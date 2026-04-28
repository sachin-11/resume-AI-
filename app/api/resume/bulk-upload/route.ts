/**
 * POST /api/resume/bulk-upload
 *
 * Accepts multiple PDF/DOCX files OR a single ZIP containing them.
 * Streams progress via Server-Sent Events is not needed here —
 * we process all and return a summary. Frontend polls or waits.
 *
 * Body: FormData with field "files" (multiple) or "zip" (single ZIP)
 * Optional: "jobDescriptionId" to auto-match after upload
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractTextFromFile } from "@/lib/fileParser";
import { indexResume } from "@/lib/rag";
import { matchAllResumes } from "@/lib/resumeMatcher";
import JSZip from "jszip";

const MAX_FILE_SIZE = 5 * 1024 * 1024;   // 5MB per file
const MAX_ZIP_SIZE  = 50 * 1024 * 1024;  // 50MB ZIP
const MAX_FILES     = 50;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

interface FileEntry { name: string; buffer: Buffer; mimeType: string; }

// ── Extract files from a ZIP buffer ─────────────────────────────
async function extractFromZip(buffer: Buffer): Promise<FileEntry[]> {
  const zip = await JSZip.loadAsync(buffer);
  const entries: FileEntry[] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const name = path.split("/").pop() ?? path;
    const lower = name.toLowerCase();

    let mimeType = "";
    if (lower.endsWith(".pdf"))  mimeType = "application/pdf";
    else if (lower.endsWith(".docx")) mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else continue; // skip non-resume files

    const data = await file.async("nodebuffer");
    if (data.length > MAX_FILE_SIZE) continue; // skip oversized
    entries.push({ name, buffer: data, mimeType });
  }

  return entries;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const jobDescriptionId = formData.get("jobDescriptionId") as string | null;

  // ── Collect all file entries ─────────────────────────────────
  const entries: FileEntry[] = [];
  const errors: { name: string; error: string }[] = [];

  // Multiple direct files
  const rawFiles = formData.getAll("files") as File[];
  for (const f of rawFiles) {
    if (f.size > MAX_FILE_SIZE) { errors.push({ name: f.name, error: "File too large (max 5MB)" }); continue; }
    if (!ALLOWED_TYPES.includes(f.type)) { errors.push({ name: f.name, error: "Only PDF/DOCX supported" }); continue; }
    entries.push({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()), mimeType: f.type });
  }

  // ZIP file
  const zipFile = formData.get("zip") as File | null;
  if (zipFile) {
    if (zipFile.size > MAX_ZIP_SIZE) return NextResponse.json({ error: "ZIP too large (max 50MB)" }, { status: 400 });
    const zipBuffer = Buffer.from(await zipFile.arrayBuffer());
    const zipEntries = await extractFromZip(zipBuffer).catch(() => []);
    entries.push(...zipEntries);
  }

  if (entries.length === 0) return NextResponse.json({ error: "No valid PDF/DOCX files found" }, { status: 400 });
  if (entries.length > MAX_FILES) return NextResponse.json({ error: `Max ${MAX_FILES} files at once` }, { status: 400 });

  // ── Process each file ────────────────────────────────────────
  const created: { id: string; fileName: string; rawText: string }[] = [];

  for (const entry of entries) {
    try {
      const rawText = await extractTextFromFile(entry.buffer, entry.mimeType);
      if (!rawText || rawText.length < 30) {
        errors.push({ name: entry.name, error: "Could not extract text" });
        continue;
      }

      const resume = await db.resume.create({
        data: {
          userId: session.user.id,
          fileName: entry.name,
          fileType: entry.mimeType,
          rawText,
        },
      });

      created.push({ id: resume.id, fileName: entry.name, rawText });

      // RAG index (non-blocking)
      indexResume(resume.id, session.user.id, rawText).catch(() => {});
    } catch (err) {
      errors.push({ name: entry.name, error: err instanceof Error ? err.message : "Failed" });
    }
  }

  // ── Auto-match against JD if provided ───────────────────────
  let matchResults: { resumeId: string; fileName: string; score: number; recommendation: string }[] = [];

  if (jobDescriptionId && created.length > 0) {
    const jd = await db.jobDescription.findFirst({
      where: { id: jobDescriptionId, userId: session.user.id },
      select: { description: true },
    });

    if (jd) {
      const ranked = await matchAllResumes(
        created.map((r) => ({ id: r.id, rawText: r.rawText })),
        jd.description
      );

      // Save to DB
      await Promise.all(
        ranked.map((r) =>
          db.resumeMatch.upsert({
            where: { jobDescriptionId_resumeId: { jobDescriptionId: jobDescriptionId!, resumeId: r.resumeId } },
            create: { jobDescriptionId: jobDescriptionId!, resumeId: r.resumeId, score: r.score, matchedSkills: r.matchedSkills, missingSkills: r.missingSkills, summary: r.summary, recommendation: r.recommendation },
            update: { score: r.score, matchedSkills: r.matchedSkills, missingSkills: r.missingSkills, summary: r.summary, recommendation: r.recommendation },
          })
        )
      );

      const fileNameMap = Object.fromEntries(created.map((c) => [c.id, c.fileName]));
      matchResults = ranked.map((r) => ({
        resumeId: r.resumeId,
        fileName: fileNameMap[r.resumeId] ?? r.resumeId,
        score: r.score,
        recommendation: r.recommendation,
      }));
    }
  }

  return NextResponse.json({
    uploaded: created.length,
    failed: errors.length,
    errors,
    matched: matchResults.length > 0,
    matchResults,
    resumeIds: created.map((c) => c.id),
  });
}
