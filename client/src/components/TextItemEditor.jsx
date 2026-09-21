export default function TextItemEditor({ item, onChange }) {
  const headline = item.role === 'headline' || item.order === 0;
  return (
    <label className="grid gap-2">
      <span className="text-xs font-bold uppercase tracking-[.1em] text-black/45">{headline ? 'Point or title' : 'Explanation'}</span>
      <textarea
        className={`${headline ? 'min-h-24 text-base font-bold' : 'min-h-28 text-sm leading-6'} w-full resize-y rounded-lg border border-black/15 bg-white p-3 text-black outline-none focus:border-[#657052]`}
        value={item.text}
        onChange={(event) => onChange({ text: event.target.value })}
      />
    </label>
  );
}
