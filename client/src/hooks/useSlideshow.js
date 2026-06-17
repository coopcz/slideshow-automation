import { useCallback, useEffect, useState } from 'react';
import { api, createBlankSlideshow } from '../api.js';

export function useSlideshow() {
  const [slideshows, setSlideshows] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await api('/api/slideshows');
    setSlideshows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);

  const createNew = useCallback(async () => {
    const created = await createBlankSlideshow();
    setCurrent(created);
    await refresh();
    return created;
  }, [refresh]);

  const save = useCallback(async (next = current) => {
    if (!next) return null;
    const saved = await api(`/api/slideshows/${next.id}`, {
      method: 'PUT',
      body: JSON.stringify(next)
    });
    setCurrent(saved);
    setSlideshows((items) => items.map((item) => item.id === saved.id ? saved : item));
    return saved;
  }, [current]);

  return { slideshows, current, setCurrent, loading, refresh, createNew, save };
}
