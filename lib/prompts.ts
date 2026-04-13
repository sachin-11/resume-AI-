export const RESUME_ANALYSIS_SYSTEM = `You are an expert resume analyst and career coach with 15+ years of experience in tech hiring. 
Analyze resumes thoroughly and provide actionable, specific feedback. Always respond with valid JSON only.`;

export function resumeAnalysisPrompt(resumeText: string): string {
  return `Analyze this resume and return a JSON object with exactly this structure:
{
  "skills": ["skill1", "skill2"],
  "strengths": ["strength1", "strength2"],
  "missingSkills": ["skill1", "skill2"],
  "atsSuggestions": ["suggestion1", "suggestion2"],
  "betterSummary": "improved professional summary text",
  "careerRecommendations": ["recommendation1", "recommendation2"],
  "experienceLevel": "junior|mid|senior",
  "detectedRole": "detected job role",
  "yearsOfExperience": 0,
  "educationLevel": "degree level",
  "overallScore": 75
}

Resume:
${resumeText}`;
}

export const QUESTION_GENERATION_SYSTEM = `You are an expert technical interviewer at a top tech company. 
Generate realistic, challenging interview questions. Always respond with valid JSON only.`;

export function questionGenerationPrompt(params: {
  resumeText: string;
  role: string;
  difficulty: string;
  roundType: string;
  count: number;
}): string {
  const hasResume = params.resumeText.trim().length > 50;

  // Split: ~60% resume-based, ~40% general (minimum 1 of each when count >= 2)
  const resumeCount = hasResume ? Math.max(1, Math.round(params.count * 0.6)) : 0;
  const generalCount = params.count - resumeCount;

  const resumeSection = hasResume
    ? `
RESUME-BASED QUESTIONS (generate exactly ${resumeCount}):
These must reference specific details from the resume — projects, technologies used, job titles, companies, or achievements mentioned.
Label each with "source": "resume"

Candidate's Resume:
${params.resumeText.slice(0, 2500)}
`
    : "";

  const generalSection = `
GENERAL ${params.roundType.toUpperCase()} QUESTIONS (generate exactly ${generalCount}):
These are standard ${params.difficulty} level questions for a ${params.role} role — NOT based on the resume.
Cover core concepts, common patterns, and best practices for this role.
Label each with "source": "general"
`;

  return `Generate exactly ${params.count} ${params.difficulty} level ${params.roundType} interview questions for a ${params.role} candidate.
${resumeSection}
${generalSection}

Return a single JSON array of exactly ${params.count} objects, resume-based questions first:
[
  {
    "text": "question text here",
    "type": "main",
    "source": "resume" | "general",
    "orderIndex": 1
  }
]

Round type guidelines:
- hr: Culture fit, motivation, career goals, past team experiences
- technical: Coding concepts, algorithms, system concepts, tech stack
- behavioral: STAR method, past situations, conflict resolution, leadership
- system_design: Architecture, scalability, trade-offs, design decisions

IMPORTANT: Return ONLY the JSON array. No extra text.`;
}

export const FEEDBACK_SYSTEM = `You are an expert interview coach who provides detailed, constructive feedback. 
Analyze interview performance objectively and provide actionable improvement advice. Always respond with valid JSON only.`;

export function feedbackPrompt(qa: Array<{ question: string; answer: string }>): string {
  const formatted = qa
    .map((item, i) => `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.answer}`)
    .join("\n\n");

  return `Evaluate this interview performance and return JSON:
{
  "overallScore": 75,
  "technicalScore": 70,
  "communicationScore": 80,
  "confidenceScore": 75,
  "strengths": ["strength1", "strength2"],
  "weakAreas": ["area1", "area2"],
  "betterAnswers": [
    {"question": "q1", "improvedAnswer": "better answer example"}
  ],
  "improvementRoadmap": ["step1", "step2", "step3"],
  "summary": "overall performance summary paragraph"
}

Interview Q&A:
${formatted}`;
}

export const FOLLOWUP_SYSTEM = `You are a sharp technical interviewer conducting a live interview. 
Ask one focused follow-up question based on the candidate's answer. Be concise and direct.`;

export function followupPrompt(question: string, answer: string): string {
  return `The candidate was asked: "${question}"
Their answer: "${answer}"

Ask ONE specific follow-up question to dig deeper or clarify a weak point in their answer. 
Return only the follow-up question text, nothing else.`;
}
