import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { createChart, CandlestickSeries, AreaSeries } from "lightweight-charts";
import { fetchSymbolAnalytics, fetchCandles, fetchTrades, overrideMarket, fetchFundamental, fetchFundamentalEvents, fetchAIPredictions, fetchHeatmap } from "./api";

const SYMBOL_REGION = {
  XAUUSD: "commodities", XAGUSD: "commodities",
  US500: "US", US100: "US", US30: "US",
  GER40: "EU", EU50: "EU", FRA40: "EU", SPN35: "EU", N25: "EU",
  UK100: "UK", JP225: "JP", AUS200: "AU", HK50: "HK",
};

const STANCE_LABELS = { "-1": "Hawkish", "0": "Neutral", "1": "Dovish" };
const GROWTH_LABELS = { "-1": "Contracting", "0": "Stable", "1": "Expanding" };
const INFLATION_LABELS = { "-1": "Falling", "0": "Stable", "1": "Rising" };
const RISK_LABELS = { "-1": "Risk-Off", "0": "Neutral", "1": "Risk-On" };

function stanceColor(val) {
  if (val === 1) return "text-emerald-400";
  if (val === -1) return "text-rose-400";
  return "text-th-muted";
}

function fmt(val, decimals = 2) {
  if (val == null) return "\u2014";
  return val.toFixed(decimals);
}

function pctColor(val) {
  if (val == null) return "text-th-faint";
  return val >= 0 ? "text-emerald-400" : "text-rose-400";
}

function pctPrefix(val) {
  if (val == null) return "\u2014";
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
}

function scoreColor(score) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-rose-400";
}

function scoreBg(score) {
  if (score >= 70) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 50) return "bg-amber-500/10 border-amber-500/20";
  return "bg-rose-500/10 border-rose-500/20";
}

function smaStatus(current, sma) {
  if (current == null || sma == null) return { label: "\u2014", color: "text-th-faint" };
  const diff = ((current - sma) / sma) * 100;
  const above = current > sma;
  return {
    label: `${above ? "Above" : "Below"} (${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%)`,
    color: above ? "text-emerald-400" : "text-rose-400",
  };
}

function rsiColor(rsi) {
  if (rsi == null) return "text-th-faint";
  if (rsi >= 70) return "text-rose-400";
  if (rsi <= 30) return "text-emerald-400";
  return "text-sky-400";
}

function rsiLabel(rsi) {
  if (rsi == null) return "";
  if (rsi >= 70) return "Overbought";
  if (rsi <= 30) return "Oversold";
  return "Neutral";
}

// ─── Shared Card ────────────────────────────────────────────────────────────────

function Card({ title, subtitle, accent, children, className = "" }) {
  const accentBorder = accent === "emerald" ? "border-l-emerald-500" :
    accent === "sky" ? "border-l-sky-500" :
    accent === "amber" ? "border-l-amber-500" :
    accent === "rose" ? "border-l-rose-500" :
    accent === "violet" ? "border-l-violet-500" :
    "border-l-slate-600";
  return (
    <div className={`bg-th-card border border-th rounded-xl overflow-hidden ${className}`}>
      {title && (
        <div className={`border-l-2 ${accentBorder} px-5 pt-4 pb-3`}>
          <h4 className="text-xs font-semibold text-th-secondary uppercase tracking-wider">
            {title}
            {subtitle && (
              <span className="ml-2 text-[10px] font-normal text-th-faint normal-case">{subtitle}</span>
            )}
          </h4>
        </div>
      )}
      <div className="px-5 pb-4">{children}</div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <p className="text-[11px] text-th-faint mb-1 uppercase tracking-wide">{label}</p>
      <p className={`text-base font-mono font-semibold ${color || "text-th-heading"}`}>{value}</p>
    </div>
  );
}

function MetricRow({ label, children }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-th last:border-0">
      <span className="text-th-faint text-xs">{label}</span>
      <span className="font-mono text-xs">{children}</span>
    </div>
  );
}

// ─── Trade Chart with markers ───────────────────────────────────────────────────

function TradeChart({ symbol, trades, onChartReady }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [noData, setNoData] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const cs = getComputedStyle(document.documentElement);
    const chartBg = cs.getPropertyValue("--chart-bg").trim() || "#080d19";
    const chartGrid = cs.getPropertyValue("--chart-grid").trim() || "#111827";
    const textMuted = cs.getPropertyValue("--text-muted").trim() || "#64748b";

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: chartBg },
        textColor: textMuted,
        fontFamily: "'Inter', -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: chartGrid },
        horzLines: { color: chartGrid },
      },
      width: containerRef.current.clientWidth,
      height: 520,
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: chartGrid },
      rightPriceScale: { borderColor: chartGrid },
      crosshair: {
        mode: 0,
        vertLine: { color: "#334155", width: 1, style: 2 },
        horzLine: { color: "#334155", width: 1, style: 2 },
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderDownColor: "#f43f5e",
      borderUpColor: "#10b981",
      wickDownColor: "#f43f5e",
      wickUpColor: "#10b981",
    });

    fetchCandles(symbol, 2000)
      .then((candles) => {
        if (candles.length === 0) { setNoData(true); return; }
        candleSeries.setData(candles);

        if (trades && trades.length > 0) {
          const markers = [];
          for (const t of trades) {
            if (t.open_time) {
              markers.push({
                time: Math.floor(new Date(t.open_time).getTime() / 1000),
                position: "belowBar", color: "#10b981", shape: "arrowUp",
                text: `BUY ${t.lot_size ? t.lot_size.toFixed(2) : ""}`,
              });
            }
            if (t.close_time && t.result) {
              const isWin = t.result === "win";
              markers.push({
                time: Math.floor(new Date(t.close_time).getTime() / 1000),
                position: "aboveBar",
                color: isWin ? "#10b981" : "#f43f5e",
                shape: "arrowDown",
                text: isWin
                  ? `TP ${t.pnl_percent != null ? "+" + t.pnl_percent.toFixed(2) + "%" : ""}`
                  : `SL ${t.pnl_percent != null ? t.pnl_percent.toFixed(2) + "%" : ""}`,
              });
            }
          }
          markers.sort((a, b) => a.time - b.time);
          candleSeries.setMarkers(markers);
        }

        chart.timeScale().fitContent();
        if (onChartReady) onChartReady(chart);
      })
      .catch(() => setNoData(true));

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chart.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [symbol, trades]);

  if (noData) {
    return (
      <div className="bg-th-card rounded-xl p-10 text-center text-th-muted border border-th">
        No candle data available yet. Data will appear after the first Friday upload.
      </div>
    );
  }

  return <div ref={containerRef} className="rounded-xl overflow-hidden border border-th" />;
}

// ─── Equity Curve ───────────────────────────────────────────────────────────────

function EquityCurve({ trades }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !trades || trades.length === 0) return;

    const cs = getComputedStyle(document.documentElement);

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: cs.getPropertyValue("--chart-bg").trim() || "#080d19" },
        textColor: cs.getPropertyValue("--text-muted").trim() || "#64748b",
      },
      grid: {
        vertLines: { color: cs.getPropertyValue("--chart-grid").trim() || "#111827" },
        horzLines: { color: cs.getPropertyValue("--chart-grid").trim() || "#111827" },
      },
      width: containerRef.current.clientWidth,
      height: 180,
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const lineSeries = chart.addSeries(AreaSeries, {
      topColor: "rgba(16, 185, 129, 0.25)",
      bottomColor: "rgba(16, 185, 129, 0.01)",
      lineColor: "#10b981",
      lineWidth: 2,
    });

    const sorted = [...trades]
      .filter((t) => t.close_time && t.pnl_percent != null)
      .sort((a, b) => new Date(a.close_time) - new Date(b.close_time));

    let cumPnl = 0;
    const data = [{ time: Math.floor(new Date(sorted[0]?.open_time || Date.now()).getTime() / 1000), value: 0 }];
    for (const t of sorted) {
      cumPnl += t.pnl_percent;
      data.push({ time: Math.floor(new Date(t.close_time).getTime() / 1000), value: parseFloat(cumPnl.toFixed(4)) });
    }

    if (cumPnl < 0) {
      lineSeries.applyOptions({
        topColor: "rgba(244, 63, 94, 0.01)",
        bottomColor: "rgba(244, 63, 94, 0.25)",
        lineColor: "#f43f5e",
      });
    }

    lineSeries.setData(data);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chart.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, [trades]);

  if (!trades || trades.length === 0) return null;
  return <div ref={containerRef} className="rounded-xl overflow-hidden border border-th" />;
}

// ─── Performance Stats ──────────────────────────────────────────────────────────

function PerformanceStats({ trades }) {
  if (!trades || trades.length === 0) return null;
  const closed = trades.filter((t) => t.result && t.pnl_percent != null);
  if (closed.length === 0) return null;

  const wins = closed.filter((t) => t.result === "win");
  const losses = closed.filter((t) => t.result === "loss");
  const totalTrades = closed.length;
  const winRate = (wins.length / totalTrades) * 100;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl_percent, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl_percent, 0) / losses.length : 0;
  const grossWins = wins.reduce((s, t) => s + t.pnl_percent, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.pnl_percent, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;
  const bestTrade = closed.reduce((best, t) => (t.pnl_percent > (best?.pnl_percent ?? -Infinity) ? t : best), null);
  const worstTrade = closed.reduce((worst, t) => (t.pnl_percent < (worst?.pnl_percent ?? Infinity) ? t : worst), null);
  const totalPnl = closed.reduce((s, t) => s + t.pnl_percent, 0);

  const sorted = [...closed].sort((a, b) => new Date(a.close_time) - new Date(b.close_time));
  let peak = 0, cumPnl = 0, maxDD = 0;
  for (const t of sorted) {
    cumPnl += t.pnl_percent;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }

  let streak = 0, streakType = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i].result;
    if (streakType === null) { streakType = r; streak = 1; }
    else if (r === streakType) streak++;
    else break;
  }

  let totalDuration = 0, durationCount = 0;
  for (const t of closed) {
    if (t.open_time && t.close_time) {
      totalDuration += new Date(t.close_time) - new Date(t.open_time);
      durationCount++;
    }
  }
  const avgDurationHrs = durationCount > 0 ? totalDuration / durationCount / 3600000 : 0;

  return (
    <Card title="Trade Performance" accent="emerald">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Total Trades" value={totalTrades} />
        <Stat label="Win Rate" value={`${winRate.toFixed(1)}%`} color={winRate >= 50 ? "text-emerald-400" : "text-rose-400"} />
        <Stat label="Total P&L" value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}%`} color={totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"} />
        <Stat label="Profit Factor" value={profitFactor === Infinity ? "INF" : profitFactor.toFixed(2)} color={profitFactor >= 1.5 ? "text-emerald-400" : profitFactor >= 1 ? "text-amber-400" : "text-rose-400"} />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4 pt-4 border-t border-th">
        <Stat label="Avg Win" value={`+${avgWin.toFixed(2)}%`} color="text-emerald-400" />
        <Stat label="Avg Loss" value={`${avgLoss.toFixed(2)}%`} color="text-rose-400" />
        <Stat label="Best Trade" value={bestTrade ? `+${bestTrade.pnl_percent.toFixed(2)}%` : "\u2014"} color="text-emerald-400" />
        <Stat label="Worst Trade" value={worstTrade ? `${worstTrade.pnl_percent.toFixed(2)}%` : "\u2014"} color="text-rose-400" />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4 pt-4 border-t border-th">
        <Stat label="Max Drawdown" value={`-${maxDD.toFixed(2)}%`} color="text-rose-400" />
        <Stat label="Current Streak" value={`${streak} ${streakType === "win" ? "W" : "L"}`} color={streakType === "win" ? "text-emerald-400" : "text-rose-400"} />
        <Stat label="Avg Duration" value={avgDurationHrs < 24 ? `${avgDurationHrs.toFixed(1)}h` : `${(avgDurationHrs / 24).toFixed(1)}d`} />
        <Stat label="Wins / Losses" value={`${wins.length} / ${losses.length}`} />
      </div>
    </Card>
  );
}

// ─── Trade History Table ────────────────────────────────────────────────────────

function TradeTable({ trades, chartRef }) {
  if (!trades || trades.length === 0) return null;
  const closed = trades.filter((t) => t.result).sort((a, b) => new Date(b.close_time) - new Date(a.close_time));
  if (closed.length === 0) return null;

  const scrollToTrade = (t) => {
    if (!chartRef?.current) return;
    const time = Math.floor(new Date(t.open_time).getTime() / 1000);
    const closeTime = t.close_time ? Math.floor(new Date(t.close_time).getTime() / 1000) : time;
    const padding = (closeTime - time) * 0.5 || 3600 * 24;
    chartRef.current.timeScale().setVisibleRange({ from: time - padding, to: closeTime + padding });
  };

  const fmtDate = (iso) => {
    if (!iso) return "\u2014";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };
  const fmtPrice = (val) => val == null ? "\u2014" : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 });

  return (
    <div className="bg-th-card border border-th rounded-xl overflow-hidden">
      <div className="border-l-2 border-l-sky-500 px-5 pt-4 pb-3">
        <h4 className="text-xs font-semibold text-th-secondary uppercase tracking-wider">Trade History</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-th-faint uppercase tracking-wide border-b border-th">
              <th className="px-4 py-2.5 text-left font-medium">Date</th>
              <th className="px-4 py-2.5 text-right font-medium">Entry</th>
              <th className="px-4 py-2.5 text-right font-medium hidden sm:table-cell">Exit</th>
              <th className="px-4 py-2.5 text-right font-medium hidden lg:table-cell">SL</th>
              <th className="px-4 py-2.5 text-right font-medium hidden lg:table-cell">TP</th>
              <th className="px-4 py-2.5 text-right font-medium hidden md:table-cell">Lots</th>
              <th className="px-4 py-2.5 text-right font-medium">P&L</th>
              <th className="px-4 py-2.5 text-center font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {closed.map((t) => {
              const isWin = t.result === "win";
              return (
                <tr key={t.id} onClick={() => scrollToTrade(t)} className="border-b border-th/30 cursor-pointer transition-colors hover:bg-th-card-hover">
                  <td className="px-4 py-2.5 text-th-heading whitespace-nowrap">{fmtDate(t.open_time)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-th-heading">{fmtPrice(t.open_price)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-th-heading hidden sm:table-cell">{fmtPrice(t.close_price)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-rose-400/50 hidden lg:table-cell">{fmtPrice(t.sl_price)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-400/50 hidden lg:table-cell">{fmtPrice(t.tp_price)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-th-muted hidden md:table-cell">{t.lot_size ? t.lot_size.toFixed(2) : "\u2014"}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${isWin ? "text-emerald-400" : "text-rose-400"}`}>
                    {t.pnl_percent != null ? `${t.pnl_percent >= 0 ? "+" : ""}${t.pnl_percent.toFixed(2)}%` : "\u2014"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${isWin ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                      {t.result}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Parameter Heatmap ──────────────────────────────────────────────────────────

function Heatmap({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState("total_return");

  const loadHeatmap = () => {
    setLoading(true);
    fetchHeatmap(symbol)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  if (!data && !loading) {
    return (
      <Card title="Parameter Heatmap" accent="violet">
        <p className="text-sm text-th-muted mb-3">
          Visualize backtest returns across all SL% / TP% combinations at the optimal entry hour.
        </p>
        <button
          onClick={loadHeatmap}
          className="px-4 py-2 rounded-lg bg-violet-500/15 text-violet-400 text-sm hover:bg-violet-500/25 transition-colors"
        >
          Generate Heatmap
        </button>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="Parameter Heatmap" accent="violet">
        <p className="text-sm text-th-muted">Running backtest grid... this may take a few seconds.</p>
      </Card>
    );
  }

  if (!data) return null;

  // Build grid matrix
  const slValues = [...new Set(data.grid.map((c) => c.sl_pct))].sort((a, b) => a - b);
  const tpValues = [...new Set(data.grid.map((c) => c.tp_pct))].sort((a, b) => a - b);
  const cellMap = {};
  for (const c of data.grid) {
    cellMap[`${c.sl_pct}_${c.tp_pct}`] = c;
  }

  const values = data.grid.map((c) => c[metric]);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const cellColor = (val) => {
    const normalized = (val - minVal) / range;
    if (metric === "total_return") {
      if (val <= 0) return `rgba(244, 63, 94, ${Math.min(Math.abs(val) / (Math.abs(minVal) || 1) * 0.6, 0.6)})`;
      return `rgba(16, 185, 129, ${Math.min(normalized * 0.6, 0.6)})`;
    }
    return `rgba(59, 130, 246, ${Math.min(normalized * 0.5 + 0.1, 0.6)})`;
  };

  return (
    <Card title="Parameter Heatmap" subtitle={`Entry ${String(data.entry_hour).padStart(2, "0")}:00`} accent="violet">
      {/* Metric selector */}
      <div className="flex gap-2 mb-4">
        {[
          { id: "total_return", label: "Return %" },
          { id: "win_rate", label: "Win Rate" },
          { id: "profit_factor", label: "Profit Factor" },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            className={`text-xs px-3 py-1 rounded-md transition-colors ${
              metric === m.id ? "bg-th-surface text-th-heading" : "text-th-muted hover:text-th-secondary"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-th-faint font-normal">SL \ TP</th>
              {tpValues.map((tp) => (
                <th key={tp} className="px-2 py-1 text-th-muted font-mono font-normal text-center">{tp}%</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slValues.map((sl) => (
              <tr key={sl}>
                <td className="px-2 py-1 text-th-muted font-mono">{sl}%</td>
                {tpValues.map((tp) => {
                  const cell = cellMap[`${sl}_${tp}`];
                  if (!cell) return <td key={tp} className="px-2 py-1" />;
                  const val = cell[metric];
                  return (
                    <td
                      key={tp}
                      className="px-2 py-1 text-center font-mono text-th-heading rounded"
                      style={{ backgroundColor: cellColor(val) }}
                      title={`SL ${sl}% / TP ${tp}%: Return ${cell.total_return}%, WR ${cell.win_rate}%, PF ${cell.profit_factor}`}
                    >
                      {metric === "total_return" ? `${val >= 0 ? "+" : ""}${val.toFixed(0)}` :
                       metric === "win_rate" ? `${val.toFixed(0)}` :
                       val.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Entry hour returns */}
      {data.entry_hour_returns.length > 0 && (
        <div className="mt-4 pt-4 border-t border-th">
          <p className="text-[11px] text-th-faint uppercase tracking-wide mb-2">Return by Entry Hour</p>
          <div className="flex gap-1 items-end h-20">
            {data.entry_hour_returns.map((h) => {
              const maxReturn = Math.max(...data.entry_hour_returns.map((r) => Math.abs(r.total_return)), 1);
              const heightPct = Math.min(Math.abs(h.total_return) / maxReturn * 100, 100);
              const isPositive = h.total_return >= 0;
              return (
                <div key={h.hour} className="flex flex-col items-center flex-1 min-w-0" title={`${h.hour}:00 → ${h.total_return >= 0 ? "+" : ""}${h.total_return.toFixed(1)}%`}>
                  <div className="w-full flex items-end justify-center h-14">
                    <div
                      className={`w-full max-w-[20px] rounded-t-sm ${isPositive ? "bg-emerald-500/40" : "bg-rose-500/40"}`}
                      style={{ height: `${heightPct}%`, minHeight: "2px" }}
                    />
                  </div>
                  <span className="text-[9px] text-th-faint mt-1 font-mono">{h.hour}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={loadHeatmap}
        className="mt-3 text-xs text-th-faint hover:text-th-secondary transition-colors"
      >
        Refresh
      </button>
    </Card>
  );
}

// ─── Tab Navigation ─────────────────────────────────────────────────────────────

const TABS = [
  { id: "chart", label: "Chart & Trades" },
  { id: "backtest", label: "Backtest" },
  { id: "fundamentals", label: "Fundamentals" },
];

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function MarketDetail({ markets }) {
  const { symbol } = useParams();
  const [analytics, setAnalytics] = useState(null);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overriding, setOverriding] = useState(false);
  const [regionOutlook, setRegionOutlook] = useState(null);
  const [events, setEvents] = useState([]);
  const [aiPrediction, setAiPrediction] = useState(null);
  const [activeTab, setActiveTab] = useState("chart");
  const chartInstanceRef = useRef(null);

  const market = markets.find((m) => m.symbol === symbol);
  const region = SYMBOL_REGION[symbol];

  const refreshAnalytics = () => {
    fetchSymbolAnalytics(symbol).then(setAnalytics).catch((e) => {
      if (e.message.includes("404")) setAnalytics(null);
      else setError(e.message);
    });
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    setActiveTab("chart");
    Promise.all([
      fetchSymbolAnalytics(symbol).catch(() => null),
      fetchTrades(symbol).catch(() => []),
      fetchFundamental().catch(() => []),
      fetchFundamentalEvents().catch(() => []),
      fetchAIPredictions().catch(() => []),
    ])
      .then(([analyticsData, tradesData, outlooks, evts, aiData]) => {
        setAnalytics(analyticsData);
        setTrades(tradesData);
        const match = (outlooks || []).find((o) => o.region === region);
        if (match) setRegionOutlook(match);
        setEvents((evts || []).filter((e) => e.region === region));
        const aiMatch = (aiData || []).find((p) => p.symbol === symbol);
        if (aiMatch) setAiPrediction(aiMatch);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol, region]);

  const handleOverride = (active) => {
    setOverriding(true);
    overrideMarket(symbol, active)
      .then(() => refreshAnalytics())
      .catch((e) => setError(e.message))
      .finally(() => setOverriding(false));
  };

  const a = analytics;

  return (
    <div>
      {/* Back link */}
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-th-faint hover:text-th-heading mb-5 transition-colors">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back to overview
      </Link>

      {/* ─── Sticky Hero Header ─── */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-4 pt-1 bg-th-base/95 backdrop-blur-sm">
        <div className="bg-th-card border border-th rounded-xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold text-th-heading tracking-tight">{symbol}</h2>
            {market && <span className="text-sm text-th-muted hidden sm:inline">{market.name}</span>}
            {market && (
              <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded-md bg-th-surface text-th-muted tracking-wide">
                {market.category}
              </span>
            )}

            {/* Score badge */}
            {a?.final_score != null ? (
              <span className={`text-sm font-bold font-mono px-3 py-1 rounded-lg border ${scoreBg(a.final_score)} ${scoreColor(a.final_score)}`}>
                {a.final_score.toFixed(1)}
              </span>
            ) : a?.technical_score != null ? (
              <span className={`text-sm font-bold font-mono px-3 py-1 rounded-lg border ${scoreBg(a.technical_score)} ${scoreColor(a.technical_score)}`}>
                {a.technical_score.toFixed(1)}
              </span>
            ) : null}
            {a?.rank != null && <span className="text-xs text-th-faint font-mono">Rank #{a.rank}</span>}

            {/* Status + override buttons */}
            {a && (
              <div className="flex items-center gap-2 ml-auto">
                {a.is_active ? (
                  <>
                    <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-400 tracking-wide">Active</span>
                    <button onClick={() => handleOverride(false)} disabled={overriding}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-th-surface hover:bg-rose-500/15 text-th-muted hover:text-rose-400 transition-colors disabled:opacity-50">
                      {overriding ? "..." : "Deactivate"}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-md bg-th-surface text-th-faint tracking-wide">Inactive</span>
                    <button onClick={() => handleOverride(true)} disabled={overriding}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-th-surface hover:bg-emerald-500/15 text-th-muted hover:text-emerald-400 transition-colors disabled:opacity-50">
                      {overriding ? "..." : "Activate"}
                    </button>
                  </>
                )}
                {a.is_manually_overridden && (
                  <>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500">Manual</span>
                    <button onClick={() => handleOverride(null)} disabled={overriding}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-th-surface hover:bg-th-card-hover text-th-muted hover:text-th-heading transition-colors disabled:opacity-50">
                      Clear Override
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Price + Tab bar in a row */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            {a?.current_price != null && (
              <p className="text-2xl sm:text-3xl font-mono font-bold text-th-heading tracking-tight">
                {a.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {a?.change_1w != null && (
                  <span className={`text-sm font-medium ml-3 ${pctColor(a.change_1w)}`}>
                    {pctPrefix(a.change_1w)} <span className="text-th-faint text-xs">1W</span>
                  </span>
                )}
              </p>
            )}

            {/* Tab bar */}
            <div className="flex gap-1 bg-th-surface/50 rounded-lg p-0.5">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    activeTab === tab.id
                      ? "bg-th-card text-th-heading font-medium shadow-sm"
                      : "text-th-muted hover:text-th-secondary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading && <p className="text-th-muted mb-4">Loading analytics...</p>}
      {error && <p className="text-rose-400 bg-rose-950/50 border border-rose-500/20 px-4 py-3 rounded-xl mb-5 text-sm">{error}</p>}

      {/* ─── Tab: Chart & Trades ─── */}
      {activeTab === "chart" && (
        <div className="grid grid-cols-1 2xl:grid-cols-[1fr_420px] gap-6">
          <div className="space-y-6 min-w-0">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-th-secondary uppercase tracking-wider">H1 Chart</h3>
                {trades.length > 0 && <span className="text-[11px] text-th-faint">{trades.filter((t) => t.result).length} trades plotted</span>}
              </div>
              <TradeChart symbol={symbol} trades={trades} onChartReady={(chart) => { chartInstanceRef.current = chart; }} />
            </div>

            {trades.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-th-secondary uppercase tracking-wider mb-3">Equity Curve</h3>
                <EquityCurve trades={trades} />
              </div>
            )}

            <PerformanceStats trades={trades} />
            <TradeTable trades={trades} chartRef={chartInstanceRef} />
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {a?.opt_entry_hour != null && (
              <Card title="Current Week Config" subtitle={a.week_start} accent="sky">
                <MetricRow label="Entry Time">
                  <span className="text-th-heading font-semibold">
                    {String(a.opt_entry_hour ?? 0).padStart(2, "0")}:{String(a.opt_entry_minute ?? 0).padStart(2, "0")}
                  </span>
                </MetricRow>
                <MetricRow label="Stop Loss"><span className="text-rose-400">{fmt(a.opt_sl_percent)}%</span></MetricRow>
                <MetricRow label="Take Profit"><span className="text-emerald-400">{fmt(a.opt_tp_percent)}%</span></MetricRow>
                <MetricRow label="Status">
                  <span className={a.is_active ? "text-emerald-400" : "text-th-faint"}>
                    {a.is_active ? "Active" : "Inactive"}{a.rank != null && ` (#${a.rank})`}
                  </span>
                </MetricRow>
                <MetricRow label="Param Stability">
                  <span className={(a.bt_param_stability ?? 0) < 50 ? "text-amber-400" : "text-emerald-400"}>
                    {fmt(a.bt_param_stability, 0)}%
                  </span>
                </MetricRow>
              </Card>
            )}

            {a && (
              <Card title="Daily Statistics" accent="sky">
                <MetricRow label="Avg daily growth"><span className="text-emerald-400">+{fmt(a.avg_daily_growth, 3)}%</span></MetricRow>
                <MetricRow label="Avg daily loss"><span className="text-rose-400">{fmt(a.avg_daily_loss, 3)}%</span></MetricRow>
                <MetricRow label="Most bullish day"><span className="text-emerald-400">+{fmt(a.most_bullish_day)}%</span></MetricRow>
                <MetricRow label="Most bearish day"><span className="text-rose-400">{fmt(a.most_bearish_day)}%</span></MetricRow>
                <MetricRow label="Up-day win rate"><span className="text-sky-400">{fmt(a.up_day_win_rate, 1)}%</span></MetricRow>
                <div className="mt-2">
                  <div className="w-full bg-th-surface rounded-full h-1.5">
                    <div className="bg-sky-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(a.up_day_win_rate || 0, 100)}%` }} />
                  </div>
                </div>
              </Card>
            )}

            {a && (
              <Card title="Trend & Momentum" accent="emerald">
                {[
                  { label: "vs SMA(20)", sma: a.sma_20 },
                  { label: "vs SMA(50)", sma: a.sma_50 },
                  { label: "vs SMA(200)", sma: a.sma_200 },
                ].map(({ label, sma }) => {
                  const s = smaStatus(a.current_price, sma);
                  return <MetricRow key={label} label={label}><span className={s.color}>{s.label}</span></MetricRow>;
                })}
                <MetricRow label="RSI(14)"><span className={rsiColor(a.rsi_14)}>{fmt(a.rsi_14, 1)} {rsiLabel(a.rsi_14)}</span></MetricRow>
                <MetricRow label="Daily range"><span className="text-th-heading">{fmt(a.daily_range_pct, 3)}%</span></MetricRow>
                <MetricRow label="ATR(14)"><span className="text-th-heading">{fmt(a.atr_14)}</span></MetricRow>
              </Card>
            )}

            {a && (
              <Card title="Price Changes" accent="rose">
                {[
                  { label: "1 week", val: a.change_1w },
                  { label: "2 weeks", val: a.change_2w },
                  { label: "1 month", val: a.change_1m },
                  { label: "3 months", val: a.change_3m },
                ].map(({ label, val }) => (
                  <MetricRow key={label} label={label}><span className={pctColor(val)}>{pctPrefix(val)}</span></MetricRow>
                ))}
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: Backtest ─── */}
      {activeTab === "backtest" && (
        <div className="space-y-6">
          {a?.bt_total_return != null && (
            <Card title="Backtest Results (2-Year)" accent="violet">
              <p className="text-sm text-th-muted mb-4 leading-relaxed">
                If you entered every day at{" "}
                <span className="font-mono text-th-heading">{String(a.opt_entry_hour ?? 0).padStart(2, "0")}:00</span>{" "}
                with SL <span className="font-mono text-th-heading">{fmt(a.opt_sl_percent, 1)}%</span>{" "}
                and TP <span className="font-mono text-th-heading">{fmt(a.opt_tp_percent, 1)}%</span>,
                you would have made{" "}
                <span className={`font-mono font-bold ${a.bt_total_return >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {a.bt_total_return >= 0 ? "+" : ""}{fmt(a.bt_total_return, 1)}%
                </span>{" "}
                over 2 years with a{" "}
                <span className="font-mono text-th-heading">{fmt(a.bt_win_rate, 1)}%</span> win rate and{" "}
                <span className="font-mono text-th-heading">{fmt(a.bt_profit_factor)}</span> profit factor.
              </p>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <Stat label="Total Return" value={`${a.bt_total_return >= 0 ? "+" : ""}${fmt(a.bt_total_return, 1)}%`} color={a.bt_total_return >= 0 ? "text-emerald-400" : "text-rose-400"} />
                <Stat label="Win Rate" value={`${fmt(a.bt_win_rate, 1)}%`} color="text-sky-400" />
                <Stat label="Profit Factor" value={fmt(a.bt_profit_factor)} />
                <Stat label="Max Drawdown" value={`-${fmt(a.bt_max_drawdown, 1)}%`} color="text-rose-400" />
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4 pt-4 border-t border-th">
                <Stat label="Entry Hour" value={`${String(a.opt_entry_hour ?? 0).padStart(2, "0")}:00`} />
                <Stat label="Stop Loss" value={`${fmt(a.opt_sl_percent, 2)}%`} />
                <Stat label="Take Profit" value={`${fmt(a.opt_tp_percent, 2)}%`} />
                <Stat label="Total Trades" value={a.bt_total_trades} />
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mt-4 pt-4 border-t border-th">
                <Stat label="Technical (50%)" value={fmt(a.technical_score, 1)} color={scoreColor(a.technical_score ?? 0)} />
                <Stat label="Backtest (35%)" value={fmt(a.backtest_score, 1)} color={scoreColor(a.backtest_score ?? 0)} />
                <Stat label="Fundamental (15%)" value={fmt(a.fundamental_score, 1)} color={scoreColor(a.fundamental_score ?? 0)} />
                <Stat label="Final Score" value={fmt(a.final_score, 1)} color={scoreColor(a.final_score ?? 0)} />
                <div>
                  <p className="text-[11px] text-th-faint mb-1 uppercase tracking-wide">Param Stability</p>
                  <p className={`text-base font-mono font-semibold ${(a.bt_param_stability ?? 0) < 50 ? "text-amber-400" : "text-emerald-400"}`}>
                    {fmt(a.bt_param_stability, 0)}%
                    {(a.bt_param_stability ?? 100) < 50 && <span className="ml-1 text-[10px] text-amber-500">Unreliable</span>}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Heatmap symbol={symbol} />
        </div>
      )}

      {/* ─── Tab: Fundamentals ─── */}
      {activeTab === "fundamentals" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {aiPrediction && (
            <Card title="AI Market Analysis" subtitle={aiPrediction.updated_at ? new Date(aiPrediction.updated_at).toLocaleDateString() : ""} accent="violet">
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-md tracking-wide ${
                  aiPrediction.prediction === "bullish" ? "bg-emerald-500/15 text-emerald-400" :
                  aiPrediction.prediction === "bearish" ? "bg-rose-500/15 text-rose-400" :
                  "bg-th-surface text-th-muted"
                }`}>
                  {aiPrediction.prediction}
                </span>
                {aiPrediction.score != null && (
                  <span className="text-xs text-th-muted">
                    <span className={`font-mono font-bold ${scoreColor(aiPrediction.score)}`}>{aiPrediction.score.toFixed(0)}</span>
                    <span className="text-th-faint">/100</span>
                  </span>
                )}
              </div>
              {aiPrediction.reasoning && (
                <p className="text-xs text-th-muted leading-relaxed">{aiPrediction.reasoning}</p>
              )}
            </Card>
          )}

          {regionOutlook && (
            <Card title="Fundamental Outlook" subtitle={`Region: ${region}`} accent="amber">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-th-faint mb-0.5 uppercase">Central Bank</p>
                  <p className={`text-xs font-mono ${stanceColor(regionOutlook.cb_stance)}`}>{STANCE_LABELS[String(regionOutlook.cb_stance)]}</p>
                </div>
                <div>
                  <p className="text-[10px] text-th-faint mb-0.5 uppercase">Growth</p>
                  <p className={`text-xs font-mono ${stanceColor(regionOutlook.growth_outlook)}`}>{GROWTH_LABELS[String(regionOutlook.growth_outlook)]}</p>
                </div>
                <div>
                  <p className="text-[10px] text-th-faint mb-0.5 uppercase">Inflation</p>
                  <p className={`text-xs font-mono ${stanceColor(regionOutlook.inflation_trend === -1 ? 1 : regionOutlook.inflation_trend === 1 ? -1 : 0)}`}>{INFLATION_LABELS[String(regionOutlook.inflation_trend)]}</p>
                </div>
                <div>
                  <p className="text-[10px] text-th-faint mb-0.5 uppercase">Risk Sentiment</p>
                  <p className={`text-xs font-mono ${stanceColor(regionOutlook.risk_sentiment)}`}>{RISK_LABELS[String(regionOutlook.risk_sentiment)]}</p>
                </div>
              </div>
              {regionOutlook.notes && (
                <p className="mt-3 pt-3 border-t border-th text-xs text-th-muted leading-relaxed">{regionOutlook.notes}</p>
              )}
              {events.length > 0 && (
                <div className="mt-3 pt-3 border-t border-th">
                  <p className="text-[10px] text-th-faint mb-2 uppercase">Upcoming Events</p>
                  <div className="space-y-1.5">
                    {events.map((evt) => (
                      <div key={evt.id} className="flex items-center gap-2 text-[11px]">
                        <span className="text-th-faint font-mono">{evt.event_date}</span>
                        <span className={
                          evt.impact === "high" ? "px-1 rounded bg-rose-500/15 text-rose-400" :
                          evt.impact === "medium" ? "px-1 rounded bg-amber-500/15 text-amber-400" :
                          "px-1 rounded bg-th-surface text-th-muted"
                        }>{evt.impact}</span>
                        <span className="text-th-heading">{evt.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {!aiPrediction && !regionOutlook && (
            <div className="bg-th-card border border-th rounded-xl p-8 text-center text-th-muted col-span-full">
              No fundamental data available yet.
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {a && (
        <p className="text-[11px] text-th-faint text-center mt-8">
          Based on {a.daily_bar_count} daily bars from {a.candle_count.toLocaleString()} H1 candles &middot; Week of {a.week_start}
        </p>
      )}

      {!loading && !error && !a && trades.length === 0 && (
        <div className="bg-th-card border border-th rounded-xl p-10 text-center text-th-muted mt-6">
          No analytics data available yet. Run the analysis after candle data has been uploaded.
        </div>
      )}
    </div>
  );
}
