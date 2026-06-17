import Dashboard from './components/Dashboard.jsx';
import SlideComposer from './components/SlideComposer.jsx';
import { useSlideshow } from './hooks/useSlideshow.js';

export default function App() {
  const { slideshows, current, setCurrent, loading, refresh, createNew, save } = useSlideshow();

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-paper text-sm font-bold uppercase">Loading</div>;
  }

  if (!current) {
    return (
      <Dashboard
        slideshows={slideshows}
        onOpen={setCurrent}
        onCreate={createNew}
        onRefresh={refresh}
      />
    );
  }

  return (
    <SlideComposer
      slideshow={current}
      onChange={setCurrent}
      onSave={(next) => save(next || current)}
      onBack={() => setCurrent(null)}
    />
  );
}
