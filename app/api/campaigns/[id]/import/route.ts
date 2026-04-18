import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendInterviewInvite } from "@/lib/mailer";
import bcrypt from "bcryptjs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;
  const campaign = await db.interviewCampaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const sendEmail = formData.get("sendEmail") === "true";
  const companyName = (formData.get("companyName") as string) || "Our Company";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  // Skip header row if it looks like a header
  const startIdx = lines[0]?.toLowerCase().includes("email") ? 1 : 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const results: Array<{ email: string; status: "created" | "skipped" | "error"; error?: string }> = [];

  for (const line of lines.slice(startIdx)) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const email = cols[0];
    const name = cols[1] ?? "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ email: email || "(empty)", status: "error", error: "Invalid email" });
      continue;
    }

    try {
      const existing = await db.candidateInvite.findFirst({ where: { campaignId, email } });
      if (existing) { results.push({ email, status: "skipped", error: "Already invited" }); continue; }

      const invite = await db.candidateInvite.create({
        data: {
          campaignId, email, name,
          portalPassword: await bcrypt.hash(Math.random().toString(36).slice(-8), 10),
        },
      });

      if (sendEmail && process.env.SMTP_USER && process.env.SMTP_PASS) {
        sendInterviewInvite({
          to: email, candidateName: name, role: campaign.role,
          companyName, interviewLink: `${appUrl}/interview/invite/${invite.token}`,
          difficulty: campaign.difficulty, roundType: campaign.roundType,
        }).catch(() => {});
      }

      results.push({ email, status: "created" });
    } catch {
      results.push({ email, status: "error", error: "Failed to create" });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ results, summary: { created, skipped, errors } });
}
