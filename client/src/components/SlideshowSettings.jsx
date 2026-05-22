const ratios = ['4:5', '9:16', '1:1', '16:9'];

export default function SlideshowSettings({ slideshow, onChange, onClose }) {
  const settings = slideshow.settings;
  const patchSettings = (patch) => onChange({ ...slideshow, settings: { ...settings, ...patch } });

  return (
    <div className="fixed inset-0 z-40 bg-black/45 p-8">
      <div className="mx-auto max-w-2xl border border-line bg-paper">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-bold uppercase">Slideshow Settings</h2>
          <button className="text-sm font-semibold" onClick={onClose}>Close</button>
        </div>
        <div className="grid gap-4 p-5">
          <label className="grid gap-1 text-sm font-semibold">Title<input className="border border-line bg-white p-2" value={slideshow.title} onChange={(event) => onChange({ ...slideshow, title: event.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm font-semibold">Default aspect ratio<select className="border border-line bg-white p-2" value={settings.aspect_ratio} onChange={(event) => patchSettings({ aspect_ratio: event.target.value })}>{ratios.map((ratio) => <option key={ratio}>{ratio}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold">Default text position<select className="border border-line bg-white p-2" value={settings.text_position} onChange={(event) => patchSettings({ text_position: event.target.value })}>{['top', 'center', 'bottom'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={settings.is_bg_overlay_on} onChange={(event) => patchSettings({ is_bg_overlay_on: event.target.checked })} /> Global background overlay</label>
            <label className="grid gap-1 text-sm font-semibold">Overlay opacity<input type="range" min="0" max="100" value={settings.background_opacity} onChange={(event) => patchSettings({ background_opacity: Number(event.target.value) })} /></label>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={settings.export_as_video} onChange={(event) => patchSettings({ export_as_video: event.target.checked })} /> Export as video</label>
            <label className="grid gap-1 text-sm font-semibold">Slide duration<input type="number" min="1" max="60" className="border border-line bg-white p-2" value={settings.slide_duration} onChange={(event) => patchSettings({ slide_duration: Number(event.target.value) })} /></label>
            <label className="grid gap-1 text-sm font-semibold">Transition<select className="border border-line bg-white p-2" value={settings.transition} onChange={(event) => patchSettings({ transition: event.target.value })}>{['none', 'fade'].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
        </div>
      </div>
    </div>
  );
}
