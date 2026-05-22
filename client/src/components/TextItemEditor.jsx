import { GripVertical, Trash2 } from 'lucide-react';

const fonts = ['TikTokSans-Regular', 'BebasNeue-Regular', 'CormorantGaramond-Regular', 'CormorantGaramond-Italic', 'Anton', 'Inter-Bold'];
const sizes = ['extra_small', 'small', 'medium', 'large', 'extra_large', 'extra_extra_large'];
const styles = ['outline', 'whiteText', 'blackText', 'yellowText', 'white_background', 'black_background', 'white_50_background', 'black_50_background'];
const widths = ['50%', '80%', '100%'];
const positions = ['top', 'center', 'bottom'];
const alignments = ['left', 'center', 'right'];

function Field({ label, children }) {
  return <label className="grid gap-1 text-xs font-semibold uppercase text-ink/60">{label}{children}</label>;
}

export default function TextItemEditor({ item, onChange, onDelete, onMoveUp, onMoveDown }) {
  return (
    <div className="border border-line bg-white/55 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase"><GripVertical size={14} /> Text item</div>
        <div className="flex gap-2">
          <button className="text-xs font-bold" onClick={onMoveUp}>Up</button>
          <button className="text-xs font-bold" onClick={onMoveDown}>Down</button>
          <button title="Delete text" onClick={onDelete}><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="grid gap-3">
        <Field label="Text">
          <textarea className="min-h-20 border border-line bg-paper p-2 normal-case text-ink" value={item.text} onChange={(event) => onChange({ text: event.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Font"><select className="border border-line bg-paper p-2 normal-case" value={item.font} onChange={(event) => onChange({ font: event.target.value })}>{fonts.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Size"><select className="border border-line bg-paper p-2 normal-case" value={item.font_size} onChange={(event) => onChange({ font_size: event.target.value })}>{sizes.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Style"><select className="border border-line bg-paper p-2 normal-case" value={item.text_style} onChange={(event) => onChange({ text_style: event.target.value })}>{styles.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Width"><select className="border border-line bg-paper p-2 normal-case" value={item.text_width} onChange={(event) => onChange({ text_width: event.target.value })}>{widths.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Position"><select className="border border-line bg-paper p-2 normal-case" value={item.text_position} onChange={(event) => onChange({ text_position: event.target.value })}>{positions.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Align"><select className="border border-line bg-paper p-2 normal-case" value={item.text_alignment} onChange={(event) => onChange({ text_alignment: event.target.value })}>{alignments.map((value) => <option key={value}>{value}</option>)}</select></Field>
        </div>
      </div>
    </div>
  );
}
