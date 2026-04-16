export const RESUME_ANALYSIS_SYSTEM = `You are an expert resume analyst, ATS specialist, and career coach with 15+ years in tech hiring.
Parse resumes thoroughly into structured data and provide actionable feedback. Always respond with valid JSON only.`;

export function resumeAnalysisPrompt(resumeText: string): string {
  return `Analyze this resume and return a JSON object with EXACTLY this structure (no extra fields):
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
  "overallScore": 75,
  "structuredData": {
    "contactInfo": {
      "name": "full name or empty string",
      "email": "email or empty string",
      "phone": "phone or empty string",
      "location": "city/country or empty string",
      "linkedin": "linkedin url or empty string",
      "github": "github url or empty string"
    },
    "summary": "existing summary from resume or empty string",
    "experience": [
      {
        "company": "company name",
        "role": "job title",
        "duration": "Jan 2022 - Present",
        "highlights": ["achievement or responsibility 1", "achievement 2"]
      }
    ],
    "education": [
      {
        "institution": "university name",
        "degree": "B.Tech Computer Science",
        "year": "2020"
      }
    ],
    "skillsByCategory": {
      "languages": ["JavaScript", "Python"],
      "frameworks": ["React", "Node.js"],
      "databases": ["PostgreSQL", "MongoDB"],
      "tools": ["Git", "Docker"],
      "cloud": ["AWS", "GCP"],
      "other": ["REST APIs", "Agile"]
    },
    "certifications": ["AWS Certified Developer", "Google Cloud Professional"],
    "projects": [
      {
        "name": "project name",
        "tech": ["React", "Node.js"],
        "description": "brief description"
      }
    ]
  }
}

Resume:
${resumeText}`;
}

export function atsMatchPrompt(resumeText: string, jobDescription: string): string {
  return `You are an ATS (Applicant Tracking System) expert. Compare this resume against the job description.

Return ONLY this JSON:
{
  "score": 72,
  "matchedKeywords": ["React", "Node.js", "PostgreSQL"],
  "missingKeywords": ["Docker", "Kubernetes", "AWS Lambda"],
  "extraKeywords": ["Vue.js", "MongoDB"],
  "recommendation": "Your resume matches 72% of the job requirements. Add Docker and Kubernetes experience to significantly improve your chances."
}

Rules:
- score: 0-100 based on keyword + skill match
- matchedKeywords: important keywords present in BOTH resume and JD
- missingKeywords: keywords in JD but NOT in resume (these are critical gaps)
- extraKeywords: skills in resume not mentioned in JD (bonus skills)
- recommendation: 2-3 sentence actionable advice

Job Description:
${jobDescription.slice(0, 3000)}

Resume:
${resumeText.slice(0, 3000)}`;
}

export const QUESTION_GENERATION_SYSTEM = `You are an expert technical interviewer at a top tech company. 
Generate realistic, challenging interview questions. Always respond with valid JSON only.`;

export function questionGenerationPrompt(params: {
  resumeText: string;
  role: string;
  difficulty: string;
  roundType: string;
  count: number;
  language?: string;
  personaPrompt?: string;
}): string {
  const hasResume = params.resumeText.trim().length > 50;
  const resumeCount = hasResume ? Math.max(1, Math.round(params.count * 0.6)) : 0;
  const generalCount = params.count - resumeCount;

  const langNote = params.language && params.language !== "en"
    ? `\nLANGUAGE: Generate ALL question text in ${params.language === "hi" ? "Hindi (हिंदी)" : params.language === "es" ? "Spanish (Español)" : "French (Français)"}.\n`
    : "";

  const personaNote = params.personaPrompt
    ? `\nINTERVIEWER PERSONA:\n${params.personaPrompt}\n`
    : "";

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
${langNote}${personaNote}${resumeSection}
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

export function feedbackPrompt(qa: Array<{ question: string; answer: string; candidateAnswer?: string }>, language = "en"): string {
  const formatted = qa
    .map((item, i) => `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.candidateAnswer ?? item.answer}`)
    .join("\n\n");

  const langNote = language !== "en"
    ? `\nLANGUAGE: Write ALL text fields (summary, strengths, weakAreas, improvementRoadmap, betterAnswers text) in ${language === "hi" ? "Hindi (हिंदी)" : language === "es" ? "Spanish (Español)" : "French (Français)"}.\n`
    : "";

  return `Evaluate this interview performance and return JSON:${langNote}
{
  "overallScore": 75,
  "technicalScore": 70,
  "communicationScore": 80,
  "confidenceScore": 75,
  "strengths": ["strength1", "strength2"],
  "weakAreas": ["area1", "area2"],
  "betterAnswers": [
    {"question": "full question text here", "candidateAnswer": "what the candidate actually said", "improvedAnswer": "better answer example"}
  ],
  "improvementRoadmap": ["step1", "step2", "step3"],
  "summary": "overall performance summary paragraph"
}

Interview Q&A:
${formatted}`;
}

export const FOLLOWUP_SYSTEM = `You are a sharp technical interviewer conducting a live interview. 
Ask one focused follow-up question based on the candidate's answer. Be concise and direct.`;

export function followupPrompt(question: string, answer: string, personaFollowupStyle?: string): string {
  const style = personaFollowupStyle ?? "Ask ONE specific follow-up question to dig deeper or clarify a weak point in their answer.";
  return `The candidate was asked: "${question}"
Their answer: "${answer}"

${style}

Return only the follow-up question text, nothing else.`;
}
