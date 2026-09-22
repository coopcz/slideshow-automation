import { Check, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';

const suggestions = [
  'Make the wording simpler and easier to scan',
  'Make every point warmer and more practical',
  'Shorten the text without losing the meaning'
];

export default function AiRevisionPanel({ slideshow, onChange, onSave }) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function revise() {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setMessage('Saving your edits, then revising the wording...');
    try {
      const saved = await onSave(slideshow);
      const result = await api(`/api/automation/slideshows/${saved.id}/revise`, {
        method: 'POST',
        body: JSON.stringify({ instruction: instruction.trim() })
      });
      onChange(result.slideshow);
      setInstruction('');
      setMessage('Revised and saved. Review the slides before publishing.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-b border-black/10 bg-[#f0f1ec] p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#657052] text-white"><Sparkles size={15} /></div>
        <div>
          <h2 className="text-sm font-extrabold">Revise with AI</h2>
          <p className="mt-1 text-xs leading-5 text-black/50">Change the wording across every slide. Images and formatting stay the same.</p>
        </div>
      </div>

      <textarea
        className="mt-4 min-h-24 w-full resize-y rounded-lg border border-black/15 bg-white p-3 text-sm leading-6 outline-none transition focus:border-[#657052]"
        maxLength={2000}
        placeholder="Example: Make slide 3 easier to understand and make the ending feel more useful for parents."
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') revise();
        }}
      />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            className="rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold text-black/55 transition hover:border-[#657052] hover:text-[#657052]"
            onClick={() => setInstruction(suggestion)}
            type="button"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <button
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f211d] px-4 py-3 text-sm font-bold text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-45"
        disabled={!instruction.trim() || busy}
        onClick={revise}
        type="button"
      >
        {busy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
        {busy ? 'Revising slideshow...' : 'Revise slideshow'}
      </button>

      {message && <p className={`mt-3 flex items-start gap-2 text-xs leading-5 ${message.startsWith('Revised') ? 'text-[#586247]' : 'text-black/55'}`}>
        {message.startsWith('Revised') && <Check className="mt-0.5 shrink-0" size={13} />}{message}
      </p>}
    </section>
  );
}
