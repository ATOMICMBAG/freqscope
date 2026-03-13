/**
 * freqscope — DSP-Engine
 * Fensterfunktionen, Peak-Hold, Smoothing, Frequenzberechnungen
 */

// ── Fensterfunktionen ────────────────────────────────────────────────────────

/**
 * Berechnet eine Fensterfunktion für N Samples.
 * @param {'hann'|'hamming'|'blackman'|'rect'} type
 * @param {number} N
 * @returns {Float32Array}
 */
export function buildWindow(type, N) {
  const w = new Float32Array(N);
  switch (type) {
    case "hann":
      for (let i = 0; i < N; i++)
        w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
      break;
    case "hamming":
      for (let i = 0; i < N; i++)
        w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
      break;
    case "blackman":
      for (let i = 0; i < N; i++)
        w[i] =
          0.42 -
          0.5 * Math.cos((2 * Math.PI * i) / (N - 1)) +
          0.08 * Math.cos((4 * Math.PI * i) / (N - 1));
      break;
    case "rect":
    default:
      w.fill(1.0);
      break;
  }
  return w;
}

/**
 * Normalisierungsfaktor für die gewählte Fensterfunktion
 * (verhindert Amplitudenfehler durch das Fenstern)
 */
export function windowNormFactor(windowArr) {
  let sum = 0;
  for (let i = 0; i < windowArr.length; i++) sum += windowArr[i];
  return windowArr.length / sum;
}

// ── Peak-Hold ────────────────────────────────────────────────────────────────

export class PeakHold {
  /**
   * @param {number} bins  – Anzahl FFT-Bins
   * @param {number} decayDbPerFrame  – dB-Abfall pro Frame (nur für 'decay')
   */
  constructor(bins, decayDbPerFrame = 0.5) {
    this.bins = bins;
    this.decayDbPerFrame = decayDbPerFrame;
    this.held = new Float32Array(bins).fill(-Infinity);
  }

  /**
   * @param {Float32Array} spectrum  – aktuelle dBFS-Werte
   * @param {'off'|'hold'|'decay'} mode
   * @returns {Float32Array|null}  – Peak-Linie oder null wenn aus
   */
  update(spectrum, mode) {
    if (mode === "off") {
      this.held.fill(-Infinity);
      return null;
    }
    for (let i = 0; i < this.bins; i++) {
      if (spectrum[i] >= this.held[i]) {
        this.held[i] = spectrum[i];
      } else if (mode === "decay") {
        this.held[i] -= this.decayDbPerFrame;
      }
    }
    return this.held;
  }

  resize(bins) {
    this.bins = bins;
    this.held = new Float32Array(bins).fill(-Infinity);
  }
}

// ── Frequenz-Utility ─────────────────────────────────────────────────────────

/**
 * Bin-Index → Frequenz in Hz
 * @param {number} bin
 * @param {number} fftSize
 * @param {number} sampleRate
 */
export function binToHz(bin, fftSize, sampleRate) {
  return (bin * sampleRate) / fftSize;
}

/**
 * Frequenz in Hz → nächstgelegener Bin-Index
 */
export function hzToBin(hz, fftSize, sampleRate) {
  return Math.round((hz * fftSize) / sampleRate);
}

/**
 * Formatiert eine Frequenz für die Anzeige
 * @param {number} hz
 * @returns {string}
 */
export function formatHz(hz) {
  if (hz >= 1000) return (hz / 1000).toFixed(2) + " kHz";
  return hz.toFixed(1) + " Hz";
}

/**
 * Findet den dominanten Peak im Spektrum
 * @param {Float32Array} dbSpectrum
 * @param {number} fftSize
 * @param {number} sampleRate
 * @param {number} minBin  – untere Grenze (z.B. 5 bins Offset vom DC)
 * @returns {{ bin: number, hz: number, db: number }}
 */
export function findPeak(dbSpectrum, fftSize, sampleRate, minBin = 4) {
  let maxDb = -Infinity;
  let maxBin = minBin;
  const maxBinLimit = dbSpectrum.length;
  for (let i = minBin; i < maxBinLimit; i++) {
    if (dbSpectrum[i] > maxDb) {
      maxDb = dbSpectrum[i];
      maxBin = i;
    }
  }
  return {
    bin: maxBin,
    hz: binToHz(maxBin, fftSize, sampleRate),
    db: maxDb,
  };
}

// ── dBFS-Konvertierung ───────────────────────────────────────────────────────

/**
 * Wandelt Float32Array (linear 0..1) → dBFS
 * Die WebAudio AnalyserNode liefert bereits dBFS-Werte (getFloatFrequencyData),
 * diese Funktion ist für manuelle Berechnungen.
 */
export function linearToDb(linear) {
  return 20 * Math.log10(Math.max(linear, 1e-10));
}

// ── Smooth-Buffer ────────────────────────────────────────────────────────────

/**
 * Exponentielles Glättungs-Array
 * smoothed[i] = alpha * smoothed[i] + (1-alpha) * current[i]
 */
export class Smoother {
  constructor(bins) {
    this.buf = new Float32Array(bins).fill(-120);
  }

  apply(current, alpha) {
    const buf = this.buf;
    const n = Math.min(buf.length, current.length);
    for (let i = 0; i < n; i++) {
      const c = isFinite(current[i]) ? current[i] : -140;
      buf[i] = alpha * buf[i] + (1 - alpha) * c;
    }
    return buf;
  }

  resize(bins) {
    this.buf = new Float32Array(bins).fill(-120);
  }
}
