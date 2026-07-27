import { useCallback, useEffect, useState } from 'react';
import { getPinnedJobIds, savePinnedJobIds, sortJobsWithPinnedFirst } from '@/lib/pinnedJobs';

export function usePinnedJobs(userId: string | undefined) {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    setPinnedIds(getPinnedJobIds(userId));
  }, [userId]);

  const togglePin = useCallback(
    (jobId: string) => {
      setPinnedIds((prev) => {
        const next = prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId];
        savePinnedJobIds(userId, next);
        return next;
      });
    },
    [userId],
  );

  const isPinned = useCallback((jobId: string) => pinnedIds.includes(jobId), [pinnedIds]);

  const sortJobs = useCallback(
    <T extends { id: string }>(jobs: T[]) => sortJobsWithPinnedFirst(jobs, pinnedIds),
    [pinnedIds],
  );

  return { pinnedIds, togglePin, isPinned, sortJobs };
}
