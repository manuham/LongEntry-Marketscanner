import { useState } from "react";
import { Link } from "react-router-dom";

const CATEGORY_COLORS = {
  commodity: "border-yellow-600",
  index: "border-blue-600",
};

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

function fmt(val, decimals = 2) {
  if (val == null) return "\u2014";
  return val.toFixed(decimals);
}

const PREDICTION_STYLE = {
  bullish: { label: "Bullish", bg: "bg-green-900/50", text: "text-green-400" },
  bearish: { label: "Bearish", bg: "bg-red-900/50", text: "text-red-400" },
  neutral: { label: "Neutral", bg: "bg-th-surface", text: "text-th-muted" },
};

// ─── Grid Card (default view) ──────────────────────────────────────────────────

export default function MarketCard({ market, analytics, aiPrediction, onToggleActive, viewMode = "grid" }) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const borderColor = CATEGORY_COLORS[market.category] || "border-gray-600";
  const a = analytics;
  const displayScore = a?.final_score ?? a?.technical_score;
  const pred = aiPrediction ? PREDICTION_STYLE[aiPrediction.prediction] || PREDICTION_STYLE.neutral : null;

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onToggleActive || toggling) return;
    setToggling(true);
    onToggleActive(market.symbol, !a?.is_active)
      .catch(() => {})
      .finally(() => setToggling(false));
  };

  if (viewMode === "table") {
    return <MarketRow market={market} analytics={a} aiPrediction={aiPrediction} onToggle={handleToggle} toggling={toggling} />;
  }

  return (
    <div className={`bg-th-card rounded-lg border-l-4 ${borderColor} hover:bg-th-card-hover transition`}>
      {/* Always-visible compact header — clickable to navigate */}
      <Link to={`/market/${market.symbol}`} className="block p-4 pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-th-heading">{market.symbol}</h3>
            {a && (
              <button
                onClick={handleToggle}
                disabled={toggling}
                className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded transition-colors ${
                  toggling
                    ? "bg-th-surface text-th-faint animate-pulse"
                    : a.is_active
                      ? "bg-green-900/60 text-green-400 hover:bg-red-900/40 hover:text-red-400"
                      : "bg-th-surface text-th-faint hover:bg-green-900/40 hover:text-green-400"
                }`}
                title={a.is_active ? "Click to deactivate" : "Click to activate"}
              >
                {toggling ? "..." : a.is_active ? "Active" : "Off"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {displayScore != null && (
              <span className={`text-sm font-bold px-2 py-0.5 rounded ${scoreBg(displayScore)} ${scoreColor(displayScore)}`}>
                {displayScore.toFixed(0)}
              </span>
            )}
            <span className="text-xs uppercase px-2 py-0.5 rounded bg-th-surface text-th-muted">
              {market.category}
            </span>
          </div>
        </div>
        <p className="text-sm text-th-muted">{market.name}</p>

        {/* Price */}
        <div className="mt-2">
          {market.latest_price != null ? (
            <p className="text-2xl font-mono text-th-heading">
              {market.latest_price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          ) : (
            <p className="text-th-faint text-sm italic">No data yet</p>
          )}
        </div>

        {/* AI Prediction badge */}
        {pred && (
          <div className="mt-2">
            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${pred.bg} ${pred.text}`}>
              {pred.label}
            </span>
          </div>
        )}
      </Link>

      {/* Expand/Collapse toggle */}
      {a && (
        <button
          onClick={(e) => { e.preventDefault(); setExpanded(!expanded); }}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-th-faint hover:text-th-secondary transition-colors border-t border-th"
        >
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {expanded ? "Less" : "More"}
        </button>
      )}

      {/* Expandable details */}
      {expanded && a && (
        <div className="px-4 pb-4 space-y-2 border-t border-th">
          {/* Win rate bar */}
          <div className="pt-3">
            <div className="flex justify-between text-xs text-th-muted mb-1">
              <span>Win rate</span>
              <span>{fmt(a.up_day_win_rate, 1)}%</span>
            </div>
            <div className="w-full bg-th-surface rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full"
                style={{ width: `${Math.min(a.up_day_win_rate || 0, 100)}%` }}
              />
            </div>
          </div>

          {/* Growth / Loss */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-th-faint">Avg growth</span>
              <p className="text-green-400 font-mono">+{fmt(a.avg_daily_growth, 3)}%</p>
            </div>
            <div>
              <span className="text-th-faint">Avg loss</span>
              <p className="text-red-400 font-mono">{fmt(a.avg_daily_loss, 3)}%</p>
            </div>
          </div>

          {/* Best / Worst day */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-th-faint">Best day</span>
              <p className="text-green-400 font-mono">+{fmt(a.most_bullish_day)}%</p>
            </div>
            <div>
              <span className="text-th-faint">Worst day</span>
              <p className="text-red-400 font-mono">{fmt(a.most_bearish_day)}%</p>
            </div>
          </div>

          {/* AI Reasoning */}
          {aiPrediction?.reasoning && (
            <p className="text-[11px] text-th-faint leading-tight line-clamp-3 pt-1">
              {aiPrediction.reasoning}
            </p>
          )}

          {/* Score breakdown */}
          {(a.technical_score != null || a.backtest_score != null || a.fundamental_score != null) && (
            <div className="pt-2 border-t border-th flex gap-3 text-xs">
              {a.technical_score != null && (
                <span className="text-th-muted">
                  T: <span className={`font-mono ${scoreColor(a.technical_score)}`}>{fmt(a.technical_score, 0)}</span>
                </span>
              )}
              {a.backtest_score != null && (
                <span className="text-th-muted">
                  B: <span className={`font-mono ${scoreColor(a.backtest_score)}`}>{fmt(a.backtest_score, 0)}</span>
                </span>
              )}
              {a.fundamental_score != null && (
                <span className="text-th-muted">
                  F: <span className={`font-mono ${scoreColor(a.fundamental_score)}`}>{fmt(a.fundamental_score, 0)}</span>
                </span>
              )}
            </div>
          )}

          {/* Backtest summary */}
          {a.bt_total_return != null && (
            <div className="pt-2 border-t border-th text-xs text-th-muted">
              <span className="font-mono">
                Entry {String(a.opt_entry_hour ?? 0).padStart(2, "0")}:00
                {" \u00B7 "}SL {fmt(a.opt_sl_percent, 1)}%
                {" \u00B7 "}TP {fmt(a.opt_tp_percent, 1)}%
                {" \u2192 "}
              </span>
              <span className={a.bt_total_return >= 0 ? "text-green-400 font-mono" : "text-red-400 font-mono"}>
                {a.bt_total_return >= 0 ? "+" : ""}{fmt(a.bt_total_return, 1)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Table Row (for list/table view) ───────────────────────────────────────────

function MarketRow({ market, analytics, aiPrediction, onToggle, toggling }) {
  const a = analytics;
  const displayScore = a?.final_score ?? a?.technical_score;
  const pred = aiPrediction ? PREDICTION_STYLE[aiPrediction.prediction] || PREDICTION_STYLE.neutral : null;

  return (
    <Link
      to={`/market/${market.symbol}`}
      className="grid grid-cols-[40px_1fr_100px_80px_80px_80px_60px_80px] gap-2 items-center px-4 py-3 bg-th-card hover:bg-th-card-hover border-b border-th transition-colors"
    >
      {/* Toggle */}
      <span className="flex justify-center">
        {a ? (
          <button
            onClick={onToggle}
            disabled={toggling}
            className={`text-[9px] uppercase font-bold px-1 py-0.5 rounded transition-colors flex-shrink-0 ${
              toggling
                ? "bg-th-surface text-th-faint animate-pulse"
                : a.is_active
                  ? "bg-green-900/60 text-green-400 hover:bg-red-900/40 hover:text-red-400"
                  : "bg-th-surface text-th-faint hover:bg-green-900/40 hover:text-green-400"
            }`}
            title={a.is_active ? "Click to deactivate" : "Click to activate"}
          >
            {toggling ? "..." : a.is_active ? "On" : "Off"}
          </button>
        ) : (
          <span className="text-[9px] text-th-faint">—</span>
        )}
      </span>

      {/* Symbol + name */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold text-th-heading truncate">{market.symbol}</span>
        <span className="text-xs text-th-faint truncate hidden sm:inline">{market.name}</span>
      </div>

      {/* Price */}
      <span className="font-mono text-sm text-th-heading text-right">
        {market.latest_price != null
          ? market.latest_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "\u2014"}
      </span>

      {/* Score */}
      <span className="text-right">
        {displayScore != null ? (
          <span className={`font-mono font-bold text-sm ${scoreColor(displayScore)}`}>
            {displayScore.toFixed(0)}
          </span>
        ) : (
          <span className="text-th-faint">\u2014</span>
        )}
      </span>

      {/* Win rate */}
      <span className="font-mono text-sm text-right text-blue-400">
        {a?.up_day_win_rate != null ? `${fmt(a.up_day_win_rate, 1)}%` : "\u2014"}
      </span>

      {/* Backtest return */}
      <span className={`font-mono text-sm text-right ${a?.bt_total_return >= 0 ? "text-green-400" : "text-red-400"}`}>
        {a?.bt_total_return != null ? `${a.bt_total_return >= 0 ? "+" : ""}${fmt(a.bt_total_return, 1)}%` : "\u2014"}
      </span>

      {/* Prediction */}
      <span className="text-center">
        {pred && (
          <span className={`text-[9px] uppercase font-bold px-1 py-0.5 rounded ${pred.bg} ${pred.text}`}>
            {pred.label.slice(0, 4)}
          </span>
        )}
      </span>

      {/* Rank */}
      <span className="font-mono text-sm text-right text-th-faint">
        {a?.rank != null ? `#${a.rank}` : "\u2014"}
      </span>
    </Link>
  );
}
