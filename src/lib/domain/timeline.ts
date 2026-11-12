/**
 * Job progress as six steps. Pure: the page passes the job's status and payment status,
 * this returns what to draw. No I/O.
 */

export const TIMELINE_STEPS = ["sent", "quotes", "approved", "paid", "in_progress", "completed"] as const;
export type TimelineStepId = (typeof TIMELINE_STEPS)[number];
export type StepState = "done" | "current" | "todo";

export interface Timeline {
  steps: { id: TimelineStepId; state: StepState }[];
  /** Jobs that left the normal path show a status note instead of the steps. */
  terminal: "cancelled" | "disputed" | null;
}

/** How many steps are finished for a job status. The next step, if any, is the current one. */
function stepsDone(status: string, paymentStatus: string): number {
  switch (status) {
    case "requested":
    case "quoted":
      return 1;
    case "accepted":
      return paymentStatus === "paid" ? 4 : 3;
    case "in_progress":
    case "awaiting_approval":
      return 4;
    case "completed":
      return 6;
    default:
      return 1;
  }
}

export function jobTimeline(status: string, paymentStatus: string): Timeline {
  if (status === "cancelled" || status === "disputed") return { steps: [], terminal: status };
  const done = stepsDone(status, paymentStatus);
  return {
    terminal: null,
    steps: TIMELINE_STEPS.map((id, i) => ({
      id,
      state: i < done ? "done" : i === done ? "current" : "todo",
    })),
  };
}
