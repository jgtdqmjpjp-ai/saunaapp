"use client";
// 開発用ページ: 採点の数字（balance.ts）を変えたあと、称号がちゃんと出るかを確認する。
// 公開する前に、この debug フォルダごと削除してもよい。
import { useState } from "react";
import { GAUGES, TITLES } from "./_sauna/constants";
import { generateRun } from "./_sauna/scoring";

const ri = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

type Result = { n: number; counts: Record<string, number>; best: string; worst: string };

export default function Debug() {
  const [result, setResult] = useState<Result | null>(null);

  // ゲージを「ランダムに止めた」場合を、n回シミュレーションする
  const simulate = (n: number) => {
    const [g0, g1, g2] = GAUGES;
    const counts: Record<string, number> = {};
    let best = { avg: -1, label: "" };
    let worst = { avg: 101, label: "" };
    for (let i = 0; i < n; i++) {
      const s = ri(g0.min, g0.max);
      const h = ri(g1.min, g1.max);
      const w = ri(g2.min, g2.max);
      const r = generateRun(s, h, w);
      counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
      const label = `サウナ${s}℃ / 湿度${h}% / 水風呂${w}℃`;
      if (r.avg > best.avg) best = { avg: r.avg, label };
      if (r.avg < worst.avg) worst = { avg: r.avg, label };
    }
    setResult({ n, counts, best: `${best.avg}点（${best.label}）`, worst: `${worst.avg}点（${worst.label}）` });
  };

  return (
    <main className="mx-auto max-w-2xl p-4 text-stone-100">
      <h1 className="mb-2 text-xl font-black">称号の出方チェック（開発用）</h1>
      <p className="mb-4 text-sm text-stone-300">ゲージをランダムに止めたとき、各称号がどれくらい出るかを数えます。0件の称号は、図鑑を埋められません。</p>
      <div className="mb-4 flex gap-2">
        <button onClick={() => simulate(10000)} className="rounded bg-orange-500 px-4 py-2 font-bold">1万回</button>
        <button onClick={() => simulate(100000)} className="rounded bg-stone-600 px-4 py-2 font-bold">10万回（少し重い）</button>
      </div>
      {result && (
        <div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-600"><th className="py-1">称号</th><th>回数</th><th>割合</th></tr>
            </thead>
            <tbody>
              {TITLES.map((t) => {
                const c = result.counts[t] ?? 0;
                return (
                  <tr key={t} className={`border-b border-stone-800 ${c === 0 ? "font-bold text-red-400" : ""}`}>
                    <td className="py-1">{t}</td>
                    <td>{c}</td>
                    <td>{((c / result.n) * 100).toFixed(2)}% {c === 0 && "← 出ません！"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-sm">最高: {result.best}</p>
          <p className="text-sm">最低: {result.worst}</p>
        </div>
      )}
    </main>
  );
}
