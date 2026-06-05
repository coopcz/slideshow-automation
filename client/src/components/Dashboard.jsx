import { Copy, Edit3, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../api.js';

function formatDate(value) {
  if (!value) return 'Not saved';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function Dashboard({ slideshows, onOpen, onCreate, onRefresh }) {
  return (
    <div className="flex h-full flex-col bg-paper">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h1 className="text-xl font-extrabold">Slideshows</h1>
          <p className="text-sm text-ink/55">{slideshows.length} local project{slideshows.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex h-10 w-10 items-center justify-center border border-line bg-white text-ink" title="Refresh" onClick={onRefresh}>
            <RefreshCw size={16} />
          </button>
          <button className="flex h-10 items-center gap-2 bg-ink px-4 text-sm font-bold text-white" onClick={onCreate}>
            <Plus size={16} /> New
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        {slideshows.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <button className="flex items-center gap-2 border border-line bg-white px-4 py-3 text-sm font-bold" onClick={onCreate}>
              <Plus size={16} /> Create slideshow
            </button>
          </div>
        ) : (
          <div className="min-w-[720px] divide-y divide-line border-y border-line">
            {slideshows.map((show) => (
              <div key={show.id} className="grid grid-cols-[72px_minmax(0,1fr)_120px_140px_112px] items-center gap-4 bg-paper py-3">
                <button className="h-20 w-[64px] overflow-hidden bg-neutral-900 text-xs text-white/60" onClick={() => onOpen(show)} title={`Open ${show.title}`}>
                  {show.slides[0]?.image_url ? <img src={show.slides[0].image_url} alt="" className="h-full w-full object-cover" /> : 'No image'}
                </button>
                <button className="min-w-0 text-left" onClick={() => onOpen(show)}>
                  <div className="truncate text-sm font-bold">{show.title}</div>
                  <div className="mt-1 text-xs text-ink/50">{show.slides.length} slide{show.slides.length === 1 ? '' : 's'}</div>
                </button>
                <div className="text-xs font-bold uppercase tracking-wide text-ink/50">{show.status}</div>
                <div className="text-xs text-ink/55">{formatDate(show.updated_at)}</div>
                <div className="flex justify-end gap-2">
                  <button className="flex h-9 w-9 items-center justify-center border border-line bg-white" title="Edit" onClick={() => onOpen(show)}><Edit3 size={15} /></button>
                  <button className="flex h-9 w-9 items-center justify-center border border-line bg-white" title="Duplicate" onClick={async () => { await api(`/api/slideshows/${show.id}/duplicate`, { method: 'POST' }); onRefresh(); }}><Copy size={15} /></button>
                  <button className="flex h-9 w-9 items-center justify-center border border-line bg-white" title="Delete" onClick={async () => { await api(`/api/slideshows/${show.id}`, { method: 'DELETE' }); onRefresh(); }}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
