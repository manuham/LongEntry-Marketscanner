import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { createChart } from "lightweight-charts";
import { fetchSymbolAnalytics, fetchCandles, overrideMarket, fetchFundamental, fetchFundamentalEvents } from "./api";

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
  if (val === 1) return "text-green-400";
  if (val === -1) return "text-red-400";
  return "text-gray-400";
}

function fmt(val, decimals = 2) {
  if (val == null) return "\u2014";
  return val.toFixed(decimals);
}

function pctColor(val) {
  if (val == null) return "text-gray-400";
  return val >= 0 ? "text-green-400" : "text-red-400";
}

function pctPrefix(val) {
  if (val == null) return "\u2014";
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
}

function scoreColor(score) {
  if (score >= 70) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function scoreBg(score) {
  if (score >= 70) return "bg-green-900/40";
  if (score >= 50) return "bg-yellow-900/40";
  return "bg-red-900/40";
}

function smaStatus(current, sma) {
  if (current == null || sma == null) return { label: "\u2014", color: "text-gray-500" };
  const diff = ((current - sma) / sma) * 100;
  const above = current > sma;
  return {
    label: `${above ? "Above" : "Below"} (${diff >= 0 ? "+" : ""}${diff.toFixed(2)}%)`,
    color: above ? "text-green-400" : "text-red-400",
  };
}

function rsiColor(rsi) {
  if (rsi == null) return "text-gray-500";
  if (rsi >= 70) return "text-red-400";
  if (rsi <= 30) return "text-green-400";
  return "text-blue-400";
}

function rsiLabel(rsi) {
  if (rsi == null) return "";
  if (rsi >= 70) return "Overbought";
  if (rsi <= 30) return "Oversold";
  return "Neutral";
}

function CandleChart({ symbol }) {
  const containerRef = useRef(null);
  const [noData, setNoData] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#111827" },
        textColor: "#9CA3AF",
      },
      grid: {
        vertLines: { color: "#1F2937" },
        horzLines: { color: "#1F2937" },
      },
      width: containerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderDownColor: "#EF4444",
      borderUpColor: "#22C55E",
      wickDownColor: "#EF4444",
      wickUpColor: "#22C55E",
    });

    fetchCandles(symbol, 1000)
      .then((candles) => {
        if (candles.length === 0) {
          setNoData(true);
          return;
        }
        candleSeries.setData(candles);
        chart.timeScale().fitContent();
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
    };
  }, [symbol]);

  if (noData) {
    return (
      <div className="bg-gray-900 rounded-lg p-8 text-center text-gray-500">
        No candle data available yet. Data will appear after the first Friday upload.
      </div>
    );
  }

  return <div ref={containerRef} className="rounded-lg overflow-hidden" />;
}

function MetricRow({ label, children }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-800 last:border-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="font-mono text-sm">{children}</span>
    </div>
  );
}

export default function MarketDetail({ markets }) {
  const { symbol } = useParams();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overriding, setOverriding] = useState(false);
  const [regionOutlook, setRegionOutlook] = useState(null);
  const [events, setEvents] = useState([]);

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
    fetchSymbolAnalytics(symbol)
      .then(setAnalytics)
      .catch((e) => {
        if (e.message.includes("404")) {
          setAnalytics(null);
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));

    // Fetch fundamental data
    fetchFundamental()
      .then((outlooks) => {
        const match = outlooks.find((o) => o.region === region);
        if (match) setRegionOutlook(match);
      })
      .catch(() => {});
    fetchFundamentalEvents()
      .then((evts) => setEvents(evts.filter((e) => e.region === region)))
      .catch(() => {});
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
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-4 transition"
      >
        &larr; Back to overview
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold">{symbol}</h2>
        {market && <span className="text-gray-400">{market.name}</span>}
        {market && (
          <span className="text-xs uppercase px-2 py-0.5 rounded bg-gray-800 text-gray-400">
            {market.category}
          </span>
        )}
        {a && (
          <div className="flex items-center gap-2">
            {a.is_active ? (
              <>
                <span className="text-xs uppercase font-bold px-2 py-1 rounded bg-green-900/60 text-green-400">
                  Active
                </span>
                <button
                  onClick={() => handleOverride(false)}
                  disabled={overriding}
                  className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-red-900/60 text-gray-300 hover:text-red-400 transition disabled:opacity-50"
                >
                  {overriding ? "..." : "Deactivate"}
                </button>
              </>
            ) : (
              <>
                <span className="text-xs uppercase font-bold px-2 py-1 rounded bg-gray-800 text-gray-500">
                  Inactive
                </span>
                <button
                  onClick={() => handleOverride(true)}
                  disabled={overriding}
                  className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-green-900/60 text-gray-300 hover:text-green-400 transition disabled:opacity-50"
                >
                  {overriding ? "..." : "Activate"}
                </button>
              </>
            )}
            {a.is_manually_overridden && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-500">
                Manual
              </span>
            )}
            {a.is_manually_overridden && (
              <button
                onClick={() => handleOverride(null)}
                disabled={overriding}
                className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200 transition disabled:opacity-50"
              >
                Clear Override
              </button>
            )}
          </div>
        )}
        {a?.final_score != null ? (
          <span
            className={`text-lg font-bold px-3 py-1 rounded ${scoreBg(a.final_score)} ${scoreColor(a.final_score)}`}
          >
            Score: {a.final_score.toFixed(1)}
          </span>
        ) : a?.technical_score != null ? (
          <span
            className={`text-lg font-bold px-3 py-1 rounded ${scoreBg(a.technical_score)} ${scoreColor(a.technical_score)}`}
          >
            Score: {a.technical_score.toFixed(1)}
          </span>
        ) : null}
        {a?.rank != null && (
          <span className="text-sm text-gray-400">
            Rank #{a.rank}
          </span>
        )}
      </div>

      {/* Price */}
      {a?.current_price != null && (
        <p className="text-3xl font-mono mb-6">
          {a.current_price.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      )}

      {/* Chart */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-3">H1 Chart</h3>
        <CandleChart symbol={symbol} />
      </div>

      {loading && <p className="text-gray-400">Loading analytics...</p>}
      {error && (
        <p className="text-red-400 bg-red-950 px-4 py-3 rounded mb-4">{error}</p>
      )}

      {/* Metrics Grid */}
      {a && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Column 1: Daily Statistics */}
          <div className="bg-gray-900 rounded-lg p-5">
            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Daily Statistics
            </h4>
            <MetricRow label="Avg daily growth">
              <span className="text-green-400">+{fmt(a.avg_daily_growth, 3)}%</span>
            </MetricRow>
            <MetricRow label="Avg daily loss">
              <span className="text-red-400">{fmt(a.avg_daily_loss, 3)}%</span>
            </MetricRow>
            <MetricRow label="Most bullish day">
              <span className="text-green-400">+{fmt(a.most_bullish_day)}%</span>
            </MetricRow>
            <MetricRow label="Most bearish day">
              <span className="text-red-400">{fmt(a.most_bearish_day)}%</span>
            </MetricRow>
            <MetricRow label="Up-day win rate">
              <span className="text-blue-400">{fmt(a.up_day_win_rate, 1)}%</span>
            </MetricRow>
            {/* Win rate bar */}
            <div className="mt-2">
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(a.up_day_win_rate || 0, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Column 2: Moving Averages & Trend */}
          <div className="bg-gray-900 rounded-lg p-5">
            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Trend & Momentum
            </h4>
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
              <span className="text-gray-200">{fmt(a.daily_range_pct, 3)}%</span>
            </MetricRow>
            <MetricRow label="ATR(14)">
              <span className="text-gray-200">{fmt(a.atr_14)}</span>
            </MetricRow>
          </div>

          {/* Column 3: Price Changes */}
          <div className="bg-gray-900 rounded-lg p-5">
            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Price Changes
            </h4>
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
                <span className="text-gray-200 font-mono">
                  {a.sma_20.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </MetricRow>
            )}
            {a.sma_50 != null && (
              <MetricRow label="SMA(50)">
                <span className="text-gray-200 font-mono">
                  {a.sma_50.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </MetricRow>
            )}
            {a.sma_200 != null && (
              <MetricRow label="SMA(200)">
                <span className="text-gray-200 font-mono">
                  {a.sma_200.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </MetricRow>
            )}
          </div>
        </div>
      )}

      {/* Backtest Results */}
      {a?.bt_total_return != null && (
        <div className="mb-8">
          <div className="bg-gray-900 rounded-lg p-5">
            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
              Backtest Results (2-Year)
            </h4>

            {/* Summary sentence */}
            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
              If you entered every day at{" "}
              <span className="font-mono text-white">
                {String(a.opt_entry_hour ?? 0).padStart(2, "0")}:00
              </span>{" "}
              with SL{" "}
              <span className="font-mono text-white">{fmt(a.opt_sl_percent, 1)}%</span>{" "}
              and TP{" "}
              <span className="font-mono text-white">{fmt(a.opt_tp_percent, 1)}%</span>
              , you would have made{" "}
              <span className={`font-mono font-bold ${a.bt_total_return >= 0 ? "text-green-400" : "text-red-400"}`}>
                {a.bt_total_return >= 0 ? "+" : ""}{fmt(a.bt_total_return, 1)}%
              </span>{" "}
              profit over 2 years with a{" "}
              <span className="font-mono text-white">{fmt(a.bt_win_rate, 1)}%</span>{" "}
              win rate and{" "}
              <span className="font-mono text-white">{fmt(a.bt_profit_factor)}</span>{" "}
              profit factor.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Total Return</p>
                <p className={`text-lg font-mono font-bold ${a.bt_total_return >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {a.bt_total_return >= 0 ? "+" : ""}{fmt(a.bt_total_return, 1)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Win Rate</p>
                <p className="text-lg font-mono text-blue-400">{fmt(a.bt_win_rate, 1)}%</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Profit Factor</p>
                <p className="text-lg font-mono text-gray-200">{fmt(a.bt_profit_factor)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Max Drawdown</p>
                <p className="text-lg font-mono text-red-400">-{fmt(a.bt_max_drawdown, 1)}%</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-800">
              <div>
                <p className="text-xs text-gray-500 mb-1">Entry Hour</p>
                <p className="text-sm font-mono text-gray-200">
                  {String(a.opt_entry_hour ?? 0).padStart(2, "0")}:00
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Stop Loss</p>
                <p className="text-sm font-mono text-gray-200">{fmt(a.opt_sl_percent, 2)}%</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Take Profit</p>
                <p className="text-sm font-mono text-gray-200">{fmt(a.opt_tp_percent, 2)}%</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Total Trades</p>
                <p className="text-sm font-mono text-gray-200">{a.bt_total_trades}</p>
              </div>
            </div>

            {/* Scores row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 pt-4 border-t border-gray-800">
              <div>
                <p className="text-xs text-gray-500 mb-1">Technical (50%)</p>
                <p className={`text-sm font-mono ${scoreColor(a.technical_score ?? 0)}`}>
                  {fmt(a.technical_score, 1)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Backtest (35%)</p>
                <p className={`text-sm font-mono ${scoreColor(a.backtest_score ?? 0)}`}>
                  {fmt(a.backtest_score, 1)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Fundamental (15%)</p>
                <p className={`text-sm font-mono ${scoreColor(a.fundamental_score ?? 0)}`}>
                  {fmt(a.fundamental_score, 1)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Final Score</p>
                <p className={`text-sm font-mono font-bold ${scoreColor(a.final_score ?? 0)}`}>
                  {fmt(a.final_score, 1)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Param Stability</p>
                <p className={`text-sm font-mono ${(a.bt_param_stability ?? 0) < 50 ? "text-yellow-400" : "text-green-400"}`}>
                  {fmt(a.bt_param_stability, 0)}%
                  {(a.bt_param_stability ?? 100) < 50 && (
                    <span className="ml-1 text-xs text-yellow-500">Unreliable</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fundamental Outlook */}
      {regionOutlook && (
        <div className="mb-8">
          <div className="bg-gray-900 rounded-lg p-5">
            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
              Fundamental Outlook
              <span className="ml-2 text-xs font-normal text-gray-500 normal-case">
                Region: {region}
              </span>
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Central Bank</p>
                <p className={`text-sm font-mono ${stanceColor(regionOutlook.cb_stance)}`}>
                  {STANCE_LABELS[String(regionOutlook.cb_stance)]}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Growth</p>
                <p className={`text-sm font-mono ${stanceColor(regionOutlook.growth_outlook)}`}>
                  {GROWTH_LABELS[String(regionOutlook.growth_outlook)]}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Inflation</p>
                <p className={`text-sm font-mono ${stanceColor(regionOutlook.inflation_trend === -1 ? 1 : regionOutlook.inflation_trend === 1 ? -1 : 0)}`}>
                  {INFLATION_LABELS[String(regionOutlook.inflation_trend)]}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Risk Sentiment</p>
                <p className={`text-sm font-mono ${stanceColor(regionOutlook.risk_sentiment)}`}>
                  {RISK_LABELS[String(regionOutlook.risk_sentiment)]}
                </p>
              </div>
            </div>

            {regionOutlook.notes && (
              <p className="mt-3 pt-3 border-t border-gray-800 text-sm text-gray-400">
                {regionOutlook.notes}
              </p>
            )}

            {events.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-2">Upcoming Events</p>
                <div className="space-y-1">
                  {events.map((evt) => (
                    <div key={evt.id} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500 font-mono">{evt.event_date}</span>
                      <span className={
                        evt.impact === "high" ? "px-1 rounded bg-red-900/40 text-red-400" :
                        evt.impact === "medium" ? "px-1 rounded bg-yellow-900/40 text-yellow-400" :
                        "px-1 rounded bg-gray-800 text-gray-400"
                      }>
                        {evt.impact}
                      </span>
                      <span className="text-gray-300">{evt.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data info footer */}
      {a && (
        <p className="text-xs text-gray-600 text-center">
          Based on {a.daily_bar_count} daily bars from {a.candle_count.toLocaleString()} H1
          candles &middot; Week of {a.week_start}
        </p>
      )}

      {!loading && !error && !a && (
        <div className="bg-gray-900 rounded-lg p-8 text-center text-gray-500">
          No analytics data available yet. Run the analysis after candle data has been uploaded.
        </div>
      )}
    </div>
  );
}
