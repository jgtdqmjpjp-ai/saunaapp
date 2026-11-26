import type { Ev, Metrics, Mood, SaunaLv, WaterLv, Sauner, Run, Scene } from "./types";
import { BUBBLE_MS, SCENE_DUR } from "./constants";
import { BALANCE as B } from "./balance";
import { SAUNA_LINES, SAUNA_ACTIONS, SAUNA_LEAVE, WATER_LINES, WATER_ACTIONS, WATER_LEAVE, OUTDOOR_LINES, OUTDOOR_ACTIONS, speechOf } from "./lines";
import { rand, pick, clamp } from "./utils";

// 湿度が高いほど熱く感じる
export const feelTemp = (sauna: number, humidity: number) => sauna + (humidity - 25) * 0.6;

// 体感温度に対する、理想の水風呂の温度（斜めのライン）。
// 熱いサウナほど、冷たい水風呂が合う。95℃ → 約16.3℃、120℃ → 約12.5℃。
export const idealWater = (feel: number) =>
  clamp(B.idealWaterAt100 - B.idealWaterSlope * (feel - 100), B.idealWaterMin, B.idealWaterMax);

// 区分（セリフの種類を選ぶために使う）
export function saunaLevel(feel: number): SaunaLv {
  if (feel < 40) return "tooCold";
  if (feel < 70) return "lukewarm";
  if (feel <= 105) return "good";
  if (feel <= 130) return "hot";
  return "tooHot";
}

export function waterLevel(w: number): WaterLv {
  if (w < 5) return "tooCold";
  if (w < 12) return "cold";
  if (w <= 20) return "good";
  if (w <= 28) return "nurui";
  return "warm";
}

// 称号を決める。高評価を先に判定し、極端な特徴がある場合は原因の称号を優先する。
// これにより、灼熱かつ水風呂も極端な設定でも「要改善施設」に埋もれない。
export function verdictOf(total: number, feel: number, water: number): string {
  if (total >= B.titleGod) return "神施設";

  // 原因が複数あっても、最も特徴的な状態を優先して称号にする。
  if (feel >= B.causeHotFeel) return "灼熱地獄";
  if (water <= B.causeColdWater) return "氷結地獄";
  if (feel < B.causeColdFeel) return "冷蔵庫";
  if (feel < B.causeLukewarmFeel) return "ただの休憩所";
  if (water >= idealWater(feel) + B.causeWarmExcess) return "ただのお風呂屋さん";

  if (total >= B.titleGood) return "良施設";
  return total >= B.titleQuirky ? "クセが強い" : "要改善施設";
}

// 結果画面に出す、一言アドバイス（方向だけ教えて、答えの数字は教えない）
export function adviceOf(m: Metrics, feel: number, water: number): string {
  const weakest = [
    { v: m.heat, msg: "もう少し体を温めたかった。サウナ室の熱さが足りないかも。" },
    { v: m.comfort, msg: feel >= B.comfortHotFrom ? "サウナ室が熱すぎて、つらそうだった。" : "水風呂が冷たすぎて、つらそうだった。" },
    {
      v: m.contrast,
      msg: water > idealWater(feel) ? "温冷差が足りない。水風呂は、もっと冷たいほうが合いそう。" : "温冷差がつきすぎ。水風呂は、もう少しぬるいほうが合いそう。",
    },
    { v: m.survival, msg: "途中で出ていく人が多かった。" },
  ].sort((a, b) => a.v - b.v)[0];
  return weakest.v >= 80 ? "バランスの取れた、いい施設！" : weakest.msg;
}

// 1人分のセリフ予定を作る
export function personScript(
  p: number,
  duration: number,
  pool: readonly string[],
  actions: readonly string[],
  first: [number, number],
  step: [number, number],
  leave: { t: number; lines: readonly string[] } | null,
): Ev[] {
  const evs: Ev[] = [];
  let t = rand(first[0], first[1]);
  const end = leave ? leave.t - BUBBLE_MS - 200 : duration - 1200;
  while (t < end) {
    if (Math.random() < 0.2) {
      const text = pick(actions);
      evs.push({ t, p, text, speech: speechOf(text), action: true });
    } else {
      const text = pick(pool);
      evs.push({ t, p, text, speech: speechOf(text) });
    }
    t += rand(step[0], step[1]);
  }
  if (leave) {
    const text = pick(leave.lines);
    evs.push({ t: leave.t, p, text, speech: speechOf(text), leave: true });
  }
  return evs;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function generateRun(sauna: number, humidity: number, water: number): Run {
  const feel = feelTemp(sauna, humidity);
  const saunaLeaveTimes: (number | null)[] = [];
  const waterLeaveTimes: (number | null)[] = [];

  const sauners: Sauner[] = Array.from({ length: 10 }, () => {
    // 同じサウナーでも、体感や水温の感じ方は少しブレる
    const sf = feel + rand(-B.feelJitter, B.feelJitter);
    const wf = water + rand(-B.waterJitter, B.waterJitter);
    const saunaLv = saunaLevel(sf);
    const waterLv = waterLevel(wf);

    // ① 熱量: 十分に温まったか（高いほど良い、ではなく、満点で頭打ち）
    const heat = clamp((sf - B.heatFrom) / (B.heatFull - B.heatFrom), 0, 1);
    // ② 温冷差: 熱に見合う水温か（理想の水温との差）
    const contrastMatch = clamp(1 - Math.max(0, Math.abs(wf - idealWater(sf)) - B.contrastTolerance) / B.contrastSpan, 0, 1);
    const contrast = heat * contrastMatch;
    // ③ 快適性: 熱すぎ、水風呂が冷たすぎ でつらくなかったか
    const comfortHot = clamp(1 - Math.max(0, sf - B.comfortHotFrom) / (B.comfortHotZero - B.comfortHotFrom), 0, 1);
    const comfortWater = clamp(1 - Math.max(0, B.comfortWaterColdFrom - wf) / B.comfortWaterColdSpan, 0, 1);
    // 熱量が足りない状態では、水風呂が適温でも快適度を高評価にしない。
    const comfort = heat * comfortHot * comfortWater;
    // ④ ととのい度: 熱と冷えがそろい、かつ快適だったか
    const tonoi = Math.sqrt(heat * contrast) * comfort;

    // 途中退室（確率はなだらかに変わる）
    const hotLeaveP = clamp((sf - B.leaveHotFrom) / B.leaveHotSpan, 0, 1);
    const coldLeaveP = clamp((B.leaveColdFrom - sf) / B.leaveColdSpan, 0, 1) * B.leaveColdMax;
    const waterColdLeaveP = clamp((B.leaveWaterColdFrom - wf) / B.leaveWaterColdSpan, 0, 1);
    const waterWarmLeaveP = clamp((wf - B.leaveWaterWarmFrom) / B.leaveWaterWarmSpan, 0, 1) * B.leaveWaterWarmMax;

    let leftAt: Sauner["leftAt"] = null;
    if (Math.random() < Math.max(hotLeaveP, coldLeaveP)) leftAt = "sauna";
    else if (Math.random() < Math.max(waterColdLeaveP, waterWarmLeaveP)) leftAt = "water";
    saunaLeaveTimes.push(leftAt === "sauna" ? rand(4000, 15000) : null);
    waterLeaveTimes.push(leftAt === "water" ? rand(2500, 6500) : null);

    // 1人の満足度
    let score: number;
    if (leftAt === "sauna") score = Math.round(rand(0, 6));
    else if (leftAt === "water") score = Math.round(clamp(tonoi * 20 + rand(0, 5), 0, 100));
    else score = Math.round(clamp(100 * tonoi + rand(-4, 4), 0, 100));
    const mood: Mood = score >= 60 ? "good" : score >= 35 ? "mid" : "bad";
    return { saunaLv, waterLv, leftAt, score, mood, heat, contrast, comfort, tonoi };
  });

  const scripts: Record<Scene, Ev[]> = { sauna: [], water: [], outdoor: [] };
  sauners.forEach((s, p) => {
    const st = saunaLeaveTimes[p];
    scripts.sauna.push(
      ...personScript(p, SCENE_DUR.sauna, SAUNA_LINES[s.saunaLv], SAUNA_ACTIONS[s.saunaLv], [1500, 4000], [2600, 4800],
        st !== null ? { t: st, lines: SAUNA_LEAVE[s.saunaLv] } : null),
    );
    if (s.leftAt === "sauna") return;
    const wt = waterLeaveTimes[p];
    scripts.water.push(
      ...personScript(p, SCENE_DUR.water, WATER_LINES[s.waterLv], WATER_ACTIONS[s.waterLv], [1200, 2500], [2200, 3500],
        wt !== null ? { t: wt, lines: WATER_LEAVE[s.waterLv] } : null),
    );
    if (s.leftAt === "water") return;
    scripts.outdoor.push(
      ...personScript(p, SCENE_DUR.outdoor, OUTDOOR_LINES[s.mood], OUTDOOR_ACTIONS[s.mood], [1300, 3000], [2600, 3600], null),
    );
  });

  // ===== 結果の集計 =====
  const finishers = sauners.filter((s) => s.leftAt === null); // 最後（外気浴）まで残った人
  const reachedWater = sauners.filter((s) => s.leftAt !== "sauna"); // 水風呂まで行った人
  const scores = sauners.map((s) => s.score);
  const sasari = mean([...scores].sort((a, b) => b - a).slice(0, B.sasariTop)); // 刺さり度
  const metrics: Metrics = {
    heat: Math.round(100 * mean(sauners.map((s) => s.heat))),
    contrast: Math.round(100 * mean(reachedWater.map((s) => s.contrast))),
    comfort: Math.round(100 * mean(sauners.map((s) => s.comfort))),
    survival: Math.round((100 * finishers.length) / sauners.length),
    tonoi: Math.round(100 * mean(finishers.map((s) => s.tonoi))),
    sasari: Math.round(sasari),
  };
  // 総合: 全員の平均に、刺さり度を混ぜる（一部の人にだけ深く刺さる施設も、評価される）
  const total = Math.round((1 - B.sasariWeight) * mean(scores) + B.sasariWeight * sasari);
  const [s5, s4, s3, s2] = B.stars;
  const stars = total >= s5 ? 5 : total >= s4 ? 4 : total >= s3 ? 3 : total >= s2 ? 2 : 1;

  return {
    sauners,
    scripts,
    settings: { sauna, humidity, water },
    feel,
    saunaLv: saunaLevel(feel),
    waterLv: waterLevel(water),
    avg: total,
    metrics,
    stars,
    verdict: verdictOf(total, feel, water),
  };
}
