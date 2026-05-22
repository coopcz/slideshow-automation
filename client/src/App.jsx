import { useEffect } from 'react';
import Dashboard from './components/Dashboard.jsx';
import SlideComposer from './components/SlideComposer.jsx';
import { useSlideshow } from './hooks/useSlideshow.js';

export default function App() {
  const { slideshows, current, setCurrent, loading, refresh, createNew, save } = useSlideshow();

  useEffect(() => {
    if (!loading && !current && slideshows.length === 0) {
      createNew();
    }
  }, [loading, current, slideshows.length, createNew]);

  if (loading || !current) {
    return <div className="flex h-screen items-center justify-center bg-paper text-sm font-bold uppercase">Loading</div>;
  }

  return current.mode === 'dashboard' ? (
    <Dashboard slideshows={slideshows} onOpen={setCurrent} onCreate={createNew} onRefresh={refresh} />
  ) : (
    <SlideComposer
      slideshow={current}
      onChange={setCurrent}
      onSave={(next) => save(next || current)}
      onBack={() => setCurrent({ ...current, mode: 'dashboard' })}
    />
  );
}
