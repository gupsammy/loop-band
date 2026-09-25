// Renders clips off the main thread, so computing sound never makes the page stutter.
import { renderClip } from './render.js';

self.onmessage = ({ data: { key, spec } }) => {
  try {
    const { L, R, snare } = renderClip(spec);
    // hand the buffers over instead of copying them
    self.postMessage({ key, L, R, snare }, [L.buffer, R.buffer, ...(snare ? [snare.buffer] : [])]);
  } catch (err) {
    self.postMessage({ key, error: String(err && err.message || err) });
  }
};
