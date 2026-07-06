import { Brain, Calendar, ChevronRight, Copy, Edit3, Images, LayoutGrid, Plus, RefreshCw, Save, Settings, SkipForward, Trash2, Workflow, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import AutomationStudio from './AutomationStudio.jsx';
import ImageLibrary from './ImageLibrary.jsx';

function formatDate(value) {
  if (!value) return 'Not saved';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function SlideshowsPanel({ slideshows, onOpen, onCreate, onRefresh }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h1 className="text-xl font-extrabold">Slideshows</h1>
          <p className="text-sm text-ink/55">{slideshows.length} project{slideshows.length === 1 ? '' : 's'}</p>
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

function QueuePanel() {
  const [schedules, setSchedules] = useState([]);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    api('/api/automation/schedules').then(setSchedules).catch(() => {});
    api('/api/jobs?limit=20').then((data) => setJobs(Array.isArray(data) ? data : data?.jobs ?? [])).catch(() => {});
  }, []);

  async function deleteSchedule(id) {
    await api(`/api/automation/schedules/${id}`, { method: 'DELETE' });
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  async function toggleSchedule(schedule) {
    const updated = await api(`/api/automation/schedules/${schedule.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !schedule.enabled }),
    }).catch(() => null);
    if (updated) setSchedules((prev) => prev.map((s) => s.id === schedule.id ? { ...s, enabled: !s.enabled } : s));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h1 className="text-xl font-extrabold">Queue</h1>
          <p className="text-sm text-ink/55">Scheduled automation runs</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
        <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">Scheduled Automations</h2>
          {schedules.length === 0 ? (
            <div className="flex items-center gap-3 border border-line bg-white/60 px-4 py-6 text-sm text-ink/50">
              <Calendar size={18} />
              No scheduled automations. Set them up in the Automation Studio inside a slideshow.
            </div>
          ) : (
            <div className="divide-y divide-line border border-line">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="flex items-center justify-between gap-4 bg-paper px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{schedule.name || 'Unnamed schedule'}</div>
                    <div className="mt-0.5 text-xs text-ink/50">
                      {Array.isArray(schedule.times) ? schedule.times.join(', ') : schedule.times}
                      {schedule.days_of_week && ` · ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].filter((_, i) => schedule.days_of_week.includes(i)).join(', ')}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase tracking-wide ${schedule.enabled ? 'text-green-600' : 'text-ink/40'}`}>
                      {schedule.enabled ? 'Active' : 'Paused'}
                    </span>
                    <button className="flex h-8 w-8 items-center justify-center border border-line bg-white" title={schedule.enabled ? 'Pause' : 'Resume'} onClick={() => toggleSchedule(schedule)}>
                      <SkipForward size={14} />
                    </button>
                    <button className="flex h-8 w-8 items-center justify-center border border-line bg-white text-red-500" title="Delete" onClick={() => deleteSchedule(schedule.id)}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">Recent Jobs</h2>
          {jobs.length === 0 ? (
            <div className="flex items-center gap-3 border border-line bg-white/60 px-4 py-6 text-sm text-ink/50">
              <Zap size={18} />
              No render jobs yet.
            </div>
          ) : (
            <div className="divide-y divide-line border border-line">
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-4 bg-paper px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{job.slideshow_title || job.id}</div>
                    <div className="mt-0.5 text-xs text-ink/50">{formatDate(job.created_at)}</div>
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-wide ${
                    job.status === 'done' ? 'text-green-600' :
                    job.status === 'error' ? 'text-red-500' :
                    'text-ink/50'
                  }`}>{job.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const emptyProduct = { name: '', app_name: '', niche: '', brief_overview: '', comprehensive_overview: '', target_audience: '', ai_memory: '' };

function ProductForm({ initial = emptyProduct, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <h2 className="text-lg font-extrabold">{initial.id ? 'Edit Product' : 'New Product'}</h2>
        <div className="flex items-center gap-2">
          <button className="flex h-9 items-center gap-2 border border-line bg-white px-4 text-sm font-bold" onClick={onCancel}>Cancel</button>
          <button className="flex h-9 items-center gap-2 bg-ink px-4 text-sm font-bold text-white" onClick={() => onSave(form)}>
            <Save size={14} /> Save
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Product Name *">
            <input className="border border-line bg-white px-3 py-2 text-sm w-full" value={form.name} onChange={set('name')} placeholder="Latter Study" />
          </Field>
          <Field label="App Name">
            <input className="border border-line bg-white px-3 py-2 text-sm w-full" value={form.app_name} onChange={set('app_name')} placeholder="com.latterstudy" />
          </Field>
        </div>
        <Field label="Niche">
          <input className="border border-line bg-white px-3 py-2 text-sm w-full" value={form.niche} onChange={set('niche')} placeholder="LDS scripture study apps" />
        </Field>
        <Field label="Target Audience">
          <input className="border border-line bg-white px-3 py-2 text-sm w-full" value={form.target_audience} onChange={set('target_audience')} placeholder="LDS individuals and families who want consistent scripture study" />
        </Field>
        <Field label="Brief Overview">
          <textarea className="border border-line bg-white px-3 py-2 text-sm w-full min-h-[72px] resize-y" value={form.brief_overview} onChange={set('brief_overview')} placeholder="One or two sentences describing the product." />
        </Field>
        <Field label="Comprehensive Overview">
          <textarea className="border border-line bg-white px-3 py-2 text-sm w-full min-h-[140px] resize-y" value={form.comprehensive_overview} onChange={set('comprehensive_overview')} placeholder="Full product description — features, benefits, value props, tone of voice, etc." />
        </Field>
        <Field label="AI Memory">
          <textarea className="border border-line bg-white px-3 py-2 text-sm w-full min-h-[120px] resize-y font-mono" value={form.ai_memory} onChange={set('ai_memory')} placeholder={"Things the AI should always know:\n- Never mention competing apps\n- Always use a faithful, hopeful tone\n- Avoid overly churchy jargon"} />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-bold uppercase tracking-wide text-ink/50">{label}</span>
      {children}
    </label>
  );
}

function BrainPanel() {
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null); // null = list, 'new' or product object = form

  async function load() {
    const data = await api('/api/products').catch(() => []);
    setProducts(data);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(form) {
    if (editing === 'new') {
      await api('/api/products', { method: 'POST', body: JSON.stringify(form) });
    } else {
      await api(`/api/products/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
    }
    await load();
    setEditing(null);
  }

  async function handleDelete(id) {
    await api(`/api/products/${id}`, { method: 'DELETE' });
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  if (editing !== null) {
    return (
      <ProductForm
        initial={editing === 'new' ? emptyProduct : editing}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h1 className="text-xl font-extrabold">Brain</h1>
          <p className="text-sm text-ink/55">Products &amp; AI context</p>
        </div>
        <button className="flex h-10 items-center gap-2 bg-ink px-4 text-sm font-bold text-white" onClick={() => setEditing('new')}>
          <Plus size={15} /> Add Product
        </button>
      </div>
      <div className="flex-1 overflow-auto px-6 py-5">
        {products.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Brain size={36} className="text-ink/20" />
            <p className="text-sm font-bold text-ink/40">No products yet</p>
            <p className="text-xs text-ink/30 max-w-xs">Add a product so the AI knows who you are, what you sell, and how to talk about it.</p>
            <button className="mt-2 flex items-center gap-2 border border-line bg-white px-4 py-2 text-sm font-bold" onClick={() => setEditing('new')}>
              <Plus size={15} /> Add Product
            </button>
          </div>
        ) : (
          <div className="divide-y divide-line border border-line">
            {products.map((product) => (
              <div key={product.id} className="flex items-center gap-4 bg-paper px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{product.name}</span>
                    {product.app_name && <span className="text-xs text-ink/40 font-mono">{product.app_name}</span>}
                    {product.niche && <span className="rounded bg-ink/8 px-2 py-0.5 text-[11px] font-semibold text-ink/55">{product.niche}</span>}
                  </div>
                  {product.brief_overview && <p className="mt-0.5 text-xs text-ink/55 line-clamp-1">{product.brief_overview}</p>}
                  {product.target_audience && <p className="mt-0.5 text-xs text-ink/40 line-clamp-1">Audience: {product.target_audience}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button className="flex h-8 w-8 items-center justify-center border border-line bg-white" title="Edit" onClick={() => setEditing(product)}><Edit3 size={14} /></button>
                  <button className="flex h-8 w-8 items-center justify-center border border-line bg-white text-red-500" title="Delete" onClick={() => handleDelete(product.id)}><Trash2 size={14} /></button>
                  <button className="flex h-8 w-8 items-center justify-center border border-line bg-white text-ink/40" title="View" onClick={() => setEditing(product)}><ChevronRight size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const navItems = [
  { id: 'slideshows', label: 'Slideshows', icon: LayoutGrid },
  { id: 'automation', label: 'Automation', icon: Workflow },
  { id: 'images', label: 'Image Library', icon: Images },
  { id: 'brain', label: 'Brain', icon: Brain },
  { id: 'queue', label: 'Queue', icon: Calendar },
];

function AutomationPanel({ onOpen }) {
  const [status, setStatus] = useState('');
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h1 className="text-xl font-extrabold">Automation</h1>
          <p className="text-sm text-ink/55">Recipes, schedules, and prompt queues</p>
        </div>
        {status && <p className="max-w-sm truncate text-xs text-ink/55">{status}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <AutomationStudio onOpenSlideshow={onOpen} onStatus={setStatus} />
      </div>
    </div>
  );
}

export default function Dashboard({ slideshows, onOpen, onCreate, onRefresh }) {
  const [activeTab, setActiveTab] = useState('slideshows');

  return (
    <div className="flex h-screen bg-paper">
      {/* Left Sidebar */}
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-line bg-[#f5f2ed]">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-ink text-white">
            <Zap size={16} fill="currentColor" />
          </div>
          <span className="text-base font-extrabold tracking-tight">SlideShow AI</span>
        </div>
        <nav className="flex flex-1 flex-col px-2">
          <div className="space-y-0.5">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-semibold transition-colors ${
                  activeTab === id
                    ? 'bg-ink text-white'
                    : 'text-ink/70 hover:bg-black/5 hover:text-ink'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </nav>
        <div className="border-t border-line p-2">
          <button
            className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === 'settings'
                ? 'bg-ink text-white'
                : 'text-ink/70 hover:bg-black/5 hover:text-ink'
            }`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={16} />
            Settings
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Panel content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab === 'slideshows' && (
            <SlideshowsPanel slideshows={slideshows} onOpen={onOpen} onCreate={onCreate} onRefresh={onRefresh} />
          )}
          {activeTab === 'automation' && <AutomationPanel onOpen={onOpen} />}
          {activeTab === 'images' && <ImageLibrary />}
          {activeTab === 'brain' && <BrainPanel />}
          {activeTab === 'queue' && <QueuePanel />}
          {activeTab === 'settings' && (
            <div className="flex h-full flex-col">
              <div className="border-b border-line px-6 py-4">
                <h1 className="text-xl font-extrabold">Settings</h1>
                <p className="text-sm text-ink/55">Application preferences</p>
              </div>
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-ink/40">Settings coming soon.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
