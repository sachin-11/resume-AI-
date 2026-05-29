/**
 * POST /api/job-agent/[id]/company-research
 * AI-powered company research: culture, tech stack, interview process, smart talking points
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCompanyResearch } from "@/lib/jobAgent";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const app = await db.jobApplication.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!app.company) return NextResponse.json({ error: "Company name missing in application" }, { status: 400 });

    const result = await generateCompanyResearch({
      company: app.company,
      jobTitle: app.jobTitle,
      jobDescription: app.jobDescription,
    });

    return NextResponse.json({ research: result });
  } catch (err) {
    console.error("[COMPANY_RESEARCH]", err);
    return NextResponse.json({ error: "Failed to generate research" }, { status: 500 });
  }
}
