import { Download, FileArchive, Film, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useRenderJob } from '../hooks/useRenderJob.js';

export default function ExportPanel({ slideshow, onSave }) {
  const [jobId, setJobId] = useState(null);
  const [exports, setExports] = useState([]);
  const job = useRenderJob(jobId);

  async function refresh() {
    setExports(await api('/api/exports'));
  }

  useEffect(() => {
    refresh();
  }, [job?.status]);

  async function render(exportAsVideo) {
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
  }

  return (
    <div className="border-t border-line p-4">
      <div className="grid grid-cols-2 gap-2">
        <button className="flex w-full items-center justify-center gap-2 bg-accent px-3 py-3 text-sm font-bold text-white" onClick={() => render(false)}>
          <FileArchive size={16} /> Render PNG ZIP
        </button>
        <button className="flex w-full items-center justify-center gap-2 border border-line bg-white px-3 py-3 text-sm font-bold" onClick={() => render(true)}>
          <Film size={16} /> Render MP4
        </button>
      </div>
      {job && (
        <div className="mt-3 text-xs">
          <div className="mb-1 flex justify-between"><span>{job.message}</span><span>{job.progress}%</span></div>
          <div className="h-2 bg-line"><div className="h-full bg-ink" style={{ width: `${job.progress}%` }} /></div>
          {job.status === 'completed' && <a className="mt-2 flex items-center gap-2 font-bold" href={`/api/jobs/${job.id}/download`}><Download size={14} /> Download</a>}
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
                <a title="Download" href={`/api/jobs/${item.id}/download`}><Download size={14} /></a>
                <button title="Delete export" onClick={async () => { await api(`/api/exports/${item.slideshow_id}`, { method: 'DELETE' }); refresh(); }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
