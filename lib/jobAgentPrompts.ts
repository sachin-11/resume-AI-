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

// ── 8. Salary Negotiation ─────────────────────────────────────────
export function salaryNegotiationPrompt(
  jobTitle: string,
  company: string,
  jobDescription: string,
  resumeText: string,
  currentOffer?: string
): string {
  return `You are a salary negotiation expert. Analyze this job and candidate profile to generate a complete salary negotiation strategy.

Return ONLY this JSON:
{
  "marketRange": {
    "min": "₹18L",
    "mid": "₹24L",
    "max": "₹32L",
    "currency": "INR",
    "basis": "Based on 5yr Node.js experience, Bangalore market, FAANG-adjacent company"
  },
  "recommendedAsk": "₹28L",
  "confidence": "high",
  "openingScript": "Thank you for the offer of ₹22L. Based on my 5 years of experience with Node.js and my track record of reducing API latency by 40% at my current company, I was expecting something closer to ₹28L. Is there flexibility there?",
  "counterOfferScript": "I appreciate you coming up to ₹25L. Given the scope of the role and what I'll be bringing — specifically my experience leading a team of 4 and owning the entire backend — I'd be more comfortable at ₹27L. Can we meet there?",
  "acceptanceScript": "Thank you, I'm happy to accept ₹27L. I'm excited to join the team and contribute from day one.",
  "walkAwayPoint": "₹22L",
  "negotiationTips": [
    "Always negotiate — 70% of companies expect it",
    "Anchor high but realistically — your first number sets the floor",
    "Never give a range — the employer will always pick the bottom",
    "Focus on value delivered, not personal need",
    "Get the offer in writing before resigning"
  ],
  "nonSalaryBenefits": [
    "Ask for joining bonus if salary is non-negotiable",
    "Negotiate extra 5 PTO days",
    "Request work-from-home 3 days/week",
    "Ask for learning budget (₹50k/year for courses)",
    "Request earlier performance review (6 months instead of 12)"
  ],
  "redFlags": [
    "Company refused any discussion on salary",
    "Offer is 30%+ below market — may indicate underfunding"
  ],
  "strengthsToHighlight": [
    "Led a team of 4 engineers",
    "Reduced API response time by 40%",
    "5 years of Node.js experience"
  ]
}

confidence must be: "high" | "medium" | "low"
Use Indian Rupee (₹) and LPA format (e.g. ₹24L) for Indian companies, USD for international.

Job Title: ${jobTitle}
Company: ${company}
${currentOffer ? `Current Offer: ${currentOffer}` : "No offer yet — generate expected range"}

Job Description:
${jobDescription.slice(0, 2000)}

Resume:
${resumeText.slice(0, 2000)}`;
}

// ── 9. LinkedIn Message Generator ────────────────────────────────
export function linkedinMessagePrompt(
  recipientName: string,
  recipientRole: string,
  company: string,
  jobTitle: string,
  jobDescription: string,
  resumeText: string,
  senderName: string
): string {
  return `You are a LinkedIn outreach expert. Generate 3 personalized LinkedIn connection/DM messages for a job referral or intro request.

Return ONLY this JSON:
{
  "formal": {
    "connectionNote": "Hi ${recipientName}, I came across your profile while researching ${company}...",
    "followUpDm": "Hi ${recipientName}, thank you for connecting! I noticed you work at ${company}...",
    "tip": "Best for senior roles, corporate companies, first-time outreach"
  },
  "casual": {
    "connectionNote": "Hey ${recipientName}! Love what ${company} is building...",
    "followUpDm": "Hey! Thanks for connecting. I saw the ${jobTitle} opening at ${company}...",
    "tip": "Best for startups, tech companies, approachable profiles"
  },
  "coldOutreach": {
    "connectionNote": "Hi ${recipientName} — saw ${company} is hiring for ${jobTitle}. I have relevant experience and would love to connect.",
    "followUpDm": "Hi ${recipientName}, I will be direct — I am applying for ${jobTitle} at ${company}. I have strong relevant experience. Would you be open to a quick 10-min call or willing to refer me internally?",
    "tip": "Best when you want to stand out — bold, direct, highlights value immediately"
  },
  "subjectLines": [
    "Quick question about the ${jobTitle} role at ${company}",
    "Engineer interested in ${company} — can we connect?",
    "Referral request for ${jobTitle} opening"
  ],
  "dosList": [
    "Personalize with something specific from their profile or company",
    "Lead with value — what you bring, not what you want",
    "Keep connection note under 150 words",
    "Give them an easy out — no pressure at all",
    "Follow up once after 5-7 days if no response"
  ],
  "dontsList": [
    "Do not paste your full resume in the message",
    "Do not ask for a job directly in the first message",
    "Do not send the same template to everyone",
    "Do not follow up more than twice",
    "Do not write a wall of text"
  ]
}

Generate real, fully written messages (not placeholders). Make them specific to the role and company.

Recipient Name: ${recipientName}
Recipient Role at Company: ${recipientRole}
Company: ${company}
Job Title: ${jobTitle}
Sender Name: ${senderName}

Job Description:
${jobDescription.slice(0, 1500)}

Sender Resume (for personalization):
${resumeText.slice(0, 1500)}`;
}

// ── 10. Company Research Agent ────────────────────────────────────
export function companyResearchPrompt(
  company: string,
  jobTitle: string,
  jobDescription: string
): string {
  return `You are a company research expert helping a candidate prepare for a job interview at ${company}.
Based on your knowledge about this company, generate a detailed research report.

Return ONLY this JSON:
{
  "overview": {
    "founded": "2011",
    "headquarters": "Bangalore, India",
    "size": "5000-10000 employees",
    "stage": "Public / Series D / Unicorn / Bootstrapped",
    "revenue": "~$500M ARR (estimated)",
    "tagline": "India's fastest delivery platform"
  },
  "products": [
    { "name": "Core App", "description": "10-minute grocery delivery to 700+ cities" },
    { "name": "Hyperpure", "description": "B2B restaurant supply chain platform" }
  ],
  "techStack": {
    "frontend": ["React", "React Native"],
    "backend": ["Node.js", "Go", "Python"],
    "infrastructure": ["AWS", "Kubernetes", "Kafka"],
    "databases": ["PostgreSQL", "Redis", "MongoDB"],
    "aiMl": ["TensorFlow", "PyTorch"],
    "notes": "Heavy on real-time systems, microservices architecture, event-driven design"
  },
  "culture": {
    "workStyle": "Hybrid — 3 days office, 2 days remote",
    "values": ["Move fast", "Customer obsession", "Ownership mentality", "Data-driven decisions"],
    "topPerks": ["ESOPs", "₹50k learning budget/year", "Free meals", "Health insurance for family"],
    "dresscode": "Casual",
    "avgAge": "26-30 years",
    "glassdoorRating": "3.8/5",
    "summary": "Fast-paced startup culture. High ownership, rapid growth. Can be stressful during peak seasons."
  },
  "interviewProcess": {
    "rounds": [
      { "round": 1, "type": "HR Screening", "duration": "30 min", "focus": "Background, motivation, salary expectations" },
      { "round": 2, "type": "Technical DSA", "duration": "60 min", "focus": "Arrays, Trees, DP — LeetCode medium level" },
      { "round": 3, "type": "System Design", "duration": "60 min", "focus": "Design delivery tracking, rate limiter, notification system" },
      { "round": 4, "type": "Engineering Manager", "duration": "45 min", "focus": "Past projects, leadership, conflict resolution" },
      { "round": 5, "type": "Bar Raiser / VP", "duration": "30 min", "focus": "Culture fit, long-term goals" }
    ],
    "difficulty": "Hard",
    "avgDuration": "2-3 weeks end to end",
    "tips": [
      "They love candidates who have worked on high-scale systems",
      "Prepare delivery/logistics domain questions",
      "Strong focus on behavioral STAR method answers",
      "Be ready to discuss trade-offs in system design"
    ],
    "commonRejectionReasons": [
      "Weak system design fundamentals",
      "Not able to handle ambiguous problem statements",
      "No ownership mindset in past examples"
    ]
  },
  "recentNews": [
    { "headline": "Zepto raises $665M in Series F at $3.6B valuation", "date": "2024", "relevance": "Shows rapid growth — good time to join" },
    { "headline": "Zepto expands to 100 new cities in 2024", "date": "2024", "relevance": "Engineering team will scale significantly" }
  ],
  "competitors": ["Blinkit (Zomato)", "Swiggy Instamart", "BigBasket Now"],
  "interviewQuestions": [
    "Tell me about a time you worked under extreme pressure and delivered results.",
    "How would you design a real-time order tracking system for 1M concurrent users?",
    "What excites you about quick commerce as a space?",
    "How do you handle disagreements with your manager?"
  ],
  "smartThingsToSay": [
    "I noticed Zepto recently expanded to Tier-2 cities — I'm curious how the supply chain architecture differs there.",
    "I read about your 10-minute delivery SLA — I'd love to understand the tech challenges behind that guarantee.",
    "I saw you use Kafka for real-time order streaming — I've worked with similar event-driven systems at scale."
  ],
  "redFlags": [
    "High attrition rate reported on Glassdoor (30%+)",
    "Work-life balance complaints during sale seasons"
  ],
  "verdict": {
    "rating": "Strong Buy",
    "summary": "Great for engineers who want scale, speed, and ownership. Compensation is competitive. Growth trajectory is excellent.",
    "bestFor": "Engineers with 3-7 years experience who want to work on hard problems at scale"
  }
}

Company: ${company}
Role Being Applied For: ${jobTitle}

Job Description (for context):
${jobDescription.slice(0, 1500)}

Note: Use your training knowledge about this company. Be as accurate and specific as possible. If you don't know specific details, make reasonable estimates based on similar companies and clearly note they are estimates.`;
}

// ── 11. ATS Score Optimizer ───────────────────────────────────────
export function atsScorePrompt(resumeText: string, jobDescription: string): string {
  return `You are an ATS (Applicant Tracking System) expert. Analyze the resume against the job description and simulate what an ATS bot would score it.

Return ONLY this JSON:
{
  "atsScore": 47,
  "verdict": "rejected",
  "verdictReason": "Your resume will likely be rejected by ATS. Critical keywords from the JD are missing and the score is below the typical 60% threshold.",
  "keywordAnalysis": {
    "totalRequired": 24,
    "found": 11,
    "missing": 13,
    "foundKeywords": [
      { "keyword": "Node.js", "frequency": 3, "importance": "critical" },
      { "keyword": "REST API", "frequency": 2, "importance": "important" },
      { "keyword": "PostgreSQL", "frequency": 1, "importance": "important" }
    ],
    "missingKeywords": [
      { "keyword": "Docker", "importance": "critical", "whereToAdd": "Skills section", "suggestedLine": "Containerized microservices using Docker and Docker Compose" },
      { "keyword": "Kubernetes", "importance": "critical", "whereToAdd": "Skills section or experience bullet", "suggestedLine": "Deployed and managed containers on Kubernetes (GKE)" },
      { "keyword": "CI/CD", "importance": "important", "whereToAdd": "Experience section", "suggestedLine": "Set up CI/CD pipelines using GitHub Actions reducing deployment time by 40%" },
      { "keyword": "microservices", "importance": "important", "whereToAdd": "Summary or experience", "suggestedLine": "Designed and built microservices architecture serving 500k+ daily users" },
      { "keyword": "TypeScript", "importance": "important", "whereToAdd": "Skills section", "suggestedLine": "TypeScript" }
    ]
  },
  "sectionScores": {
    "skills": { "score": 55, "maxScore": 100, "issues": ["Missing 8 critical skills keywords", "Add a dedicated 'Technical Skills' section with comma-separated keywords"] },
    "experience": { "score": 40, "maxScore": 100, "issues": ["Weak action verbs — replace 'worked on' with 'built', 'architected', 'led'", "Missing quantifiable metrics", "JD mentions 'distributed systems' but resume does not"] },
    "summary": { "score": 60, "maxScore": 100, "issues": ["Does not mirror JD language", "Add job title from JD into your headline"] },
    "education": { "score": 80, "maxScore": 100, "issues": [] }
  },
  "formattingIssues": [
    "Avoid tables — ATS cannot parse table content",
    "Do not use headers/footers with contact info — ATS ignores them",
    "Use standard section titles: 'Work Experience' not 'Where I Worked'",
    "Save as .docx or plain PDF — not image-based PDF"
  ],
  "quickFixes": [
    { "fix": "Add 'Docker' to Skills section", "impact": "high", "timeMinutes": 2 },
    { "fix": "Change summary headline to match job title exactly", "impact": "high", "timeMinutes": 3 },
    { "fix": "Add 5 missing keywords from JD to skills list", "impact": "high", "timeMinutes": 5 },
    { "fix": "Replace weak verbs: 'worked on' → 'engineered', 'helped' → 'led'", "impact": "medium", "timeMinutes": 10 },
    { "fix": "Add metrics to 3 experience bullets (%, numbers, scale)", "impact": "medium", "timeMinutes": 15 }
  ],
  "improvedScore": 78,
  "improvedVerdict": "shortlisted",
  "totalFixTime": "35 minutes"
}

verdict must be: "rejected" | "borderline" | "shortlisted" | "strong"
importance must be: "critical" | "important" | "nice-to-have"
impact must be: "high" | "medium" | "low"

atsScore: 0-100 (below 60 = likely rejected, 60-75 = borderline, 75+ = shortlisted)
improvedScore: what score would be after applying quickFixes

Job Description:
${jobDescription.slice(0, 3000)}

Resume:
${resumeText.slice(0, 3000)}`;
}

// ── 12. Job Rejection Analyzer ────────────────────────────────────
export function rejectionAnalyzerPrompt(
  rejectionEmail: string,
  jobTitle: string,
  company: string,
  jobDescription: string,
  resumeText: string
): string {
  return `You are a career coach helping candidates learn from rejections and bounce back stronger.
Analyze this rejection and give honest, actionable insights.

Return ONLY this JSON:
{
  "rejectionType": "skills_mismatch",
  "tone": "polite",
  "wasHuman": true,
  "likelyReasons": [
    { "reason": "Missing required skill: Docker/Kubernetes", "confidence": "high", "evidence": "JD listed Docker as required; resume does not mention it" },
    { "reason": "Overqualified for the seniority level", "confidence": "medium", "evidence": "8 years experience for a role expecting 3-5 years" }
  ],
  "whatWentWell": [
    "Resume passed ATS screening",
    "Got a human response — most rejections are silent",
    "Applied within 3 days of posting"
  ],
  "improvementAreas": [
    { "area": "Technical Skills Gap", "action": "Add Docker to your skillset. A free 2-hour YouTube course is enough to add it honestly.", "priority": "high" },
    { "area": "Resume Targeting", "action": "Downplay leadership experience when applying to IC (Individual Contributor) roles.", "priority": "high" },
    { "area": "Cover Letter", "action": "Reference specific products or recent news about the company — shows genuine interest.", "priority": "medium" }
  ],
  "alternativeRoles": [
    { "role": "Senior Backend Engineer", "reason": "Your experience level is better matched — you will be valued, not overlooked", "companies": ["Razorpay", "CRED", "Meesho", "Groww"] },
    { "role": "Tech Lead", "reason": "Leverage your leadership experience instead of hiding it", "companies": ["Zepto", "PhonePe", "Juspay"] },
    { "role": "Founding Engineer at Startup", "reason": "Startups value breadth — you would be a strong early hire", "companies": ["YC India startups", "top angel-funded startups"] }
  ],
  "shouldReapply": false,
  "reapplyAdvice": "Wait 6 months after adding Docker/Kubernetes experience. The team is growing.",
  "replyToRejection": "Hi [Name], thank you for the update. I would love to stay in touch — if a more senior role opens or the team grows, I would appreciate being considered. Wishing you all the best!",
  "emotionalNote": "Rejection stings, but this one has clear fixable reasons — two skill gaps and a seniority mismatch. That is very fixable in 30 days.",
  "nextSteps": [
    "Apply to 3 senior-level roles today where your experience is valued",
    "Complete a Docker fundamentals course this weekend (2-3 hours)",
    "Rewrite your resume summary to match your actual seniority",
    "Send the reply email above to leave the door open"
  ]
}

rejectionType: "generic" | "skills_mismatch" | "overqualified" | "underqualified" | "culture_fit" | "budget" | "internal_hire" | "ghosted"
tone: "polite" | "cold" | "encouraging" | "vague"
confidence: "high" | "medium" | "low"
priority: "high" | "medium" | "low"

Job Title: ${jobTitle}
Company: ${company}

Rejection Email:
${rejectionEmail.slice(0, 1500)}

Job Description:
${jobDescription.slice(0, 1500)}

Resume:
${resumeText.slice(0, 1500)}`;
}
