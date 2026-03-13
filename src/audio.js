/**
 * freqscope — Audio-Engine
 * WebAudio API: Mikrofon, Datei-Wiedergabe, AnalyserNode, FFT-Daten
 */

export class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {AnalyserNode|null} */
    this.analyser = null;
    /** @type {MediaStreamAudioSourceNode|null} */
    this._micSource = null;
    /** @type {MediaStream|null} */
    this._stream = null;
    /** @type {AudioBufferSourceNode|null} */
    this._fileSource = null;
    /** @type {OscillatorNode|null} */
    this._osc = null;
    /** @type {GainNode|null} */
    this._oscGain = null;

    this._fftSize = 4096;
    this._smoothing = 0.0; // wir machen Smoothing selbst in DSP
    this._running = false;
    this._paused = false;

    /** @type {Float32Array|null} */
    this._freqBuf = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  _ensureContext() {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext();
    }
  }

  /** Mikrofon starten */
  async startMic() {
    this._ensureContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    // Bestehenden Stream aufräumen
    this._stopMicStream();
    this._stopFileSource();
    this._stopOscillator();

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });

    this._micSource = this.ctx.createMediaStreamSource(this._stream);
    this._setupAnalyser();
    this._micSource.connect(this.analyser);
    this._running = true;
    this._paused = false;
    return this.ctx.sampleRate;
  }

  /** Audio-Datei laden und analysieren */
  async loadFile(arrayBuffer) {
    this._ensureContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    // Bestehende Quellen stoppen
    this._stopMicStream();
    this._stopFileSource();
    this._stopOscillator();

    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this._fileSource = this.ctx.createBufferSource();
    this._fileSource.buffer = audioBuffer;
    this._fileSource.loop = true;

    this._setupAnalyser();
    this._fileSource.connect(this.analyser);
    this._fileSource.start(0);

    this._running = true;
    this._paused = false;
    return this.ctx.sampleRate;
  }

  /**
   * Mikrofon & Analyse stoppen
   */
  stop() {
    this._stopMicStream();
    this._stopFileSource();
    this._stopOscillator();
    this._running = false;
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.suspend();
    }
  }

  pause() {
    if (!this.ctx) return;
    if (this.ctx.state === "running") {
      this.ctx.suspend();
      this._paused = true;
    }
  }

  resume() {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
      this._paused = false;
    }
  }

  get isRunning() {
    return this._running && !this._paused;
  }

  get isPaused() {
    return this._paused;
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 44100;
  }

  // ── Analyser Setup ────────────────────────────────────────────────────────

  _setupAnalyser() {
    if (this.analyser) {
      this.analyser.disconnect();
    }
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this._fftSize;
    this.analyser.smoothingTimeConstant = this._smoothing;
    this.analyser.minDecibels = -140;
    this.analyser.maxDecibels = 0;
    this._freqBuf = new Float32Array(this.analyser.frequencyBinCount);
  }

  // ── FFT-Parameter ändern ──────────────────────────────────────────────────

  setFftSize(size) {
    this._fftSize = size;
    if (this.analyser) {
      this.analyser.fftSize = size;
      this._freqBuf = new Float32Array(this.analyser.frequencyBinCount);
    }
  }

  get binCount() {
    return this.analyser ? this.analyser.frequencyBinCount : this._fftSize / 2;
  }

  // ── Daten lesen ───────────────────────────────────────────────────────────

  /**
   * Gibt die aktuellen dBFS-Werte zurück (Float32Array).
   * Gibt null zurück wenn kein Analyser aktiv.
   */
  getFrequencyData() {
    if (!this.analyser || !this._freqBuf) return null;
    this.analyser.getFloatFrequencyData(this._freqBuf);
    return this._freqBuf;
  }

  /**
   * Gibt die gesamte Trace-Daten-Struktur zurück (für SCPI :TRAC:DATA?)
   */
  getTraceData() {
    const raw = this.getFrequencyData();
    if (!raw) return null;
    const sr = this.sampleRate;
    const fftSize = this._fftSize;
    const freq = new Array(raw.length);
    const amp = new Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      freq[i] = Math.round((i * sr) / fftSize);
      amp[i] = parseFloat(raw[i].toFixed(2));
    }
    return { freq, amplitude_db: amp };
  }

  async startOscillator(freq = 440, waveType = "sine", gain = 0.08) {
    this._ensureContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this._stopMicStream();
    this._stopFileSource();
    this._stopOscillator();
    this._setupAnalyser();
    this._osc = this.ctx.createOscillator();
    this._oscGain = this.ctx.createGain();
    this._osc.type = waveType;
    this._osc.frequency.value = freq;
    this._oscGain.gain.value = Math.max(0, Math.min(1, gain));
    this._osc.connect(this._oscGain);
    this._oscGain.connect(this.analyser);
    this._oscGain.connect(this.ctx.destination);
    this._osc.start();
    this._running = true;
    this._paused = false;
    return this.ctx.sampleRate;
  }
  setOscFreq(hz) {
    if (this._osc) this._osc.frequency.value = hz;
  }
  setOscType(t) {
    if (this._osc) this._osc.type = t;
  }
  setOscGain(value) {
    if (!this._oscGain) return;
    const gain = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    this._oscGain.gain.setValueAtTime(gain, this.ctx.currentTime);
  }
  get isOscRunning() {
    return !!this._osc;
  }
  _stopOscillator() {
    if (this._osc) {
      try {
        this._osc.stop();
      } catch (_) {}
      this._osc.disconnect();
      this._osc = null;
      if (this._oscGain) {
        try {
          this._oscGain.disconnect();
        } catch (_) {}
        this._oscGain = null;
      }
    }
  }
  // ── Private Helpers ───────────────────────────────────────────────────────

  _stopMicStream() {
    if (this._micSource) {
      this._micSource.disconnect();
      this._micSource = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
  }

  _stopFileSource() {
    if (this._fileSource) {
      try {
        this._fileSource.stop();
      } catch (_) {
        /* bereits gestoppt */
      }
      this._fileSource.disconnect();
      this._fileSource = null;
    }
  }
}
