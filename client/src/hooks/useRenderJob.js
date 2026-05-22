import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function useRenderJob(jobId) {
  const [job, setJob] = useState(null);

  useEffect(() => {
    if (!jobId) return undefined;
    let active = true;
    async function poll() {
      const next = await api(`/api/jobs/${jobId}/status`).catch(() => null);
      if (!active || !next) return;
      setJob(next);
      if (next.status === 'completed') window.location.href = `/api/jobs/${jobId}/download`;
      if (!['completed', 'failed'].includes(next.status)) setTimeout(poll, 3000);
    }
    poll();
    return () => {
      active = false;
    };
  }, [jobId]);

  return job;
}
