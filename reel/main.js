// @ts-mandatory: Tarayicida native ES modulu olarak calismasi icin saf JS gereklidir.
import { renderFilm, DUR } from './film.js';

const canvas = document.getElementById('c');
const g = canvas.getContext('2d');

window.DUR = DUR;
window.render = (t) => renderFilm(g, t);
window.seek = (t) => renderFilm(g, t);

try {
  await document.fonts.ready;
} catch (err) {
  console.warn('Font load error:', err);
}

window.READY = true;
window.seek(0);
