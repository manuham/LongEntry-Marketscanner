import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createChart, LineSeries } from "lightweight-charts";
import { fetchAllHistory } from "./api";

function scoreColor(score) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-rose-400";
}

const LINE_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#f43f5e", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
  "#a78bfa", "#fb923c", "#22d3ee", "#e879f9",
];

function HistoryChart({ history }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || history.length === 0) return;

    // Group by symbol
    const bySymbol = {};
    for (const r of history) {
      if (!bySymbol[r.symbol]) bySymbol[r.symbol] = [];
      bySymbol[r.symbol].push(r);
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: getComputedStyle(document.documentElement).getPropertyValue("--chart-bg").trim() || "#080d19" },
        textColor: getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim() || "#64748b",
        fontFamily: "'Inter', -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim() || "#111827" },
        horzLines: { color: getComputedStyle(document.documentElement).getPropertyValue("--chart-grid").trim() || "#111827" },
      },
      width: containerRef.current.clientWidth,
      height: 400,
      timeScale: { borderColor: "var(--border)" },
      rightPriceScale: { borderColor: "var(--border)" },
    });

    const symbols = Object.keys(bySymbol).sort();
    symbols.forEach((sym, idx) => {
      const series = chart.addSeries(LineSeries, {
        color: LINE_COLORS[idx % LINE_COLORS.length],
        lineWidth: 2,
        title: sym,
      });

      const data = bySymbol[sym]
        .filter((r) => r.final_score != null)
        .sort((a, b) => a.week_start.localeCompare(b.week_start))
        .map((r) => ({
          time: r.week_start,
          value: r.final_score,
        }));

      if (data.length > 0) series.setData(data);
    });

    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chart.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [history]);

  return <div ref={containerRef} className="rounded-xl overflow-hidden border border-th" />;
}

function RankTable({ history }) {
  // Group by week, show rank of each symbol
  const weeks = {};
  const allSymbols = new Set();
  for (const r of history) {
    if (!weeks[r.week_start]) weeks[r.week_start] = {};
    weeks[r.week_start][r.symbol] = r;
    allSymbols.add(r.symbol);
  }

  const sortedWeeks = Object.keys(weeks).sort().reverse();
  const symbols = [...allSymbols].sort();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] text-th-faint uppercase tracking-wide border-b border-th">
            <th className="px-3 py-2 text-left font-medium sticky left-0 bg-th-card z-10">Week</th>
            {symbols.map((s) => (
              <th key={s} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                <Link to={`/market/${s}`} className="hover:text-emerald-400 transition-colors">{s}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedWeeks.map((ws) => (
            <tr key={ws} className="border-b border-th-strong/30">
              <td className="px-3 py-2 font-mono text-th-secondary sticky left-0 bg-th-card z-10 whitespace-nowrap">{ws}</td>
              {symbols.map((sym) => {
                const r = weeks[ws]?.[sym];
                if (!r) return <td key={sym} className="px-2 py-2 text-center text-th-faint">--</td>;
                return (
                  <td key={sym} className="px-2 py-2 text-center">
                    <span className={`font-mono font-semibold ${scoreColor(r.final_score ?? 0)}`}>
                      {r.final_score != null ? r.final_score.toFixed(0) : "--"}
                    </span>
                    {r.rank != null && (
                      <span className="text-th-faint ml-1">#{r.rank}</span>
                    )}
                    {r.is_active && (
                      <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParamChanges({ history }) {
  // Show how optimal parameters changed per symbol
  const bySymbol = {};
  for (const r of history) {
    if (!bySymbol[r.symbol]) bySymbol[r.symbol] = [];
    bySymbol[r.symbol].push(r);
  }

  const symbols = Object.keys(bySymbol).sort();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {symbols.map((sym) => {
        const records = bySymbol[sym].sort((a, b) => b.week_start.localeCompare(a.week_start)).slice(0, 8);
        return (
          <div key={sym} className="bg-th-card border border-th rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <Link to={`/market/${sym}`} className="font-semibold text-th-heading hover:text-emerald-400 transition-colors">{sym}</Link>
              {records[0]?.is_active && (
                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-400">Active</span>
              )}
            </div>
            <div className="space-y-1">
              {records.map((r) => (
                <div key={r.week_start} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-th-faint w-20">{r.week_start}</span>
                  <span className={`font-mono w-8 text-right ${scoreColor(r.final_score ?? 0)}`}>
                    {r.final_score != null ? r.final_score.toFixed(0) : "--"}
                  </span>
                  {r.opt_entry_hour != null && (
                    <span className="font-mono text-th-muted">
                      {String(r.opt_entry_hour).padStart(2, "0")}:00 SL{r.opt_sl_percent}% TP{r.opt_tp_percent}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function HistoryView() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState(12);
  const [tab, setTab] = useState("chart");

  useEffect(() => {
    setLoading(true);
    fetchAllHistory(weeks)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [weeks]);

  const tabs = [
    { id: "chart", label: "Score Trends" },
    { id: "table", label: "Rank Table" },
    { id: "params", label: "Parameter Changes" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-th-heading">Historical Comparison</h2>
          <p className="text-sm text-th-muted mt-1">Track how scores, ranks, and parameters change over time</p>
        </div>
        <select
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value))}
          className="bg-th-card border border-th rounded-lg px-3 py-1.5 text-sm text-th-heading focus:outline-none"
        >
          <option value={4}>Last 4 weeks</option>
          <option value={8}>Last 8 weeks</option>
          <option value={12}>Last 12 weeks</option>
          <option value={26}>Last 26 weeks</option>
          <option value={52}>Last year</option>
        </select>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-th-card border border-th rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
              tab === t.id
                ? "bg-th-surface text-th-heading font-medium"
                : "text-th-muted hover:text-th-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-th-muted">Loading history...</p>}

      {!loading && history.length === 0 && (
        <div className="bg-th-card rounded-xl p-8 text-center text-th-muted border border-th">
          No historical data yet. History accumulates after each weekly analysis run.
        </div>
      )}

      {!loading && history.length > 0 && (
        <>
          {tab === "chart" && <HistoryChart history={history} />}
          {tab === "table" && (
            <div className="bg-th-card border border-th rounded-xl overflow-hidden">
              <RankTable history={history} />
            </div>
          )}
          {tab === "params" && <ParamChanges history={history} />}
        </>
      )}
    </div>
  );
}
