"use client";
import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

interface Props {
  question?: string;
  answer: string;
  version?: string;
  threadId: string | null;
}

/** 👍/👎 on one Copilot answer. A thumbs-down becomes an eval case after review. */
export function FeedbackButtons({ question, answer, version, threadId }: Props) {
  const [rated, setRated] = useState<"up" | "down" | null>(null);

  async function rate(rating: "up" | "down") {
    if (rated) return;
    const comment = rating === "down" ? window.prompt("What was wrong with this answer? (optional)") ?? "" : "";
    setRated(rating);
    await fetch("/api/recruiter-copilot/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment, question, answer, version, threadId: threadId ?? undefined }),
    }).catch(() => { /* feedback is best-effort */ });
  }

  const base = "rounded p-1 transition-colors disabled:cursor-default";
  return (
    <div className="mt-2 flex items-center gap-1 text-muted-foreground">
      <button aria-label="Good answer" className={`${base} ${rated === "up" ? "text-green-500" : "hover:text-foreground"}`}
        onClick={() => rate("up")} disabled={rated !== null}>
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button aria-label="Bad answer" className={`${base} ${rated === "down" ? "text-red-500" : "hover:text-foreground"}`}
        onClick={() => rate("down")} disabled={rated !== null}>
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      {rated && <span className="text-[11px]">Thanks — noted.</span>}
    </div>
  );
}
