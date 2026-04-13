import { ResumeAnalysis, FeedbackReport, GeneratedQuestion } from "@/types";

export const MOCK_RESUME_ANALYSIS: ResumeAnalysis = {
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "PostgreSQL", "REST APIs", "Git"],
  strengths: [
    "Strong frontend development experience with React ecosystem",
    "Full-stack capability with Node.js backend experience",
    "Good understanding of database design and SQL",
    "Experience with version control and collaborative development",
  ],
  missingSkills: [
    "Docker / Kubernetes",
    "Cloud platforms (AWS/GCP/Azure)",
    "GraphQL",
    "Testing frameworks (Jest, Cypress)",
    "CI/CD pipelines",
  ],
  atsSuggestions: [
    "Add quantifiable achievements (e.g., 'Improved performance by 40%')",
    "Include relevant keywords from job descriptions",
    "Use action verbs at the start of bullet points",
    "Add a dedicated skills section with categorized technologies",
    "Ensure consistent date formatting throughout",
  ],
  betterSummary:
    "Results-driven Full Stack Developer with 3+ years of experience building scalable web applications using React, TypeScript, and Node.js. Proven track record of delivering high-quality software solutions that improve user experience and business outcomes.",
  careerRecommendations: [
    "Pursue AWS Solutions Architect certification to strengthen cloud skills",
    "Contribute to open-source projects to build public portfolio",
    "Learn Docker and containerization for DevOps readiness",
    "Consider specializing in either frontend or backend for senior roles",
  ],
  experienceLevel: "mid",
  detectedRole: "Full Stack Developer",
  yearsOfExperience: 3,
  educationLevel: "Bachelor's Degree",
  overallScore: 72,
};

export const MOCK_FEEDBACK: FeedbackReport = {
  overallScore: 74,
  technicalScore: 70,
  communicationScore: 80,
  confidenceScore: 72,
  strengths: [
    "Clear and structured communication style",
    "Good understanding of core concepts",
    "Provided relevant examples from past experience",
    "Showed enthusiasm and genuine interest in the role",
  ],
  weakAreas: [
    "Answers lacked specific technical depth in system design",
    "Could improve on quantifying past achievements",
    "Some answers were too brief and needed more elaboration",
  ],
  betterAnswers: [
    {
      question: "Tell me about yourself",
      improvedAnswer:
        "I'm a Full Stack Developer with 3 years of experience specializing in React and Node.js. At my previous company, I led the migration of a legacy system to a modern microservices architecture, reducing deployment time by 60%. I'm passionate about clean code and scalable systems, which is why I'm excited about this opportunity.",
    },
    {
      question: "What is your greatest weakness?",
      improvedAnswer:
        "I used to struggle with delegating tasks, wanting to handle everything myself. I recognized this was limiting team growth, so I started actively mentoring junior developers and using project management tools to distribute work effectively. This has improved our team velocity by 30%.",
    },
  ],
  improvementRoadmap: [
    "Practice system design problems on Excalidraw weekly",
    "Study STAR method for behavioral questions",
    "Review data structures and algorithms fundamentals",
    "Record mock interviews to analyze communication patterns",
    "Read 'Cracking the Coding Interview' for technical prep",
  ],
  summary:
    "Overall a solid performance showing good communication skills and relevant experience. The candidate demonstrates a strong foundation but needs to work on providing more technical depth and quantifiable examples. With focused preparation on system design and behavioral storytelling, this candidate has strong potential.",
};

export const MOCK_QUESTIONS: Record<string, GeneratedQuestion[]> = {
  technical: [
    { text: "Looking at your resume, you've worked with Node.js — can you explain how the event loop works and how it handles async operations?", type: "main", orderIndex: 1 },
    { text: "Your resume mentions REST APIs — what's the difference between REST and GraphQL, and when would you choose one over the other?", type: "main", orderIndex: 2 },
    { text: "I see you've used PostgreSQL — how would you optimize a slow SQL query? Walk me through your approach.", type: "main", orderIndex: 3 },
    { text: "What is the difference between `==` and `===` in JavaScript?", type: "main", orderIndex: 4 },
    { text: "Explain the concept of closures in JavaScript with a practical example.", type: "main", orderIndex: 5 },
  ],
  hr: [
    { text: "Your resume shows you've changed roles a couple of times — can you walk me through your career journey and what drove each transition?", type: "main", orderIndex: 1 },
    { text: "Based on your experience, what kind of team culture do you thrive in?", type: "main", orderIndex: 2 },
    { text: "Why are you looking for a new opportunity right now?", type: "main", orderIndex: 3 },
    { text: "Where do you see yourself in 5 years?", type: "main", orderIndex: 4 },
    { text: "What are your salary expectations for this role?", type: "main", orderIndex: 5 },
  ],
  behavioral: [
    { text: "Your resume mentions leading a project — tell me about a time you faced a major technical challenge on that project and how you resolved it.", type: "main", orderIndex: 1 },
    { text: "Describe a situation where you had to work with a difficult team member. How did you handle it?", type: "main", orderIndex: 2 },
    { text: "Tell me about a project you're most proud of from your resume and why.", type: "main", orderIndex: 3 },
    { text: "Give an example of when you had to meet a very tight deadline. What did you do?", type: "main", orderIndex: 4 },
    { text: "Describe a time you received critical feedback. How did you respond and what did you change?", type: "main", orderIndex: 5 },
  ],
  system_design: [
    { text: "Based on your experience with APIs, how would you design a scalable REST API that handles 1 million requests per day?", type: "main", orderIndex: 1 },
    { text: "Design a URL shortening service like bit.ly — walk me through the architecture.", type: "main", orderIndex: 2 },
    { text: "How would you design a real-time notification system for a large-scale application?", type: "main", orderIndex: 3 },
    { text: "Design a rate limiting system for a public API. What are the trade-offs?", type: "main", orderIndex: 4 },
    { text: "How would you architect a microservices-based e-commerce platform?", type: "main", orderIndex: 5 },
  ],
};
