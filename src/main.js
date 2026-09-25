import { Engine } from './engine.js';
import { initGuide } from './guide.js';
import { initBoard } from './ui.js';

let guide;
const engine = new Engine(() => guide.onBar());
guide = initGuide(engine);
initBoard(engine, guide);
window.loopBand = engine; // for poking at from the browser console
