#!/usr/bin/env node
/**
 * Seed a throwaway database with what the MCP tests need: two recruiters (to test
 * cross-user isolation) and an "MCP test" campaign for the first one, with three
 * scored candidates, one pending, and three open slots.
 *
 *   node scripts/mcp-seed.mjs        → prints {"user":"…","otherUser":"…"}
 *
 * Refuses to touch anything but a localhost database (CI service container / local dev).
 */
import { existsSync, readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=("?)(.*)\2$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3];
  }
}

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Refusing: DATABASE_URL is not a localhost database.");
  process.exit(1);
}

const db = new PrismaClient();
const hour = 3600_000;

async function recruiter(email) {
  return db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: email.split("@")[0], password: "!seeded-no-login", role: "recruiter" },
  });
}

const user = await recruiter("mcp-ci-recruiter@example.com");
const other = await recruiter("mcp-ci-other@example.com");

await db.interviewCampaign.deleteMany({ where: { userId: user.id, title: { startsWith: "MCP test" } } });
const campaign = await db.interviewCampaign.create({
  data: {
    userId: user.id, title: "MCP test — Backend Engineer", role: "Backend Engineer", difficulty: "intermediate",
    roundType: "technical", description: "Senior Backend Engineer: Python, FastAPI or Django, PostgreSQL, AWS.",
  },
});

const people = [
  ["Asha Verma", "asha@example.com", 86, 88], ["Ravi Kumar", "ravi@example.com", 72, 70],
  ["Neha Singh", "neha@example.com", 58, 55], ["Arjun Mehta", "arjun@example.com", null, null],
];
for (const [name, email, overall, tech] of people) {
  let sessionId = null;
  if (overall !== null) {
    const s = await db.interviewSession.create({
      data: { userId: user.id, title: "MCP test interview", role: "Backend Engineer", difficulty: "intermediate",
              roundType: "technical", status: "completed", totalQuestions: 5 },
    });
    await db.feedbackReport.create({
      data: { sessionId: s.id, overallScore: overall, technicalScore: tech, communicationScore: overall - 2,
              confidenceScore: overall - 4, strengths: ["Clear API design", "Solid SQL"], weakAreas: ["System design depth"],
              betterAnswers: [], improvementRoadmap: [], summary: `${name.split(" ")[0]} answered well on fundamentals.` },
    });
    sessionId = s.id;
  }
  await db.candidateInvite.create({
    data: { campaignId: campaign.id, email, name, status: sessionId ? "completed" : "pending", sessionId },
  });
}
for (const h of [26, 50, 74]) {
  await db.interviewSlot.create({ data: { campaignId: campaign.id, startsAt: new Date(Date.now() + h * hour) } });
}

console.log(JSON.stringify({ user: user.id, otherUser: other.id }));
await db.$disconnect();
