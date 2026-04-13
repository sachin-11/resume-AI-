import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractTextFromFile } from "@/lib/fileParser";

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

    const maxSize = 5 * 1024 * 1024; // 5MB
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

    return NextResponse.json({ resume }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process file";
    console.error("[RESUME_UPLOAD]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
