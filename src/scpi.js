/**
 * freqscope — SCPI-Parser & Instrument-State-Machine
 *
 * Unterstützte Befehle:
 *   *IDN?
 *   *RST
 *   *CLS
 *   :SENS:FREQ:CENT?       / :SENS:FREQ:CENT <hz>
 *   :SENS:FREQ:SPAN?       / :SENS:FREQ:SPAN <hz>
 *   :SENS:FREQ:STAR?       / :SENS:FREQ:STAR <hz>
 *   :SENS:FREQ:STOP?       / :SENS:FREQ:STOP <hz>
 *   :DISP:WIND:TRAC:Y:RLEV?  / :DISP:WIND:TRAC:Y:RLEV <db>
 *   :DISP:WIND:TRAC:Y:RLEV:OFFS?
 *   :TRAC:DATA? TRACE1
 *   :CALC:MARK:PEAK?
 *   :SENS:SWE:TIME?
 *   :SYST:ERR?
 */

const VERSION = "FREQSCOPE,WEB,0,1.0";
const DISPLAY_MAX_HZ = 200000;

/** Interner Instrument-Zustand */
export class InstrumentState {
  constructor() {
    this.reset();
  }

  reset() {
    // Frequenz
    this.centerHz = DISPLAY_MAX_HZ / 2;
    this.spanHz = DISPLAY_MAX_HZ;
    // Display
    this.refLevel = 0; // dBFS
    this.refOffset = 0;
    // Error queue
    this._errors = [];
  }

  get startHz() {
    return Math.max(0, this.centerHz - this.spanHz / 2);
  }
  get stopHz() {
    return this.centerHz + this.spanHz / 2;
  }

  set startHz(v) {
    const stop = this.stopHz;
    this.spanHz = stop - v;
    this.centerHz = v + this.spanHz / 2;
  }
  set stopHz(v) {
    const start = this.startHz;
    this.spanHz = v - start;
    this.centerHz = start + this.spanHz / 2;
  }

  pushError(code, msg) {
    this._errors.push(`${code},"${msg}"`);
  }

  popError() {
    return this._errors.length ? this._errors.shift() : '+0,"No error"';
  }
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * SCPI-Befehl parsen & ausführen
 * @param {string} rawCmd  – roher Befehlstext
 * @param {InstrumentState} state
 * @param {import('./audio').AudioEngine} audio  – für Trace-Daten
 * @param {import('./dsp').findPeak} _findPeak  – aktueller Peak (oder null)
 * @returns {{ response: string|null, stateChange: object|null }}
 */
export function executeScpi(rawCmd, state, audio, currentPeak) {
  const cmd = rawCmd.trim().toUpperCase();

  // ── Common Commands ──────────────────────────────────────────────────────
  if (cmd === "*IDN?") {
    return ok(VERSION);
  }

  if (cmd === "*RST") {
    state.reset();
    return ok(null, { reset: true });
  }

  if (cmd === "*CLS") {
    state._errors = [];
    return ok(null);
  }

  // ── SYST:ERR ─────────────────────────────────────────────────────────────
  if (cmd === ":SYST:ERR?" || cmd === "SYST:ERR?") {
    return ok(state.popError());
  }

  // ── SENS:FREQ:CENT ────────────────────────────────────────────────────────
  if (cmd === ":SENS:FREQ:CENT?" || cmd === "SENS:FREQ:CENT?") {
    return ok(state.centerHz.toFixed(2));
  }
  {
    const m = cmd.match(/^:?SENS:FREQ:CENT\s+(.+)$/);
    if (m) {
      const v = parseFloat(m[1]);
      if (isNaN(v) || v < 0 || v > DISPLAY_MAX_HZ) {
        return err(state, -222, "Data out of range");
      }
      state.centerHz = v;
      return ok(null, { centerHz: v });
    }
  }

  // ── SENS:FREQ:SPAN ────────────────────────────────────────────────────────
  if (cmd === ":SENS:FREQ:SPAN?" || cmd === "SENS:FREQ:SPAN?") {
    return ok(state.spanHz.toFixed(2));
  }
  {
    const m = cmd.match(/^:?SENS:FREQ:SPAN\s+(.+)$/);
    if (m) {
      const v = parseFloat(m[1]);
      if (isNaN(v) || v <= 0 || v > DISPLAY_MAX_HZ) {
        return err(state, -222, "Data out of range");
      }
      state.spanHz = v;
      return ok(null, { spanHz: v });
    }
  }

  // ── SENS:FREQ:STAR ────────────────────────────────────────────────────────
  if (cmd === ":SENS:FREQ:STAR?" || cmd === "SENS:FREQ:STAR?") {
    return ok(state.startHz.toFixed(2));
  }
  {
    const m = cmd.match(/^:?SENS:FREQ:STAR\s+(.+)$/);
    if (m) {
      const v = parseFloat(m[1]);
      if (isNaN(v) || v < 0 || v > DISPLAY_MAX_HZ) {
        return err(state, -222, "Data out of range");
      }
      state.startHz = v;
      return ok(null, { startHz: v });
    }
  }

  // ── SENS:FREQ:STOP ────────────────────────────────────────────────────────
  if (cmd === ":SENS:FREQ:STOP?" || cmd === "SENS:FREQ:STOP?") {
    return ok(state.stopHz.toFixed(2));
  }
  {
    const m = cmd.match(/^:?SENS:FREQ:STOP\s+(.+)$/);
    if (m) {
      const v = parseFloat(m[1]);
      if (isNaN(v) || v < 0 || v > DISPLAY_MAX_HZ) {
        return err(state, -222, "Data out of range");
      }
      state.stopHz = v;
      return ok(null, { stopHz: v });
    }
  }

  // ── DISP:WIND:TRAC:Y:RLEV ────────────────────────────────────────────────
  if (cmd === ":DISP:WIND:TRAC:Y:RLEV?" || cmd === "DISP:WIND:TRAC:Y:RLEV?") {
    return ok(state.refLevel.toFixed(2));
  }
  {
    const m = cmd.match(/^:?DISP:WIND:TRAC:Y:RLEV\s+(.+)$/);
    if (m) {
      const v = parseFloat(m[1]);
      if (isNaN(v)) return err(state, -222, "Data out of range");
      state.refLevel = v;
      return ok(null, { refLevel: v });
    }
  }

  // ── TRAC:DATA? TRACE1 ─────────────────────────────────────────────────────
  if (
    cmd === ":TRAC:DATA? TRACE1" ||
    cmd === "TRAC:DATA? TRACE1" ||
    cmd === ":TRAC:DATA? 1" ||
    cmd === "TRAC:DATA? 1"
  ) {
    const td = audio ? audio.getTraceData() : null;
    if (!td) return err(state, -240, "Hardware error – no audio active");
    return ok(JSON.stringify(td));
  }

  // ── CALC:MARK:PEAK? ───────────────────────────────────────────────────────
  if (
    cmd === ":CALC:MARK:PEAK?" ||
    cmd === "CALC:MARK:PEAK?" ||
    cmd === ":CALC:MARK1:MAX:PEAK?" ||
    cmd === "CALC:MARK1:MAX:PEAK?"
  ) {
    if (!currentPeak) return err(state, -240, "No peak data");
    return ok(`${currentPeak.hz.toFixed(2)},${currentPeak.db.toFixed(2)}`);
  }

  // ── SENS:SWE:TIME? ────────────────────────────────────────────────────────
  if (cmd === ":SENS:SWE:TIME?" || cmd === "SENS:SWE:TIME?") {
    return ok("AUTO");
  }

  // Unbekannter Befehl
  state.pushError(-113, `Undefined header: ${rawCmd}`);
  return {
    response: null,
    error: `ERROR: -113 Undefined header: "${rawCmd}"`,
    stateChange: null,
  };
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function ok(response, stateChange = null) {
  return { response, stateChange, error: null };
}

function err(state, code, msg) {
  state.pushError(code, msg);
  return {
    response: null,
    error: `ERROR: ${code},"${msg}"`,
    stateChange: null,
  };
}
