import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractTextFromFile } from "@/lib/fileParser";
import { indexResume } from "@/lib/rag";
import { matchAllResumes } from "@/lib/resumeMatcher";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const allowedTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Only PDF and DOCX files are supported" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawText = await extractTextFromFile(buffer, file.type);

    if (!rawText || rawText.length < 50) {
      return NextResponse.json({ error: "Could not extract text from file" }, { status: 422 });
    }

    const resume = await db.resume.create({
      data: {
        userId: session.user.id,
        fileName: file.name,
        fileType: file.type,
        rawText,
      },
    });

    // Index resume in Pinecone for RAG (non-blocking)
    indexResume(resume.id, session.user.id, rawText).catch((e) =>
      console.error("[RAG_INDEX]", e)
    );

    // Auto-match against all existing JDs for this user (non-blocking)
    autoMatchAgainstAllJDs(session.user.id, resume.id, rawText).catch((e) =>
      console.error("[AUTO_MATCH]", e)
    );

    return NextResponse.json({ resume }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process file";
    console.error("[RESUME_UPLOAD]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Auto-match new resume against all existing JDs ───────────────
async function autoMatchAgainstAllJDs(userId: string, resumeId: string, rawText: string) {
  const jds = await db.jobDescription.findMany({
    where: { userId },
    select: { id: true, description: true },
  });
  if (jds.length === 0) return;

  for (const jd of jds) {
    const jdResults = await matchAllResumes([{ id: resumeId, rawText }], jd.description);
    const r = jdResults[0];
    if (!r) continue;

    await db.resumeMatch.upsert({
      where: { jobDescriptionId_resumeId: { jobDescriptionId: jd.id, resumeId } },
      create: {
        jobDescriptionId: jd.id,
        resumeId,
        score: r.score,
        matchedSkills: r.matchedSkills,
        missingSkills: r.missingSkills,
        summary: r.summary,
        recommendation: r.recommendation,
      },
      update: {
        score: r.score,
        matchedSkills: r.matchedSkills,
        missingSkills: r.missingSkills,
        summary: r.summary,
        recommendation: r.recommendation,
      },
    });
  }

  console.log(`[AUTO_MATCH] Resume ${resumeId} matched against ${jds.length} JD(s)`);
}
