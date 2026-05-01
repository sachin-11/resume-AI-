export type PanelAgentId = "technical" | "hr" | "domain";

export const PANEL_AGENT_META: Record<
  PanelAgentId,
  { label: string; emoji: string; badgeClass: string; botClass: string }
> = {
  technical: {
    label: "Technical AI",
    emoji: "💻",
    badgeClass: "bg-blue-500/20 text-blue-300 border-blue-500/35",
    botClass: "bg-blue-600",
  },
  hr: {
    label: "HR AI",
    emoji: "🤝",
    badgeClass: "bg-pink-500/20 text-pink-300 border-pink-500/35",
    botClass: "bg-pink-600",
  },
  domain: {
    label: "Domain AI",
    emoji: "🎯",
    badgeClass: "bg-amber-500/20 text-amber-200 border-amber-500/35",
    botClass: "bg-amber-600",
  },
};

export function parsePanelAgent(v: string | null | undefined): PanelAgentId | null {
  if (v === "technical" || v === "hr" || v === "domain") return v;
  return null;
}
