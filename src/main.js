/**
 * freqscope — Haupteinstiegspunkt
 * Verbindet alle Module: Audio, DSP, Renderer, SCPI, Config, UI
 */

import { AudioEngine } from "./audio.js";
import { Smoother, PeakHold, findPeak, formatHz, buildWindow } from "./dsp.js";
import { SpectrumRenderer } from "./spectrum.js";
import { WaterfallRenderer } from "./waterfall.js";
import { InstrumentState, executeScpi } from "./scpi.js";
import {
  loadConfig,
  saveConfig,
  exportConfig,
  importConfig,
  resetConfig,
} from "./config.js";

// ═══════════════════════════════════════════════════════════════════════════
// INITIALISIERUNG
// ═══════════════════════════════════════════════════════════════════════════

// Konfiguration laden
let cfg = loadConfig();

// Module instanziieren
const audio = new AudioEngine();
const instrState = new InstrumentState();

// Renderer
const spectrumRenderer = new SpectrumRenderer(
  document.getElementById("spectrum-canvas"),
);
const waterfallRenderer = new WaterfallRenderer(
  document.getElementById("waterfall-canvas"),
);

// DSP-Helfer
let smoother = new Smoother(cfg.dsp.fftSize / 2);
let peakHold = new PeakHold(cfg.dsp.fftSize / 2);
let windowBuf = buildWindow(cfg.dsp.window, cfg.dsp.fftSize);

// Laufzeitvariablen
let rafId = null;
let isPaused = false;
let currentPeak = null;
let frameCount = 0;

// ── DOM-Referenzen ──────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const elPeakFreq = $("peak-freq");
const elPeakDb = $("peak-db");
const elCenterFreq = $("center-freq");
const elSpanFreq = $("span-freq");
const elLed = $("led-dot");
const elLedLabel = $("led-label");

const elGuidedBanner = $("guided-banner");
const elSpectrumOverlay = $("spectrum-overlay");
const elWaterfallOverlay = $("waterfall-overlay");
const elBtnGuideToggle = $("btn-guide-toggle");
const elBtnHideGuide = $("btn-hide-guide");

const elBtnStartMic = $("btn-start-mic");
const elBtnMicToggle = $("btn-mic-toggle");
const elBtnPause = $("btn-pause");
const elBtnClear = $("btn-clear");
const elBtnNerdToggle = $("btn-nerd-toggle");
const elNerdArrow = $("nerd-arrow");
const elNerdPanel = $("nerd-panel");
const elFileInput = $("file-input");
const elConfigFileInput = $("config-file-input");
const elBtnExportConfig = $("btn-export-config");
const elBtnResetConfig = $("btn-reset-config");

// DSP Controls
const elFftSize = $("sel-fft-size");
const elWindow = $("sel-window");
const elSmoothing = $("rng-smoothing");
const elSmoothingVal = $("smoothing-val");
const elPeakHoldSel = $("sel-peak-hold");
const elDbMin = $("rng-db-min");
const elDbMax = $("rng-db-max");
const elDbMinVal = $("dbmin-val");
const elDbMaxVal = $("dbmax-val");
const elColormap = $("sel-colormap");
const elFreqMin = $("rng-freq-min");
const elFreqMax = $("rng-freq-max");
const elFreqMinVal = $("freqmin-val");
const elFreqMaxVal = $("freqmax-val");

// SCPI
const elScpiInput = $("scpi-input");
const elScpiOutput = $("scpi-output");
const elBtnScpiSend = $("btn-scpi-send");

// Footer
const elFooterSr = $("footer-sample-rate");
const elFooterFft = $("footer-fft-info");
const elBtnTone = $("btn-tone-toggle");
const elWave = $("sel-wave-type");
const elToneFreqRange = $("rng-tone-freq");
const elToneFreqNumber = $("num-tone-freq");
const elToneActiveNote = $("tone-active-note");
const elToneKeyboard = $("tone-keyboard");
const elToneVolumeRange = $("rng-tone-volume");
const elToneVolumeNumber = $("num-tone-volume");
const elToneVolumeNote = $("tone-volume-note");

const TONE_MIN_HZ = 20;
const TONE_MAX_HZ = 200000;
const TONE_SLIDER_MAX = 1000;
const DISPLAY_MAX_HZ = 200000;

// ═══════════════════════════════════════════════════════════════════════════
// UI AUS CONFIG INITIALISIEREN
// ═══════════════════════════════════════════════════════════════════════════

function applyConfigToUI() {
  cfg.display.freqMin = Math.max(
    0,
    Math.min(DISPLAY_MAX_HZ, cfg.display.freqMin),
  );
  cfg.display.freqMax = Math.max(
    cfg.display.freqMin,
    Math.min(DISPLAY_MAX_HZ, cfg.display.freqMax),
  );

  elFftSize.value = cfg.dsp.fftSize;
  elWindow.value = cfg.dsp.window;
  elSmoothing.value = cfg.dsp.smoothing;
  elSmoothingVal.textContent = cfg.dsp.smoothing;
  elPeakHoldSel.value = cfg.dsp.peakHold;

  elDbMin.value = cfg.display.dbMin;
  elDbMax.value = cfg.display.dbMax;
  elDbMinVal.textContent = cfg.display.dbMin;
  elDbMaxVal.textContent = cfg.display.dbMax;
  elColormap.value = cfg.display.colormap;
  elFreqMin.value = cfg.display.freqMin;
  elFreqMax.value = cfg.display.freqMax;
  elFreqMinVal.textContent = cfg.display.freqMin;
  elFreqMaxVal.textContent = cfg.display.freqMax;

  if (elToneVolumeRange && elToneVolumeNumber) {
    const safeToneVolume = clampToneVolume(cfg.tone?.volume ?? 0.08);
    cfg.tone.volume = safeToneVolume;
    elToneVolumeRange.value = safeToneVolume.toFixed(2);
    elToneVolumeNumber.value = safeToneVolume.toFixed(2);
    updateToneVolumeLabel(safeToneVolume);
  }

  // Guided Banner
  setGuideVisibility(!cfg.ui.guideDismissed, false);

  // Nerd Panel
  if (cfg.ui.nerdOpen) {
    elNerdPanel.classList.remove("collapsed");
    elNerdArrow.textContent = "▲";
  }

  // Wasserfall Colormap
  waterfallRenderer.setColormap(cfg.display.colormap);

  // Header-Readouts aus instrState
  updateHeaderReadouts();
}

function updateHeaderReadouts() {
  elCenterFreq.textContent = formatHz(instrState.centerHz);
  elSpanFreq.textContent = formatHz(instrState.spanHz);
}

function updateGuideButtons() {
  if (elBtnGuideToggle) {
    elBtnGuideToggle.textContent = cfg.ui.guideDismissed
      ? "ℹ Hilfe einblenden"
      : "ℹ Hilfe ausblenden";
  }
}

function setGuideVisibility(isVisible, persist = true) {
  if (!elGuidedBanner) return;
  elGuidedBanner.classList.toggle("hidden", !isVisible);
  cfg.ui.guideDismissed = !isVisible;
  updateGuideButtons();
  if (persist) saveConfig(cfg);
}

function clampToneVolume(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0.08;
  return Math.max(0, Math.min(0.3, numeric));
}

function clampToneFrequency(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 440;
  return Math.max(TONE_MIN_HZ, Math.min(TONE_MAX_HZ, numeric));
}

function toneSliderToHz(sliderValue) {
  const pos = Math.max(0, Math.min(TONE_SLIDER_MAX, Number(sliderValue) || 0));
  const minLog = Math.log10(TONE_MIN_HZ);
  const maxLog = Math.log10(TONE_MAX_HZ);
  const ratio = pos / TONE_SLIDER_MAX;
  return 10 ** (minLog + ratio * (maxLog - minLog));
}

function toneHzToSlider(hz) {
  const safeHz = clampToneFrequency(hz);
  const minLog = Math.log10(TONE_MIN_HZ);
  const maxLog = Math.log10(TONE_MAX_HZ);
  const ratio = (Math.log10(safeHz) - minLog) / (maxLog - minLog);
  return Math.round(ratio * TONE_SLIDER_MAX);
}

function updateToneVolumeLabel(volume) {
  if (!elToneVolumeNote) return;
  const percent = Math.round(volume * 100);
  let text = `${percent} %`;
  if (volume === 0) text = "Stumm";
  else if (volume <= 0.08) text = `Leise · ${percent} %`;
  else if (volume <= 0.18) text = `Mittel · ${percent} %`;
  else text = `Vorsicht · ${percent} %`;
  elToneVolumeNote.textContent = text;
}

function syncToneVolume(volume, persist = true) {
  const safeVolume = clampToneVolume(volume);
  if (elToneVolumeRange) elToneVolumeRange.value = safeVolume.toFixed(2);
  if (elToneVolumeNumber) elToneVolumeNumber.value = safeVolume.toFixed(2);
  updateToneVolumeLabel(safeVolume);
  cfg.tone.volume = safeVolume;
  if (audio.isOscRunning) {
    audio.setOscGain(safeVolume);
  }
  if (persist) saveConfig(cfg);
  return safeVolume;
}

applyConfigToUI();
scpiLog("info", `freqscope v1.0 bereit. Tippe *IDN? für Instrumenteninfo.`);

// ═══════════════════════════════════════════════════════════════════════════
// STATUS LED
// ═══════════════════════════════════════════════════════════════════════════

function setLed(state, label) {
  elLed.className = "led";
  if (state) elLed.classList.add(state);
  elLedLabel.textContent = label;
}

function resetMicButton() {
  elBtnMicToggle.disabled = false;
  elBtnMicToggle.querySelector("#mic-btn-text").textContent = "Mikrofon";
}

function resetToneButton() {
  if (!elBtnTone) return;
  elBtnTone.textContent = "Start";
  elBtnTone.classList.remove("active");
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════════════════

function getRenderOpts() {
  return {
    dbMin: cfg.display.dbMin,
    dbMax: cfg.display.dbMax,
    freqMin: cfg.display.freqMin,
    freqMax: cfg.display.freqMax,
    sampleRate: audio.sampleRate,
    fftSize: cfg.dsp.fftSize,
  };
}

function renderLoop() {
  rafId = requestAnimationFrame(renderLoop);

  if (!audio.isRunning) return;

  const raw = audio.getFrequencyData();
  if (!raw) return;

  // Smoothing
  const smoothed = smoother.apply(raw, cfg.dsp.smoothing);

  // Peak-Hold
  const peak = peakHold.update(smoothed, cfg.dsp.peakHold);

  // Peak-Frequenz
  currentPeak = findPeak(smoothed, cfg.dsp.fftSize, audio.sampleRate);

  // Header-Anzeige aktualisieren (ca. 10fps reicht)
  if (frameCount % 6 === 0) {
    elPeakFreq.textContent = formatHz(currentPeak.hz);
    elPeakDb.textContent = currentPeak.db.toFixed(1) + " dBFS";
  }

  const opts = getRenderOpts();

  // Spektrum zeichnen (jedes Frame)
  spectrumRenderer.draw(smoothed, peak, opts);

  // Wasserfall: jedes 3. Frame einschieben (~20fps bei 60fps)
  if (frameCount % 3 === 0) {
    waterfallRenderer.push(smoothed, opts);
  }

  frameCount++;
}

function startLoop() {
  if (!rafId) {
    rafId = requestAnimationFrame(renderLoop);
  }
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MIKROFON STARTEN / STOPPEN
// ═══════════════════════════════════════════════════════════════════════════

async function startMicrophone() {
  try {
    setLed("warning", "VERBINDE …");
    const sr = await audio.startMic();
    audio.setFftSize(cfg.dsp.fftSize);

    // DSP-Helfer auf neue Bin-Anzahl anpassen
    resizeDspBuffers();

    // Overlays ausblenden
    elSpectrumOverlay.classList.add("hidden");
    elWaterfallOverlay.classList.add("hidden");

    // Buttons
    resetToneButton();
    elBtnMicToggle.disabled = false;
    elBtnMicToggle.querySelector("#mic-btn-text").textContent =
      "Mikrofon stopp";
    elBtnPause.disabled = false;

    setLed("active", "LIVE");
    elFooterSr.textContent = `SR: ${sr / 1000} kHz`;
    elFooterFft.textContent = `FFT: ${cfg.dsp.fftSize} (${(audio.sampleRate / cfg.dsp.fftSize).toFixed(1)} Hz/bin)`;

    startLoop();
  } catch (e) {
    console.error("[freqscope] Mikrofon-Fehler:", e);
    setLed("error", "FEHLER");
    elSpectrumOverlay.classList.remove("hidden");
    elSpectrumOverlay.querySelector("span").textContent =
      "Mikrofon-Zugriff verweigert. Bitte Berechtigungen prüfen.";
  }
}

function stopMicrophone() {
  audio.stop();
  stopLoop();
  setLed(null, "BEREIT");
  resetMicButton();
  resetToneButton();
  elBtnPause.disabled = true;
}

// ═══════════════════════════════════════════════════════════════════════════
// DSP BUFFER RESIZE
// ═══════════════════════════════════════════════════════════════════════════

function resizeDspBuffers() {
  const bins = audio.binCount;
  smoother.resize(bins);
  peakHold.resize(bins);
  windowBuf = buildWindow(cfg.dsp.window, cfg.dsp.fftSize);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

// ── Mikrofon-Buttons ──
elBtnStartMic.addEventListener("click", startMicrophone);

elBtnMicToggle.addEventListener("click", () => {
  if (audio.isRunning || audio.isPaused) {
    stopMicrophone();
  } else {
    startMicrophone();
  }
});

// ── Pause ──
elBtnPause.addEventListener("click", () => {
  if (audio.isPaused) {
    audio.resume();
    isPaused = false;
    setLed("active", "LIVE");
    elBtnPause.textContent = "⏸ Pause";
  } else {
    audio.pause();
    isPaused = true;
    setLed("paused", "PAUSE");
    elBtnPause.textContent = "▶ Fortsetzen";
  }
});

// ── Clear ──
elBtnClear.addEventListener("click", () => {
  waterfallRenderer.clear();
  peakHold.resize(audio.binCount || cfg.dsp.fftSize / 2);
});

// ── Datei laden ──
elFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    // CSV-Dateien werden nicht direkt abgespielt – nur Audio
    if (file.name.endsWith(".csv")) {
      alert(
        "CSV-Import: Diese Funktion wird in einer späteren Version unterstützt.",
      );
      return;
    }
    setLed("warning", "LADE …");
    const buf = await file.arrayBuffer();
    const sr = await audio.loadFile(buf);
    audio.setFftSize(cfg.dsp.fftSize);
    resizeDspBuffers();

    elSpectrumOverlay.classList.add("hidden");
    elWaterfallOverlay.classList.add("hidden");
    resetMicButton();
    resetToneButton();
    elBtnPause.disabled = false;
    elFooterSr.textContent = `SR: ${sr / 1000} kHz`;

    setLed("active", `FILE: ${file.name.slice(0, 20)}`);
    startLoop();
  } catch (err) {
    console.error("[freqscope] Datei-Fehler:", err);
    setLed("error", "FEHLER");
  }
  // Input zurücksetzen damit dieselbe Datei erneut geladen werden kann
  e.target.value = "";
});

// ── Nerd Toggle ──
elBtnNerdToggle.addEventListener("click", () => {
  const isOpen = !elNerdPanel.classList.contains("collapsed");
  if (isOpen) {
    elNerdPanel.classList.add("collapsed");
    elNerdArrow.textContent = "▼";
    cfg.ui.nerdOpen = false;
  } else {
    elNerdPanel.classList.remove("collapsed");
    elNerdArrow.textContent = "▲";
    cfg.ui.nerdOpen = true;
  }
  saveConfig(cfg);
});

// ── Guided Banner ein-/ausblenden ──
elBtnHideGuide?.addEventListener("click", () => {
  setGuideVisibility(false);
});

elBtnGuideToggle?.addEventListener("click", () => {
  setGuideVisibility(cfg.ui.guideDismissed);
});

// ═══════════════════════════════════════════════════════════════════════════
// DSP-PARAMETER CONTROLS
// ═══════════════════════════════════════════════════════════════════════════

elFftSize.addEventListener("change", () => {
  const size = parseInt(elFftSize.value);
  cfg.dsp.fftSize = size;
  audio.setFftSize(size);
  resizeDspBuffers();
  elFooterFft.textContent = `FFT: ${size} (${(audio.sampleRate / size).toFixed(1)} Hz/bin)`;
  saveConfig(cfg);
});

elWindow.addEventListener("change", () => {
  cfg.dsp.window = elWindow.value;
  windowBuf = buildWindow(cfg.dsp.window, cfg.dsp.fftSize);
  saveConfig(cfg);
});

elSmoothing.addEventListener("input", () => {
  const v = parseFloat(elSmoothing.value);
  cfg.dsp.smoothing = v;
  elSmoothingVal.textContent = v.toFixed(2);
  saveConfig(cfg);
});

elPeakHoldSel.addEventListener("change", () => {
  cfg.dsp.peakHold = elPeakHoldSel.value;
  if (cfg.dsp.peakHold === "off") {
    peakHold.resize(audio.binCount || cfg.dsp.fftSize / 2);
  }
  saveConfig(cfg);
});

// ── Anzeige-Controls ──

elDbMin.addEventListener("input", () => {
  const v = parseInt(elDbMin.value);
  cfg.display.dbMin = v;
  elDbMinVal.textContent = v;
  saveConfig(cfg);
});

elDbMax.addEventListener("input", () => {
  const v = parseInt(elDbMax.value);
  cfg.display.dbMax = v;
  elDbMaxVal.textContent = v;
  saveConfig(cfg);
});

elColormap.addEventListener("change", () => {
  cfg.display.colormap = elColormap.value;
  waterfallRenderer.setColormap(elColormap.value);
  saveConfig(cfg);
});

elFreqMin.addEventListener("input", () => {
  const v = Math.max(0, Math.min(DISPLAY_MAX_HZ, parseInt(elFreqMin.value)));
  cfg.display.freqMin = v;
  if (cfg.display.freqMax < v) {
    cfg.display.freqMax = v;
    elFreqMax.value = v;
    elFreqMaxVal.textContent = v;
  }
  elFreqMin.value = v;
  elFreqMinVal.textContent = v;
  // SCPI-State synchronisieren
  instrState.startHz = v;
  updateHeaderReadouts();
  saveConfig(cfg);
});

elFreqMax.addEventListener("input", () => {
  const v = Math.max(0, Math.min(DISPLAY_MAX_HZ, parseInt(elFreqMax.value)));
  cfg.display.freqMax = v;
  if (cfg.display.freqMin > v) {
    cfg.display.freqMin = v;
    elFreqMin.value = v;
    elFreqMinVal.textContent = v;
  }
  elFreqMax.value = v;
  elFreqMaxVal.textContent = v;
  instrState.stopHz = v;
  updateHeaderReadouts();
  saveConfig(cfg);
});

// ═══════════════════════════════════════════════════════════════════════════
// KONFIG EXPORT / IMPORT / RESET
// ═══════════════════════════════════════════════════════════════════════════

elBtnExportConfig.addEventListener("click", () => {
  exportConfig(cfg);
});

elConfigFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    cfg = await importConfig(file);
    applyConfigToUI();
    saveConfig(cfg);
    scpiLog("info", "Konfiguration importiert.");
  } catch (err) {
    console.error("[freqscope] Config-Import-Fehler:", err);
    alert("Fehler beim Importieren: " + err.message);
  }
  e.target.value = "";
});

elBtnResetConfig.addEventListener("click", () => {
  if (!confirm("Konfiguration wirklich zurücksetzen?")) return;
  cfg = resetConfig();
  applyConfigToUI();
  scpiLog("info", "Konfiguration auf Standard zurückgesetzt.");
});

// ═══════════════════════════════════════════════════════════════════════════
// SCPI TERMINAL
// ═══════════════════════════════════════════════════════════════════════════

/** Zeile im SCPI-Output loggen */
function scpiLog(type, text) {
  const p = document.createElement("p");
  p.className = `scpi-line ${type}`;

  // Lange Antworten verkürzt anzeigen (Trace-Daten)
  const maxLen = 500;
  p.textContent =
    text.length > maxLen ? text.slice(0, maxLen) + " …[gekürzt]" : text;
  elScpiOutput.appendChild(p);

  // Maximal 200 Zeilen
  while (elScpiOutput.children.length > 200) {
    elScpiOutput.removeChild(elScpiOutput.firstChild);
  }
  elScpiOutput.scrollTop = elScpiOutput.scrollHeight;
}

function sendScpiCommand() {
  const raw = elScpiInput.value.trim();
  if (!raw) return;

  scpiLog("cmd", `> ${raw}`);
  elScpiInput.value = "";

  const result = executeScpi(raw, instrState, audio, currentPeak);

  if (result.response !== null) {
    scpiLog("resp", result.response);
  }
  if (result.error) {
    scpiLog("err", result.error);
  }

  // SCPI-State → UI synchronisieren
  if (result.stateChange) {
    const sc = result.stateChange;
    if (sc.reset) {
      // *RST: alles zurücksetzen
      cfg.display.freqMin = 0;
      cfg.display.freqMax = DISPLAY_MAX_HZ;
      elFreqMin.value = cfg.display.freqMin;
      elFreqMax.value = cfg.display.freqMax;
      elFreqMinVal.textContent = cfg.display.freqMin;
      elFreqMaxVal.textContent = cfg.display.freqMax;
    }
    if (sc.centerHz !== undefined || sc.spanHz !== undefined) {
      cfg.display.freqMin = Math.max(0, instrState.startHz);
      cfg.display.freqMax = Math.min(DISPLAY_MAX_HZ, instrState.stopHz);
      elFreqMin.value = cfg.display.freqMin;
      elFreqMax.value = cfg.display.freqMax;
      elFreqMinVal.textContent = Math.round(cfg.display.freqMin);
      elFreqMaxVal.textContent = Math.round(cfg.display.freqMax);
    }
    updateHeaderReadouts();
    saveConfig(cfg);
  }
}

elBtnScpiSend.addEventListener("click", sendScpiCommand);

elScpiInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendScpiCommand();
});

// Chip-Buttons
document.querySelectorAll(".scpi-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    elScpiInput.value = btn.dataset.cmd;
    sendScpiCommand();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD-SHORTCUTS
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener("keydown", (e) => {
  // Keine Shortcuts wenn in Input/Select
  if (e.target.matches("input,select,textarea")) return;

  switch (e.key) {
    case " ":
    case "p":
      e.preventDefault();
      elBtnPause.click();
      break;
    case "m":
      if (audio.isRunning) stopMicrophone();
      else startMicrophone();
      break;
    case "c":
      elBtnClear.click();
      break;
    case "n":
      elBtnNerdToggle.click();
      break;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// VISIBILITY API – Analyse pausieren wenn Tab nicht sichtbar
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (audio.isRunning) {
      stopLoop(); // RAF anhalten aber Stream läuft weiter
    }
  } else {
    if (audio.isRunning && !isPaused) {
      startLoop();
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INIT – Loop starten (zeigt leeres Canvas)
// ═══════════════════════════════════════════════════════════════════════════

// Leeres Spektrum zeichnen als Platzhalter
{
  const bins = cfg.dsp.fftSize / 2;
  const emptySpec = new Float32Array(bins).fill(cfg.display.dbMin);
  spectrumRenderer.draw(emptySpec, null, {
    dbMin: cfg.display.dbMin,
    dbMax: cfg.display.dbMax,
    freqMin: cfg.display.freqMin,
    freqMax: cfg.display.freqMax,
    sampleRate: 44100,
    fftSize: cfg.dsp.fftSize,
  });
  // ── Testton-Generator ──
  (() => {
    const NOTE_NAMES = [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ];
    const KEYBOARD_START_MIDI = 48; // C3
    const KEYBOARD_END_MIDI = 95; // B6 = 48 Tasten
    const toneNoteMap = new Map();

    if (!elBtnTone) return;

    function midiToHz(midi) {
      return 440 * 2 ** ((midi - 69) / 12);
    }

    function midiToLabel(midi) {
      const name = NOTE_NAMES[midi % 12];
      const octave = Math.floor(midi / 12) - 1;
      return `${name}${octave}`;
    }

    function getToneKeys() {
      return elToneKeyboard ? elToneKeyboard.querySelectorAll(".note-key") : [];
    }

    function renderToneKeyboard() {
      if (!elToneKeyboard) return;

      toneNoteMap.clear();
      elToneKeyboard.innerHTML = "";

      for (let midi = KEYBOARD_START_MIDI; midi <= KEYBOARD_END_MIDI; midi++) {
        const freq = Number(midiToHz(midi).toFixed(2));
        const label = midiToLabel(midi);
        const btn = document.createElement("button");

        btn.className = label.includes("#") ? "note-key black-key" : "note-key";
        btn.dataset.freq = String(freq);
        btn.textContent = label;
        btn.addEventListener("click", () => {
          setToneFreq(freq);
          if (!audio.isOscRunning) startTone();
        });

        toneNoteMap.set(freq, label);
        elToneKeyboard.appendChild(btn);
      }
    }

    function stopTone() {
      audio.stop();
      resetToneButton();
      resetMicButton();
      setLed(null, "BEREIT");
      stopLoop();
    }

    async function startTone() {
      const freq = clampToneFrequency(elToneFreqNumber.value);
      const gain = clampToneVolume(cfg.tone?.volume ?? 0.08);

      try {
        const sr = await audio.startOscillator(freq, elWave.value, gain);
        audio.setFftSize(cfg.dsp.fftSize);
        resizeDspBuffers();
        elSpectrumOverlay.classList.add("hidden");
        elWaterfallOverlay.classList.add("hidden");
        stopLoop();
        startLoop();
        resetMicButton();
        elBtnTone.textContent = "Stop";
        elBtnTone.classList.add("active");
        setLed("active", "TESTTON");
        elFooterSr.textContent = `SR: ${(sr / 1000).toFixed(1)} kHz`;
      } catch (e) {
        console.error("[freqscope] Testton Fehler:", e);
        elBtnTone.textContent = "Start";
        elBtnTone.classList.remove("active");
        setLed("error", "FEHLER");
      }
    }

    function toggleTone() {
      if (audio.isOscRunning) stopTone();
      else startTone();
    }

    function setToneFreq(hz) {
      const safeHz = clampToneFrequency(hz);
      if (audio.isOscRunning) audio.setOscFreq(safeHz);
      elToneFreqRange.value = String(toneHzToSlider(safeHz));
      elToneFreqNumber.value =
        safeHz >= 1000 ? safeHz.toFixed(0) : safeHz.toFixed(2);

      const roundedKey = Number(safeHz.toFixed(2));
      const noteName = toneNoteMap.get(roundedKey);
      elToneActiveNote.textContent = noteName
        ? `${noteName} · ${formatHz(safeHz)}`
        : formatHz(safeHz);

      getToneKeys().forEach((key) => {
        key.classList.toggle(
          "active",
          Number.parseFloat(key.dataset.freq) === roundedKey,
        );
      });
    }

    elBtnTone.addEventListener("click", toggleTone);
    elWave.addEventListener("change", () => {
      audio.setOscType(elWave.value);
    });
    elToneFreqRange.addEventListener("input", () => {
      setToneFreq(toneSliderToHz(elToneFreqRange.value));
    });
    elToneFreqNumber.addEventListener("change", () => {
      setToneFreq(Number.parseFloat(elToneFreqNumber.value));
    });
    elToneVolumeRange.addEventListener("input", () => {
      syncToneVolume(elToneVolumeRange.value);
    });
    elToneVolumeNumber.addEventListener("change", () => {
      syncToneVolume(elToneVolumeNumber.value);
    });

    renderToneKeyboard();

    syncToneVolume(cfg.tone?.volume ?? 0.08, false);
    setToneFreq(440);
  })();
}

console.log(
  "%cfreqscope v1.0 geladen 🎙",
  "color:#0055cc;font-weight:bold;font-size:14px",
);
console.log("Taste [m] = Mikrofon, [Space] = Pause, [n] = Nerd-Mode");
