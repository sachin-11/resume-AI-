/**
 * Job Application Agent — AI Prompts
 * All prompts for the agentic job application pipeline
 */

export const JOB_AGENT_SYSTEM = `You are an expert career coach, professional writer, and hiring specialist with 15+ years of experience.
You help candidates craft compelling job applications, prepare for interviews, and navigate the hiring process.
Always respond with valid JSON only — no markdown, no explanation outside JSON.`;

// ── 1. Resume ↔ JD Gap Analysis ─────────────────────────────────
export function gapAnalysisPrompt(resumeText: string, jobDescription: string): string {
  return `Analyze this candidate's resume against the job description and return ONLY this JSON:
{
  "matchScore": 72,
  "matchedSkills": ["React", "Node.js", "PostgreSQL"],
  "missingSkills": ["Docker", "Kubernetes", "AWS Lambda"],
  "experienceGaps": ["5 years required, candidate has 2 years", "No team lead experience mentioned"],
  "strengths": ["Strong frontend skills", "Good project portfolio", "Relevant domain experience"],
  "quickWins": ["Add Docker to skills section", "Mention any AWS usage even if minor", "Quantify achievements with numbers"],
  "overallVerdict": "Good match with some gaps. Focus on highlighting transferable skills and addressing the missing technical requirements.",
  "hiringChance": "medium"
}

hiringChance must be: "high" | "medium" | "low"
matchScore: 0-100

Job Description:
${jobDescription.slice(0, 3000)}

Resume:
${resumeText.slice(0, 3000)}`;
}

// ── 2. Cover Letter Generation ───────────────────────────────────
export function coverLetterPrompt(
  resumeText: string,
  jobDescription: string,
  jobTitle: string,
  company: string,
  tone: "professional" | "enthusiastic" | "concise"
): string {
  const toneGuide = {
    professional: "formal, polished, and authoritative — suitable for corporate roles",
    enthusiastic: "warm, energetic, and passionate — shows genuine excitement for the role",
    concise: "brief and punchy — 3 short paragraphs, gets straight to the point",
  }[tone];

  return `Write a compelling cover letter for this job application. Tone: ${toneGuide}.

Return ONLY this JSON:
{
  "subject": "Application for ${jobTitle} at ${company}",
  "coverLetter": "Full cover letter text here with proper paragraphs separated by \\n\\n",
  "keyPointsUsed": ["point1 from resume that was highlighted", "point2"],
  "customizationTips": ["tip to further personalize this letter", "another tip"]
}

Rules:
- Address it to "Hiring Manager" if no name available
- Reference specific requirements from the JD
- Highlight 2-3 most relevant achievements from the resume
- End with a clear call to action
- Keep it under 350 words
- Do NOT use generic filler phrases like "I am writing to express my interest"

Job Title: ${jobTitle}
Company: ${company}

Job Description:
${jobDescription.slice(0, 2500)}

Resume:
${resumeText.slice(0, 2500)}`;
}

// ── 3. Interview Questions Generation ───────────────────────────
export function interviewQuestionsPrompt(
  resumeText: string,
  jobDescription: string,
  jobTitle: string
): string {
  return `Generate targeted interview questions for this specific job application. Return ONLY this JSON:
{
  "technical": [
    { "question": "question text", "why": "why they might ask this", "tipToAnswer": "how to answer well" }
  ],
  "behavioral": [
    { "question": "question text", "why": "why they might ask this", "tipToAnswer": "how to answer well" }
  ],
  "roleSpecific": [
    { "question": "question text", "why": "why they might ask this", "tipToAnswer": "how to answer well" }
  ],
  "questionsToAsk": [
    "A good question the candidate should ask the interviewer"
  ]
}

Generate exactly: 4 technical, 3 behavioral, 3 role-specific, 3 questions-to-ask.
Base questions on BOTH the resume gaps AND the JD requirements.

Job Title: ${jobTitle}

Job Description:
${jobDescription.slice(0, 2000)}

Resume:
${resumeText.slice(0, 2000)}`;
}

// ── 4. Application Checklist (Agentic Steps) ────────────────────
export function applicationChecklistPrompt(
  resumeText: string,
  jobDescription: string,
  jobTitle: string,
  company: string
): string {
  return `Create a personalized step-by-step application checklist for this candidate. Return ONLY this JSON:
{
  "checklist": [
    {
      "step": 1,
      "category": "resume",
      "action": "Add Docker to your skills section",
      "priority": "high",
      "timeEstimate": "5 mins",
      "done": false
    }
  ],
  "totalEstimatedTime": "2-3 hours",
  "priorityActions": ["Most important action to take first", "Second most important"],
  "redFlags": ["Potential concern the recruiter might have", "Another concern"],
  "applicationStrategy": "2-3 sentence strategy for this specific application"
}

Categories must be one of: resume | cover_letter | research | networking | preparation | application
Priority must be: high | medium | low

Generate 8-12 checklist steps that are SPECIFIC to this job and candidate — not generic advice.
Focus on what THIS candidate needs to do for THIS specific job.

Job Title: ${jobTitle}
Company: ${company}

Job Description:
${jobDescription.slice(0, 2000)}

Resume:
${resumeText.slice(0, 2000)}`;
}

// ── 5. Resume Auto-Tailor ────────────────────────────────────────
export function resumeTailorPrompt(resumeText: string, jobDescription: string): string {
  return `You are an expert resume writer. Rewrite the candidate's resume bullet points to better match this job description.
Make them more impactful, quantified, and keyword-optimized for ATS.

Return ONLY this JSON:
{
  "tailoredBullets": [
    {
      "section": "Experience",
      "company": "Company name where this bullet belongs",
      "original": "Original bullet point text",
      "improved": "Rewritten bullet point — stronger, quantified, keyword-matched",
      "reason": "Why this change improves the match"
    }
  ],
  "keywordsAdded": ["keyword1", "keyword2"],
  "summaryRewrite": "Rewritten professional summary tailored to this specific JD",
  "titleSuggestion": "Suggested job title to use on resume for this application"
}

Rules:
- Only rewrite bullets that are RELEVANT to this JD
- Add numbers/metrics where possible (e.g., "improved performance" → "improved API response time by 40%")
- Naturally include missing keywords from JD without keyword stuffing
- Keep the same truthful content — only rephrase, don't fabricate
- Generate 4-8 improved bullets

Job Description:
${jobDescription.slice(0, 2500)}

Resume:
${resumeText.slice(0, 2500)}`;
}

// ── 6. JD URL Scraper / Parser ───────────────────────────────────
export function jdExtractPrompt(rawPageText: string): string {
  return `Extract the job description details from this webpage text. Return ONLY this JSON:
{
  "jobTitle": "extracted job title",
  "company": "company name",
  "location": "location or Remote",
  "jobType": "Full-time / Part-time / Contract",
  "salary": "salary range if mentioned, else null",
  "jobDescription": "complete cleaned job description text — responsibilities, requirements, nice-to-haves",
  "requiredSkills": ["skill1", "skill2"],
  "experienceRequired": "e.g. 2-4 years",
  "extractionSuccess": true
}

If the text doesn't contain a job description, return:
{ "extractionSuccess": false, "jobDescription": "", "jobTitle": "", "company": "" }

Webpage text:
${rawPageText.slice(0, 4000)}`;
}

// ── 7. Follow-up Email Templates ─────────────────────────────────
export function followUpEmailPrompt(
  jobTitle: string,
  company: string,
  candidateName: string,
  daysSinceApplied: number,
  stage: "after_apply" | "after_interview" | "no_response"
): string {
  const stageContext = {
    after_apply: `The candidate applied ${daysSinceApplied} days ago and hasn't heard back. Write a polite follow-up email to check on application status.`,
    after_interview: `The candidate had an interview ${daysSinceApplied} days ago and is waiting for feedback. Write a thank-you + follow-up email.`,
    no_response: `The candidate applied ${daysSinceApplied} days ago with no response at all. Write a final gentle follow-up before moving on.`,
  }[stage];

  return `${stageContext}

Return ONLY this JSON:
{
  "subject": "email subject line",
  "emailBody": "complete email body text with proper paragraphs separated by \\n\\n",
  "tone": "professional and polite",
  "sendTiming": "Best time to send this email (e.g., Tuesday morning)",
  "followUpTip": "One tip for this specific situation"
}

Rules:
- Keep it short (under 150 words)
- Be confident but not pushy
- Reference the specific role and company
- End with a clear but soft call to action
- Do NOT sound desperate

Candidate Name: ${candidateName}
Job Title: ${jobTitle}
Company: ${company}
Days Since Applied/Interview: ${daysSinceApplied}`;
}
