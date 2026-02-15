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
  if (val == null) return "—";
  return val.toFixed(decimals);
}

const PREDICTION_STYLE = {
  bullish: { label: "Bullish", bg: "bg-green-900/50", text: "text-green-400" },
  bearish: { label: "Bearish", bg: "bg-red-900/50", text: "text-red-400" },
  neutral: { label: "Neutral", bg: "bg-gray-800", text: "text-gray-400" },
};

export default function MarketCard({ market, analytics, aiPrediction }) {
  const borderColor = CATEGORY_COLORS[market.category] || "border-gray-600";
  const a = analytics;
  const displayScore = a?.final_score ?? a?.technical_score;
  const pred = aiPrediction ? PREDICTION_STYLE[aiPrediction.prediction] || PREDICTION_STYLE.neutral : null;

  return (
    <Link
      to={`/market/${market.symbol}`}
      className={`block bg-gray-900 rounded-lg p-4 border-l-4 ${borderColor} hover:bg-gray-800 transition cursor-pointer`}
    >
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{market.symbol}</h3>
          {a?.is_active && (
            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-900/60 text-green-400">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {displayScore != null && (
            <span
              className={`text-sm font-bold px-2 py-0.5 rounded ${scoreBg(displayScore)} ${scoreColor(displayScore)}`}
            >
              {displayScore.toFixed(0)}
            </span>
          )}
          <span className="text-xs uppercase px-2 py-0.5 rounded bg-gray-800 text-gray-400">
            {market.category}
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-400">{market.name}</p>

      {/* Price */}
      <div className="mt-3">
        {market.latest_price != null ? (
          <p className="text-2xl font-mono">
            {market.latest_price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        ) : (
          <p className="text-gray-500 text-sm italic">No data yet</p>
        )}
      </div>

      {market.latest_time && (
        <p className="text-xs text-gray-500 mt-1">
          {new Date(market.latest_time).toLocaleString()}
        </p>
      )}

      {/* AI Prediction */}
      {pred && (
        <div className="mt-2">
          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${pred.bg} ${pred.text}`}>
            {pred.label}
          </span>
          {aiPrediction.reasoning && (
            <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-tight">
              {aiPrediction.reasoning}
            </p>
          )}
        </div>
      )}

      {/* Analytics section */}
      {a && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
          {/* Win rate bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Win rate</span>
              <span>{fmt(a.up_day_win_rate, 1)}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full"
                style={{ width: `${Math.min(a.up_day_win_rate || 0, 100)}%` }}
              />
            </div>
          </div>

          {/* Growth / Loss */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Avg growth</span>
              <p className="text-green-400 font-mono">+{fmt(a.avg_daily_growth, 3)}%</p>
            </div>
            <div>
              <span className="text-gray-500">Avg loss</span>
              <p className="text-red-400 font-mono">{fmt(a.avg_daily_loss, 3)}%</p>
            </div>
          </div>

          {/* Best / Worst day */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Best day</span>
              <p className="text-green-400 font-mono">+{fmt(a.most_bullish_day)}%</p>
            </div>
            <div>
              <span className="text-gray-500">Worst day</span>
              <p className="text-red-400 font-mono">{fmt(a.most_bearish_day)}%</p>
            </div>
          </div>

          {/* Score breakdown */}
          {(a.technical_score != null || a.backtest_score != null || a.fundamental_score != null) && (
            <div className="pt-2 border-t border-gray-800 flex gap-3 text-xs">
              {a.technical_score != null && (
                <span className="text-gray-400">
                  T: <span className={`font-mono ${scoreColor(a.technical_score)}`}>{fmt(a.technical_score, 0)}</span>
                </span>
              )}
              {a.backtest_score != null && (
                <span className="text-gray-400">
                  B: <span className={`font-mono ${scoreColor(a.backtest_score)}`}>{fmt(a.backtest_score, 0)}</span>
                </span>
              )}
              {a.fundamental_score != null && (
                <span className="text-gray-400">
                  F: <span className={`font-mono ${scoreColor(a.fundamental_score)}`}>{fmt(a.fundamental_score, 0)}</span>
                </span>
              )}
            </div>
          )}

          {/* Backtest summary */}
          {a.bt_total_return != null && (
            <div className="pt-2 border-t border-gray-800 text-xs text-gray-400">
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
    </Link>
  );
}
