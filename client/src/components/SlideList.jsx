import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableSlide({ slide, selected, onSelect, onDuplicate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: slide.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`group flex w-36 shrink-0 flex-col border ${selected ? 'border-accent' : 'border-line'} bg-paper`}>
      <button onClick={onSelect} className="aspect-[4/5] overflow-hidden bg-ink">
        {slide.image_url ? <img src={slide.image_url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-neutral-800" />}
      </button>
      <div className="flex items-center justify-between border-t border-line px-2 py-1">
        <button {...attributes} {...listeners} title="Drag slide"><GripVertical size={14} /></button>
        <span className="text-xs font-bold">#{slide.order + 1}</span>
        <div className="flex gap-1">
          <button onClick={onDuplicate} title="Duplicate slide"><Copy size={14} /></button>
          <button onClick={onDelete} title="Delete slide"><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  );
}

export default function SlideList({ slides, selectedId, onSelect, onChange, onAdd }) {
  function reorder(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = slides.findIndex((slide) => slide.id === active.id);
    const newIndex = slides.findIndex((slide) => slide.id === over.id);
    onChange(arrayMove(slides, oldIndex, newIndex).map((slide, index) => ({ ...slide, order: index })));
  }

  return (
    <div className="border-t border-line bg-paper">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-sm font-bold">{slides.length} slides</div>
        <button className="flex items-center gap-2 bg-ink px-3 py-2 text-sm font-bold text-white" onClick={onAdd}>
          <Plus size={16} /> Add slide
        </button>
      </div>
      <DndContext collisionDetection={closestCenter} onDragEnd={reorder}>
        <SortableContext items={slides.map((slide) => slide.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-3 overflow-x-auto px-4 pb-4">
            {slides.map((slide) => (
              <SortableSlide
                key={slide.id}
                slide={slide}
                selected={slide.id === selectedId}
                onSelect={() => onSelect(slide.id)}
                onDuplicate={() => {
                  const copy = { ...slide, id: crypto.randomUUID(), order: slides.length, text_items: slide.text_items.map((item) => ({ ...item, id: crypto.randomUUID() })) };
                  onChange([...slides, copy]);
                }}
                onDelete={() => onChange(slides.filter((item) => item.id !== slide.id).map((item, index) => ({ ...item, order: index })))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
