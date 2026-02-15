import { useEffect, useState } from "react";
import { fetchResults } from "./api";

function pnlColor(val) {
  if (val > 0) return "text-green-400";
  if (val < 0) return "text-red-400";
  return "text-gray-400";
}

export default function Results() {
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResults()
      .then(setWeeks)
      .catch(() => setWeeks([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-400">Loading results...</p>;

  if (weeks.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg p-8 text-center text-gray-500">
        No trade results yet. Results are uploaded by the EA at the end of each trading week.
      </div>
    );
  }

  // Cumulative P&L across all weeks
  let cumPnl = 0;
  const cumData = weeks.slice().reverse().map((w) => {
    cumPnl += w.total_pnl_percent;
    return { week: w.week_start, pnl: cumPnl };
  });

  return (
    <div>
      {/* Cumulative summary */}
      <div className="bg-gray-900 rounded-lg p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Cumulative Performance
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total P&L</p>
            <p className={`text-lg font-mono font-bold ${pnlColor(cumPnl)}`}>
              {cumPnl >= 0 ? "+" : ""}{cumPnl.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Weeks Tracked</p>
            <p className="text-lg font-mono text-gray-200">{weeks.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Trades</p>
            <p className="text-lg font-mono text-gray-200">
              {weeks.reduce((s, w) => s + w.total_trades, 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Win Rate</p>
            <p className="text-lg font-mono text-blue-400">
              {(() => {
                const wins = weeks.reduce((s, w) => s + w.total_wins, 0);
                const total = weeks.reduce((s, w) => s + w.total_trades, 0);
                return total > 0 ? `${((wins / total) * 100).toFixed(1)}%` : "\u2014";
              })()}
            </p>
          </div>
        </div>
      </div>

      {/* Week-by-week results */}
      <div className="space-y-4">
        {weeks.map((w) => (
          <div key={w.week_start} className="bg-gray-900 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-300">
                Week of {w.week_start}
              </h4>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500">{w.active_markets} active</span>
                <span className="text-gray-500">{w.total_trades} trades</span>
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
                    r.was_active ? "bg-gray-800" : "bg-gray-800/50 opacity-60"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-200">{r.symbol}</span>
                    {r.was_active && (
                      <span className="text-[9px] uppercase px-1 rounded bg-green-900/60 text-green-400">
                        active
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">
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
