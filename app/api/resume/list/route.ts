import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resumes = await db.resume.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        analysisReport: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ resumes });
  } catch (err) {
    console.error("[RESUME_LIST]", err);
    return NextResponse.json({ error: "Failed to fetch resumes" }, { status: 500 });
  }
}
