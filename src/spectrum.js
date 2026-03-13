/**
 * freqscope — Spektrum-Renderer
 * Zeichnet das FFT-Spektrum auf ein Canvas-Element
 */

const GRID_COLOR = "rgba(255,255,255,0.08)";
const AXIS_COLOR = "rgba(255,255,255,0.4)";
const SPECTRUM_FILL = "rgba(0, 160, 255, 0.18)";
const SPECTRUM_LINE = "#00aaff";
const PEAK_LINE_COLOR = "#ff6600";
const LABEL_COLOR = "rgba(200,200,200,0.7)";
const FONT = '10px "Cascadia Code","Fira Code","Consolas",monospace';

export class SpectrumRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this._dpr = window.devicePixelRatio || 1;
    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas.parentElement);
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    this._dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.scale(dpr, dpr);
    this._w = w;
    this._h = h;
  }

  /**
   * Hauptzeichenfunktion
   * @param {Float32Array} spectrum  – dBFS-Werte
   * @param {Float32Array|null} peakHeld  – Peak-Hold-Linie (optional)
   * @param {object} opts
   * @param {number} opts.dbMin
   * @param {number} opts.dbMax
   * @param {number} opts.freqMin  – Hz
   * @param {number} opts.freqMax  – Hz
   * @param {number} opts.sampleRate
   * @param {number} opts.fftSize
   */
  draw(spectrum, peakHeld, opts) {
    const { dbMin, dbMax, freqMin, freqMax, sampleRate, fftSize } = opts;
    const ctx = this.ctx;
    const W = this._w;
    const H = this._h;
    const nyquist = sampleRate / 2;

    if (!W || !H) return;

    // Padding
    const PAD_L = 44; // Platz für Y-Achse
    const PAD_B = 22; // Platz für X-Achse
    const PAD_T = 8;
    const PAD_R = 8;
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;

    // Hintergrund
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W, H);

    // ── Grid ──
    this._drawGrid(
      ctx,
      PAD_L,
      PAD_T,
      plotW,
      plotH,
      dbMin,
      dbMax,
      freqMin,
      freqMax,
      sampleRate,
      fftSize,
    );

    // ── Spektrumlinie ──
    ctx.beginPath();
    let firstPoint = true;
    for (let px = 0; px < plotW; px++) {
      const ratio = plotW > 1 ? px / (plotW - 1) : 0;
      const freq = freqMin + ratio * (freqMax - freqMin);
      const bin = Math.round((freq * fftSize) / sampleRate);
      const db =
        freq >= 0 && freq <= nyquist && bin >= 0 && bin < spectrum.length
          ? spectrum[bin]
          : dbMin;
      const y = PAD_T + plotH - ((db - dbMin) / (dbMax - dbMin)) * plotH;
      const yC = Math.max(PAD_T, Math.min(PAD_T + plotH, y));
      if (firstPoint) {
        ctx.moveTo(PAD_L + px, yC);
        firstPoint = false;
      } else {
        ctx.lineTo(PAD_L + px, yC);
      }
    }

    // Fill
    ctx.lineTo(PAD_L + plotW, PAD_T + plotH);
    ctx.lineTo(PAD_L, PAD_T + plotH);
    ctx.closePath();
    ctx.fillStyle = SPECTRUM_FILL;
    ctx.fill();

    // Linie nochmals ohne Fill
    ctx.beginPath();
    firstPoint = true;
    for (let px = 0; px < plotW; px++) {
      const ratio = plotW > 1 ? px / (plotW - 1) : 0;
      const freq = freqMin + ratio * (freqMax - freqMin);
      const bin = Math.round((freq * fftSize) / sampleRate);
      const db =
        freq >= 0 && freq <= nyquist && bin >= 0 && bin < spectrum.length
          ? spectrum[bin]
          : dbMin;
      const y = PAD_T + plotH - ((db - dbMin) / (dbMax - dbMin)) * plotH;
      const yC = Math.max(PAD_T, Math.min(PAD_T + plotH, y));
      if (firstPoint) {
        ctx.moveTo(PAD_L + px, yC);
        firstPoint = false;
      } else {
        ctx.lineTo(PAD_L + px, yC);
      }
    }
    ctx.strokeStyle = SPECTRUM_LINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Peak-Hold-Linie ──
    if (peakHeld) {
      ctx.beginPath();
      firstPoint = true;
      for (let px = 0; px < plotW; px++) {
        const ratio = plotW > 1 ? px / (plotW - 1) : 0;
        const freq = freqMin + ratio * (freqMax - freqMin);
        const bin = Math.round((freq * fftSize) / sampleRate);
        const db =
          freq >= 0 && freq <= nyquist && bin >= 0 && bin < peakHeld.length
            ? peakHeld[bin]
            : dbMin;
        if (!isFinite(db)) continue;
        const y = PAD_T + plotH - ((db - dbMin) / (dbMax - dbMin)) * plotH;
        const yC = Math.max(PAD_T, Math.min(PAD_T + plotH, y));
        if (firstPoint) {
          ctx.moveTo(PAD_L + px, yC);
          firstPoint = false;
        } else {
          ctx.lineTo(PAD_L + px, yC);
        }
      }
      ctx.strokeStyle = PEAK_LINE_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Rahmen ──
    ctx.strokeStyle = AXIS_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD_L, PAD_T, plotW, plotH);
  }

  _drawGrid(
    ctx,
    padL,
    padT,
    plotW,
    plotH,
    dbMin,
    dbMax,
    freqMin,
    freqMax,
    sampleRate,
    fftSize,
  ) {
    ctx.font = FONT;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    // Y-Achse (dB) – 6 Linien
    const dbStep = Math.ceil((dbMax - dbMin) / 6 / 10) * 10;
    for (
      let db = Math.ceil(dbMin / dbStep) * dbStep;
      db <= dbMax;
      db += dbStep
    ) {
      const y = padT + plotH - ((db - dbMin) / (dbMax - dbMin)) * plotH;
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillStyle = LABEL_COLOR;
      ctx.fillText(db + " dB", padL - 4, y);
    }

    // X-Achse (Hz / kHz) – 8 Linien
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const freqRange = freqMax - freqMin;
    const freqStepRaw = freqRange / 8;
    const freqMag = Math.pow(10, Math.floor(Math.log10(freqStepRaw)));
    const freqStep = Math.ceil(freqStepRaw / freqMag) * freqMag;

    for (
      let f = Math.ceil(freqMin / freqStep) * freqStep;
      f <= freqMax;
      f += freqStep
    ) {
      const x = padL + ((f - freqMin) / (freqMax - freqMin)) * plotW;
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.fillStyle = LABEL_COLOR;
      const label = f >= 1000 ? (f / 1000).toFixed(1) + "k" : f.toFixed(0);
      ctx.fillText(label, x, padT + plotH + 4);
    }
  }

  destroy() {
    this._ro.disconnect();
  }
}
