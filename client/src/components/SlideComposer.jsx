import { ArrowLeft, Image, Save } from 'lucide-react';
import { useState } from 'react';
import ExportPanel from './ExportPanel.jsx';
import ImageLibrary from './ImageLibrary.jsx';
import SlideCanvas from './SlideCanvas.jsx';
import SlideList from './SlideList.jsx';
import TextItemEditor from './TextItemEditor.jsx';

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
  const selected = slideshow.slides.find((slide) => slide.id === selectedId) || slideshow.slides[0];

  function patchShow(patch) {
    onChange({ ...slideshow, ...patch });
  }

  function patchSlide(patch) {
    patchShow({ slides: slideshow.slides.map((slide) => slide.id === selected.id ? { ...slide, ...patch } : slide) });
  }

  function updateText(id, patch) {
    patchSlide({ text_items: selected.text_items.map((item) => item.id === id ? { ...item, ...patch } : item) });
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
    <div className="grid h-screen grid-rows-[64px_1fr_190px] bg-[#eeefeb]">
      <header className="flex items-center justify-between border-b border-black/10 bg-[#f7f7f5] px-5">
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 text-sm font-bold text-black/55 hover:text-black" onClick={onBack}><ArrowLeft size={16} /> All slideshows</button>
          <div>
            <h1 className="max-w-[52vw] truncate text-base font-extrabold">{slideshow.title}</h1>
            <p className="text-xs text-black/45">TikTok format · 9:16 · {slideshow.slides.length} slides</p>
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-[#1f211d] px-4 py-2.5 text-sm font-bold text-white" onClick={() => onSave()}><Save size={16} /> Save changes</button>
      </header>

      <main className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-h-0 min-w-0">
          <SlideCanvas slide={selected} settings={slideshow.settings} />
        </section>
        <aside className="min-h-0 overflow-auto border-l border-black/10 bg-[#f7f7f5]">
              <div className="border-b border-black/10 p-5">
                <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#657052]">Slide {selected.order + 1}</p><h2 className="mt-1 text-lg font-extrabold">Edit the words</h2></div>
                <div className="grid gap-3">
                  {[...selected.text_items].sort((a, b) => a.order - b.order).map((item, index, sorted) => (
                    <TextItemEditor
                      key={item.id}
                      item={item}
                      onChange={(patch) => updateText(item.id, patch)}
                      onDelete={null}
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

              <div className="grid gap-3 border-b border-black/10 p-5">
                <div><h2 className="text-sm font-extrabold">Background image</h2><p className="mt-1 text-xs leading-5 text-black/45">Use one clear vertical image that supports this point.</p></div>
                <button className="flex items-center justify-center gap-2 rounded-lg border border-black/15 bg-white py-3 text-sm font-bold hover:border-black/30" onClick={() => setPicker({ type: 'background' })}><Image size={16} /> Replace image</button>
                <InspectorField label="Image darkness"><input type="range" min="0" max="55" value={selected.overrides.background_opacity ?? slideshow.settings.background_opacity} onChange={(event) => patchSlide({ overrides: { ...selected.overrides, is_bg_overlay_on: true, background_opacity: Number(event.target.value) } })} /></InspectorField>
              </div>
              <ExportPanel slideshow={slideshow} onSave={onSave} />
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
    </div>
  );
}
