// A single integer in local device storage, no account, no backend, per
// CLAUDE.md. Resetting on reinstall (or clearing localStorage) is acceptable.
const STORAGE_KEY = "trail-score:visit-count";

export function getAndIncrementVisitCount() {
  if (typeof localStorage === "undefined") return 1;
  const stored = parseInt(localStorage.getItem(STORAGE_KEY) ?? "0", 10);
  const next = (Number.isFinite(stored) ? stored : 0) + 1;
  localStorage.setItem(STORAGE_KEY, String(next));
  return next;
}

export function resetVisitCount() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
