"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import type * as Types from "@/lib/types";

interface DrawdownSidebarProps {
  data: Types.DrawdownItem[];
}

export default function DrawdownSidebar({ data }: DrawdownSidebarProps) {
  // Filter to active markets only and sort by P&L
  const activeMarkets = data
    .filter((item) => item.is_active)
    .sort((a, b) => b.week_pnl_percent - a.week_pnl_percent);

  // Calculate total P&L
  const totalPnL = activeMarkets.reduce((sum, item) => sum + item.week_pnl_percent, 0);
  const totalTrades = activeMarkets.reduce((sum, item) => sum + item.week_trades, 0);
  const totalWins = activeMarkets.reduce((sum, item) => sum + item.week_wins, 0);

  return (
    <div
      className="rounded-lg border p-4 sticky top-20"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-solid)",
      }}
    >
      {/* Header */}
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--text-heading)" }}
      >
        Active Markets P&L
      </h3>

      {/* Total Summary */}
      <div
        className="p-3 rounded-lg mb-4 border"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-solid)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Total Weekly P&L
          </span>
          <span
            className="font-bold text-lg"
            style={{
              color:
                totalPnL >= 0
                  ? "var(--accent-green)"
                  : "var(--accent-red)",
            }}
          >
            {totalPnL >= 0 ? "+" : ""}
            {totalPnL.toFixed(2)}%
          </span>
        </div>
        <div
          className="text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {totalTrades} trades • {totalWins} wins
        </div>
      </div>

      {/* Markets List */}
      {activeMarkets.length > 0 ? (
        <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto">
          {activeMarkets.map((item) => (
            <div
              key={item.symbol}
              className="p-2 rounded border transition-colors hover:bg-opacity-75"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-solid)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-heading)" }}
                >
                  {item.symbol}
                </span>
                <div className="flex items-center space-x-1">
                  {item.week_pnl_percent >= 0 ? (
                    <TrendingUp
                      size={14}
                      style={{ color: "var(--accent-green)" }}
                    />
                  ) : (
                    <TrendingDown
                      size={14}
                      style={{ color: "var(--accent-red)" }}
                    />
                  )}
                  <span
                    className="text-sm font-semibold"
                    style={{
                      color:
                        item.week_pnl_percent >= 0
                          ? "var(--accent-green)"
                          : "var(--accent-red)",
                    }}
                  >
                    {item.week_pnl_percent >= 0 ? "+" : ""}
                    {item.week_pnl_percent.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Trades Info */}
              <div
                className="text-xs flex items-center justify-between"
                style={{ color: "var(--text-muted)" }}
              >
                <span>
                  {item.week_trades} trade{item.week_trades !== 1 ? "s" : ""}
                </span>
                <span>
                  {item.week_wins} win{item.week_wins !== 1 ? "s" : ""}
                </span>
                <span>
                  {item.open_trades} open
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="text-center py-8"
          style={{ color: "var(--text-muted)" }}
        >
          <p className="text-sm">No active markets with trades</p>
        </div>
      )}
    </div>
  );
}
