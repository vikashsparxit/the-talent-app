const STORAGE_PREFIX = 'sparxtalent_pinned_jobs';

export function getPinnedJobIds(userId: string | undefined): string[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function savePinnedJobIds(userId: string | undefined, jobIds: string[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${userId}`, JSON.stringify(jobIds));
  } catch {
    // localStorage unavailable
  }
}

export function sortJobsWithPinnedFirst<T extends { id: string }>(jobs: T[], pinnedIds: string[]): T[] {
  if (pinnedIds.length === 0) return jobs;
  const pinnedSet = new Set(pinnedIds);
  const pinned = pinnedIds
    .map((id) => jobs.find((j) => j.id === id))
    .filter((j): j is T => j !== undefined);
  const unpinned = jobs.filter((j) => !pinnedSet.has(j.id));
  return [...pinned, ...unpinned];
}

/** Active (non-paused) first, then all paused — preserves relative order within each group. */
export function sortActiveJobsThenPaused<T extends { status: string }>(jobs: T[]): T[] {
  const active: T[] = [];
  const paused: T[] = [];
  for (const job of jobs) {
    if (job.status === 'paused') paused.push(job);
    else active.push(job);
  }
  return [...active, ...paused];
}
