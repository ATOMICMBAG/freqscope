/**
 * freqscope — Farbkarten für den Wasserfall
 * Wert 0.0 = kalt (kein Signal), 1.0 = heiß (starkes Signal)
 */

// ── Turbo (Google) ───────────────────────────────────────────────────────────
// Hohe Qualität, sehr gut für spektrale Daten
const TURBO_DATA = [
  [48, 18, 59],
  [50, 42, 94],
  [54, 65, 128],
  [57, 89, 140],
  [57, 113, 140],
  [53, 136, 136],
  [45, 158, 125],
  [31, 180, 107],
  [21, 200, 83],
  [47, 216, 56],
  [86, 229, 27],
  [132, 239, 14],
  [176, 246, 15],
  [214, 248, 26],
  [243, 243, 49],
  [253, 227, 82],
  [252, 204, 107],
  [249, 178, 125],
  [244, 151, 126],
  [237, 122, 115],
  [225, 93, 102],
  [212, 64, 92],
  [196, 37, 88],
  [174, 18, 88],
  [147, 8, 89],
  [114, 4, 84],
  [79, 2, 72],
  [48, 18, 59],
];

// ── Viridis (Matplotlib) ─────────────────────────────────────────────────────
const VIRIDIS_DATA = [
  [68, 1, 84],
  [72, 26, 108],
  [71, 47, 122],
  [65, 68, 135],
  [57, 86, 140],
  [49, 104, 142],
  [42, 120, 142],
  [35, 137, 142],
  [28, 153, 139],
  [25, 168, 132],
  [34, 183, 122],
  [58, 197, 107],
  [91, 210, 89],
  [130, 221, 67],
  [171, 229, 44],
  [214, 234, 26],
  [253, 231, 37],
];

// ── Hot ──────────────────────────────────────────────────────────────────────
const HOT_DATA = [
  [0, 0, 0],
  [64, 0, 0],
  [128, 0, 0],
  [192, 0, 0],
  [255, 0, 0],
  [255, 64, 0],
  [255, 128, 0],
  [255, 192, 0],
  [255, 255, 0],
  [255, 255, 128],
  [255, 255, 255],
];

// ── Gray ─────────────────────────────────────────────────────────────────────
const GRAY_DATA = [
  [0, 0, 0],
  [255, 255, 255],
];

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Interpoliert zwischen Farb-Stützpunkten
 * @param {number[][]} data  – Array von [r,g,b] Stützpunkten
 * @param {number} t  – 0.0 … 1.0
 * @returns {[number,number,number]}
 */
function interpolate(data, t) {
  t = Math.max(0, Math.min(1, t));
  const idx = t * (data.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, data.length - 1);
  const frac = idx - lo;
  const c0 = data[lo];
  const c1 = data[hi];
  return [
    Math.round(c0[0] + frac * (c1[0] - c0[0])),
    Math.round(c0[1] + frac * (c1[1] - c0[1])),
    Math.round(c0[2] + frac * (c1[2] - c0[2])),
  ];
}

/**
 * Baut ein Lookup-Array mit 256 Einträgen [r,g,b] für maximale Performance
 * @param {string} name
 * @returns {Uint8Array}  – 256*3 Bytes (r0,g0,b0, r1,g1,b1, …)
 */
function buildLUT(name) {
  let data;
  switch (name) {
    case "viridis":
      data = VIRIDIS_DATA;
      break;
    case "gray":
      data = GRAY_DATA;
      break;
    case "hot":
      data = HOT_DATA;
      break;
    case "turbo":
    default:
      data = TURBO_DATA;
  }

  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = interpolate(data, i / 255);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

// Cache für LUTs
const _cache = new Map();

/**
 * Gibt eine gecachte LUT zurück
 * @param {string} name 'turbo'|'viridis'|'gray'|'hot'
 * @returns {Uint8Array}
 */
export function getLUT(name) {
  if (!_cache.has(name)) {
    _cache.set(name, buildLUT(name));
  }
  return _cache.get(name);
}

/**
 * Mappe dB-Wert auf RGB über LUT
 * @param {number} db  – aktueller dBFS-Wert
 * @param {number} dbMin  – z.B. -120
 * @param {number} dbMax  – z.B. 0
 * @param {Uint8Array} lut
 * @returns {[number,number,number]}
 */
export function dbToColor(db, dbMin, dbMax, lut) {
  const t = (db - dbMin) / (dbMax - dbMin);
  const idx = Math.max(0, Math.min(255, Math.round(t * 255)));
  return [lut[idx * 3], lut[idx * 3 + 1], lut[idx * 3 + 2]];
}
