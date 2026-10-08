/**
 * POST /api/resume/bulk-upload
 *
 * Accepts multiple PDF/DOCX files OR a single ZIP containing them.
 * Streams progress via Server-Sent Events is not needed here —
 * we process all and return a summary. Frontend polls or waits.
 *
 * Body: FormData with field "files" (multiple) or "zip" (single ZIP)
 * Matching against a JD runs separately as a background job (POST /api/job-match/[id]/match).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractTextFromFile } from "@/lib/fileParser";
import { indexResume } from "@/lib/rag";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
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

  const limited = checkRateLimit(`bru:${session.user.id}`, RATE_LIMITS.bulkResumeUpload);
  if (limited) return limited;

  const formData = await req.formData();

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
  // Batched concurrency instead of one-at-a-time — up to 50 files processed
  // sequentially could push this single request's latency into timeout
  // territory. Batch size matches the Prisma connection_limit budget (lib/db.ts).
  const created: { id: string; fileName: string; rawText: string }[] = [];
  const PROCESS_BATCH = 5;

  for (let i = 0; i < entries.length; i += PROCESS_BATCH) {
    const batch = entries.slice(i, i + PROCESS_BATCH);
    const results = await Promise.all(
      batch.map(async (entry) => {
        try {
          const rawText = await extractTextFromFile(entry.buffer, entry.mimeType);
          if (!rawText || rawText.length < 30) {
            return { entry, error: "Could not extract text" as const };
          }

          const resume = await db.resume.create({
            data: {
              userId: session.user.id,
              fileName: entry.name,
              fileType: entry.mimeType,
              rawText,
            },
          });

          // RAG index (non-blocking)
          indexResume(resume.id, session.user.id, rawText).catch(() => {});

          return { entry, created: { id: resume.id, fileName: entry.name, rawText } };
        } catch (err) {
          return { entry, error: err instanceof Error ? err.message : "Failed" };
        }
      })
    );

    for (const r of results) {
      if (r.created) created.push(r.created);
      else errors.push({ name: r.entry.name, error: r.error ?? "Failed" });
    }
  }

  // Matching against a JD is a separate background job (POST /api/job-match/[id]/match),
  // so this request only uploads and never waits on the AI.
  return NextResponse.json({
    uploaded: created.length,
    failed: errors.length,
    errors,
    resumeIds: created.map((c) => c.id),
  });
}
