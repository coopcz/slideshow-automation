import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function ImageLibrary({ picker = false, onPick, onClose }) {
  const [images, setImages] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  async function refresh() {
    setImages(await api('/api/images'));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function upload(files) {
    if (!files?.length) return;
    const form = new FormData();
    Array.from(files).forEach((file) => form.append('images', file));
    await api('/api/images', { method: 'POST', body: form });
    await refresh();
  }

  async function remove(id) {
    await api(`/api/images/${id}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <div className={picker ? 'fixed inset-0 z-50 bg-black/45 p-8' : 'h-full'}>
      <div className={picker ? 'mx-auto flex h-full max-w-5xl flex-col border border-line bg-paper' : 'flex h-full flex-col'}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">Image Library</h2>
            <p className="text-xs text-ink/60">{images.length} local images</p>
          </div>
          {picker && <button className="text-sm font-semibold" onClick={onClose}>Close</button>}
        </div>

        <div
          className={`m-5 flex min-h-28 cursor-pointer items-center justify-center border border-dashed ${dragging ? 'border-accent bg-accent/10' : 'border-line'} px-4 text-center`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            upload(event.dataTransfer.files);
          }}
        >
          <input ref={inputRef} className="hidden" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => upload(event.target.files)} />
          <div className="flex items-center gap-3 text-sm font-semibold">
            <Upload size={18} />
            Drop JPG, PNG, or WebP files here
          </div>
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-4 gap-3 overflow-auto px-5 pb-5">
          {images.map((image) => (
            <div key={image.id} className="group relative aspect-square overflow-hidden border border-line bg-white">
              <button className="h-full w-full" onClick={() => onPick?.(image.url)}>
                <img src={image.url} alt={image.original_name} className="h-full w-full object-cover" />
              </button>
              <button className="absolute right-2 top-2 hidden bg-paper p-1 group-hover:block" title="Delete image" onClick={() => remove(image.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {!images.length && (
            <div className="col-span-4 flex h-40 items-center justify-center gap-2 border border-line text-sm text-ink/60">
              <ImagePlus size={18} /> No uploads yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
