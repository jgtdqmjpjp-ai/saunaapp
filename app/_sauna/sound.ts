import type { Run, Scene } from "./types";
import { WALKOUT_MS } from "./constants";

// ===== サウンド（Web Audio で合成） =====
export type Sound = { ctx: AudioContext; master: GainNode };

export function tone(a: Sound, freq: number, dur: number, type: OscillatorType = "sine", vol = 0.2, delay = 0, freqEnd?: number) {
  const t0 = a.ctx.currentTime + delay;
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(a.master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function noise(a: Sound, dur: number, filter: BiquadFilterType, freq: number, vol: number, delay = 0, freqEnd?: number, attack = 0.005) {
  const t0 = a.ctx.currentTime + delay;
  const len = Math.floor(a.ctx.sampleRate * dur);
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const f = a.ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t0);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(a.master);
  src.start(t0);
}

export const SFX = {
  stop: (a: Sound) => tone(a, 900, 0.08, "square", 0.08),
  sweet: (a: Sound) => [660, 880, 1320].forEach((f, i) => tone(a, f, 0.2, "triangle", 0.18, i * 0.08)),
  near: (a: Sound) => {
    tone(a, 660, 0.15, "triangle", 0.15);
    tone(a, 880, 0.2, "triangle", 0.12, 0.1);
  },
  miss: (a: Sound) => tone(a, 320, 0.5, "sawtooth", 0.1, 0, 110),
  // バタン！
  door: (a: Sound) => {
    noise(a, 0.3, "lowpass", 700, 0.6);
    tone(a, 95, 0.4, "sine", 0.6, 0, 40);
    tone(a, 160, 0.08, "square", 0.08, 0.01);
  },
  step: (a: Sound) => tone(a, 180 + Math.random() * 60, 0.05, "triangle", 0.12),
  // ジュワー（ロウリュ）
  loyly: (a: Sound) => {
    tone(a, 220, 0.08, "sine", 0.15);
    noise(a, 2.4, "highpass", 3500, 0.25, 0.05, undefined, 0.08);
  },
  splash: (a: Sound) => {
    noise(a, 1.0, "bandpass", 1500, 0.6, 0, 300, 0.01);
    noise(a, 0.6, "lowpass", 400, 0.4, 0.02);
  },
  smallSplash: (a: Sound) => noise(a, 0.5, "bandpass", 1200, 0.35, 0, 400, 0.01),
  wind: (a: Sound) => noise(a, 5, "bandpass", 500, 0.18, 0, 220, 1.8),
  bell: (a: Sound) => [1568, 2093].forEach((f, i) => tone(a, f, 1.2, "sine", 0.08, i * 0.02)),
  banner: (a: Sound) => tone(a, 120, 0.4, "sine", 0.4, 0, 55),
  tick: (a: Sound) => tone(a, 1400, 0.03, "square", 0.03),
  fanfare: (a: Sound, stars: number) => {
    if (stars >= 4) {
      [523, 659, 784, 1047].forEach((f, i) => tone(a, f, 0.25, "square", 0.08, i * 0.12));
      [523, 659, 784, 1047].forEach((f) => tone(a, f, 1.0, "triangle", 0.08, 0.5));
    } else if (stars === 3) {
      [523, 659, 784].forEach((f, i) => tone(a, f, 0.3, "triangle", 0.12, i * 0.15));
    } else {
      // ぷわぷわぷわ〜
      [392, 370, 349].forEach((f, i) => tone(a, f, 0.35, "sawtooth", 0.08, i * 0.35));
      tone(a, 330, 1.0, "sawtooth", 0.08, 1.05, 300);
    }
  },
};

// ===== 読み上げ（Web Speech API） =====
export const PITCH = [0.7, 1.3, 0.9, 1.6, 0.5, 1.1, 1.45, 0.8, 1.2, 1.0];

let speechUnlocked = false;
let lastSpeakAt = 0;
const spokenSceneEvents = new Set<string>();

export function stopSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

// スマホ（特にiPhone）は、「タップした操作の中」で一度声を出さないと、
// あとからタイマーで呼んでも鳴らないことがある。
// そのため、最初のタップ時に、音量0の発話を1回だけ行って「解禁」する。
export function unlockSpeech() {
  if (speechUnlocked || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  speechUnlocked = true;
  const u = new SpeechSynthesisUtterance("あ");
  u.lang = "ja-JP";
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export function speak(text: string, voices: SpeechSynthesisVoice[], p: number, urgent: boolean) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = text.replace(/\.{2,}|…+/g, "、").replace(/[（）]/g, "");
  if (!/[\p{L}]/u.test(clean)) return;
  const ss = window.speechSynthesis;
  if (ss.paused) ss.resume(); // スマホで一時停止になったまま固まることがある
  if (ss.speaking || ss.pending) {
    // 6秒以上しゃべり続けている状態は、固まっているとみなして、割り込む
    const stuck = Date.now() - lastSpeakAt > 6000;
    if (!urgent && !stuck) return; // しゃべっている人がいたら譲る（捨て台詞は割り込む）
    ss.cancel();
  }
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "ja-JP";
  if (voices.length > 0) u.voice = voices[p % voices.length];
  u.pitch = p < 0 ? 1 : PITCH[p % PITCH.length];
  // iOS Safariなどは同じrateでも速く再生されるため、スマホでは明示的に遅くする。
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  u.rate = urgent ? (isMobile ? 0.9 : 1.15) : (isMobile ? 0.78 : 1.0);
  lastSpeakAt = Date.now();
  ss.speak(u);
}

// シーン中のイベント（前回tick〜今回tickの間に起きたもの）に合わせて音を鳴らす
export function playSceneSounds(scene: Scene, run: Run, prev: number, e: number, a: Sound | null, voices: SpeechSynthesisVoice[], soundOn: boolean) {
  if (!soundOn) return;
  if (prev < 0) spokenSceneEvents.clear();
  const crossed = (t: number) => prev < t && t <= e;
  if (a && prev < 0) {
    SFX.banner(a);
    if (scene === "sauna") SFX.loyly(a);
    if (scene === "water") SFX.splash(a);
    if (scene === "outdoor") {
      SFX.wind(a);
      SFX.bell(a);
    }
  }
  for (const ev of run.scripts[scene]) {
    const eventKey = `${scene}:${ev.p}:${ev.t}:${ev.leave ? "leave" : "line"}`;
    if (crossed(ev.t) && !ev.action && !spokenSceneEvents.has(eventKey)) {
      spokenSceneEvents.add(eventKey);
      speak(ev.speech ?? ev.text, voices, ev.p, !!ev.leave);
    }
    if (!a || !ev.leave) continue;
    if (scene === "water" && crossed(ev.t)) SFX.smallSplash(a);
    for (let k = 0; k < 6; k++) if (crossed(ev.t + WALKOUT_MS * 0.25 + k * 280)) SFX.step(a);
    if (crossed(ev.t + WALKOUT_MS - 150)) SFX.door(a);
  }
}

export function playResultSounds(run: Run, prev: number, e: number, a: Sound | null, voices: SpeechSynthesisVoice[], soundOn: boolean) {
  if (!soundOn || !a) return;
  if (e < 1500) SFX.tick(a);
  if (prev < 1600 && e >= 1600) SFX.fanfare(a, run.stars);
  if (prev < 2200 && e >= 2200) {
    SFX.banner(a);
    speak(run.verdict, voices, -1, true);
  }
}
