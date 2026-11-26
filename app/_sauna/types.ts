// ===== 型 =====
export type Phase = "setup" | "sauna" | "water" | "outdoor" | "result";
export type Scene = "sauna" | "water" | "outdoor";
export type SaunaLv = "tooCold" | "lukewarm" | "good" | "hot" | "tooHot";
export type WaterLv = "tooCold" | "cold" | "good" | "nurui" | "warm";
export type Mood = "good" | "mid" | "bad";
export type Ev = { t: number; p: number; text: string; speech?: string; action?: boolean; leave?: boolean };
export type Sauner = {
  saunaLv: SaunaLv;
  waterLv: WaterLv;
  leftAt: "sauna" | "water" | null;
  score: number;
  mood: Mood;
  // 以下は 0〜1。1人ごとの内訳
  heat: number; // 熱量
  contrast: number; // 温冷差
  comfort: number; // 快適性
  tonoi: number; // ととのい度
};
// 結果画面に出す内訳（すべて 0〜100）
export type Metrics = {
  heat: number; // 熱量
  contrast: number; // 温冷差
  comfort: number; // 快適性
  survival: number; // 生還率（最後まで残った人の割合）
  tonoi: number; // ととのい度（最後まで残った人の平均）
  sasari: number; // 刺さり度（満足度の上位の平均）
};
export type Run = {
  sauners: Sauner[];
  scripts: Record<Scene, Ev[]>;
  settings: { sauna: number; humidity: number; water: number };
  feel: number;
  saunaLv: SaunaLv;
  waterLv: WaterLv;
  avg: number; // 総合評価（名前は avg のまま。平均点ではなく、刺さり度も含めた総合）
  metrics: Metrics;
  stars: number;
  verdict: string;
};
