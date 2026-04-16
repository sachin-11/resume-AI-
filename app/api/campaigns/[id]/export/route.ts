import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "csv"; // csv | xlsx

  const campaign = await db.interviewCampaign.findFirst({
    where: { id: campaignId, userId: session.user.id },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invites = await db.candidateInvite.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
  });

  // Fetch feedback for each
  const rows = await Promise.all(
    invites.map(async (inv) => {
      let feedback = null;
      if (inv.sessionId) {
        feedback = await db.feedbackReport.findUnique({
          where: { sessionId: inv.sessionId },
          select: {
            overallScore: true, technicalScore: true,
            communicationScore: true, confidenceScore: true,
            strengths: true, weakAreas: true, summary: true,
          },
        });
        const sessionData = await db.interviewSession.findUnique({
          where: { id: inv.sessionId },
          select: { tabSwitchCount: true },
        });
        return {
          "Name":               inv.name ?? "",
          "Email":              inv.email,
          "Status":             inv.status,
          "Scheduled At":       inv.scheduledAt ? new Date(inv.scheduledAt).toLocaleString() : "",
          "Completed At":       inv.sessionId ? new Date(inv.createdAt).toLocaleString() : "",
          "Overall Score":      feedback?.overallScore ?? "",
          "Technical Score":    feedback?.technicalScore ?? "",
          "Communication":      feedback?.communicationScore ?? "",
          "Confidence":         feedback?.confidenceScore ?? "",
          "Tab Switches":       sessionData?.tabSwitchCount ?? 0,
          "Strengths":          feedback?.strengths?.join("; ") ?? "",
          "Weak Areas":         feedback?.weakAreas?.join("; ") ?? "",
          "Summary":            feedback?.summary ?? "",
          "Pass/Fail":          feedback ? (feedback.overallScore >= 60 ? "Pass" : "Fail") : "",
        };
      }
      return {
        "Name":               inv.name ?? "",
        "Email":              inv.email,
        "Status":             inv.status,
        "Scheduled At":       inv.scheduledAt ? new Date(inv.scheduledAt).toLocaleString() : "",
        "Completed At":       "",
        "Overall Score":      "",
        "Technical Score":    "",
        "Communication":      "",
        "Confidence":         "",
        "Tab Switches":       0,
        "Strengths":          "",
        "Weak Areas":         "",
        "Summary":            "",
        "Pass/Fail":          "",
      };
    })
  );

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Results");

  // Auto column widths
  const colWidths = Object.keys(rows[0] ?? {}).map((k) => ({ wch: Math.max(k.length, 15) }));
  ws["!cols"] = colWidths;

  const filename = `${campaign.title.replace(/\s+/g, "_")}_results`;

  if (format === "xlsx") {
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  // CSV
  const csv = XLSX.utils.sheet_to_csv(ws);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
