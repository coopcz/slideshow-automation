import { ArrowRight, Copy, Edit3, Image, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import AutomationSettings from './AutomationSettings.jsx';
import ImageLibrary from './ImageLibrary.jsx';

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

export default function Dashboard({ slideshows, onOpen, onCreate, onRefresh }) {
  const [view, setView] = useState('create');
  const [topic, setTopic] = useState('');
  const [theme, setTheme] = useState('Useful gospel lessons for LDS moms and families');
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [recipeId, setRecipeId] = useState('');

  async function refreshRecipes() {
    const next = await api('/api/automation/recipes');
    setRecipes(next);
    setRecipeId((current) => next.some((recipe) => recipe.id === current) ? current : '');
  }

  useEffect(() => {
    refreshRecipes().catch(() => {});
  }, []);

  async function suggestTopics() {
    setBusy('topics');
    setStatus('Finding distinct topics...');
    try {
      const result = await api('/api/automation/topics', { method: 'POST', body: JSON.stringify({ theme, count: 6 }) });
      setSuggestions(result.topics || []);
      setStatus('Choose a topic or write your own.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy('');
    }
  }

  async function createSlideshow() {
    if (!topic.trim()) return;
    setBusy('create');
    setStatus('Writing 7 slides, matching images, and preparing Google Drive...');
    try {
      const result = await api('/api/automation/quick-create', { method: 'POST', body: JSON.stringify({ topic, recipe_id: recipeId || undefined }) });
      await onRefresh();
      onOpen(result.slideshow);
    } catch (error) {
      setStatus(error.message);
      setBusy('');
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#1f211d]">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-[#f7f7f5]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-10">
          <button className="text-lg font-extrabold tracking-[-0.03em]" onClick={() => setView('create')}>Latter Study Slides</button>
          <nav className="flex items-center gap-1 rounded-full bg-black/[.045] p-1 text-sm font-semibold">
            <button className={`rounded-full px-4 py-2 transition ${view === 'create' ? 'bg-white shadow-sm' : 'text-black/55 hover:text-black'}`} onClick={() => setView('create')}>Create</button>
            <button className={`rounded-full px-4 py-2 transition ${view === 'images' ? 'bg-white shadow-sm' : 'text-black/55 hover:text-black'}`} onClick={() => setView('images')}>Images</button>
            <button className={`rounded-full px-4 py-2 transition ${view === 'automation' ? 'bg-white shadow-sm' : 'text-black/55 hover:text-black'}`} onClick={() => setView('automation')}>Automation</button>
          </nav>
        </div>
      </header>

      {view === 'images' ? <main className="mx-auto h-[calc(100vh-64px)] max-w-7xl"><ImageLibrary /></main> : view === 'automation' ? (
        <AutomationSettings onOpenSlideshow={onOpen} onRecipesChanged={refreshRecipes} />
      ) : (
        <main className="mx-auto max-w-7xl px-6 pb-20 pt-12 lg:px-10">
          <section className="border-b border-black/10 pb-14">
            <div className="border-l-2 border-[#657052] pl-6">
              <label className="text-xs font-bold uppercase tracking-[.12em] text-black/50">Your topic</label>
              <textarea autoFocus className="mt-2 min-h-32 w-full resize-none border-0 bg-transparent p-0 text-xl font-semibold leading-8 outline-none placeholder:text-black/25" placeholder="What Moroni’s visits teach us about repetition" value={topic} onChange={(event) => setTopic(event.target.value)} />
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <label className="font-semibold text-black/55" htmlFor="home-recipe">Writing recipe</label>
                <select id="home-recipe" className="max-w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[#657052]" value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
                  <option value="">Built-in LDS family recipe</option>
                  {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                </select>
                <span className="text-xs text-black/40">7 vertical slides · publishes to Drive</span>
              </div>
              <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f211d] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-50" disabled={!topic.trim() || Boolean(busy)} onClick={createSlideshow}>
                {busy === 'create' ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}{busy === 'create' ? 'Creating slideshow...' : 'Create slideshow'}
              </button>
              {status && <p className="mt-3 text-sm leading-6 text-black/50">{status}</p>}
            </div>
          </section>

          <section className="grid gap-8 border-b border-black/10 py-12 lg:grid-cols-[260px_1fr]">
            <div><h2 className="text-lg font-extrabold tracking-tight">Need an idea?</h2><p className="mt-2 text-sm leading-6 text-black/50">Generate six distinct topics, then choose the one worth making.</p></div>
            <div>
              <div className="flex gap-3">
                <input className="min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-4 py-3 text-sm outline-none focus:border-[#657052]" value={theme} onChange={(event) => setTheme(event.target.value)} />
                <button className="flex shrink-0 items-center gap-2 rounded-lg border border-black/15 bg-white px-4 py-3 text-sm font-bold hover:border-black/30 disabled:opacity-50" disabled={Boolean(busy)} onClick={suggestTopics}>{busy === 'topics' ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Suggest topics</button>
              </div>
              {suggestions.length > 0 && <div className="mt-5 divide-y divide-black/10 border-y border-black/10">{suggestions.map((item) => <button key={item} className="group flex w-full items-center justify-between gap-6 py-4 text-left text-sm font-semibold hover:text-[#657052]" onClick={() => { setTopic(item); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><span>{item}</span><ArrowRight className="shrink-0 opacity-30 transition group-hover:translate-x-1 group-hover:opacity-100" size={16} /></button>)}</div>}
            </div>
          </section>

          <section className="pt-12">
            <div className="mb-6 flex items-end justify-between">
              <div><h2 className="text-2xl font-extrabold tracking-[-0.03em]">Recent slideshows</h2><p className="mt-1 text-sm text-black/45">Open one to review text, replace an image, or publish again.</p></div>
              <button className="flex items-center gap-2 text-sm font-bold text-black/55 hover:text-black" onClick={onCreate}><Plus size={16} /> Blank slideshow</button>
            </div>
            {slideshows.length === 0 ? <div className="border-y border-black/10 py-14 text-center text-sm text-black/40">Your generated slideshows will appear here.</div> : (
              <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{slideshows.slice(0, 12).map((show) => (
                <article key={show.id} className="group min-w-0">
                  <button className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-[#20211f] text-white" onClick={() => onOpen(show)}>
                    {show.slides[0]?.image_url ? <img src={show.slides[0].image_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center"><Image size={24} className="opacity-30" /></div>}<div className="absolute inset-0 bg-black/20" /><span className="absolute bottom-4 left-4 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold">{show.slides.length} slides</span>
                  </button>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => onOpen(show)}><h3 className="line-clamp-2 text-sm font-bold leading-5">{show.title}</h3><p className="mt-1 text-xs text-black/40">{formatDate(show.updated_at)}</p></button>
                    <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100"><button className="p-2 text-black/45 hover:text-black" title="Edit" onClick={() => onOpen(show)}><Edit3 size={15} /></button><button className="p-2 text-black/45 hover:text-black" title="Duplicate" onClick={async () => { await api(`/api/slideshows/${show.id}/duplicate`, { method: 'POST' }); onRefresh(); }}><Copy size={15} /></button><button className="p-2 text-black/45 hover:text-red-600" title="Delete" onClick={async () => { await api(`/api/slideshows/${show.id}`, { method: 'DELETE' }); onRefresh(); }}><Trash2 size={15} /></button></div>
                  </div>
                </article>
              ))}</div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
