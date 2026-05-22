export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || response.statusText);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const createBlankSlideshow = () => api('/api/slideshows', {
  method: 'POST',
  body: JSON.stringify({})
});
