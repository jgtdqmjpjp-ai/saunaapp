import type { Phase, Scene, Mood } from "./types";

// ===== 定数 =====
export const GAUGE_PERIOD = 900;
export const GAUGES = [
  { label: "サウナ温度", unit: "℃", icon: "🔥", min: -10, max: 200, bar: "from-sky-400 via-yellow-200 to-red-600" },
  { label: "湿度", unit: "%", icon: "💧", min: 0, max: 100, bar: "from-amber-200 via-cyan-200 to-sky-600" },
  { label: "水風呂温度", unit: "℃", icon: "🧊", min: -20, max: 50, bar: "from-indigo-700 via-cyan-300 to-orange-400" },
] as const;

export const SCENE_DUR: Record<Scene, number> = { sauna: 20000, water: 10000, outdoor: 8000 };
export const NEXT: Record<Scene, Phase> = { sauna: "water", water: "outdoor", outdoor: "result" };
export const SCENE_TITLE: Record<Scene, string> = { sauna: "🔥 サウナ室へ！", water: "🧊 水風呂へダイブ！", outdoor: "🍃 外気浴タイム" };
export const BUBBLE_MS = 2000;
export const WALKOUT_MS = 2400;
export const MOOD_ICON: Record<Mood, string> = { good: "😇", mid: "🙂", bad: "😤" };

export const VERDICT_DESC: Record<string, string> = {
  冷蔵庫: "サウナ室というより、冷蔵庫に近い。まずは体を温めるところから。",
  神施設: "全サウナーが天に召された。ここが聖地か。",
  良施設: "また来たいと思える、確かな一軒。",
  クセが強い: "刺さる人には刺さる。刺さらない人もいる。",
  灼熱地獄: "サウナ室というより溶鉱炉。",
  氷結地獄: "水風呂というより北極海。",
  ただの休憩所: "サウナ室がただの小部屋になっている。",
  ただのお風呂屋さん: "水風呂…どこ…？",
  要改善施設: "全体的に見直しが必要そうだ。",
};

// 称号図鑑に載る称号の一覧（VERDICT_DESC のキー）
export const TITLES = Object.keys(VERDICT_DESC);
