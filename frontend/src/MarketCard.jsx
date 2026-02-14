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

export default function MarketCard({ market, analytics }) {
  const borderColor = CATEGORY_COLORS[market.category] || "border-gray-600";
  const a = analytics;

  return (
    <div
      className={`bg-gray-900 rounded-lg p-4 border-l-4 ${borderColor} hover:bg-gray-800 transition`}
    >
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold">{market.symbol}</h3>
          <p className="text-sm text-gray-400">{market.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {a?.technical_score != null && (
            <span
              className={`text-sm font-bold px-2 py-0.5 rounded ${scoreBg(a.technical_score)} ${scoreColor(a.technical_score)}`}
            >
              {a.technical_score.toFixed(0)}
            </span>
          )}
          <span className="text-xs uppercase px-2 py-0.5 rounded bg-gray-800 text-gray-400">
            {market.category}
          </span>
        </div>
      </div>

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
        </div>
      )}
    </div>
  );
}
