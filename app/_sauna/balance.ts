// ===== 採点の「つまみ」 =====
// 評価の厳しさや傾向は、ここの数字を変えるだけで調整できる。
// 計算式は scoring.ts にある。
export const BALANCE = {
  // --- 人ごとのブレ ---
  feelJitter: 8, // 体感温度の個人差（±℃）
  waterJitter: 2.5, // 水温の感じ方の個人差（±℃）

  // --- 熱量（しっかり温まったか）---
  // 「高ければ高いほど良い」にはしない。heatFull 以上は、すべて満点。
  heatFrom: 55, // 体感がこれ以下だと、熱量 0
  heatFull: 80, // 体感がこれ以上だと、熱量 満点

  // --- 快適性（つらくなかったか）---
  comfortHotFrom: 115, // 体感がこれを超えると、熱すぎて快適性が下がり始める
  comfortHotZero: 150, // 体感がここで、快適性 0
  comfortWaterColdFrom: 8, // 水温がこれより冷たいと、快適性が下がり始める
  comfortWaterColdSpan: 10, // そこから何℃で、快適性 0 になるか

  // --- 温冷差（熱に見合う冷やし方か）---
  // 理想の水温 = idealWaterAt100 − idealWaterSlope × (体感温度 − 100)
  // 体感が高いほど、理想の水風呂は冷たくなる（斜めのライン）
  idealWaterAt100: 15.5,
  idealWaterSlope: 0.15,
  idealWaterMin: 4, // 理想の水温の下限
  idealWaterMax: 20, // 理想の水温の上限
  contrastTolerance: 3, // 理想から±3℃までは、満点
  contrastSpan: 12, // そこからさらに何℃で、温冷差 0 になるか

  // --- 途中退室 ---
  leaveHotFrom: 120, // 体感がこれを超えると、退室する人が出始める
  leaveHotSpan: 30, // そこから何℃で、全員が退室するか
  leaveColdFrom: 45, // 体感がこれより低いと、「意味がない」と退室する人が出る
  leaveColdSpan: 25,
  leaveColdMax: 0.7, // 寒すぎるサウナでの、退室確率の上限
  leaveWaterColdFrom: 6, // 水温がこれより冷たいと、水風呂で退室する人が出る
  leaveWaterColdSpan: 8,
  leaveWaterWarmFrom: 28, // 水温がこれより温いと、「ただのお風呂」と退室する人が出る
  leaveWaterWarmSpan: 20,
  leaveWaterWarmMax: 0.5,

  // --- 総合 ---
  // 総合 = (1 − sasariWeight) × 全員の平均 + sasariWeight × 刺さり度
  // 刺さり度 = 満足度が高い上位 sasariTop 人の平均（「刺さる人には刺さる」を評価する）
  sasariWeight: 0.3,
  sasariTop: 3,

  // --- 称号 ---
  titleGod: 85, // 総合がこれ以上 → 神施設
  titleGood: 65, // → 良施設
  titleQuirky: 40, // → クセが強い（極端な原因がない中低得点にも出やすくする）
  causeHotFeel: 125, // 体感がこれ以上 → 「熱すぎ」が原因
  causeColdWater: 4, // 水温がこれ以下 → 「水風呂が冷たすぎ」が原因
  causeColdFeel: 25, // 体感温度がこれ未満 → 「冷蔵庫」が原因
  causeLukewarmFeel: 67, // 体感温度がこれ未満 → 「ただの休憩所」が原因
  causeWarmExcess: 12, // 水温が、理想より何℃以上高い → 「水風呂が温い」が原因

  // --- ★の境目（5つ星、4つ星、3つ星、2つ星）---
  stars: [85, 65, 45, 25],
} as const;
