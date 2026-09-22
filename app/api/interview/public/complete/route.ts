import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callGroq } from "@/lib/groq";
import { FEEDBACK_SYSTEM, feedbackPrompt } from "@/lib/prompts";
import { safeJsonParse, clampScore } from "@/lib/utils";
import { FeedbackReport } from "@/types";
import { MOCK_FEEDBACK } from "@/lib/mockData";
import { sendRecruiterAlert, sendScoreReport } from "@/lib/mailer";
import { dispatchWebhooks, dispatchScoreThresholdWebhooks } from "@/lib/webhooks";
import type { WebhookPayload } from "@/lib/webhooks";
import { rateLimit, RATE_LIMITS, getIP, rateLimitResponse } from "@/lib/rate-limit";
import { verifyInviteToken } from "@/lib/candidateInvite";

// Public endpoint — no auth required (for candidate invite sessions)
export async function POST(req: NextRequest) {
  const rl = rateLimit(getIP(req), RATE_LIMITS.publicComplete);
  if (!rl.success) return rateLimitResponse(rl);
  try {
    // sendBeacon sends as text/plain, fetch sends as application/json
    let body: {
      sessionId?: string; token?: string; action?: string;
      cameraEverEnabled?: boolean; faceDetectionActive?: boolean;
    };
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const text = await req.text();
      body = JSON.parse(text);
    }

    const { sessionId, token, action, cameraEverEnabled, faceDetectionActive } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    if (!(await verifyInviteToken(sessionId, token))) {
      return NextResponse.json({ error: "Invalid or missing invite token" }, { status: 403 });
    }

    // Best-effort proctoring-coverage flags — record whatever the client saw
    // over the session so a "clean" integrity flag can't be mistaken for
    // "camera/face monitoring actually ran" when it never did.
    const coverageData = {
      ...(cameraEverEnabled ? { cameraEverEnabled: true } : {}),
      ...(faceDetectionActive ? { faceDetectionActive: true } : {}),
    };

    // ── Abandoned (tab closed mid-interview) ──────────────────
    if (action === "abandon") {
      await db.interviewSession.updateMany({
        where: { id: sessionId, status: "active" },
        data: { status: "abandoned", ...coverageData },
      });
      await db.candidateInvite.updateMany({
        where: { token, sessionId },
        data: { status: "abandoned" },
      });
      return NextResponse.json({ success: true });
    }

    // ── Completed ─────────────────────────────────────────────
    await db.interviewSession.update({
      where: { id: sessionId },
      data: { status: "completed", ...coverageData },
    });

    await db.candidateInvite.updateMany({
      where: { token, sessionId },
      data: { status: "completed" },
    });

    // Generate feedback
    const existing = await db.feedbackReport.findUnique({ where: { sessionId } });
    if (existing) return NextResponse.json({ success: true });

    const interviewSession = await db.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: {
          include: { answers: { orderBy: { createdAt: "asc" } } },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!interviewSession) return NextResponse.json({ success: true });

    const qa = interviewSession.questions
      .filter((q) => q.answers.length > 0)
      .map((q) => ({ question: q.text, answer: q.answers[0].text }));

    let feedback: FeedbackReport = MOCK_FEEDBACK;

    if (process.env.GROQ_API_KEY && qa.length > 0) {
      const raw = await callGroq(
        FEEDBACK_SYSTEM,
        feedbackPrompt(qa, interviewSession.language ?? "en"),
        undefined,
        { userId: interviewSession.userId, sessionId, feature: "feedback" }
      );
      feedback = safeJsonParse<FeedbackReport>(raw, MOCK_FEEDBACK);
    }

    // safeJsonParse returns the exact `fallback` reference on parse failure,
    // same as the explicit MOCK_FEEDBACK assignment above — either way this
    // is canned demo data, not a real AI report.
    const isFallback = feedback === MOCK_FEEDBACK;

    // Guard against malformed AI JSON (missing/NaN/out-of-range fields)
    // reaching the DB, emails, or webhooks as-is.
    const overallScore = clampScore(feedback.overallScore, MOCK_FEEDBACK.overallScore);
    const technicalScore = clampScore(feedback.technicalScore, MOCK_FEEDBACK.technicalScore);
    const communicationScore = clampScore(feedback.communicationScore, MOCK_FEEDBACK.communicationScore);
    const confidenceScore = clampScore(feedback.confidenceScore, MOCK_FEEDBACK.confidenceScore);

    await db.feedbackReport.create({
      data: {
        sessionId,
        overallScore,
        technicalScore,
        communicationScore,
        confidenceScore,
        strengths: feedback.strengths,
        weakAreas: feedback.weakAreas,
        betterAnswers: feedback.betterAnswers as object[],
        improvementRoadmap: feedback.improvementRoadmap,
        summary: feedback.summary,
        isFallback,
      },
    });

    // ── Send emails (non-blocking) ────────────────────────────
    const invite = await db.candidateInvite.findFirst({
      where: { sessionId },
      include: { campaign: { include: { user: true } } },
    });

    if (invite && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      // Recruiter alert
      if (invite.campaign?.user?.email) {
        sendRecruiterAlert({
          to: invite.campaign.user.email,
          recruiterName: invite.campaign.user.name ?? "",
          candidateName: invite.name ?? "",
          candidateEmail: invite.email,
          role: invite.campaign.role,
          overallScore,
          tabSwitchCount: interviewSession.tabSwitchCount ?? 0,
          dashboardUrl: `${appUrl}/campaigns`,
          isFallback,
        }).catch((e) => console.error("[RECRUITER_ALERT]", e));
      }

      // Score report to candidate
      sendScoreReport({
        to: invite.email,
        candidateName: invite.name ?? "",
        role: invite.campaign.role,
        overallScore,
        technicalScore,
        communicationScore,
        confidenceScore,
        strengths: feedback.strengths,
        weakAreas: feedback.weakAreas,
        summary: feedback.summary,
        isFallback,
      }).catch((e) => console.error("[SCORE_REPORT]", e));
    }

    // ── Fire webhooks (non-blocking) ──────────────────────────
    if (invite?.campaign?.userId) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const webhookPayload: WebhookPayload = {
        event: "interview_completed",
        timestamp: new Date().toISOString(),
        data: {
          candidateName: invite.name ?? invite.email,
          candidateEmail: invite.email,
          role: invite.campaign.role,
          campaignTitle: invite.campaign.title,
          overallScore,
          technicalScore,
          communicationScore,
          confidenceScore,
          tabSwitchCount: interviewSession.tabSwitchCount ?? 0,
          passed: overallScore >= 60,
          shortlisted: false,
          dashboardUrl: `${appUrl}/campaigns`,
          sessionId,
          isFallback,
        },
      };

      void dispatchWebhooks(invite.campaign.userId, "interview_completed", webhookPayload);
      void dispatchScoreThresholdWebhooks(invite.campaign.userId, overallScore, webhookPayload);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PUBLIC_COMPLETE]", err);
    return NextResponse.json({ error: "Failed to complete session" }, { status: 500 });
  }
}
