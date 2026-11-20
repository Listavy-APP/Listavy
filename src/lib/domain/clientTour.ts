/**
 * Client first-run tour rules (build item 8g). Pure functions, no I/O.
 * Clients only. Pros never see the tour. A dual-role user (pro with client jobs) sees it once.
 */

export type TourProfile = { role: string; client_tour_completed_at?: string | null };

/**
 * True when the first-run tour should open on this visit.
 * Fails open: only an explicit null flag (never completed) can show it. A missing flag (undefined)
 * means the read failed or the column is absent, so no tour is shown and the user is not trapped.
 */
export function shouldShowClientTour(profile: TourProfile, hasClientJobs: boolean): boolean {
  if (profile.client_tour_completed_at !== null) return false;
  if (profile.role === "homeowner") return true;
  if (profile.role === "pro") return hasClientJobs;
  return false;
}

/** What finishing the tour does. Replays never touch the stored flag. */
export function tourFinishAction(mode: "first" | "replay"): "stamp" | "none" {
  return mode === "first" ? "stamp" : "none";
}
