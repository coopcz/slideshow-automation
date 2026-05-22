import { Copy, Edit3, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';

export default function Dashboard({ slideshows, onOpen, onCreate, onRefresh }) {
  return (
    <div className="flex h-full flex-col bg-paper">
      <div className="flex items-center justify-between border-b border-line px-6 py-5">
        <div>
          <h1 className="font-display text-4xl uppercase">Slideshows</h1>
          <p className="text-sm text-ink/60">Local drafts and rendered projects</p>
        </div>
        <button className="flex items-center gap-2 bg-ink px-4 py-3 text-sm font-bold text-white" onClick={onCreate}><Plus size={16} /> New slideshow</button>
      </div>
      <div className="grid flex-1 auto-rows-min grid-cols-4 gap-4 overflow-auto p-6">
        {slideshows.map((show) => (
          <div key={show.id} className="border border-line bg-white">
            <button className="aspect-[4/5] w-full overflow-hidden bg-neutral-900" onClick={() => onOpen(show)}>
              {show.slides[0]?.image_url ? <img src={show.slides[0].image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-white/60">No image</div>}
            </button>
            <div className="p-3">
              <div className="truncate text-sm font-bold">{show.title}</div>
              <div className="mt-1 text-xs uppercase text-ink/50">{show.status}</div>
              <div className="mt-3 flex gap-3">
                <button title="Edit" onClick={() => onOpen(show)}><Edit3 size={15} /></button>
                <button title="Duplicate" onClick={async () => { await api(`/api/slideshows/${show.id}/duplicate`, { method: 'POST' }); onRefresh(); }}><Copy size={15} /></button>
                <button title="Delete" onClick={async () => { await api(`/api/slideshows/${show.id}`, { method: 'DELETE' }); onRefresh(); }}><Trash2 size={15} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
