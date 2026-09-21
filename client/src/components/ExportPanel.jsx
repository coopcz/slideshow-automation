import { Download, ExternalLink, Film, UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useRenderJob } from '../hooks/useRenderJob.js';

export default function ExportPanel({ slideshow, onSave }) {
  const [jobId, setJobId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [exports, setExports] = useState([]);
  const job = useRenderJob(jobId);

  async function refresh() {
    setExports(await api('/api/exports'));
  }

  useEffect(() => {
    refresh();
  }, [job?.status]);

  useEffect(() => {
    if (job && ['completed', 'failed'].includes(job.status)) setSubmitting(false);
  }, [job?.status]);

  async function render(exportAsVideo) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const next = {
        ...slideshow,
        settings: {
          ...slideshow.settings,
          export_as_video: exportAsVideo
        }
      };
      const saved = await api(`/api/slideshows/${slideshow.id}`, {
        method: 'PUT',
        body: JSON.stringify(next)
      });
      await onSave(saved);
      const result = await api(`/api/slideshows/${saved.id}/render`, { method: 'POST' });
      setJobId(result.job_id);
    } catch (error) {
      setSubmitting(false);
      throw error;
    }
  }

  return (
    <div className="border-t border-line p-4">
      <div className="grid grid-cols-2 gap-2">
        <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#657052] px-3 py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50" onClick={() => render(false)}>
          <UploadCloud size={16} /> {submitting ? 'Publishing...' : 'Publish PNGs to Drive'}
        </button>
        <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg border border-black/15 bg-white px-3 py-3 text-sm font-bold disabled:cursor-wait disabled:opacity-50" onClick={() => render(true)}>
          <Film size={16} /> Publish MP4
        </button>
      </div>
      {job && (
        <div className="mt-3 text-xs">
          <div className="mb-1 flex justify-between"><span>{job.message}</span><span>{job.progress}%</span></div>
          <div className="h-2 bg-line"><div className="h-full bg-ink" style={{ width: `${job.progress}%` }} /></div>
          {job.status === 'completed' && <div className="mt-2 flex gap-4 font-bold">
            {job.drive_url && <a className="flex items-center gap-2" href={job.drive_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open in Drive</a>}
            <a className="flex items-center gap-2" href={`/api/jobs/${job.id}/download`}><Download size={14} /> Download</a>
          </div>}
          {job.status === 'failed' && <p className="mt-2 text-red-700">{job.error}</p>}
        </div>
      )}
      <div className="mt-5">
        <h3 className="mb-2 text-xs font-bold uppercase">My Exports</h3>
        <div className="grid gap-2">
          {exports.slice(0, 5).map((item) => (
            <div key={item.id} className="flex items-center justify-between border border-line bg-white/50 p-2 text-xs">
              <span className="truncate">{item.title}</span>
              <div className="flex gap-2">
                {item.drive_url && <a title="Open in Google Drive" href={item.drive_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>}
                <a title="Download" href={`/api/jobs/${item.id}/download`}><Download size={14} /></a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
