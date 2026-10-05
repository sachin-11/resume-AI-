"use client";
import { useState } from "react";
import { ShieldAlert, CalendarClock, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

export type Approval =
  | {
      type: "confirm_rejection";
      candidate_name: string;
      rating?: number;
      reasons: string[];
      red_flags: string[];
    }
  | {
      type: "book_interview";
      candidate_name: string;
      candidate_email: string;
      slots: { slotId: string; startsAt: string; durationMin?: number }[];
      message: string;
    };

export type ApprovalAnswer =
  | { type: "confirm_rejection"; decision: "reject" | "maybe" | "shortlist"; note?: string }
  | { type: "book_interview"; approved: boolean; slotId?: string; message?: string };

/** A paused Copilot run waiting on the recruiter (human-in-the-loop gate). */
export function ApprovalCard({
  approval, busy, onAnswer,
}: {
  approval: Approval;
  busy: boolean;
  onAnswer: (answer: ApprovalAnswer) => void;
}) {
  const [note, setNote] = useState("");
  const [slotId, setSlotId] = useState(approval.type === "book_interview" ? approval.slots[0]?.slotId ?? "" : "");
  const [message, setMessage] = useState(approval.type === "book_interview" ? approval.message : "");

  return (
    <Card className="border-yellow-500/40 bg-yellow-500/5 px-4 py-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-yellow-500">
        <ShieldAlert className="h-4 w-4" /> Your approval is needed
      </div>

      {approval.type === "confirm_rejection" ? (
        <>
          <p className="text-sm">
            The AI recommends <strong>rejecting {approval.candidate_name}</strong>
            {approval.rating != null && <> (rating {approval.rating}/100)</>}. Nothing is final until you decide.
          </p>
          {[...approval.reasons, ...approval.red_flags].length > 0 && (
            <ul className="ml-4 list-disc text-xs text-muted-foreground space-y-0.5">
              {[...approval.reasons, ...approval.red_flags].map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          <Textarea
            placeholder="Note for the record (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-[56px] text-sm"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" disabled={busy}
              onClick={() => onAnswer({ type: "confirm_rejection", decision: "reject", note })}>
              Confirm reject
            </Button>
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => onAnswer({ type: "confirm_rejection", decision: "maybe", note })}>
              Change to maybe
            </Button>
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => onAnswer({ type: "confirm_rejection", decision: "shortlist", note })}>
              Shortlist instead
            </Button>
            {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            Book <strong>{approval.candidate_name}</strong> and email <strong>{approval.candidate_email}</strong>?
          </p>
          <div className="space-y-1.5">
            {approval.slots.map((s) => (
              <label key={s.slotId} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio" name="slot" value={s.slotId}
                  checked={slotId === s.slotId}
                  onChange={() => setSlotId(s.slotId)}
                  disabled={busy}
                />
                <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                {new Date(s.startsAt).toLocaleString()} {s.durationMin ? `· ${s.durationMin} min` : ""}
              </label>
            ))}
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[96px] text-sm"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !slotId}
              onClick={() => onAnswer({ type: "book_interview", approved: true, slotId, message })}>
              <Check className="h-4 w-4 mr-1" /> Approve &amp; send
            </Button>
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => onAnswer({ type: "book_interview", approved: false })}>
              <X className="h-4 w-4 mr-1" /> Don&apos;t book
            </Button>
            {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
          </div>
        </>
      )}
    </Card>
  );
}
