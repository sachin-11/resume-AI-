// Client-side PDF generation using jsPDF
// Called from browser only

export async function generateCandidatePDF(inviteId: string, campaignId: string): Promise<void> {
  const res = await fetch(`/api/campaigns/${campaignId}/pdf/${inviteId}`);
  if (!res.ok) throw new Error("Failed to fetch PDF data");
  const data = await res.json();

  // Dynamic import — jsPDF is browser-only
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { candidate, campaign, feedback, tabSwitchCount, generatedAt } = data;

  const VIOLET = [124, 58, 237] as [number, number, number];
  const DARK   = [17, 17, 24]  as [number, number, number];
  const GRAY   = [100, 116, 139] as [number, number, number];
  const WHITE  = [255, 255, 255] as [number, number, number];

  // ── Header ──────────────────────────────────────────────────
  doc.setFillColor(...VIOLET);
  doc.rect(0, 0, 210, 35, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Interview Report", 15, 15);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${campaign.role} — ${campaign.title}`, 15, 23);
  doc.text(`Generated: ${new Date(generatedAt).toLocaleDateString()}`, 15, 30);

  // ── Candidate info ───────────────────────────────────────────
  doc.setTextColor(...DARK);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Candidate Information", 15, 48);

  autoTable(doc, {
    startY: 52,
    head: [],
    body: [
      ["Name",       candidate.name || "—"],
      ["Email",      candidate.email],
      ["Position",   campaign.role],
      ["Round",      campaign.roundType.replace("_", " ")],
      ["Difficulty", campaign.difficulty],
      ["Tab Switches", tabSwitchCount > 0 ? `${tabSwitchCount} (suspicious)` : "0 (clean)"],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } },
    margin: { left: 15, right: 15 },
  });

  if (!feedback) {
    doc.setFontSize(11);
    doc.setTextColor(...GRAY);
    doc.text("No feedback available — interview not completed.", 15, (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15);
    doc.save(`${candidate.name || candidate.email}_report.pdf`);
    return;
  }

  const afterInfo = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Scores ───────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Score Summary", 15, afterInfo);

  const grade = feedback.overallScore >= 85 ? "Excellent" : feedback.overallScore >= 70 ? "Pass" : feedback.overallScore >= 55 ? "Decent" : "Needs Work";
  const scoreColor: [number, number, number] = feedback.overallScore >= 70 ? [34, 197, 94] : feedback.overallScore >= 55 ? [234, 179, 8] : [239, 68, 68];

  autoTable(doc, {
    startY: afterInfo + 4,
    head: [["Metric", "Score", "Grade"]],
    body: [
      ["Overall",       `${feedback.overallScore}/100`, grade],
      ["Technical",     `${feedback.technicalScore}/100`, ""],
      ["Communication", `${feedback.communicationScore}/100`, ""],
      ["Confidence",    `${feedback.confidenceScore}/100`, ""],
    ],
    theme: "striped",
    headStyles: { fillColor: VIOLET, textColor: WHITE, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3 },
    margin: { left: 15, right: 15 },
    didParseCell: (data) => {
      if (data.row.index === 0 && data.column.index === 1) {
        data.cell.styles.textColor = scoreColor;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const afterScores = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Summary ──────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Summary", 15, afterScores);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  const summaryLines = doc.splitTextToSize(feedback.summary, 180);
  doc.text(summaryLines, 15, afterScores + 6);

  const afterSummary = afterScores + 6 + summaryLines.length * 5 + 6;

  // ── Strengths & Weak Areas ───────────────────────────────────
  autoTable(doc, {
    startY: afterSummary,
    head: [["✓ Strengths", "! Areas to Improve"]],
    body: Array.from({ length: Math.max(feedback.strengths.length, feedback.weakAreas.length) }, (_, i) => [
      feedback.strengths[i] ?? "",
      feedback.weakAreas[i] ?? "",
    ]),
    theme: "grid",
    headStyles: { fillColor: [30, 30, 46], textColor: WHITE, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 },
    margin: { left: 15, right: 15 },
  });

  const afterStrengths = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Improvement Roadmap ──────────────────────────────────────
  if (feedback.improvementRoadmap?.length > 0) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text("Improvement Roadmap", 15, afterStrengths);

    autoTable(doc, {
      startY: afterStrengths + 4,
      head: [["#", "Action Item"]],
      body: feedback.improvementRoadmap.map((step: string, i: number) => [String(i + 1), step]),
      theme: "striped",
      headStyles: { fillColor: VIOLET, textColor: WHITE, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 10 } },
      margin: { left: 15, right: 15 },
    });
  }

  // ── Footer ───────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`AI Resume Coach — Confidential Report — Page ${i}/${pageCount}`, 15, 290);
  }

  doc.save(`${(candidate.name || candidate.email).replace(/\s+/g, "_")}_interview_report.pdf`);
}
