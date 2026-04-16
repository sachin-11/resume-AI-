import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const settingsSchema = z.object({
  name: z.string().min(2).optional(),
  targetRole: z.string().optional(),
  techStack: z.array(z.string()).optional(),
  experienceYears: z.number().min(0).max(50).optional(),
});

export const interviewSetupSchema = z.object({
  resumeId: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  roundType: z.enum(["hr", "technical", "behavioral", "system_design"]),
  questionCount: z.number().min(3).max(15).default(5),
  customQuestionIds: z.array(z.string()).optional(),
  persona: z.string().default("friendly"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type InterviewSetupInput = z.infer<typeof interviewSetupSchema>;
