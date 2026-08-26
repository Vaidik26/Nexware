/**
 * Cross-screen signals about jobs the picker has just acted on.
 *
 * When a picker submits a job, the detail screen pops back to the list, but the
 * list can only learn the job is gone by refetching — so the finished job stayed
 * on screen for as long as that request took. Recording the id here lets the
 * list hide it immediately and reconcile when the server confirms.
 *
 * Module-level state deliberately: it has to outlive the screens being unmounted
 * as the picker navigates, and it is throwaway UI state that must never be
 * persisted across app launches.
 */

const submittedJobIds = new Set<string>();

/** Mark a job as submitted so the jobs list hides it without waiting. */
export function markJobSubmitted(id: string | number) {
  submittedJobIds.add(String(id));
}

export function isJobSubmitted(id: string | number): boolean {
  return submittedJobIds.has(String(id));
}

/**
 * Drop ids the server no longer reports as active. Without this the set would
 * grow all shift, and an id could linger long enough to hide a genuinely new
 * job that happened to reuse it.
 */
export function reconcileSubmittedJobs(activeIds: Array<string | number>) {
  const active = new Set(activeIds.map(String));
  for (const id of submittedJobIds) {
    if (!active.has(id)) submittedJobIds.delete(id);
  }
}
