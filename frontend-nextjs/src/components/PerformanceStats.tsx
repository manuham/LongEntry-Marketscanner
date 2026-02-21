"use client";

import { Analytics, Trade } from "@/lib/types";
import {
  TrendingUp,
  Target,
  BarChart3,
  BarChart2,
  Activity,
  Zap,
} from "lucide-react";
import { useMemo } from "react";

interface PerformanceStatsProps {
  analytics: Analytics;
  trades: Trade[];
}

export default function PerformanceStats({
  analytics,
  trades,
}: PerformanceStatsProps) {
  const stats = useMemo(() => {
    let winCount = 0;
    let lossCount = 0;
    let totalPnL = 0;
    let maxDD = 0;
    let grossProfit = 0;
    let grossLoss = 0;

    for (const trade of trades) {
      const pnl = trade.pnl_percent ?? 0;
      if (pnl > 0) {
        winCount++;
        grossProfit += pnl;
      } else if (pnl < 0) {
        lossCount++;
        grossLoss += Math.abs(pnl);
      }
      totalPnL += pnl;
    }

    const totalTrades = trades.length;
    const winRate =
      totalTrades > 0
        ? ((winCount / totalTrades) * 100).toFixed(1)
        : "0.0";

    // Profit Factor = Gross Profit / Gross Loss
    const profitFactor =
      grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : "N/A";

    // Max Drawdown from analytics or calculate from trades
    maxDD = analytics.bt_max_drawdown ?? 0;

    return {
      winRate: parseFloat(winRate),
      totalPnL,
      profitFactor,
      maxDD,
      totalTrades,
      winCount,
      lossCount,
    };
  }, [trades, analytics]);

  const statCards = [
    {
      label: "Win Rate",
      value: `${stats.winRate.toFixed(1)}%`,
      icon: Target,
      subtext: `${stats.winCount}W / ${stats.lossCount}L`,
      color: "var(--accent-green)",
    },
    {
      label: "Total P&L",
      value: `${stats.totalPnL >= 0 ? "+" : ""}${stats.totalPnL.toFixed(2)}%`,
      icon: TrendingUp,
      subtext: `${stats.totalTrades} trades`,
      color:
        stats.totalPnL >= 0 ? "var(--accent-green)" : "var(--accent-red)",
    },
    {
      label: "Profit Factor",
      value: String(stats.profitFactor),
      icon: BarChart3,
      subtext: "Gross Profit / Loss",
      color: "var(--accent-blue)",
    },
    {
      label: "Max Drawdown",
      value: `${stats.maxDD.toFixed(1)}%`,
      icon: BarChart2,
      subtext: "2-year backtest",
      color: "var(--accent-red)",
    },
    {
      label: "Total Trades",
      value: stats.totalTrades,
      icon: Activity,
      subtext: `Win: ${stats.winCount}, Loss: ${stats.lossCount}`,
      color: "var(--accent-purple)",
    },
    {
      label: "Daily Growth",
      value: `${analytics.avg_daily_growth?.toFixed(2) ?? "N/A"}%`,
      icon: Zap,
      subtext: `Loss: ${analytics.avg_daily_loss?.toFixed(2) ?? "N/A"}%`,
      color: "var(--accent-amber)",
    },
  ];

  return (
    <div
      className="rounded-lg p-6"
      style={{ backgroundColor: "var(--bg-card)" }}
    >
      <h3
        style={{ color: "var(--text-heading)" }}
        className="text-lg font-bold mb-6"
      >
        Performance Metrics
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-lg p-4 transition-all hover:shadow-lg"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderLeftColor: stat.color,
                borderLeftWidth: "3px",
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <p style={{ color: "var(--text-muted)" }} className="text-sm">
                  {stat.label}
                </p>
                <Icon
                  size={18}
                  style={{
                    color: stat.color,
                    opacity: 0.6,
                  }}
                />
              </div>
              <p
                className="text-2xl font-bold mb-1"
                style={{ color: stat.color }}
              >
                {stat.value}
              </p>
              <p style={{ color: "var(--text-faint)" }} className="text-xs">
                {stat.subtext}
              </p>
            </div>
          );
        })}
      </div>

      {/* Up Day Win Rate */}
      {analytics.up_day_win_rate !== null &&
        analytics.up_day_win_rate !== undefined && (
          <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: "var(--bg-card)" }}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p style={{ color: "var(--text-muted)" }} className="text-sm">
                  Up Day Win Rate
                </p>
                <p style={{ color: "var(--accent-green)" }} className="text-2xl font-bold">
                  {analytics.up_day_win_rate.toFixed(1)}%
                </p>
              </div>
              {analytics.most_bullish_day !== null &&
                analytics.most_bullish_day !== undefined && (
                  <div>
                    <p style={{ color: "var(--text-muted)" }} className="text-sm">
                      Most Bullish Day
                    </p>
                    <p style={{ color: "var(--accent-green)" }} className="text-2xl font-bold">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                        analytics.most_bullish_day
                      ] || "N/A"}
                    </p>
                  </div>
                )}
              {analytics.most_bearish_day !== null &&
                analytics.most_bearish_day !== undefined && (
                  <div>
                    <p style={{ color: "var(--text-muted)" }} className="text-sm">
                      Most Bearish Day
                    </p>
                    <p style={{ color: "var(--accent-red)" }} className="text-2xl font-bold">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                        analytics.most_bearish_day
                      ] || "N/A"}
                    </p>
                  </div>
                )}
            </div>
          </div>
        )}
    </div>
  );
}
