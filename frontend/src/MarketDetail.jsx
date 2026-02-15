import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { createChart, CandlestickSeries, AreaSeries } from "lightweight-charts";
import { fetchSymbolAnalytics, fetchCandles, fetchTrades, overrideMarket, fetchFundamental, fetchFundamentalEvents, fetchAIPredictions } from "./api";

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
  return "text-slate-400";
}

function fmt(val, decimals = 2) {
  if (val == null) return "\u2014";
  return val.toFixed(decimals);
}

function pctColor(val) {
  if (val == null) return "text-slate-500";
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
  if (current == null || sma == null) return { label: "\u2014", color: "text-slate-500" };
  const diff = ((current - sma) / sma) * 100;
  const above = current > sma;
  return {
    label: `${above ? "Above" : "Below"} (${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%)`,
    color: above ? "text-emerald-400" : "text-rose-400",
  };
}

function rsiColor(rsi) {
  if (rsi == null) return "text-slate-500";
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
    <div className={`bg-[#0c1322] border border-slate-800/60 rounded-xl overflow-hidden ${className}`}>
      {title && (
        <div className={`border-l-2 ${accentBorder} px-5 pt-4 pb-3`}>
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            {title}
            {subtitle && (
              <span className="ml-2 text-[10px] font-normal text-slate-500 normal-case">{subtitle}</span>
            )}
          </h4>
        </div>
      )}
      <div className="px-5 pb-4">{children}</div>
    </div>
  );
}

// ─── Stat cell ──────────────────────────────────────────────────────────────────

function Stat({ label, value, color }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500 mb-1 uppercase tracking-wide">{label}</p>
      <p className={`text-base font-mono font-semibold ${color || "text-slate-200"}`}>{value}</p>
    </div>
  );
}

// ─── Metric Row helper ──────────────────────────────────────────────────────────

function MetricRow({ label, children }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0">
      <span className="text-slate-500 text-xs">{label}</span>
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

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#080d19" },
        textColor: "#64748b",
        fontFamily: "'Inter', -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: "#111827" },
        horzLines: { color: "#111827" },
      },
      width: containerRef.current.clientWidth,
      height: 520,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#1e293b",
      },
      rightPriceScale: {
        borderColor: "#1e293b",
      },
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
        if (candles.length === 0) {
          setNoData(true);
          return;
        }
        candleSeries.setData(candles);

        if (trades && trades.length > 0) {
          const markers = [];
          for (const t of trades) {
            if (t.open_time) {
              markers.push({
                time: Math.floor(new Date(t.open_time).getTime() / 1000),
                position: "belowBar",
                color: "#10b981",
                shape: "arrowUp",
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

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [symbol, trades]);

  if (noData) {
    return (
      <div className="bg-[#0c1322] rounded-xl p-10 text-center text-slate-500 border border-slate-800/60">
        No candle data available yet. Data will appear after the first Friday upload.
      </div>
    );
  }

  return <div ref={containerRef} className="rounded-xl overflow-hidden border border-slate-800/60" />;
}

// ─── Equity Curve ───────────────────────────────────────────────────────────────

function EquityCurve({ trades }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !trades || trades.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#080d19" },
        textColor: "#64748b",
        fontFamily: "'Inter', -apple-system, sans-serif",
      },
      grid: {
        vertLines: { color: "#111827" },
        horzLines: { color: "#111827" },
      },
      width: containerRef.current.clientWidth,
      height: 180,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#1e293b",
      },
      rightPriceScale: {
        borderColor: "#1e293b",
      },
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
      data.push({
        time: Math.floor(new Date(t.close_time).getTime() / 1000),
        value: parseFloat(cumPnl.toFixed(4)),
      });
    }

    const isNegative = cumPnl < 0;
    if (isNegative) {
      lineSeries.applyOptions({
        topColor: "rgba(244, 63, 94, 0.01)",
        bottomColor: "rgba(244, 63, 94, 0.25)",
        lineColor: "#f43f5e",
      });
    }

    lineSeries.setData(data);
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [trades]);

  if (!trades || trades.length === 0) return null;

  return <div ref={containerRef} className="rounded-xl overflow-hidden border border-slate-800/60" />;
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
  let peak = 0;
  let cumPnl = 0;
  let maxDD = 0;
  for (const t of sorted) {
    cumPnl += t.pnl_percent;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }

  let streak = 0;
  let streakType = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i].result;
    if (streakType === null) {
      streakType = r;
      streak = 1;
    } else if (r === streakType) {
      streak++;
    } else {
      break;
    }
  }

  let totalDuration = 0;
  let durationCount = 0;
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
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-800/50">
        <Stat label="Avg Win" value={`+${avgWin.toFixed(2)}%`} color="text-emerald-400" />
        <Stat label="Avg Loss" value={`${avgLoss.toFixed(2)}%`} color="text-rose-400" />
        <Stat label="Best Trade" value={bestTrade ? `+${bestTrade.pnl_percent.toFixed(2)}%` : "\u2014"} color="text-emerald-400" />
        <Stat label="Worst Trade" value={worstTrade ? `${worstTrade.pnl_percent.toFixed(2)}%` : "\u2014"} color="text-rose-400" />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-800/50">
        <Stat label="Max Drawdown" value={`-${maxDD.toFixed(2)}%`} color="text-rose-400" />
        <Stat
          label="Current Streak"
          value={`${streak} ${streakType === "win" ? "W" : "L"}`}
          color={streakType === "win" ? "text-emerald-400" : "text-rose-400"}
        />
        <Stat label="Avg Duration" value={avgDurationHrs < 24 ? `${avgDurationHrs.toFixed(1)}h` : `${(avgDurationHrs / 24).toFixed(1)}d`} />
        <Stat label="Wins / Losses" value={`${wins.length} / ${losses.length}`} />
      </div>
    </Card>
  );
}

// ─── Trade History Table ────────────────────────────────────────────────────────

function TradeTable({ trades, chartRef }) {
  if (!trades || trades.length === 0) return null;

  const closed = trades
    .filter((t) => t.result)
    .sort((a, b) => new Date(b.close_time) - new Date(a.close_time));

  if (closed.length === 0) return null;

  const scrollToTrade = (t) => {
    if (!chartRef?.current) return;
    const time = Math.floor(new Date(t.open_time).getTime() / 1000);
    const closeTime = t.close_time ? Math.floor(new Date(t.close_time).getTime() / 1000) : time;
    const padding = (closeTime - time) * 0.5 || 3600 * 24;
    chartRef.current.timeScale().setVisibleRange({
      from: time - padding,
      to: closeTime + padding,
    });
  };

  const fmtDate = (iso) => {
    if (!iso) return "\u2014";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
      " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  const fmtPrice = (val) => {
    if (val == null) return "\u2014";
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 });
  };

  return (
    <div className="bg-[#0c1322] border border-slate-800/60 rounded-xl overflow-hidden">
      <div className="border-l-2 border-l-sky-500 px-5 pt-4 pb-3">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Trade History</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-500 uppercase tracking-wide border-b border-slate-800/60">
              <th className="px-4 py-2.5 text-left font-medium">Date</th>
              <th className="px-4 py-2.5 text-right font-medium">Entry</th>
              <th className="px-4 py-2.5 text-right font-medium">Exit</th>
              <th className="px-4 py-2.5 text-right font-medium">SL</th>
              <th className="px-4 py-2.5 text-right font-medium">TP</th>
              <th className="px-4 py-2.5 text-right font-medium">Lots</th>
              <th className="px-4 py-2.5 text-right font-medium">P&L</th>
              <th className="px-4 py-2.5 text-center font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {closed.map((t) => {
              const isWin = t.result === "win";
              return (
                <tr
                  key={t.id}
                  onClick={() => scrollToTrade(t)}
                  className="border-b border-slate-800/30 cursor-pointer transition-colors hover:bg-slate-800/30"
                >
                  <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{fmtDate(t.open_time)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-300">{fmtPrice(t.open_price)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-300">{fmtPrice(t.close_price)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-rose-400/50">{fmtPrice(t.sl_price)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-400/50">{fmtPrice(t.tp_price)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-400">{t.lot_size ? t.lot_size.toFixed(2) : "\u2014"}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${isWin ? "text-emerald-400" : "text-rose-400"}`}>
                    {t.pnl_percent != null ? `${t.pnl_percent >= 0 ? "+" : ""}${t.pnl_percent.toFixed(2)}%` : "\u2014"}
                    {t.pnl_amount != null && (
                      <span className="text-xs text-slate-500 ml-1">
                        (${t.pnl_amount >= 0 ? "+" : ""}{t.pnl_amount.toFixed(0)})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                      isWin ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                    }`}>
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
  const chartInstanceRef = useRef(null);

  const market = markets.find((m) => m.symbol === symbol);
  const region = SYMBOL_REGION[symbol];

  const refreshAnalytics = () => {
    fetchSymbolAnalytics(symbol)
      .then(setAnalytics)
      .catch((e) => {
        if (e.message.includes("404")) setAnalytics(null);
        else setError(e.message);
      });
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
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
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-200 mb-5 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back to overview
      </Link>

      {/* ─── Hero Header ─── */}
      <div className="bg-[#0c1322] border border-slate-800/60 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-2xl font-bold text-white tracking-tight">{symbol}</h2>
          {market && <span className="text-sm text-slate-400">{market.name}</span>}
          {market && (
            <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 tracking-wide">
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
          {a?.rank != null && (
            <span className="text-xs text-slate-500 font-mono">
              Rank #{a.rank}
            </span>
          )}

          {/* Status + override buttons */}
          {a && (
            <div className="flex items-center gap-2 ml-auto">
              {a.is_active ? (
                <>
                  <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-400 tracking-wide">
                    Active
                  </span>
                  <button
                    onClick={() => handleOverride(false)}
                    disabled={overriding}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-slate-800 hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-50"
                  >
                    {overriding ? "..." : "Deactivate"}
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-md bg-slate-800 text-slate-500 tracking-wide">
                    Inactive
                  </span>
                  <button
                    onClick={() => handleOverride(true)}
                    disabled={overriding}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-slate-800 hover:bg-emerald-500/15 text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
                  >
                    {overriding ? "..." : "Activate"}
                  </button>
                </>
              )}
              {a.is_manually_overridden && (
                <>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500">
                    Manual
                  </span>
                  <button
                    onClick={() => handleOverride(null)}
                    disabled={overriding}
                    className="text-[11px] px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
                  >
                    Clear Override
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Price row */}
        {a?.current_price != null && (
          <p className="text-3xl font-mono font-bold text-white tracking-tight">
            {a.current_price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            {a?.change_1w != null && (
              <span className={`text-sm font-medium ml-3 ${pctColor(a.change_1w)}`}>
                {pctPrefix(a.change_1w)} <span className="text-slate-600 text-xs">1W</span>
              </span>
            )}
          </p>
        )}
      </div>

      {loading && <p className="text-slate-400 mb-4">Loading analytics...</p>}
      {error && (
        <p className="text-rose-400 bg-rose-950/50 border border-rose-500/20 px-4 py-3 rounded-xl mb-5 text-sm">{error}</p>
      )}

      {/* ─── Two-Column Layout ─── */}
      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_420px] gap-6">

        {/* ─── LEFT COLUMN: Charts, Performance, Backtest, Trade Table ─── */}
        <div className="space-y-6 min-w-0">

          {/* Chart */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">H1 Chart</h3>
              {trades.length > 0 && (
                <span className="text-[11px] text-slate-500">
                  {trades.filter((t) => t.result).length} trades plotted
                </span>
              )}
            </div>
            <TradeChart
              symbol={symbol}
              trades={trades}
              onChartReady={(chart) => { chartInstanceRef.current = chart; }}
            />
          </div>

          {/* Equity Curve */}
          {trades.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Equity Curve</h3>
              <EquityCurve trades={trades} />
            </div>
          )}

          {/* Performance Stats */}
          <PerformanceStats trades={trades} />

          {/* Backtest Results */}
          {a?.bt_total_return != null && (
            <Card title="Backtest Results (2-Year)" accent="violet">
              <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                If you entered every day at{" "}
                <span className="font-mono text-slate-200">
                  {String(a.opt_entry_hour ?? 0).padStart(2, "0")}:00
                </span>{" "}
                with SL{" "}
                <span className="font-mono text-slate-200">{fmt(a.opt_sl_percent, 1)}%</span>{" "}
                and TP{" "}
                <span className="font-mono text-slate-200">{fmt(a.opt_tp_percent, 1)}%</span>
                , you would have made{" "}
                <span className={`font-mono font-bold ${a.bt_total_return >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {a.bt_total_return >= 0 ? "+" : ""}{fmt(a.bt_total_return, 1)}%
                </span>{" "}
                over 2 years with a{" "}
                <span className="font-mono text-slate-200">{fmt(a.bt_win_rate, 1)}%</span>{" "}
                win rate and{" "}
                <span className="font-mono text-slate-200">{fmt(a.bt_profit_factor)}</span>{" "}
                profit factor.
              </p>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <Stat label="Total Return" value={`${a.bt_total_return >= 0 ? "+" : ""}${fmt(a.bt_total_return, 1)}%`} color={a.bt_total_return >= 0 ? "text-emerald-400" : "text-rose-400"} />
                <Stat label="Win Rate" value={`${fmt(a.bt_win_rate, 1)}%`} color="text-sky-400" />
                <Stat label="Profit Factor" value={fmt(a.bt_profit_factor)} />
                <Stat label="Max Drawdown" value={`-${fmt(a.bt_max_drawdown, 1)}%`} color="text-rose-400" />
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-800/50">
                <Stat label="Entry Hour" value={`${String(a.opt_entry_hour ?? 0).padStart(2, "0")}:00`} />
                <Stat label="Stop Loss" value={`${fmt(a.opt_sl_percent, 2)}%`} />
                <Stat label="Take Profit" value={`${fmt(a.opt_tp_percent, 2)}%`} />
                <Stat label="Total Trades" value={a.bt_total_trades} />
              </div>

              {/* Scores row */}
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mt-4 pt-4 border-t border-slate-800/50">
                <Stat label="Technical (50%)" value={fmt(a.technical_score, 1)} color={scoreColor(a.technical_score ?? 0)} />
                <Stat label="Backtest (35%)" value={fmt(a.backtest_score, 1)} color={scoreColor(a.backtest_score ?? 0)} />
                <Stat label="Fundamental (15%)" value={fmt(a.fundamental_score, 1)} color={scoreColor(a.fundamental_score ?? 0)} />
                <Stat label="Final Score" value={fmt(a.final_score, 1)} color={scoreColor(a.final_score ?? 0)} />
                <div>
                  <p className="text-[11px] text-slate-500 mb-1 uppercase tracking-wide">Param Stability</p>
                  <p className={`text-base font-mono font-semibold ${(a.bt_param_stability ?? 0) < 50 ? "text-amber-400" : "text-emerald-400"}`}>
                    {fmt(a.bt_param_stability, 0)}%
                    {(a.bt_param_stability ?? 100) < 50 && (
                      <span className="ml-1 text-[10px] text-amber-500">Unreliable</span>
                    )}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Trade History Table */}
          <TradeTable trades={trades} chartRef={chartInstanceRef} />
        </div>

        {/* ─── RIGHT COLUMN: Sidebar Cards ─── */}
        <div className="space-y-5">

          {/* Current Week Config */}
          {a?.opt_entry_hour != null && (
            <Card title="Current Week Config" subtitle={a.week_start} accent="sky">
              <MetricRow label="Entry Time">
                <span className="text-white font-semibold">
                  {String(a.opt_entry_hour ?? 0).padStart(2, "0")}:
                  {String(a.opt_entry_minute ?? 0).padStart(2, "0")}
                </span>
              </MetricRow>
              <MetricRow label="Stop Loss">
                <span className="text-rose-400">{fmt(a.opt_sl_percent)}%</span>
              </MetricRow>
              <MetricRow label="Take Profit">
                <span className="text-emerald-400">{fmt(a.opt_tp_percent)}%</span>
              </MetricRow>
              <MetricRow label="Status">
                <span className={a.is_active ? "text-emerald-400" : "text-slate-500"}>
                  {a.is_active ? "Active" : "Inactive"}
                  {a.rank != null && ` (#${a.rank})`}
                </span>
              </MetricRow>
              <MetricRow label="Param Stability">
                <span className={(a.bt_param_stability ?? 0) < 50 ? "text-amber-400" : "text-emerald-400"}>
                  {fmt(a.bt_param_stability, 0)}%
                </span>
              </MetricRow>
            </Card>
          )}

          {/* AI Market Prediction */}
          {aiPrediction && (
            <Card title="AI Market Analysis" subtitle={aiPrediction.updated_at ? new Date(aiPrediction.updated_at).toLocaleDateString() : ""} accent="violet">
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-md tracking-wide ${
                  aiPrediction.prediction === "bullish" ? "bg-emerald-500/15 text-emerald-400" :
                  aiPrediction.prediction === "bearish" ? "bg-rose-500/15 text-rose-400" :
                  "bg-slate-800 text-slate-400"
                }`}>
                  {aiPrediction.prediction}
                </span>
                <span className="text-xs text-slate-400">
                  <span className={`font-mono font-bold ${scoreColor(aiPrediction.score)}`}>{aiPrediction.score.toFixed(0)}</span>
                  <span className="text-slate-600">/100</span>
                </span>
              </div>

              {aiPrediction.reasoning && (
                <p className="text-xs text-slate-400 leading-relaxed">
                  {aiPrediction.reasoning}
                </p>
              )}
            </Card>
          )}

          {/* Fundamental Outlook */}
          {regionOutlook && (
            <Card title="Fundamental Outlook" subtitle={`Region: ${region}`} accent="amber">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5 uppercase">Central Bank</p>
                  <p className={`text-xs font-mono ${stanceColor(regionOutlook.cb_stance)}`}>
                    {STANCE_LABELS[String(regionOutlook.cb_stance)]}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5 uppercase">Growth</p>
                  <p className={`text-xs font-mono ${stanceColor(regionOutlook.growth_outlook)}`}>
                    {GROWTH_LABELS[String(regionOutlook.growth_outlook)]}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5 uppercase">Inflation</p>
                  <p className={`text-xs font-mono ${stanceColor(regionOutlook.inflation_trend === -1 ? 1 : regionOutlook.inflation_trend === 1 ? -1 : 0)}`}>
                    {INFLATION_LABELS[String(regionOutlook.inflation_trend)]}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5 uppercase">Risk Sentiment</p>
                  <p className={`text-xs font-mono ${stanceColor(regionOutlook.risk_sentiment)}`}>
                    {RISK_LABELS[String(regionOutlook.risk_sentiment)]}
                  </p>
                </div>
              </div>

              {regionOutlook.notes && (
                <p className="mt-3 pt-3 border-t border-slate-800/50 text-xs text-slate-400 leading-relaxed">
                  {regionOutlook.notes}
                </p>
              )}

              {events.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-800/50">
                  <p className="text-[10px] text-slate-500 mb-2 uppercase">Upcoming Events</p>
                  <div className="space-y-1.5">
                    {events.map((evt) => (
                      <div key={evt.id} className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500 font-mono">{evt.event_date}</span>
                        <span className={
                          evt.impact === "high" ? "px-1 rounded bg-rose-500/15 text-rose-400" :
                          evt.impact === "medium" ? "px-1 rounded bg-amber-500/15 text-amber-400" :
                          "px-1 rounded bg-slate-800 text-slate-400"
                        }>
                          {evt.impact}
                        </span>
                        <span className="text-slate-300">{evt.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Daily Statistics */}
          {a && (
            <Card title="Daily Statistics" accent="sky">
              <MetricRow label="Avg daily growth">
                <span className="text-emerald-400">+{fmt(a.avg_daily_growth, 3)}%</span>
              </MetricRow>
              <MetricRow label="Avg daily loss">
                <span className="text-rose-400">{fmt(a.avg_daily_loss, 3)}%</span>
              </MetricRow>
              <MetricRow label="Most bullish day">
                <span className="text-emerald-400">+{fmt(a.most_bullish_day)}%</span>
              </MetricRow>
              <MetricRow label="Most bearish day">
                <span className="text-rose-400">{fmt(a.most_bearish_day)}%</span>
              </MetricRow>
              <MetricRow label="Up-day win rate">
                <span className="text-sky-400">{fmt(a.up_day_win_rate, 1)}%</span>
              </MetricRow>
              <div className="mt-2">
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div
                    className="bg-sky-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(a.up_day_win_rate || 0, 100)}%` }}
                  />
                </div>
              </div>
            </Card>
          )}

          {/* Trend & Momentum */}
          {a && (
            <Card title="Trend & Momentum" accent="emerald">
              {[
                { label: "vs SMA(20)", sma: a.sma_20 },
                { label: "vs SMA(50)", sma: a.sma_50 },
                { label: "vs SMA(200)", sma: a.sma_200 },
              ].map(({ label, sma }) => {
                const s = smaStatus(a.current_price, sma);
                return (
                  <MetricRow key={label} label={label}>
                    <span className={s.color}>{s.label}</span>
                  </MetricRow>
                );
              })}
              <MetricRow label="RSI(14)">
                <span className={rsiColor(a.rsi_14)}>
                  {fmt(a.rsi_14, 1)} {rsiLabel(a.rsi_14)}
                </span>
              </MetricRow>
              <MetricRow label="Daily range">
                <span className="text-slate-200">{fmt(a.daily_range_pct, 3)}%</span>
              </MetricRow>
              <MetricRow label="ATR(14)">
                <span className="text-slate-200">{fmt(a.atr_14)}</span>
              </MetricRow>
            </Card>
          )}

          {/* Price Changes */}
          {a && (
            <Card title="Price Changes" accent="rose">
              {[
                { label: "1 week", val: a.change_1w },
                { label: "2 weeks", val: a.change_2w },
                { label: "1 month", val: a.change_1m },
                { label: "3 months", val: a.change_3m },
              ].map(({ label, val }) => (
                <MetricRow key={label} label={label}>
                  <span className={pctColor(val)}>{pctPrefix(val)}</span>
                </MetricRow>
              ))}
              {a.sma_20 != null && (
                <MetricRow label="SMA(20)">
                  <span className="text-slate-200 font-mono">
                    {a.sma_20.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </MetricRow>
              )}
              {a.sma_50 != null && (
                <MetricRow label="SMA(50)">
                  <span className="text-slate-200 font-mono">
                    {a.sma_50.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </MetricRow>
              )}
              {a.sma_200 != null && (
                <MetricRow label="SMA(200)">
                  <span className="text-slate-200 font-mono">
                    {a.sma_200.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </MetricRow>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Footer */}
      {a && (
        <p className="text-[11px] text-slate-600 text-center mt-8">
          Based on {a.daily_bar_count} daily bars from {a.candle_count.toLocaleString()} H1
          candles &middot; Week of {a.week_start}
        </p>
      )}

      {!loading && !error && !a && trades.length === 0 && (
        <div className="bg-[#0c1322] border border-slate-800/60 rounded-xl p-10 text-center text-slate-500 mt-6">
          No analytics data available yet. Run the analysis after candle data has been uploaded.
        </div>
      )}
    </div>
  );
}
