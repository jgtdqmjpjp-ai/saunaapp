"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ev, Phase, Run, Scene } from "./_sauna/types";
import { BUBBLE_MS, GAUGES, GAUGE_PERIOD, MOOD_ICON, NEXT, SCENE_DUR, SCENE_TITLE, TITLES, VERDICT_DESC, WALKOUT_MS } from "./_sauna/constants";
import { adviceOf, feelTemp, generateRun } from "./_sauna/scoring";
import { SFX, playResultSounds, playSceneSounds, speak, unlockSpeech } from "./_sauna/sound";
import type { Sound } from "./_sauna/sound";
import { EMPTY_SAVE, clearSave, loadSave, writeSave } from "./_sauna/storage";
import type { SaveData } from "./_sauna/storage";
import { fmt } from "./_sauna/utils";

export default function Home() {
  type InputMode = "stop" | "slider";
  const [phase, setPhase] = useState<Phase>("setup");
  const [values, setValues] = useState<(number | null)[]>([null, null, null]);
  const [inputMode, setInputMode] = useState<InputMode>("stop");
  const [retries, setRetries] = useState([1, 1, 1]);
  const [activeIdx, setActiveIdx] = useState(0); // 3 = 動いているゲージなし
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const sceneStartRef = useRef(0);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const audioRef = useRef<Sound | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const [save, setSave] = useState<SaveData>(EMPTY_SAVE); // ハイスコアと図鑑
  const [flags, setFlags] = useState({ isNewBest: false, isNewTitle: false });
  const [showDex, setShowDex] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const savedRunRef = useRef<Run | null>(null); // 保存済みの結果（二重保存の防止）

  // ===== 音声の準備 =====
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => {
      const ja = window.speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith("ja"));
      const local = ja.filter((v) => v.localService); // 端末内の声を優先（ネットが要る声は鳴らないことがある）
      voicesRef.current = local.length > 0 ? local : ja;
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  // ===== 保存データの読み込み（localStorage はブラウザ側でしか使えないので useEffect の中で） =====
  useEffect(() => {
    setSave(loadSave());
  }, []);

  // ブラウザの制約で、音はクリック等の操作の後でないと鳴らせない
  const ensureAudio = useCallback(() => {
    unlockSpeech(); // スマホで、セリフの読み上げを使えるようにする（最初のタップ時に1回だけ動く）
    if (!audioRef.current) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = soundOnRef.current ? 0.7 : 0;
      master.connect(ctx.destination);
      audioRef.current = { ctx, master };
    }
    void audioRef.current.ctx.resume();
    return audioRef.current;
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundOnRef.current = next;
    const a = ensureAudio();
    a.master.gain.value = next ? 0.7 : 0;
    if (!next && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  // ===== ゲージの針 =====
  useEffect(() => {
    if (phase !== "setup" || activeIdx > 2) return;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const p = ((now - start) / GAUGE_PERIOD) % 2;
      const v = p < 1 ? p : 2 - p;
      posRef.current = v;
      setPos(v);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, activeIdx]);

  const stopGauge = useCallback(() => {
    if (activeIdx > 2) return;
    const g = GAUGES[activeIdx];
    const v = Math.round(g.min + posRef.current * (g.max - g.min));
    const next = values.map((x, i) => (i === activeIdx ? v : x));
    setValues(next);
    const nextIdx = next.findIndex((x) => x === null);
    setActiveIdx(nextIdx === -1 ? 3 : nextIdx);

    // 当たり外れの音は鳴らさない（正解のヒントになってしまうため）
    SFX.stop(ensureAudio());
  }, [activeIdx, values, ensureAudio]);

  useEffect(() => {
    if (phase !== "setup") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        stopGauge();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, stopGauge]);

  const retryGauge = (i: number) => {
    setValues(values.map((x, j) => (j === i ? null : x)));
    setRetries(retries.map((r, j) => (j === i ? r - 1 : r)));
    setActiveIdx(i);
  };

  const changeInputMode = (mode: InputMode) => {
    setInputMode(mode);
    if (mode === "slider") {
      setValues(GAUGES.map((g) => Math.round((g.min + g.max) / 2)));
      setActiveIdx(3);
    } else {
      setValues([null, null, null]);
      setRetries([1, 1, 1]);
      setActiveIdx(0);
    }
  };

  // ===== シーンタイマー（効果音・読み上げもここで発火） =====
  useEffect(() => {
    if (phase === "setup") return;
    const start = Date.now();
    sceneStartRef.current = start;
    let prev = -1;
    const id = setInterval(() => {
      const e = Date.now() - start;
      const r = runRef.current;
      if (phase === "result") {
        if (r) playResultSounds(r, prev, e, audioRef.current, voicesRef.current, soundOnRef.current);
        prev = e;
        setElapsed(Math.min(e, 3000));
        if (e > 3000) clearInterval(id);
        return;
      }
      if (r) playSceneSounds(phase, r, prev, e, audioRef.current, voicesRef.current, soundOnRef.current);
      prev = e;
      if (e >= SCENE_DUR[phase]) {
        clearInterval(id);
        setElapsed(0);
        setPhase(NEXT[phase]);
      } else {
        setElapsed(e);
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  // ===== 3D描画 =====
  // three.js は重いので、3Dが必要になった時に初めて読み込む（動的 import）
  useEffect(() => {
    if (!run || (phase !== "sauna" && phase !== "water" && phase !== "outdoor")) return;
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    import("./_sauna/scene3d").then((m) => {
      if (cancelled) return; // 読み込み中に画面が切り替わっていたら何もしない
      stop = m.startScene({
        mount,
        kind: phase,
        run,
        getElapsed: () => Date.now() - sceneStartRef.current,
        getBubbles: () => bubbleRefs.current,
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [phase, run]);

  // ===== 結果が出たら、ハイスコアと図鑑を保存 =====
  useEffect(() => {
    if (phase !== "result" || !run) return;
    if (savedRunRef.current === run) return; // 同じ結果を二重に保存しない
    savedRunRef.current = run;
    const prev = loadSave();
    const isNewBest = run.avg > prev.best;
    const isNewTitle = !prev.found.includes(run.verdict);
    const next: SaveData = {
      best: isNewBest ? run.avg : prev.best,
      bestStars: isNewBest ? run.stars : prev.bestStars,
      bestTitle: isNewBest ? run.verdict : prev.bestTitle,
      found: isNewTitle ? [...prev.found, run.verdict] : prev.found,
      history: prev.history,
    };
    writeSave(next);
    setSave(next);
    setFlags({ isNewBest, isNewTitle });
  }, [phase, run]);

  const startGame = () => {
    const [s, h, w] = values;
    if (s === null || h === null || w === null) return;
    ensureAudio();
    const previous = loadSave();
    const history = [{ sauna: s, humidity: h, water: w, createdAt: Date.now() }, ...previous.history].slice(0, 10);
    const nextSave = { ...previous, history };
    writeSave(nextSave);
    setSave(nextSave);
    const r = generateRun(s, h, w);
    runRef.current = r;
    setRun(r);
    setElapsed(0);
    setPhase("sauna");
  };

  const resetSetup = () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setValues([null, null, null]);
    setRetries([1, 1, 1]);
    setActiveIdx(0);
    setRun(null);
    runRef.current = null;
    setElapsed(0);
    setPhase("setup");
  };

  const skipToResult = () => {
    if (phase !== "sauna" && phase !== "water") return;
    setElapsed(0);
    setPhase("result");
  };

  // ===== 描画ヘルパー =====
  const bubbleFor = (scene: Scene, p: number): Ev | null => {
    if (!run) return null;
    let found: Ev | null = null;
    for (const ev of run.scripts[scene]) {
      if (ev.p !== p || ev.t > elapsed) continue;
      const until = ev.leave ? ev.t + WALKOUT_MS : ev.t + BUBBLE_MS;
      if (elapsed < until) found = ev;
    }
    return found;
  };

  const renderBubble = (ev: Ev | null) =>
    ev && (
      <div
        key={`${ev.t}`}
        className={`a-pop max-w-[42vw] whitespace-normal break-words rounded-xl border-2 px-2 py-1 text-center text-xs font-bold leading-tight shadow-lg sm:max-w-none sm:whitespace-nowrap sm:text-sm ${
          ev.leave
            ? "border-red-600 bg-red-100 text-red-700"
            : ev.action
              ? "border-stone-400 bg-stone-100/90 italic text-stone-600"
              : "border-stone-800 bg-white text-stone-900"
        }`}
        style={{ transformOrigin: "bottom center" }}
      >
        {ev.leave && "🚪 "}
        {ev.text}
      </div>
    );

  const isScene = phase === "sauna" || phase === "water" || phase === "outdoor";

  const timerBar = () => {
    if (!isScene) return null;
    const dur = SCENE_DUR[phase];
    const remain =
      phase === "sauna"
        ? fmt(Math.max(0, Math.ceil(600 * (1 - elapsed / dur))))
        : phase === "water"
          ? fmt(Math.max(0, Math.ceil(60 * (1 - elapsed / dur))))
          : null;
    const label = { sauna: "🔥 サウナ室 1セット目", water: "🧊 水風呂", outdoor: "🍃 外気浴" }[phase];
    const color = { sauna: "bg-red-500", water: "bg-cyan-400", outdoor: "bg-emerald-400" }[phase];
    return (
      <div className="mb-3 rounded-xl bg-black/70 p-3 text-center">
        <div className="text-sm text-stone-300">{label}</div>
        {remain ? (
          <div className="font-mono text-5xl font-black tracking-widest text-red-400">{remain}</div>
        ) : (
          <div className="text-3xl font-black text-emerald-300">ととのい中...</div>
        )}
        <div className="mt-2 h-2 overflow-hidden rounded bg-stone-700">
          <div className={`h-full ${color}`} style={{ width: `${(elapsed / dur) * 100}%` }} />
        </div>
        {phase !== "outdoor" && (
          <button onClick={skipToResult} className="mt-3 rounded-lg bg-stone-600 px-4 py-1 text-sm font-bold hover:bg-stone-500">
            ⏭ 評価画面へスキップ
          </button>
        )}
      </div>
    );
  };

  // ===== 画面 =====
  const allSet = values.every((v) => v !== null);
  const feelPreview = allSet ? Math.round(feelTemp(values[0]!, values[1]!)) : null;

  return (
    <main className="app-shell w-full bg-stone-900 text-white">
      <style>{`
@keyframes pop{0%{transform:scale(0);opacity:0}70%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes banner{0%{transform:scale(.3);opacity:0}15%{transform:scale(1.15);opacity:1}25%{transform:scale(1)}75%{opacity:1}100%{opacity:0;visibility:hidden}}
.a-pop{animation:pop .25s ease-out both}
.a-banner{animation:banner 1.8s ease-out forwards}
`}</style>
      <div className="mx-auto max-w-5xl p-2 sm:p-4">
        <div className="mb-3 flex flex-col items-center gap-2 sm:mb-4 sm:flex-row sm:justify-center sm:gap-4">
          <h1 className="whitespace-nowrap text-xl font-black sm:text-3xl">
            🧖 サウナシミュレーター<span className="text-xs text-stone-400 sm:text-base">（仮）</span>
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={toggleSound} className="rounded-full bg-stone-700 px-3 py-1 text-sm hover:bg-stone-600">
              {soundOn ? "🔊 音あり" : "🔇 ミュート"}
            </button>
            <button
              onClick={() => {
                ensureAudio();
                if (soundOnRef.current) speak("ととのいました", voicesRef.current, 0, true);
              }}
              className="rounded-full bg-stone-700 px-3 py-1 text-sm hover:bg-stone-600"
            >
              🗣 声テスト
            </button>
          </div>
        </div>

        {/* ===== 設定画面 ===== */}
        {phase === "setup" && (
          <div className="space-y-4">
            <p className="text-center text-stone-300">
              {inputMode === "stop" ? <>針が動いている間に <b className="text-yellow-300">STOP</b>（またはスペースキー）！</> : <>バーを自由に動かして設定できます。</>} 理想の設定は、サウナーの反応から探ろう。
            </p>
            <div className="flex justify-center gap-2">
              <button onClick={() => changeInputMode("stop")} className={`rounded-lg px-3 py-1 text-sm font-bold ${inputMode === "stop" ? "bg-yellow-400 text-stone-900" : "bg-stone-700"}`}>
                針をSTOP
              </button>
              <button onClick={() => changeInputMode("slider")} className={`rounded-lg px-3 py-1 text-sm font-bold ${inputMode === "slider" ? "bg-yellow-400 text-stone-900" : "bg-stone-700"}`}>
                自由に設定
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-stone-300">
              <span>
                🏆 ハイスコア: <b className="text-yellow-300">{save.best > 0 ? `${save.best}点（${save.bestTitle}）` : "---"}</b>
              </span>
              <button onClick={() => setShowDex(!showDex)} className="rounded-lg bg-stone-700 px-3 py-1 hover:bg-stone-600">
                📖 称号図鑑 {save.found.length}/{TITLES.length}
              </button>
              <button onClick={() => setShowHistory(!showHistory)} className="rounded-lg bg-stone-700 px-3 py-1 hover:bg-stone-600">
                🧾 設定履歴 {save.history.length}/10
              </button>
            </div>
            {showDex && (
              <div className="rounded-2xl border-4 border-stone-700 bg-stone-800 p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {TITLES.map((t) => {
                    const got = save.found.includes(t);
                    return (
                      <div key={t} className={`rounded-lg p-2 ${got ? "bg-stone-700" : "bg-stone-900 text-stone-500"}`}>
                        <div className="font-black">{got ? `「${t}」` : "「？？？」"}</div>
                        <div className="text-xs text-stone-300">{got ? VERDICT_DESC[t] : "まだ見つかっていない称号"}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-right">
                  <button
                    onClick={() => {
                      if (window.confirm("ハイスコアと図鑑の記録を消しますか？")) {
                        clearSave();
                        setSave(EMPTY_SAVE);
                      }
                    }}
                    className="text-xs text-stone-400 underline hover:text-stone-200"
                  >
                    記録を消す
                  </button>
                </div>
              </div>
            )}
            {showHistory && (
              <div className="rounded-2xl border-4 border-stone-700 bg-stone-800 p-4">
                {save.history.length === 0 ? (
                  <p className="text-center text-stone-400">まだ設定履歴がありません。</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {save.history.map((h, i) => (
                      <div key={`${h.createdAt}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-700 px-3 py-2">
                        <span className="text-stone-400">{new Date(h.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        <span>🔥 {h.sauna}℃　💧 {h.humidity}%　🧊 {h.water}℃</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {GAUGES.map((g, i) => {
              const v = values[i];
              const isActive = inputMode === "stop" && activeIdx === i;
              const needle = inputMode === "slider" ? (v !== null ? (v - g.min) / (g.max - g.min) : 0.5) : isActive ? pos : v !== null ? (v - g.min) / (g.max - g.min) : 0;
              const live = Math.round(g.min + needle * (g.max - g.min));
              return (
                <div key={g.label} className={`rounded-2xl border-4 p-4 ${isActive ? "border-yellow-400 bg-stone-800" : "border-stone-700 bg-stone-800/60"}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-lg font-bold">
                      {g.icon} {g.label}
                      <span className="ml-2 text-xs text-stone-400">
                        ({g.min}〜{g.max}
                        {g.unit})
                      </span>
                    </div>
                    <div className="font-mono text-3xl font-black">
                      {isActive || v !== null ? live : "--"}
                      <span className="text-lg">{g.unit}</span>
                    </div>
                  </div>
                  <div className={`relative h-10 rounded-lg bg-gradient-to-r ${g.bar}`}>
                    {(isActive || v !== null) && (
                      <div className="absolute -top-2 h-14 w-1.5 -translate-x-1/2 rounded bg-black shadow-[0_0_0_2px_white]" style={{ left: `${needle * 100}%` }} />
                    )}
                  </div>
                  {inputMode === "slider" && (
                    <input
                      type="range"
                      min={g.min}
                      max={g.max}
                      value={v ?? Math.round((g.min + g.max) / 2)}
                      onChange={(e) => setValues(values.map((x, j) => (j === i ? Number(e.target.value) : x)))}
                      className="mt-3 w-full accent-yellow-400"
                      aria-label={`${g.label}を設定`}
                    />
                  )}
                  <div className="mt-3 flex h-10 items-center gap-3">
                    {isActive && (
                      <button onClick={stopGauge} className="rounded-xl bg-red-600 px-8 py-2 text-xl font-black shadow-[0_4px_0_#7f1d1d] active:translate-y-1 active:shadow-none">
                        STOP!
                      </button>
                    )}
                    {v !== null && (
                      <>
                        <span className="a-pop text-lg font-black text-stone-200">
                          ✔ {v}
                          {g.unit} で決定
                        </span>
                        {inputMode === "stop" && retries[i] > 0 && (
                          <button
                            onClick={() => retryGauge(i)}
                            disabled={activeIdx !== 3}
                            className="ml-auto rounded-lg bg-stone-600 px-3 py-1 text-sm disabled:opacity-30"
                          >
                            やり直し（残り{retries[i]}回）
                          </button>
                        )}
                      </>
                    )}
                    {!isActive && v === null && <span className="text-stone-500">待機中...</span>}
                  </div>
                </div>
              );
            })}
            {allSet && (
              <div className="a-pop text-center">
                <p className="mb-2 text-stone-300">
                  サウナ体感温度: <b className="text-orange-300">{feelPreview}℃</b>（湿度が高いほど熱く感じる）
                </p>
                <button onClick={startGame} className="rounded-2xl bg-orange-500 px-10 py-4 text-2xl font-black shadow-[0_6px_0_#9a3412] active:translate-y-1 active:shadow-none">
                  🧖 サウナーを入場させる！
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== サウナ / 水風呂 / 外気浴（3D） ===== */}
        {isScene && run && (
          <div>
            {timerBar()}
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border-4 border-stone-700 bg-black sm:aspect-[16/10]">
              <div ref={mountRef} className="absolute inset-0" />
              <div className="pointer-events-none absolute inset-0 z-10">
                {run.sauners.map((_, p) => (
                  <div
                    key={p}
                    ref={(el) => {
                      bubbleRefs.current[p] = el;
                    }}
                    className="absolute left-0 top-0"
                    style={{ display: "none" }}
                  >
                    {renderBubble(bubbleFor(phase, p))}
                  </div>
                ))}
              </div>
              {elapsed < 1800 && (
                <div key={phase} className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                  <div className="a-banner whitespace-nowrap rounded-2xl border-4 border-white bg-black/80 px-4 py-3 text-[clamp(1.25rem,6vw,2.25rem)] font-black text-white sm:px-8 sm:py-4">{SCENE_TITLE[phase]}</div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 z-10 rounded-lg bg-black/60 px-3 py-1 font-mono text-xs sm:text-sm">
                {phase === "sauna" && `🌡 ${run.settings.sauna}℃ / 💧 ${run.settings.humidity}%`}
                {phase === "water" && `🌡 水温 ${run.settings.water}℃`}
                {phase === "outdoor" && "🌙 夜風が気持ちいい"}
              </div>
            </div>
          </div>
        )}

        {/* ===== 結果 ===== */}
        {phase === "result" && run && (
          <div className="rounded-2xl border-4 border-yellow-400 bg-stone-800 p-4 text-center sm:p-6">
            <div className="text-stone-300">本日の施設評価</div>
            <div className="my-2 text-lg">総合評価</div>
            <div className="font-mono text-6xl font-black text-emerald-300 sm:text-7xl">{Math.round(run.avg * Math.min(1, elapsed / 1500))}</div>
            <div className="h-10 text-4xl">
              {elapsed >= 1600 && (
                <span className="a-pop inline-block text-yellow-300">
                  {"★".repeat(run.stars)}
                  <span className="text-stone-600">{"★".repeat(5 - run.stars)}</span>
                </span>
              )}
            </div>
            <div className="mt-4 h-24">
              {elapsed >= 2200 && (
                <div className="a-pop">
                  <div className="text-[clamp(1.5rem,7vw,3rem)] font-black leading-tight text-orange-400">「{run.verdict}」</div>
                  <div className="mt-2 text-stone-300">{VERDICT_DESC[run.verdict]}</div>
                </div>
              )}
            </div>
            <div className="mt-2 h-8 text-sm">
              {elapsed >= 2600 && (
                <div className="a-pop flex flex-wrap items-center justify-center gap-3">
                  {flags.isNewBest && <span className="rounded bg-yellow-400 px-2 py-0.5 font-black text-stone-900">🏆 ハイスコア更新！</span>}
                  {flags.isNewTitle && <span className="rounded bg-emerald-400 px-2 py-0.5 font-black text-stone-900">📖 新しい称号！</span>}
                  <span className="text-stone-300">
                    図鑑 {save.found.length}/{TITLES.length} ・ ハイスコア {save.best}点
                  </span>
                </div>
              )}
            </div>
            {elapsed >= 2600 && (
              <div className="a-pop mx-auto mt-3 max-w-md space-y-1 text-left text-sm">
                {(
                  [
                    ["快適性", run.metrics.comfort],
                    ["生還率", run.metrics.survival],
                    ["ととのい度", run.metrics.tonoi],
                    ["刺さり度", run.metrics.sasari],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-20 shrink-0">{label}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded bg-stone-700">
                      <div className="h-full bg-emerald-400" style={{ width: `${v}%` }} />
                    </div>
                    <span className="w-8 text-right font-mono">{v}</span>
                  </div>
                ))}
                <p className="pt-1 text-center text-stone-300">💡 {adviceOf(run.metrics, run.feel, run.settings.water)}</p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
              {run.sauners.map((s, i) => (
                <div key={i} className="w-14 rounded-lg bg-stone-700 p-1">
                  <div className="text-2xl">{s.leftAt ? "🚪" : MOOD_ICON[s.mood]}</div>
                  <div className="font-mono">{s.score}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-stone-400">
              サウナ {run.settings.sauna}℃ / 湿度 {run.settings.humidity}%（体感 {Math.round(run.feel)}℃） / 水風呂 {run.settings.water}℃ / 途中退室{" "}
              {run.sauners.filter((s) => s.leftAt).length}人
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button onClick={startGame} className="rounded-xl bg-orange-500 px-6 py-3 font-black shadow-[0_4px_0_#9a3412] active:translate-y-1 active:shadow-none">
                🔁 同じ設定でもう1セット
              </button>
              <button onClick={resetSetup} className="rounded-xl bg-stone-600 px-6 py-3 font-black shadow-[0_4px_0_#292524] active:translate-y-1 active:shadow-none">
                ⚙️ 設定からやり直す
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
