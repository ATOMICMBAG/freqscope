/**
 * freqscope — Konfigurations-Management
 * LocalStorage Persistenz + JSON Export/Import
 */

const LS_KEY = "freqscope_config_v1";

/**
 * Standard-Konfiguration
 * Entspricht dem Beispiel aus der README
 */
export const DEFAULT_CONFIG = {
  version: 1,
  dsp: {
    fftSize: 4096,
    window: "hann",
    smoothing: 0.25,
    peakHold: "off",
  },
  display: {
    dbMin: -120,
    dbMax: 0,
    colormap: "turbo",
    freqMin: 0,
    freqMax: 200000,
  },
  ui: {
    guideDismissed: false,
    nerdOpen: false,
  },
  tone: {
    volume: 0.08,
  },
};

/**
 * Tiefes Zusammenführen von zwei Objekten (target wird mit source überschrieben)
 * @param {object} target
 * @param {object} source
 * @returns {object}
 */
function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      out[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * Konfiguration aus LocalStorage laden
 * @returns {object}  – vollständige, validierte Konfiguration
 */
export function loadConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    const parsed = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT_CONFIG), parsed);
  } catch (e) {
    console.warn("[freqscope] Konnte Config nicht laden:", e);
    return structuredClone(DEFAULT_CONFIG);
  }
}

/**
 * Konfiguration in LocalStorage speichern
 * @param {object} config
 */
export function saveConfig(config) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn("[freqscope] Konnte Config nicht speichern:", e);
  }
}

/**
 * Konfiguration als JSON-Datei herunterladen
 * @param {object} config
 */
export function exportConfig(config) {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "freqscope.config.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * JSON-Datei importieren & validieren
 * @param {File} file
 * @returns {Promise<object>}  – gemergete Konfiguration
 */
export async function importConfig(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed.version) throw new Error("Ungültige Config: keine Version");
  return deepMerge(structuredClone(DEFAULT_CONFIG), parsed);
}

/**
 * Konfiguration auf Default zurücksetzen
 * @returns {object}
 */
export function resetConfig() {
  localStorage.removeItem(LS_KEY);
  return structuredClone(DEFAULT_CONFIG);
}
