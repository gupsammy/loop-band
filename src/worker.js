// Renders clips off the main thread, so computing sound never makes the page stutter.
import { renderClip } from './render.js';

self.onmessage = ({ data: { key, spec } }) => {
  try {
    const { L, R } = renderClip(spec);
    self.postMessage({ key, L, R }, [L.buffer, R.buffer]); // hand the buffers over instead of copying them
  } catch (err) {
    self.postMessage({ key, error: String(err && err.message || err) });
  }
};
