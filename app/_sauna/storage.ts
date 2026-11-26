// ハイスコアと称号図鑑の保存（localStorage）
export type SaveData = {
  best: number; // 最高の平均点
  bestStars: number;
  bestTitle: string;
  found: string[]; // 見つけた称号
  history: SettingHistory[];
};

export type SettingHistory = {
  sauna: number;
  humidity: number;
  water: number;
  createdAt: number;
};

const KEY = "sauna-sim-save-v1";

export const EMPTY_SAVE: SaveData = { best: 0, bestStars: 0, bestTitle: "", found: [], history: [] };

// ブラウザでしか使えないので、必ず useEffect の中などクライアント側で呼ぶこと
export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_SAVE;
    const d = JSON.parse(raw);
    return {
      best: Number(d.best) || 0,
      bestStars: Number(d.bestStars) || 0,
      bestTitle: typeof d.bestTitle === "string" ? d.bestTitle : "",
      found: Array.isArray(d.found) ? d.found.filter((x: unknown): x is string => typeof x === "string") : [],
      history: Array.isArray(d.history)
        ? d.history.filter((x: unknown): x is SettingHistory => {
            if (!x || typeof x !== "object") return false;
            const item = x as Partial<SettingHistory>;
            return typeof item.sauna === "number" && typeof item.humidity === "number" && typeof item.water === "number" && typeof item.createdAt === "number";
          })
        : [],
    };
  } catch {
    return EMPTY_SAVE;
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 保存できない環境（プライベートモード等）では何もしない
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 同上
  }
}
