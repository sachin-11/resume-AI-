import crypto from "crypto";
import { db } from "@/lib/db";

export type WebhookEvent =
  | "interview_completed"
  | "candidate_shortlisted"
  | "score_threshold_crossed";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: {
    candidateName: string;
    candidateEmail: string;
    role: string;
    campaignTitle: string;
    overallScore: number;
    technicalScore: number;
    communicationScore: number;
    confidenceScore: number;
    tabSwitchCount: number;
    passed: boolean;          // score >= 60
    shortlisted: boolean;     // score >= threshold
    dashboardUrl: string;
    sessionId: string;
  };
}

// ── Sign payload with HMAC-SHA256 ───────────────────────────────
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// ── Format for Slack ─────────────────────────────────────────────
function toSlackMessage(payload: WebhookPayload): object {
  const { data, event } = payload;
  const emoji = data.overallScore >= 70 ? "✅" : data.overallScore >= 55 ? "🟡" : "❌";
  const shortlistBadge = data.shortlisted ? " 🏆 *SHORTLISTED*" : "";

  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} Interview ${event === "interview_completed" ? "Completed" : "Alert"}${shortlistBadge}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Candidate:*\n${data.candidateName || data.candidateEmail}` },
          { type: "mrkdwn", text: `*Position:*\n${data.role}` },
          { type: "mrkdwn", text: `*Overall Score:*\n${data.overallScore}/100` },
          { type: "mrkdwn", text: `*Technical:*\n${data.technicalScore}/100` },
          { type: "mrkdwn", text: `*Communication:*\n${data.communicationScore}/100` },
          { type: "mrkdwn", text: `*Tab Switches:*\n${data.tabSwitchCount}` },
        ],
      },
      {
        type: "actions",
        elements: [{
          type: "button",
          text: { type: "plain_text", text: "View in Dashboard" },
          url: data.dashboardUrl,
          style: "primary",
        }],
      },
    ],
  };
}

// ── Format for Greenhouse / Lever / Workday (ATS) ───────────────
function toATSPayload(payload: WebhookPayload): object {
  const { data } = payload;
  return {
    event: payload.event,
    timestamp: payload.timestamp,
    candidate: {
      name: data.candidateName,
      email: data.candidateEmail,
    },
    application: {
      job_title: data.role,
      campaign: data.campaignTitle,
      stage: data.shortlisted ? "shortlisted" : data.passed ? "passed" : "failed",
    },
    scores: {
      overall: data.overallScore,
      technical: data.technicalScore,
      communication: data.communicationScore,
      confidence: data.confidenceScore,
    },
    flags: {
      tab_switches: data.tabSwitchCount,
      integrity_concern: data.tabSwitchCount >= 3,
    },
    source: "ai_resume_coach",
    dashboard_url: data.dashboardUrl,
  };
}

// ── Main dispatcher ──────────────────────────────────────────────
export async function dispatchWebhooks(
  userId: string,
  event: WebhookEvent,
  payload: WebhookPayload
): Promise<void> {
  const webhooks = await db.webhookConfig.findMany({
    where: {
      userId,
      isActive: true,
      events: { has: event },
    },
  });

  if (webhooks.length === 0) return;

  await Promise.allSettled(
    webhooks.map(async (wh) => {
      try {
        let body: string;

        if (wh.type === "slack") {
          body = JSON.stringify(toSlackMessage(payload));
        } else if (["greenhouse", "lever", "workday"].includes(wh.type)) {
          body = JSON.stringify(toATSPayload(payload));
        } else {
          // custom — send raw payload
          body = JSON.stringify(payload);
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "AI-Resume-Coach/1.0",
          "X-Webhook-Event": event,
          "X-Webhook-Timestamp": payload.timestamp,
        };

        if (wh.secret) {
          headers["X-Webhook-Signature"] = `sha256=${signPayload(body, wh.secret)}`;
        }

        const res = await fetch(wh.url, { method: "POST", headers, body });
        if (!res.ok) {
          console.error(`[WEBHOOK] ${wh.name} failed: ${res.status}`);
        }
      } catch (err) {
        console.error(`[WEBHOOK] ${wh.name} error:`, err);
      }
    })
  );
}
