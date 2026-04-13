import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  return "text-red-500";
}

export function getScoreBg(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

export function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case "beginner": return "text-green-500 bg-green-500/10";
    case "intermediate": return "text-yellow-500 bg-yellow-500/10";
    case "advanced": return "text-red-500 bg-red-500/10";
    default: return "text-gray-500 bg-gray-500/10";
  }
}

export function getRoundTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    hr: "HR Round",
    technical: "Technical Round",
    behavioral: "Behavioral Round",
    system_design: "System Design Round",
  };
  return labels[type] ?? type;
}

export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : str;
    return JSON.parse(jsonStr.trim()) as T;
  } catch {
    return fallback;
  }
}
