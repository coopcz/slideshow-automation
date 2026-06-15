import { Download, Loader2, Play, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const emptyRecipe = {
  name: 'Latter Study evergreen slideshow',
  slideshow_type: 'educational',
  product_name: 'Latter Study',
  audience: 'LDS individuals and families who want consistent scripture study',
  goal: 'Promote Latter Study while teaching practical scripture study ideas.',
  voice: 'Faithful, thoughtful, respectful, practical, never combative.',
  word_spacing: 'balanced',
  image_instructions: 'Choose concrete scripture study, family, faith, learning, object, setting, or story images that support each slide.',
  progression: 'Hook the viewer, explain the study principle, show why it matters, give practical application, then mention the product naturally near the end.',
  aspect_ratio: '9:16',
  prompt_template: 'Create a slideshow about {{topic}}. Connect the lesson to consistent scripture study for individuals and families, and naturally mention {{product_name}} near the end.',
  slide_count: 8,
  export_as_video: false,
  transition: 'none',
  image_strategy: 'relevant',
  output_mode: 'editable_and_render'
};

const emptySchedule = {
  name: 'Weekly automation',
  topic: '',
  days_of_week: [1, 2, 3, 4, 5],
  times: ['09:00'],
  timezone: 'local',
  enabled: true
};

const weekdays = [
  ['Sun', 0],
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6]
];

function Field({ label, children }) {
  return <label className="grid gap-1 text-xs font-semibold uppercase text-ink/60">{label}{children}</label>;
}

function Section({ title, children }) {
  return (
    <section className="grid gap-3 border-b border-line pb-4">
      <h3 className="text-xs font-bold uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

function formatDate(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function AutomationStudio({ onOpenSlideshow, onStatus }) {
  const [recipes, setRecipes] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(emptyRecipe);
  const [runTopic, setRunTopic] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [scheduleDraft, setScheduleDraft] = useState(emptySchedule);
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState('');

  const selectedRecipe = useMemo(() => recipes.find((recipe) => recipe.id === selectedId), [recipes, selectedId]);
  const selectedSchedule = schedules[0] || null;

  async function refreshRecipes(nextSelectedId = selectedId) {
    const next = await api('/api/automation/recipes');
    setRecipes(next);
    const selected = next.find((recipe) => recipe.id === nextSelectedId) || next[0];
    if (selected) {
      setSelectedId(selected.id);
      setDraft(selected);
      return selected.id;
    }
    setSelectedId('');
    setDraft(emptyRecipe);
    return '';
  }

  async function refreshSchedules(recipeId = selectedId) {
    if (!recipeId) {
      setSchedules([]);
      setScheduleDraft(emptySchedule);
      return;
    }
    const next = await api(`/api/automation/recipes/${recipeId}/schedules`);
    setSchedules(next);
    setScheduleDraft(next[0] || emptySchedule);
  }

  async function refreshRuns() {
    setRuns(await api('/api/automation/runs'));
  }

  useEffect(() => {
    refreshRecipes().then((recipeId) => refreshSchedules(recipeId)).catch(() => {});
    refreshRuns().catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => refreshRuns().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedRecipe) {
      setDraft(selectedRecipe);
      refreshSchedules(selectedRecipe.id).catch(() => {});
    }
  }, [selectedRecipe?.id]);

  function patchRecipe(patchValue) {
    setDraft((current) => ({ ...current, ...patchValue }));
  }

  function patchSchedule(patchValue) {
    setScheduleDraft((current) => ({ ...current, ...patchValue }));
  }

  async function persistRecipe() {
    const saved = draft.id
      ? await api(`/api/automation/recipes/${draft.id}`, { method: 'PUT', body: JSON.stringify(draft) })
      : await api('/api/automation/recipes', { method: 'POST', body: JSON.stringify(draft) });
    await refreshRecipes(saved.id);
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
    if (!runTopic.trim()) {
      onStatus?.('Add a run topic before running automation.');
      return;
    }
    setBusy('run');
    onStatus?.('Saving recipe, then writing slides, matching images, and queueing export...');
    try {
      const saved = await persistRecipe();
      const result = await api(`/api/automation/recipes/${saved.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ topic: runTopic })
      });
      onOpenSlideshow?.(result.slideshow);
      await refreshRuns();
      onStatus?.(result.job_id ? 'Automation finished and render was queued.' : 'Automation finished and opened as an editable slideshow.');
    } catch (error) {
      onStatus?.(error.message);
    } finally {
      setBusy('');
    }
  }

  async function saveSchedule() {
    setBusy('schedule');
    try {
      const saved = await persistRecipe();
      const path = selectedSchedule
        ? `/api/automation/recipes/${saved.id}/schedules/${selectedSchedule.id}`
        : `/api/automation/recipes/${saved.id}/schedules`;
      await api(path, {
        method: selectedSchedule ? 'PUT' : 'POST',
        body: JSON.stringify(scheduleDraft)
      });
      await refreshSchedules(saved.id);
      onStatus?.('Automation schedule saved.');
    } catch (error) {
      onStatus?.(error.message);
    } finally {
      setBusy('');
    }
  }

  async function deleteSchedule() {
    if (!selectedSchedule || !selectedId) return;
    setBusy('deleteSchedule');
    try {
      await api(`/api/automation/recipes/${selectedId}/schedules/${selectedSchedule.id}`, { method: 'DELETE' });
      await refreshSchedules(selectedId);
      onStatus?.('Automation schedule deleted.');
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
      await refreshRecipes('');
      setSchedules([]);
      setScheduleDraft(emptySchedule);
      onStatus?.('Automation recipe deleted.');
    } catch (error) {
      onStatus?.(error.message);
    } finally {
      setBusy('');
    }
  }

  function toggleDay(day) {
    const current = new Set(scheduleDraft.days_of_week);
    if (current.has(day)) current.delete(day);
    else current.add(day);
    patchSchedule({ days_of_week: [...current].sort((a, b) => a - b) });
  }

  return (
    <div className="grid gap-4 p-4">
      <div className="border-b border-line pb-4">
        <h2 className="text-sm font-bold uppercase">Automation Studio</h2>
        <p className="mt-1 text-xs leading-5 text-ink/60">
          Configure one reusable slideshow recipe, schedule weekly run times, and download completed renders.
        </p>
      </div>

      <Section title="Recipe">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select className="border border-line bg-white p-2 text-sm" value={selectedId} onChange={(event) => {
            const value = event.target.value;
            setSelectedId(value);
            if (!value) {
              setDraft(emptyRecipe);
              setSchedules([]);
              setScheduleDraft(emptySchedule);
            }
          }}>
            <option value="">New automation recipe</option>
            {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
          </select>
          <button className="border border-line px-3 text-xs font-bold" onClick={() => { setSelectedId(''); setDraft(emptyRecipe); setSchedules([]); setScheduleDraft(emptySchedule); }}>New</button>
        </div>
        <Field label="Recipe name">
          <input className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.name} onChange={(event) => patchRecipe({ name: event.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <select className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.slideshow_type} onChange={(event) => patchRecipe({ slideshow_type: event.target.value })}>
              <option value="educational">Educational</option>
              <option value="product">Product</option>
              <option value="story">Story</option>
              <option value="promo">Promo</option>
              <option value="tutorial">Tutorial</option>
              <option value="testimonial">Testimonial</option>
            </select>
          </Field>
          <Field label="Product">
            <input className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.product_name} onChange={(event) => patchRecipe({ product_name: event.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Slides">
            <input type="number" min="3" max="15" className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.slide_count} onChange={(event) => patchRecipe({ slide_count: Number(event.target.value) })} />
          </Field>
          <Field label="Aspect">
            <select className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.aspect_ratio} onChange={(event) => patchRecipe({ aspect_ratio: event.target.value })}>
              <option value="9:16">9:16</option>
              <option value="4:5">4:5</option>
              <option value="1:1">1:1</option>
              <option value="16:9">16:9</option>
            </select>
          </Field>
          <Field label="Caption">
            <select className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.word_spacing} onChange={(event) => patchRecipe({ word_spacing: event.target.value })}>
              <option value="concise">Concise</option>
              <option value="balanced">Balanced</option>
              <option value="detailed">Detailed</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Creative Rules">
        <Field label="Audience">
          <input className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.audience} onChange={(event) => patchRecipe({ audience: event.target.value })} />
        </Field>
        <Field label="Goal">
          <textarea className="min-h-16 border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.goal} onChange={(event) => patchRecipe({ goal: event.target.value })} />
        </Field>
        <Field label="Voice">
          <textarea className="min-h-16 border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.voice} onChange={(event) => patchRecipe({ voice: event.target.value })} />
        </Field>
        <Field label="Progression">
          <textarea className="min-h-20 border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.progression} onChange={(event) => patchRecipe({ progression: event.target.value })} />
        </Field>
        <Field label="Images to choose">
          <textarea className="min-h-20 border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.image_instructions} onChange={(event) => patchRecipe({ image_instructions: event.target.value })} />
        </Field>
        <Field label="Prompt template">
          <textarea className="min-h-24 border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.prompt_template} onChange={(event) => patchRecipe({ prompt_template: event.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Output">
            <select className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.output_mode} onChange={(event) => patchRecipe({ output_mode: event.target.value })}>
              <option value="editable_and_render">Open editor + render</option>
              <option value="editable_only">Open editor only</option>
            </select>
          </Field>
          <Field label="Format">
            <select className="border border-line bg-white p-2 normal-case text-sm font-normal" value={draft.export_as_video ? 'video' : 'zip'} onChange={(event) => patchRecipe({ export_as_video: event.target.value === 'video' })}>
              <option value="zip">PNG ZIP</option>
              <option value="video">MP4</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Manual Run">
        <Field label="Run topic">
          <textarea className="min-h-20 border border-line bg-white p-2 normal-case text-sm font-normal" placeholder="Next slideshow topic" value={runTopic} onChange={(event) => setRunTopic(event.target.value)} />
        </Field>
        <div className="flex gap-2">
          <button className="flex flex-1 items-center justify-center gap-2 border border-line py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-60" disabled={Boolean(busy)} onClick={saveRecipe}>
            {busy === 'save' ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            Save recipe
          </button>
          <button className="border border-line px-3 disabled:opacity-40" disabled={!draft.id || Boolean(busy)} title="Delete recipe" onClick={deleteRecipe}>
            {busy === 'delete' ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
          </button>
        </div>
        <button className="flex items-center justify-center gap-2 bg-accent py-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60" disabled={!runTopic.trim() || Boolean(busy)} onClick={runRecipe}>
          {busy === 'run' ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
          {busy === 'run' ? 'Running automation...' : 'Run now'}
        </button>
      </Section>

      <Section title="Schedule">
        <Field label="Scheduled topic">
          <textarea className="min-h-16 border border-line bg-white p-2 normal-case text-sm font-normal" value={scheduleDraft.topic} onChange={(event) => patchSchedule({ topic: event.target.value })} />
        </Field>
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map(([label, day]) => (
            <button key={day} className={`border border-line py-2 text-xs font-bold ${scheduleDraft.days_of_week.includes(day) ? 'bg-ink text-white' : 'bg-white text-ink/65'}`} onClick={() => toggleDay(day)}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-2">
          {scheduleDraft.times.map((time, index) => (
            <div key={`${time}-${index}`} className="grid grid-cols-[1fr_auto] gap-2">
              <input type="time" className="border border-line bg-white p-2 text-sm" value={time} onChange={(event) => {
                const next = [...scheduleDraft.times];
                next[index] = event.target.value;
                patchSchedule({ times: next });
              }} />
              <button className="border border-line px-3 disabled:opacity-40" disabled={scheduleDraft.times.length === 1} title="Remove time" onClick={() => patchSchedule({ times: scheduleDraft.times.filter((_, itemIndex) => itemIndex !== index) })}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="flex items-center justify-center gap-2 border border-line py-2 text-sm font-bold" onClick={() => patchSchedule({ times: [...scheduleDraft.times, '09:00'] })}>
            <Plus size={15} /> Add time
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={Boolean(scheduleDraft.enabled)} onChange={(event) => patchSchedule({ enabled: event.target.checked })} />
          Enabled
        </label>
        <div className="flex gap-2">
          <button className="flex flex-1 items-center justify-center gap-2 border border-line py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-60" disabled={Boolean(busy)} onClick={saveSchedule}>
            {busy === 'schedule' ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            Save schedule
          </button>
          <button className="border border-line px-3 disabled:opacity-40" disabled={!selectedSchedule || Boolean(busy)} title="Delete schedule" onClick={deleteSchedule}>
            {busy === 'deleteSchedule' ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
          </button>
        </div>
      </Section>

      <Section title="Runs">
        <div className="grid gap-2">
          {runs.slice(0, 8).map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_auto] gap-2 border-y border-line py-2 text-xs">
              <div className="min-w-0">
                <div className="truncate font-bold">{item.title}</div>
                <div className="mt-1 text-ink/55">{item.status} · {item.progress}% · {formatDate(item.updated_at)}</div>
              </div>
              {item.status === 'completed' ? (
                <a className="flex h-8 w-8 items-center justify-center border border-line bg-white" title="Download" href={`/api/jobs/${item.id}/download`}>
                  <Download size={14} />
                </a>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center text-ink/35">
                  {item.status === 'processing' || item.status === 'queued' ? <Loader2 className="animate-spin" size={14} /> : null}
                </div>
              )}
            </div>
          ))}
          {runs.length === 0 && <p className="text-xs text-ink/55">No automation runs yet.</p>}
        </div>
      </Section>
    </div>
  );
}
