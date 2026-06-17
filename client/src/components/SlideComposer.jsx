import { Image, Loader2, Plus, Save, Settings, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import AutomationStudio from './AutomationStudio.jsx';
import ExportPanel from './ExportPanel.jsx';
import ImageLibrary from './ImageLibrary.jsx';
import SlideCanvas from './SlideCanvas.jsx';
import SlideList from './SlideList.jsx';
import SlideshowSettings from './SlideshowSettings.jsx';
import TextItemEditor from './TextItemEditor.jsx';

const ratios = ['4:5', '9:16', '1:1', '16:9'];

function blankText(order) {
  return {
    id: crypto.randomUUID(),
    text: 'New text',
    font: 'TikTokSans-Regular',
    font_size: 'large',
    text_style: 'outline',
    text_width: '80%',
    text_position: 'center',
    text_alignment: 'center',
    order
  };
}

function blankSlide(order, imageUrl = '') {
  return {
    id: crypto.randomUUID(),
    order,
    image_layout: 'single',
    image_url: imageUrl,
    image_urls: imageUrl ? [imageUrl] : [],
    text_items: [blankText(0)],
    overrides: { aspect_ratio: null, text_position: null, is_bg_overlay_on: null, background_opacity: null },
    duration: null
  };
}

function InspectorField({ label, children }) {
  return <label className="grid gap-1 text-xs font-semibold uppercase text-ink/60">{label}{children}</label>;
}

export default function SlideComposer({ slideshow, onChange, onSave, onBack }) {
  const [selectedId, setSelectedId] = useState(slideshow.slides[0]?.id);
  const [picker, setPicker] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState('edit');
  const [prompt, setPrompt] = useState('');
  const [automationStatus, setAutomationStatus] = useState('');
  const [automationBusy, setAutomationBusy] = useState(null);
  const [capabilities, setCapabilities] = useState({ llm_enabled: false });
  const selected = slideshow.slides.find((slide) => slide.id === selectedId) || slideshow.slides[0];

  useEffect(() => {
    api('/api/automation/capabilities').then(setCapabilities).catch(() => {});
  }, []);

  function patchShow(patch) {
    onChange({ ...slideshow, ...patch });
  }

  function patchSlide(patch) {
    patchShow({ slides: slideshow.slides.map((slide) => slide.id === selected.id ? { ...slide, ...patch } : slide) });
  }

  function updateText(id, patch) {
    patchSlide({ text_items: selected.text_items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }

  async function generateFromPrompt() {
    if (!prompt.trim() || automationBusy) return;
    setAutomationBusy('generate');
    setAutomationStatus('Writing slides and matching local images...');
    try {
      const generated = await api('/api/automation/generate', { method: 'POST', body: JSON.stringify({ prompt }) });
      onChange({ ...slideshow, title: generated.title, settings: generated.settings, slides: generated.slides });
      setSelectedId(generated.slides[0]?.id);
      setAutomationStatus(generated.llm_used ? 'Generated with OpenAI and matched against your image library.' : 'Generated with local fallback and basic image matching.');
    } catch (error) {
      setAutomationStatus(error.message);
    } finally {
      setAutomationBusy(null);
    }
  }

  async function saveTemplate() {
    await api('/api/automation/templates', {
      method: 'POST',
      body: JSON.stringify({ ...slideshow, name: slideshow.title })
    });
  }

  function pickImage(url) {
    if (picker?.type === 'newSlide') {
      const next = blankSlide(slideshow.slides.length, url);
      patchShow({ slides: [...slideshow.slides, next] });
      setSelectedId(next.id);
    } else if (picker?.type === 'slot') {
      const urls = [...(selected.image_urls || [])];
      urls[picker.index] = url;
      patchSlide({ image_urls: urls, image_url: urls[0] || selected.image_url });
    } else {
      patchSlide({ image_layout: 'single', image_url: url, image_urls: [url] });
    }
    setPicker(null);
  }

  if (!selected) return null;

  return (
    <div className="grid h-screen grid-rows-[64px_1fr_220px] bg-[#ebe7df]">
      <header className="flex items-center justify-between border-b border-line bg-paper px-5">
        <div className="flex items-center gap-4">
          <button className="text-sm font-bold" onClick={onBack}>Dashboard</button>
          <div>
            <h1 className="text-lg font-extrabold">{slideshow.title}</h1>
            <p className="text-xs text-ink/55">Desktop composer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 border border-line px-3 py-2 text-sm font-bold" onClick={() => setSettingsOpen(true)}><Settings size={16} /> Settings</button>
          <button className="flex items-center gap-2 bg-ink px-3 py-2 text-sm font-bold text-white" onClick={() => onSave()}><Save size={16} /> Save</button>
        </div>
      </header>

      <main className="grid min-h-0 grid-cols-[1fr_360px]">
        <section className="min-h-0">
          <SlideCanvas slide={selected} settings={slideshow.settings} />
        </section>
        <aside className="min-h-0 overflow-auto border-l border-line bg-paper">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
            <div className="text-xs font-bold uppercase tracking-wide text-ink/55">Workspace</div>
            <div className="flex border border-line bg-white p-1">
              {['edit', 'automation'].map((tab) => (
                <button
                  key={tab}
                  className={`px-3 py-1.5 text-xs font-bold ${workspaceTab === tab ? 'bg-ink text-white' : 'text-ink/65'}`}
                  onClick={() => setWorkspaceTab(tab)}
                >
                  {tab === 'edit' ? 'Edit' : 'Automation Studio'}
                </button>
              ))}
            </div>
          </div>

          {workspaceTab === 'edit' && (
            <>
              <div className="border-b border-line p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase">Text Overlays</h2>
                  <button title="Add text" className="bg-ink p-2 text-white" onClick={() => patchSlide({ text_items: [...selected.text_items, blankText(selected.text_items.length)] })}><Plus size={16} /></button>
                </div>
                <div className="grid gap-3">
                  {[...selected.text_items].sort((a, b) => a.order - b.order).map((item, index, sorted) => (
                    <TextItemEditor
                      key={item.id}
                      item={item}
                      onChange={(patch) => updateText(item.id, patch)}
                      onDelete={() => patchSlide({ text_items: selected.text_items.filter((text) => text.id !== item.id).map((text, order) => ({ ...text, order })) })}
                      onMoveUp={() => {
                        if (index === 0) return;
                        const next = [...sorted];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        patchSlide({ text_items: next.map((text, order) => ({ ...text, order })) });
                      }}
                      onMoveDown={() => {
                        if (index === sorted.length - 1) return;
                        const next = [...sorted];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        patchSlide({ text_items: next.map((text, order) => ({ ...text, order })) });
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid gap-3 border-b border-line p-4">
                <h2 className="text-sm font-bold uppercase">Slide Settings</h2>
                <button className="flex items-center justify-center gap-2 border border-line py-2 text-sm font-bold" onClick={() => setPicker({ type: 'background' })}><Image size={16} /> Change background</button>
                <InspectorField label="Aspect override"><select className="border border-line bg-white p-2 normal-case" value={selected.overrides.aspect_ratio || ''} onChange={(event) => patchSlide({ overrides: { ...selected.overrides, aspect_ratio: event.target.value || null } })}><option value="">Use default</option>{ratios.map((item) => <option key={item}>{item}</option>)}</select></InspectorField>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(selected.overrides.is_bg_overlay_on ?? slideshow.settings.is_bg_overlay_on)} onChange={(event) => patchSlide({ overrides: { ...selected.overrides, is_bg_overlay_on: event.target.checked } })} /> Background overlay</label>
                <InspectorField label="Overlay opacity"><input type="range" min="0" max="100" value={selected.overrides.background_opacity ?? slideshow.settings.background_opacity} onChange={(event) => patchSlide({ overrides: { ...selected.overrides, background_opacity: Number(event.target.value) } })} /></InspectorField>
              </div>

              <div className="grid gap-3 border-b border-line p-4">
                <div>
                  <h2 className="text-sm font-bold uppercase">Single Prompt</h2>
                  <p className="mt-1 text-xs leading-5 text-ink/60">
                    Generate edits the current slideshow and chooses relevant images from your uploaded library.
                  </p>
                </div>
                <button className="border border-line py-2 text-sm font-bold" onClick={saveTemplate}>Save current layout as template</button>
                {capabilities.llm_enabled && (
                  <>
                    <label className="grid gap-1 text-xs font-semibold uppercase text-ink/60">
                      Slideshow prompt
                      <textarea
                        className="min-h-28 border border-line bg-white p-2 normal-case text-sm font-normal text-ink"
                        placeholder="Create 8 slides for Latter Study about how Joseph Smith helps us approach difficult Christian beliefs with scripture, context, and faithful study."
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                      />
                    </label>
                    <button className="flex items-center justify-center gap-2 border border-line py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-60" disabled={!prompt.trim() || Boolean(automationBusy)} onClick={generateFromPrompt}>
                      {automationBusy === 'generate' ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
                      {automationBusy === 'generate' ? 'Generating slideshow...' : 'Generate editable slideshow'}
                    </button>
                  </>
                )}
                {!capabilities.llm_enabled && (
                  <p className="border border-line bg-white/60 p-3 text-xs leading-5 text-ink/65">
                    Add OPENAI_API_KEY to your root .env and restart the dev server to enable AI writing and image matching.
                  </p>
                )}
                {automationStatus && <p className="border-l-2 border-accent pl-3 text-xs leading-5 text-ink/70">{automationStatus}</p>}
              </div>

              <ExportPanel slideshow={slideshow} onSave={onSave} />
            </>
          )}

          {workspaceTab === 'automation' && (
            <AutomationStudio
              onOpenSlideshow={(next) => {
                onChange(next);
                setSelectedId(next.slides[0]?.id);
              }}
              onStatus={setAutomationStatus}
            />
          )}

        </aside>
      </main>

      <SlideList
        slides={slideshow.slides}
        selectedId={selected.id}
        onSelect={setSelectedId}
        onChange={(slides) => {
          patchShow({ slides });
          if (!slides.find((slide) => slide.id === selectedId)) setSelectedId(slides[0]?.id);
        }}
        onAdd={() => setPicker({ type: 'newSlide' })}
      />
      {picker && <ImageLibrary picker onPick={pickImage} onClose={() => setPicker(null)} />}
      {settingsOpen && <SlideshowSettings slideshow={slideshow} onChange={onChange} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
