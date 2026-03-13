/**
 * freqscope — Wasserfall-Renderer
 * Scrollender Zeit-Frequenz-Verlauf mit Farbkarte
 */

import { getLUT, dbToColor } from "./colormaps.js";

export class WaterfallRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this._w = 0;
    this._h = 0;
    this._colormap = "turbo";
    this._lut = getLUT("turbo");

    // Off-screen ImageData für schnelles Pixel-Schreiben
    /** @type {ImageData|null} */
    this._imgData = null;

    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas.parentElement);
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(parent.clientWidth * dpr);
    const h = Math.round(parent.clientHeight * dpr);

    if (w === this.canvas.width && h === this.canvas.height) return;

    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = parent.clientWidth + "px";
    this.canvas.style.height = parent.clientHeight + "px";
    this._w = w;
    this._h = h;

    // Neues ImageData (schwarz)
    this._imgData = this.ctx.createImageData(w, h);
    // Alpha auf 255 setzen
    for (let i = 3; i < this._imgData.data.length; i += 4) {
      this._imgData.data[i] = 255;
    }
  }

  /**
   * Farbkarte wechseln
   * @param {string} name
   */
  setColormap(name) {
    this._colormap = name;
    this._lut = getLUT(name);
  }

  /**
   * Eine neue Zeile oben einfügen (scrollt nach unten)
   * @param {Float32Array} spectrum  – dBFS-Werte
   * @param {object} opts
   * @param {number} opts.dbMin
   * @param {number} opts.dbMax
   * @param {number} opts.freqMin  – Hz
   * @param {number} opts.freqMax  – Hz
   * @param {number} opts.sampleRate
   * @param {number} opts.fftSize
   */
  push(spectrum, opts) {
    if (!this._imgData) return;
    const { dbMin, dbMax, freqMin, freqMax, sampleRate, fftSize } = opts;
    const W = this._w;
    const H = this._h;
    const data = this._imgData.data;
    const lut = this._lut;
    const nyquist = sampleRate / 2;

    if (!W || !H) return;

    // Alle Zeilen um 1 nach unten verschieben (memmove emulieren)
    // Quell: Bytes 0…(H-2)*W*4, Ziel: W*4…(H-1)*W*4
    data.copyWithin(W * 4, 0, (H - 1) * W * 4);

    // Neue Zeile ganz oben schreiben (y=0)
    for (let px = 0; px < W; px++) {
      const ratio = W > 1 ? px / (W - 1) : 0;
      const freq = freqMin + ratio * (freqMax - freqMin);
      const bin = Math.round((freq * fftSize) / sampleRate);
      const db =
        freq >= 0 && freq <= nyquist && bin >= 0 && bin < spectrum.length
          ? spectrum[bin]
          : dbMin;
      const [r, g, b] = dbToColor(db, dbMin, dbMax, lut);
      const off = px * 4;
      data[off] = r;
      data[off + 1] = g;
      data[off + 2] = b;
      data[off + 3] = 255;
    }

    this.ctx.putImageData(this._imgData, 0, 0);
  }

  /** Canvas leeren */
  clear() {
    if (!this._imgData) return;
    const d = this._imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 10;
      d[i + 1] = 10;
      d[i + 2] = 15;
      d[i + 3] = 255;
    }
    this.ctx.putImageData(this._imgData, 0, 0);
  }

  destroy() {
    this._ro.disconnect();
  }
}
