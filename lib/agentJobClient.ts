/**
 * Browser-side: start a background agent job and poll it to completion,
 * reporting live progress (the graph node currently running).
 */

export interface AgentJob<T = unknown> {
  id: string;
  agent: string;
  status: "queued" | "running" | "succeeded" | "failed";
  // `count` > 1 when the same node ran repeatedly (parallel fan-out branches)
  progress: { node: string; at: string; count?: number }[];
  result: T | null;
  error: string | null;
  error_code: number | null;
}

/** Human-readable label for each graph node the user might see while waiting. */
const NODE_LABELS: Record<string, string> = {
  planner: "Planning the steps",
  resume_screening: "Screening the resume",
  extract_info: "Reading the resume",
  fetch_github: "Checking GitHub",
  match_jd: "Matching against the job",
  build_report: "Writing the screening report",
  review_rejection: "Waiting for your decision",
  scheduling: "Finding interview slots",
  propose_slots: "Checking available slots",
  draft_confirmation: "Drafting the confirmation",
  approve_booking: "Waiting for your approval",
  faq: "Searching company policies",
  retrieve_docs: "Searching company policies",
  answer_question: "Writing the answer",
  eval_answer: "Checking the answer for accuracy",
  other: "Thinking",
  finalize: "Putting it together",
  technical_eval: "Technical interviewer reviewing",
  hr_eval: "HR interviewer reviewing",
  domain_eval: "Domain expert reviewing",
  consensus: "Panel reaching consensus",
  assess_candidate: "Assessing candidates",
  rank_candidates: "Ranking the shortlist",
};

/** The latest step worth showing, e.g. "Checking GitHub" or "Assessing candidates (37)". */
export function progressLabel(progress: AgentJob["progress"]): string | null {
  for (let i = progress.length - 1; i >= 0; i--) {
    const label = NODE_LABELS[progress[i].node];
    if (label) {
      const count = progress[i].count ?? 1;
      return count > 1 ? `${label} (${count})` : label;
    }
  }
  return null;
}

const MAX_WAIT_MS = 10 * 60_000;

/**
 * `start` calls the app route that submits the job and returns { jobId }.
 * Resolves with the finished job (status succeeded or failed); throws on transport errors.
 */
export async function runAgentJob<T>(
  start: () => Promise<Response>,
  onProgress?: (label: string | null, job: AgentJob<T>) => void,
): Promise<AgentJob<T>> {
  const res = await start();
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not start the agent");

  const startedAt = Date.now();
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    // Poll quickly at first, then back off.
    await new Promise((r) => setTimeout(r, Date.now() - startedAt < 30_000 ? 1000 : 2500));
    const poll = await fetch(`/api/agent-jobs/${data.jobId}`);
    const job: AgentJob<T> & { error?: string } = await poll.json();
    if (!poll.ok) throw new Error(job.error ?? "Lost track of the agent job");
    onProgress?.(progressLabel(job.progress ?? []), job);
    if (job.status === "succeeded" || job.status === "failed") return job;
  }
  throw new Error("The agent is taking unusually long — please check back later.");
}
