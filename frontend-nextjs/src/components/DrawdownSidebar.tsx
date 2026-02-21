"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import type * as Types from "@/lib/types";

interface DrawdownSidebarProps {
  data: Types.DrawdownItem[];
}

export default function DrawdownSidebar({ data }: DrawdownSidebarProps) {
  const activeMarkets = data
    .filter((item) => item.is_active)
    .sort((a, b) => b.week_pnl_percent - a.week_pnl_percent);

  const totalPnL = activeMarkets.reduce((sum, item) => sum + item.week_pnl_percent, 0);
  const totalTrades = activeMarkets.reduce((sum, item) => sum + item.week_trades, 0);
  const totalWins = activeMarkets.reduce((sum, item) => sum + item.week_wins, 0);

  return (
    <div
      className="rounded-xl p-4 sticky top-20"
      style={{
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-solid)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Header */}
      <h3
        className="text-sm font-semibold uppercase tracking-wide mb-4"
        style={{ color: "var(--text-faint)" }}
      >
        Active P&L
      </h3>

      {/* Total Summary */}
      <div
        className="p-3 rounded-lg mb-4"
        style={{ backgroundColor: "var(--bg-surface)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Weekly Total
          </span>
          <span
            className="font-bold text-lg"
            style={{
              color: totalPnL >= 0 ? "var(--accent-green)" : "var(--accent-red)",
            }}
          >
            {totalPnL >= 0 ? "+" : ""}{totalPnL.toFixed(2)}%
          </span>
        </div>
        <div className="text-xs" style={{ color: "var(--text-faint)" }}>
          {totalTrades} trades · {totalWins} wins
        </div>
      </div>

      {/* Markets List */}
      {activeMarkets.length > 0 ? (
        <div className="space-y-1.5 max-h-[calc(100vh-350px)] overflow-y-auto">
          {activeMarkets.map((item) => (
            <div
              key={item.symbol}
              className="p-2.5 rounded-lg transition-colors"
              style={{ backgroundColor: "var(--bg-surface)" }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className="text-xs font-bold"
                  style={{ color: "var(--text-heading)" }}
                >
                  {item.symbol}
                </span>
                <div className="flex items-center space-x-1">
                  {item.week_pnl_percent >= 0 ? (
                    <TrendingUp size={12} style={{ color: "var(--accent-green)" }} />
                  ) : (
                    <TrendingDown size={12} style={{ color: "var(--accent-red)" }} />
                  )}
                  <span
                    className="text-xs font-bold"
                    style={{
                      color: item.week_pnl_percent >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                    }}
                  >
                    {item.week_pnl_percent >= 0 ? "+" : ""}{item.week_pnl_percent.toFixed(2)}%
                  </span>
                </div>
              </div>
              <div
                className="text-[10px] flex items-center space-x-2"
                style={{ color: "var(--text-faint)" }}
              >
                <span>{item.week_trades} trade{item.week_trades !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{item.week_wins} win{item.week_wins !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{item.open_trades} open</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="text-center py-6"
          style={{ color: "var(--text-faint)" }}
        >
          <p className="text-xs">No active markets with trades</p>
        </div>
      )}
    </div>
  );
}
