/** Synthesized coin sounds. No audio files and no network. */

export function createAudio() {
  let ctx = null;
  let muted = false;
  let noise = null;
  let lastImpact = 0;
  let lastRattle = 0;

  function context() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function noiseBuffer(ac) {
    if (noise && noise.sampleRate === ac.sampleRate) return noise;
    const seconds = 0.2;
    const length = Math.floor(ac.sampleRate * seconds);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x6d2b79f5;
    for (let i = 0; i < length; i += 1) {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      data[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
    }
    noise = buffer;
    return buffer;
  }

  function burst(ac, peak, attack, decay) {
    const gain = ac.createGain();
    const now = ac.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    gain.connect(ac.destination);
    return gain;
  }

  return {
    unlock() {
      context();
    },
    setMuted(next) {
      muted = Boolean(next);
    },
    ting(pitch = 1) {
      if (muted) return;
      const ac = context();
      if (!ac) return;
      const p = Number.isFinite(pitch) && pitch > 0 ? pitch : 1;
      const master = burst(ac, 0.16, 0.003, 0.11);
      const partials = [
        [1480 * p, "triangle", 0.55],
        [2960 * p, "sine", 0.22],
        [4420 * p, "sine", 0.08],
      ];
      for (const [freq, type, level] of partials) {
        const osc = ac.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const gain = ac.createGain();
        gain.gain.value = level;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        osc.stop(ac.currentTime + 0.18);
      }
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac);
      const filter = ac.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 3400 * p;
      filter.Q.value = 5;
      const gain = ac.createGain();
      gain.gain.value = 0.28;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
      src.stop(ac.currentTime + 0.05);
    },
    impact(speed, pitch = 1) {
      if (muted) return;
      const ac = context();
      if (!ac) return;
      if (ac.currentTime - lastImpact < 0.04) return;
      lastImpact = ac.currentTime;
      const p = Number.isFinite(pitch) && pitch > 0 ? pitch : 1;
      const amount = Math.max(0, Math.min(1, speed / 1400));
      const master = burst(ac, 0.05 + amount * 0.42, 0.002, 0.05 + amount * 0.09);
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac);
      const filter = ac.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = (700 + amount * 3800) * p;
      filter.Q.value = 1.4;
      src.connect(filter);
      filter.connect(master);
      src.start();
      src.stop(ac.currentTime + 0.12);
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = (180 + amount * 90) * p;
      const gain = ac.createGain();
      gain.gain.value = 0.35;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ac.currentTime + 0.1);
    },
    rattle(pitch = 1) {
      if (muted) return;
      const ac = context();
      if (!ac) return;
      if (ac.currentTime - lastRattle < 0.05) return;
      lastRattle = ac.currentTime;
      const p = Number.isFinite(pitch) && pitch > 0 ? pitch : 1;
      const master = burst(ac, 0.05, 0.002, 0.045);
      const osc = ac.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 2100 * p;
      osc.connect(master);
      osc.start();
      osc.stop(ac.currentTime + 0.06);
    },
  };
}
