import { useEffect, useRef, useState } from "react";
import { createChart, AreaSeries } from "lightweight-charts";
import { fetchResults } from "./api";

function pnlColor(val) {
  if (val > 0) return "text-green-400";
  if (val < 0) return "text-red-400";
  return "text-th-muted";
}

// ─── Mini sparkline bar for week-over-week comparison ────────────────────────

function Sparkline({ value, max }) {
  const pct = max > 0 ? Math.min(Math.abs(value) / max * 100, 100) : 0;
  const isPositive = value >= 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-4 relative">
        <div className="absolute inset-0 flex items-center">
          {/* Center line */}
          <div className="w-full h-px bg-th-surface" />
        </div>
        <div
          className={`absolute top-0.5 h-3 rounded-sm transition-all ${isPositive ? "bg-emerald-500/40" : "bg-rose-500/40"}`}
          style={{
            width: `${pct / 2}%`,
            left: isPositive ? "50%" : `${50 - pct / 2}%`,
          }}
        />
      </div>
      <span className={`font-mono text-[11px] w-16 text-right ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
        {isPositive ? "+" : ""}{value.toFixed(2)}%
      </span>
    </div>
  );
}

// ─── Cumulative Equity Curve ─────────────────────────────────────────────────

function CumulativeEquityCurve({ weeks }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || weeks.length === 0) return;

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
      height: 240,
      timeScale: { borderColor: "var(--border)" },
      rightPriceScale: { borderColor: "var(--border)" },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: "rgba(16, 185, 129, 0.25)",
      bottomColor: "rgba(16, 185, 129, 0.01)",
      lineColor: "#10b981",
      lineWidth: 2,
    });

    // Build cumulative P/L data from oldest to newest
    let cumPnl = 0;
    const sorted = [...weeks].reverse();
    const data = sorted.map((w) => {
      cumPnl += w.total_pnl_percent;
      return { time: w.week_start, value: parseFloat(cumPnl.toFixed(2)) };
    });

    if (cumPnl < 0) {
      areaSeries.applyOptions({
        topColor: "rgba(244, 63, 94, 0.01)",
        bottomColor: "rgba(244, 63, 94, 0.25)",
        lineColor: "#f43f5e",
      });
    }

    areaSeries.setData(data);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chart.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [weeks]);

  return <div ref={containerRef} className="rounded-xl overflow-hidden border border-th" />;
}

// ─── Main Results Component ──────────────────────────────────────────────────

export default function Results() {
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResults()
      .then(setWeeks)
      .catch(() => setWeeks([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-th-muted">Loading results...</p>;

  if (weeks.length === 0) {
    return (
      <div className="bg-th-card rounded-lg p-8 text-center text-th-muted border border-th">
        No trade results yet. Results are uploaded by the EA at the end of each trading week.
      </div>
    );
  }

  // Cumulative P&L across all weeks
  let cumPnl = 0;
  weeks.slice().reverse().forEach((w) => { cumPnl += w.total_pnl_percent; });

  // Max absolute PnL for sparkline scaling
  const maxPnl = Math.max(...weeks.map((w) => Math.abs(w.total_pnl_percent)), 0.01);

  // Best / worst week
  const bestWeek = weeks.reduce((b, w) => w.total_pnl_percent > (b?.total_pnl_percent ?? -Infinity) ? w : b, null);
  const worstWeek = weeks.reduce((b, w) => w.total_pnl_percent < (b?.total_pnl_percent ?? Infinity) ? w : b, null);

  // Average weekly return
  const avgReturn = cumPnl / weeks.length;

  return (
    <div>
      <h2 className="text-xl font-bold text-th-heading mb-6">Performance Tracker</h2>

      {/* Cumulative summary */}
      <div className="bg-th-card rounded-xl p-5 mb-6 border border-th">
        <h3 className="text-sm font-semibold text-th-secondary uppercase tracking-wider mb-3">
          Cumulative Performance
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <p className="text-xs text-th-faint mb-1">Total P&L</p>
            <p className={`text-lg font-mono font-bold ${pnlColor(cumPnl)}`}>
              {cumPnl >= 0 ? "+" : ""}{cumPnl.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-th-faint mb-1">Weeks Tracked</p>
            <p className="text-lg font-mono text-th-heading">{weeks.length}</p>
          </div>
          <div>
            <p className="text-xs text-th-faint mb-1">Total Trades</p>
            <p className="text-lg font-mono text-th-heading">
              {weeks.reduce((s, w) => s + w.total_trades, 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-th-faint mb-1">Win Rate</p>
            <p className="text-lg font-mono text-blue-400">
              {(() => {
                const wins = weeks.reduce((s, w) => s + w.total_wins, 0);
                const total = weeks.reduce((s, w) => s + w.total_trades, 0);
                return total > 0 ? `${((wins / total) * 100).toFixed(1)}%` : "\u2014";
              })()}
            </p>
          </div>
          <div>
            <p className="text-xs text-th-faint mb-1">Avg Week</p>
            <p className={`text-lg font-mono font-bold ${pnlColor(avgReturn)}`}>
              {avgReturn >= 0 ? "+" : ""}{avgReturn.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-th-faint mb-1">Best / Worst</p>
            <p className="text-sm font-mono">
              <span className="text-emerald-400">+{bestWeek?.total_pnl_percent.toFixed(2)}%</span>
              <span className="text-th-faint mx-1">/</span>
              <span className="text-rose-400">{worstWeek?.total_pnl_percent.toFixed(2)}%</span>
            </p>
          </div>
        </div>
      </div>

      {/* Equity curve */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-th-secondary uppercase tracking-wider mb-3">Equity Curve</h3>
        <CumulativeEquityCurve weeks={weeks} />
      </div>

      {/* Week-over-week sparkline comparison */}
      <div className="bg-th-card rounded-xl p-5 mb-6 border border-th">
        <h3 className="text-sm font-semibold text-th-secondary uppercase tracking-wider mb-4">Week-over-Week</h3>
        <div className="space-y-2">
          {weeks.map((w) => (
            <div key={w.week_start} className="flex items-center gap-3">
              <span className="font-mono text-xs text-th-faint w-24 flex-shrink-0">{w.week_start}</span>
              <span className="text-[10px] text-th-faint w-16 flex-shrink-0">{w.total_trades}T {w.active_markets}A</span>
              <Sparkline value={w.total_pnl_percent} max={maxPnl} />
            </div>
          ))}
        </div>
      </div>

      {/* Week-by-week results */}
      <div className="space-y-4">
        {weeks.map((w) => (
          <div key={w.week_start} className="bg-th-card rounded-xl p-5 border border-th">
            <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
              <h4 className="text-sm font-semibold text-th-heading">
                Week of {w.week_start}
              </h4>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-th-faint">{w.active_markets} active</span>
                <span className="text-th-faint">{w.total_trades} trades</span>
                <span className={`font-mono font-bold ${pnlColor(w.total_pnl_percent)}`}>
                  {w.total_pnl_percent >= 0 ? "+" : ""}{w.total_pnl_percent.toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
              {w.results.map((r) => (
                <div
                  key={r.symbol}
                  className={`rounded px-3 py-2 text-xs ${
                    r.was_active ? "bg-th-card-hover" : "bg-th-card-hover/50 opacity-60"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-th-heading">{r.symbol}</span>
                    {r.was_active && (
                      <span className="text-[9px] uppercase px-1 rounded bg-green-900/60 text-green-400">
                        active
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-th-faint">
                      {r.wins}W / {r.losses}L
                    </span>
                    <span className={`font-mono ${pnlColor(r.total_pnl_percent)}`}>
                      {r.total_pnl_percent >= 0 ? "+" : ""}{r.total_pnl_percent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
