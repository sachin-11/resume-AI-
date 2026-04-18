import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const campaign = await db.interviewCampaign.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invites = await db.candidateInvite.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "desc" },
  });

  // Fetch scores
  const rows = await Promise.all(invites.map(async (inv) => {
    let score = "";
    let technical = "";
    let communication = "";
    let confidence = "";
    let integrityFlag = "";

    if (inv.sessionId) {
      const [feedback, sess] = await Promise.all([
        db.feedbackReport.findUnique({
          where: { sessionId: inv.sessionId },
          select: { overallScore: true, technicalScore: true, communicationScore: true, confidenceScore: true },
        }),
        db.interviewSession.findUnique({
          where: { id: inv.sessionId },
          select: { integrityFlag: true, tabSwitchCount: true },
        }),
      ]);
      if (feedback) {
        score = String(feedback.overallScore);
        technical = String(feedback.technicalScore);
        communication = String(feedback.communicationScore);
        confidence = String(feedback.confidenceScore);
      }
      if (sess) integrityFlag = sess.integrityFlag;
    }

    return [
      inv.name ?? "",
      inv.email,
      inv.status,
      score,
      technical,
      communication,
      confidence,
      integrityFlag,
      inv.emailSent ? "Yes" : "No",
      new Date(inv.createdAt).toLocaleDateString("en-IN"),
    ];
  }));

  const headers = ["Name", "Email", "Status", "Overall Score", "Technical", "Communication", "Confidence", "Integrity", "Email Sent", "Invited On"];
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${campaign.title.replace(/[^a-z0-9]/gi, "_")}_candidates.csv"`,
    },
  });
}
