import { Suspense } from "react";
import { CopilotPhoneContent } from "./phone-content";

export const metadata = {
  title: "Copilot (phone) · AI Resume Coach",
  robots: { index: false, follow: false },
};

export default function InterviewPhonePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-zinc-950 text-zinc-400 p-4 flex items-center justify-center">Loading…</div>
      }
    >
      <CopilotPhoneContent />
    </Suspense>
  );
}
