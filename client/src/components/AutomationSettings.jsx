import { ExternalLink, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const defaultRecipe = {
  name: 'Latter Study family slideshow',
  slideshow_type: 'educational',
  product_name: 'Latter Study',
  audience: 'LDS parents and older Church members',
  goal: 'Teach one useful gospel insight in plain language.',
  voice: 'A thoughtful LDS mom speaking plainly to a friend. Warm, practical, and doctrinally careful.',
  word_spacing: 'balanced',
  image_instructions: 'Choose concrete images that support each slide.',
  progression: 'One cover slide followed by six different, useful teaching points.',
  aspect_ratio: '9:16',
  prompt_template: 'Create a slideshow about {{topic}}.',
  slide_count: 7,
  export_as_video: false,
  transition: 'none',
  image_strategy: 'relevant',
  output_mode: 'editable_and_render'
};

const defaultSchedule = {
  name: 'Weekly slideshow',
  prompts: [''],
  days_of_week: [1, 2, 3, 4, 5],
  times: ['09:00'],
  timezone: 'local',
  enabled: true
};

const days = [['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]];
const fieldClass = 'w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm leading-5 outline-none transition focus:border-[#657052]';

function Field({ label, hint, children }) {
  return <label className="grid gap-1.5 text-sm font-bold text-[#1f211d]">{label}{hint && <span className="text-xs font-normal leading-5 text-black/45">{hint}</span>}{children}</label>;
}

export default function AutomationSettings({ onOpenSlideshow, onRecipesChanged }) {
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [recipe, setRecipe] = useState(defaultRecipe);
  const [schedules, setSchedules] = useState([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [runs, setRuns] = useState([]);
  const [runTopic, setRunTopic] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function loadSchedules(recipeId, scheduleId = '') {
    if (!recipeId) {
      setSchedules([]);
      setSelectedScheduleId('');
      setSchedule(defaultSchedule);
      return;
    }
    const next = await api(`/api/automation/recipes/${recipeId}/schedules`);
    setSchedules(next);
    const selected = next.find((item) => item.id === scheduleId) || next[0];
    setSelectedScheduleId(selected?.id || '');
    setSchedule(selected || defaultSchedule);
  }

  async function loadRecipes(recipeId = '') {
    const next = await api('/api/automation/recipes');
    setRecipes(next);
    const selected = next.find((item) => item.id === recipeId) || next[0];
    setSelectedRecipeId(selected?.id || '');
    setRecipe(selected || defaultRecipe);
    await loadSchedules(selected?.id || '');
  }

  async function loadRuns() {
    setRuns(await api('/api/automation/runs'));
  }

  useEffect(() => {
    loadRecipes().catch((error) => setMessage(error.message));
    loadRuns().catch(() => {});
  }, []);

  function selectRecipe(id) {
    const selected = recipes.find((item) => item.id === id);
    setSelectedRecipeId(id);
    setRecipe(selected || defaultRecipe);
    loadSchedules(id).catch((error) => setMessage(error.message));
    setMessage('');
  }

  function selectSchedule(id) {
    setSelectedScheduleId(id);
    setSchedule(schedules.find((item) => item.id === id) || defaultSchedule);
    setMessage('');
  }

  async function saveRecipe() {
    setBusy('recipe');
    setMessage('');
    try {
      const saved = await api(selectedRecipeId ? `/api/automation/recipes/${selectedRecipeId}` : '/api/automation/recipes', {
        method: selectedRecipeId ? 'PUT' : 'POST',
        body: JSON.stringify({ ...recipe, slide_count: 7, aspect_ratio: '9:16' })
      });
      await loadRecipes(saved.id);
      await onRecipesChanged?.();
      setMessage('Recipe saved. Future runs will use these instructions.');
      return saved;
    } catch (error) {
      setMessage(error.message);
      return null;
    } finally {
      setBusy('');
    }
  }

  async function saveSchedule() {
    if (!selectedRecipeId) {
      setMessage('Save a recipe before adding a schedule.');
      return;
    }
    if (!schedule.prompts.some((prompt) => prompt.trim())) {
      setMessage('Add at least one topic before saving the schedule.');
      return;
    }
    if (!schedule.days_of_week.length || !schedule.times.length) {
      setMessage('Choose at least one day and time.');
      return;
    }
    setBusy('schedule');
    setMessage('');
    try {
      const saved = await api(selectedScheduleId
        ? `/api/automation/recipes/${selectedRecipeId}/schedules/${selectedScheduleId}`
        : `/api/automation/recipes/${selectedRecipeId}/schedules`, {
        method: selectedScheduleId ? 'PUT' : 'POST',
        body: JSON.stringify({ ...schedule, prompts: schedule.prompts.map((prompt) => prompt.trim()).filter(Boolean) })
      });
      await loadSchedules(selectedRecipeId, saved.id);
      setMessage('Schedule saved. The next run will use the current recipe and topic queue.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  async function deleteSchedule() {
    if (!selectedScheduleId || !window.confirm('Delete this schedule? The recipe and existing slideshows will stay.')) return;
    setBusy('delete');
    try {
      await api(`/api/automation/recipes/${selectedRecipeId}/schedules/${selectedScheduleId}`, { method: 'DELETE' });
      await loadSchedules(selectedRecipeId);
      setMessage('Schedule deleted.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  async function runNow() {
    if (!selectedRecipeId || !runTopic.trim()) return;
    setBusy('run');
    setMessage('Creating a slideshow with this recipe...');
    try {
      const result = await api(`/api/automation/recipes/${selectedRecipeId}/run`, {
        method: 'POST',
        body: JSON.stringify({ topic: runTopic.trim() })
      });
      await loadRuns();
      onOpenSlideshow(result.slideshow);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  function toggleDay(day) {
    const selected = new Set(schedule.days_of_week);
    if (selected.has(day)) selected.delete(day);
    else selected.add(day);
    setSchedule({ ...schedule, days_of_week: [...selected].sort((a, b) => a - b) });
  }

  return (
    <main className="mx-auto max-w-6xl px-6 pb-20 pt-10 lg:px-10">
      <div className="border-b border-black/10 pb-8">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-[#657052]">Settings</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">Recipes & automation</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">A recipe tells the AI how to write. A schedule picks topics and times. Each scheduled run creates a slideshow and, when Drive publishing is on and connected, uploads it automatically.</p>
      </div>

      {message && <p role="status" className="mt-5 rounded-lg bg-[#e9ece4] px-4 py-3 text-sm font-semibold text-[#4c5842]">{message}</p>}

      <div className="grid gap-12 py-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <div className="flex items-end justify-between gap-4">
            <div><h2 className="text-xl font-extrabold">Writing recipe</h2><p className="mt-1 text-sm text-black/50">Controls voice, audience, teaching points, and image choices.</p></div>
            <button className="flex shrink-0 items-center gap-1 text-sm font-bold text-[#586247] hover:text-[#35422e]" onClick={() => selectRecipe('')}><Plus size={16} /> New</button>
          </div>
          <div className="mt-6 grid gap-4">
            <Field label="Choose recipe"><select className={fieldClass} value={selectedRecipeId} onChange={(event) => selectRecipe(event.target.value)}><option value="">New recipe</option>{recipes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Recipe name"><input className={fieldClass} value={recipe.name} onChange={(event) => setRecipe({ ...recipe, name: event.target.value })} /></Field>
            <p className="border-y border-black/10 py-3 text-xs leading-5 text-black/50">All recipes use the seven-slide, 9:16 TikTok format. The app applies the same plain-language and doctrinal-care rules to every recipe.</p>
            <Field label="Who it's for"><input className={fieldClass} value={recipe.audience} onChange={(event) => setRecipe({ ...recipe, audience: event.target.value })} /></Field>
            <Field label="What it should do"><textarea className={`${fieldClass} min-h-20 resize-y`} value={recipe.goal} onChange={(event) => setRecipe({ ...recipe, goal: event.target.value })} /></Field>
            <Field label="Voice and tone"><textarea className={`${fieldClass} min-h-24 resize-y`} value={recipe.voice} onChange={(event) => setRecipe({ ...recipe, voice: event.target.value })} /></Field>
            <Field label="How points should build"><textarea className={`${fieldClass} min-h-20 resize-y`} value={recipe.progression} onChange={(event) => setRecipe({ ...recipe, progression: event.target.value })} /></Field>
            <Field label="Image guidance"><textarea className={`${fieldClass} min-h-20 resize-y`} value={recipe.image_instructions} onChange={(event) => setRecipe({ ...recipe, image_instructions: event.target.value })} /></Field>
            <Field label="Topic prompt" hint="Use {{topic}} where the selected topic should appear."><textarea className={`${fieldClass} min-h-20 resize-y`} value={recipe.prompt_template} onChange={(event) => setRecipe({ ...recipe, prompt_template: event.target.value })} /></Field>
            <Field label="Text length"><select className={fieldClass} value={recipe.word_spacing} onChange={(event) => setRecipe({ ...recipe, word_spacing: event.target.value })}><option value="concise">Short</option><option value="balanced">Balanced</option><option value="detailed">More detail</option></select></Field>
            <Field label="Scheduled output"><select className={fieldClass} value={recipe.output_mode} onChange={(event) => setRecipe({ ...recipe, output_mode: event.target.value })}><option value="editable_and_render">Create and publish to Drive</option><option value="editable_only">Create draft only</option></select></Field>
            <Field label="Drive format"><select className={fieldClass} value={recipe.export_as_video ? 'mp4' : 'png'} onChange={(event) => setRecipe({ ...recipe, export_as_video: event.target.value === 'mp4' })}><option value="png">PNG slides in a Drive folder</option><option value="mp4">One MP4 video</option></select></Field>
            <button className="flex items-center justify-center gap-2 rounded-lg bg-[#1f211d] px-4 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={Boolean(busy)} onClick={saveRecipe}>{busy === 'recipe' ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save recipe</button>
          </div>
        </section>

        <section className="min-w-0 lg:border-l lg:border-black/10 lg:pl-12">
          <div className="flex items-end justify-between gap-4">
            <div><h2 className="text-xl font-extrabold">Schedule</h2><p className="mt-1 text-sm text-black/50">One topic runs at each selected time, then the queue repeats.</p></div>
            <button className="flex shrink-0 items-center gap-1 text-sm font-bold text-[#586247] hover:text-[#35422e] disabled:opacity-40" disabled={!selectedRecipeId} onClick={() => selectSchedule('')}><Plus size={16} /> New</button>
          </div>
          <div className="mt-6 grid gap-4">
            <Field label="Choose schedule"><select className={fieldClass} value={selectedScheduleId} disabled={!selectedRecipeId} onChange={(event) => selectSchedule(event.target.value)}><option value="">New schedule</option>{schedules.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Schedule name"><input className={fieldClass} value={schedule.name} disabled={!selectedRecipeId} onChange={(event) => setSchedule({ ...schedule, name: event.target.value })} /></Field>
            <Field label="Topics" hint="One topic per line. They rotate in order at each run."><textarea className={`${fieldClass} min-h-28 resize-y`} value={schedule.prompts.join('\n')} disabled={!selectedRecipeId} onChange={(event) => setSchedule({ ...schedule, prompts: event.target.value.split('\n') })} /></Field>
            <div>
              <p className="text-sm font-bold">Days</p>
              <div className="mt-2 grid grid-cols-7 gap-1.5">{days.map(([label, day]) => <button key={day} type="button" className={`rounded-lg border py-2 text-xs font-bold transition ${schedule.days_of_week.includes(day) ? 'border-[#657052] bg-[#657052] text-white' : 'border-black/15 bg-white text-black/50 hover:border-[#657052]'}`} disabled={!selectedRecipeId} aria-pressed={schedule.days_of_week.includes(day)} onClick={() => toggleDay(day)}>{label}</button>)}</div>
            </div>
            <div>
              <p className="text-sm font-bold">Times <span className="font-normal text-black/45">(this computer's local time)</span></p>
              <div className="mt-2 grid gap-2">{schedule.times.map((time, index) => <div key={index} className="flex gap-2"><input type="time" className={fieldClass} value={time} disabled={!selectedRecipeId} onChange={(event) => { const times = [...schedule.times]; times[index] = event.target.value; setSchedule({ ...schedule, times }); }} /><button className="rounded-lg border border-black/15 px-3 text-black/50 disabled:opacity-40" disabled={!selectedRecipeId || schedule.times.length === 1} aria-label={`Remove time ${index + 1}`} onClick={() => setSchedule({ ...schedule, times: schedule.times.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /></button></div>)}</div>
              <button className="mt-2 flex items-center gap-1 text-xs font-bold text-[#586247] disabled:opacity-40" disabled={!selectedRecipeId} onClick={() => setSchedule({ ...schedule, times: [...schedule.times, '09:00'] })}><Plus size={14} /> Add time</button>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(schedule.enabled)} disabled={!selectedRecipeId} onChange={(event) => setSchedule({ ...schedule, enabled: event.target.checked })} /> Automation enabled</label>
            <p className="text-xs leading-5 text-black/45">The app server must be running at the scheduled time. Missed runs are not made up later.</p>
            <div className="flex gap-2"><button className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1f211d] px-4 py-3 text-sm font-bold text-white disabled:opacity-40" disabled={!selectedRecipeId || Boolean(busy)} onClick={saveSchedule}>{busy === 'schedule' ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save schedule</button><button className="rounded-lg border border-black/15 px-4 text-black/50 disabled:opacity-40" disabled={!selectedScheduleId || Boolean(busy)} aria-label="Delete schedule" onClick={deleteSchedule}><Trash2 size={16} /></button></div>
          </div>

          <div className="mt-12 border-t border-black/10 pt-8">
            <h2 className="text-xl font-extrabold">Run this recipe now</h2>
            <p className="mt-1 text-sm text-black/50">Useful for testing changes before the next scheduled run.</p>
            <div className="mt-4 flex gap-2"><input className={fieldClass} value={runTopic} disabled={!selectedRecipeId} placeholder="Enter a topic" onChange={(event) => setRunTopic(event.target.value)} /><button className="shrink-0 rounded-lg border border-black/15 bg-white px-4 text-sm font-bold disabled:opacity-40" disabled={!selectedRecipeId || !runTopic.trim() || Boolean(busy)} onClick={runNow}>Run now</button></div>
            <p className="mt-2 text-xs text-black/45">Save recipe changes first. This follows the recipe's scheduled output setting.</p>
          </div>
        </section>
      </div>

      <section className="border-t border-black/10 pt-8">
        <h2 className="text-xl font-extrabold">Recent runs</h2>
        <div className="mt-4 divide-y divide-black/10 border-y border-black/10">{runs.slice(0, 8).map((run) => <div key={run.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div className="min-w-0"><p className="truncate font-bold">{run.title}</p><p className="mt-1 text-xs text-black/45">{run.message} · {new Date(run.updated_at).toLocaleString()}</p></div>{run.drive_url && <a href={run.drive_url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#586247]">Drive <ExternalLink size={14} /></a>}</div>)}{runs.length === 0 && <p className="py-5 text-sm text-black/45">No runs yet.</p>}</div>
      </section>
    </main>
  );
}
