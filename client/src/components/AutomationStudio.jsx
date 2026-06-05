import { Loader2, Play, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const emptyRecipe = {
  name: 'Latter Study evergreen slideshow',
  product_name: 'Latter Study',
  audience: 'LDS individuals and families who want consistent scripture study',
  goal: 'Promote Latter Study while teaching practical scripture study ideas.',
  voice: 'Faithful, thoughtful, respectful, practical, never combative.',
  prompt_template: 'Create a slideshow about {{topic}}. Connect the lesson to consistent scripture study for individuals and families, and naturally mention {{product_name}} near the end.',
  slide_count: 8,
  export_as_video: false,
  transition: 'none',
  image_strategy: 'relevant',
  output_mode: 'editable_and_render'
};

function Field({ label, children }) {
  return <label className="grid gap-1 text-xs font-semibold uppercase text-ink/60">{label}{children}</label>;
}

export default function AutomationStudio({ onOpenSlideshow, onStatus }) {
  const [recipes, setRecipes] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(emptyRecipe);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState('');

  const selectedRecipe = useMemo(() => recipes.find((recipe) => recipe.id === selectedId), [recipes, selectedId]);

  async function refresh() {
    const next = await api('/api/automation/recipes');
    setRecipes(next);
    if (!selectedId && next[0]) {
      setSelectedId(next[0].id);
      setDraft(next[0]);
    }
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedRecipe) setDraft(selectedRecipe);
  }, [selectedRecipe?.id]);

  function patch(patchValue) {
    setDraft((current) => ({ ...current, ...patchValue }));
  }

  async function persistRecipe() {
    const saved = draft.id
      ? await api(`/api/automation/recipes/${draft.id}`, { method: 'PUT', body: JSON.stringify(draft) })
      : await api('/api/automation/recipes', { method: 'POST', body: JSON.stringify(draft) });
    await refresh();
    setSelectedId(saved.id);
    setDraft(saved);
    return saved;
  }

  async function saveRecipe() {
    setBusy('save');
    try {
      await persistRecipe();
      onStatus?.('Automation recipe saved.');
    } catch (error) {
      onStatus?.(error.message);
    } finally {
      setBusy('');
    }
  }

  async function runRecipe() {
    if (!topic.trim()) {
      onStatus?.('Add a topic before running automation.');
      return;
    }
    setBusy('run');
    onStatus?.('Saving recipe, then writing slides, matching images, and queueing export...');
    try {
      const saved = await persistRecipe();
      const result = await api(`/api/automation/recipes/${saved.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ topic })
      });
      onOpenSlideshow?.(result.slideshow);
      onStatus?.(result.job_id ? 'Automation finished and render was queued. Check My Exports for the download.' : 'Automation finished and opened as an editable slideshow.');
    } catch (error) {
      onStatus?.(error.message);
    } finally {
      setBusy('');
    }
  }

  async function deleteRecipe() {
    if (!draft.id) return;
    setBusy('delete');
    try {
      await api(`/api/automation/recipes/${draft.id}`, { method: 'DELETE' });
      setDraft(emptyRecipe);
      setSelectedId('');
      await refresh();
      onStatus?.('Automation recipe deleted.');
    } catch (error) {
      onStatus?.(error.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="grid gap-4 p-4">
      <div className="border-b border-line pb-4">
        <h2 className="text-sm font-bold uppercase">Automation Studio</h2>
        <p className="mt-1 text-xs leading-5 text-ink/60">
          Build one reusable slideshow recipe. Each run saves the recipe first, then uses the topic below to write slides, choose local images, and create the export.
        </p>
      </div>

      <section className="grid gap-3 border-b border-line pb-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide">1. Choose a Recipe</h3>
          <p className="mt-1 text-xs leading-5 text-ink/55">Pick an existing setup or start a new one.</p>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select className="border border-line bg-white p-2 text-sm" value={selectedId} onChange={(event) => {
            const value = event.target.value;
            setSelectedId(value);
            if (!value) setDraft(emptyRecipe);
          }}>
            <option value="">New automation recipe</option>
            {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
          </select>
          <button className="border border-line px-3 text-xs font-bold" onClick={() => { setSelectedId(''); setDraft(emptyRecipe); }}>New</button>
        </div>
        <Field label="Recipe name">
          <input className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
        </Field>
      </section>

      <section className="grid gap-3 border-b border-line pb-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide">2. Define the Slideshow</h3>
          <p className="mt-1 text-xs leading-5 text-ink/55">Set the product, audience, voice, and prompt pattern the generator should follow.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Product">
            <input className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.product_name} onChange={(event) => patch({ product_name: event.target.value })} />
          </Field>
          <Field label="Slides">
            <input type="number" min="3" max="15" className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.slide_count} onChange={(event) => patch({ slide_count: Number(event.target.value) })} />
          </Field>
        </div>
        <Field label="Audience">
          <input className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.audience} onChange={(event) => patch({ audience: event.target.value })} />
        </Field>
        <Field label="Goal">
          <textarea className="min-h-16 border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.goal} onChange={(event) => patch({ goal: event.target.value })} />
        </Field>
        <Field label="Voice rules">
          <textarea className="min-h-16 border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.voice} onChange={(event) => patch({ voice: event.target.value })} />
        </Field>
        <Field label="Prompt template">
          <textarea className="min-h-24 border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.prompt_template} onChange={(event) => patch({ prompt_template: event.target.value })} />
        </Field>
        <p className="text-xs leading-5 text-ink/55">Use {'{{topic}}'} where the run topic should be inserted. Other variables: {'{{product_name}}'}, {'{{audience}}'}, {'{{goal}}'}, {'{{voice}}'}.</p>
      </section>

      <section className="grid gap-3 border-b border-line pb-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide">3. Save and Run</h3>
          <p className="mt-1 text-xs leading-5 text-ink/55">Type the topic for this slideshow. Running automation saves the recipe automatically first.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Output">
            <select className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.output_mode} onChange={(event) => patch({ output_mode: event.target.value })}>
              <option value="editable_and_render">Open editor + render</option>
              <option value="editable_only">Open editor only</option>
            </select>
          </Field>
          <Field label="Format">
            <select className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.export_as_video ? 'video' : 'zip'} onChange={(event) => patch({ export_as_video: event.target.value === 'video' })}>
              <option value="zip">PNG ZIP</option>
              <option value="video">MP4</option>
            </select>
          </Field>
        </div>

        <Field label="Run topic">
          <textarea className="min-h-20 border border-line bg-white p-2 normal-case text-sm font-normal" placeholder="Joseph Smith and how to study difficult Christian beliefs faithfully" value={topic} onChange={(event) => setTopic(event.target.value)} />
        </Field>
      </section>

      <div className="flex gap-2">
        <button className="flex flex-1 items-center justify-center gap-2 border border-line py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-60" disabled={Boolean(busy)} onClick={saveRecipe}>
          {busy === 'save' ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
          Save recipe
        </button>
        <button className="border border-line px-3 disabled:opacity-40" disabled={!draft.id || Boolean(busy)} title="Delete recipe" onClick={deleteRecipe}>
          {busy === 'delete' ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
        </button>
      </div>

      <button className="flex items-center justify-center gap-2 bg-accent py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60" disabled={!topic.trim() || Boolean(busy)} onClick={runRecipe}>
        {busy === 'run' ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
        {busy === 'run' ? 'Running automation...' : 'Run saved automation'}
      </button>
    </div>
  );
}
