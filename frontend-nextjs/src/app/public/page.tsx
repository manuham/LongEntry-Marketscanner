"use client";

import { useState, useEffect } from "react";
import { AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { getResults, getMarkets, getErrorMessage } from "@/lib/api";
import type * as Types from "@/lib/types";

interface ChartDataPoint {
  week_start: string;
  cumulative_pnl: number;
}

interface MonthlyStats {
  month: string;
  trades: number;
  wins: number;
  losses: number;
  pnl_percent: number;
}

export default function PublicPage() {
  const [results, setResults] = useState<Types.WeeklyResult[]>([]);
  const [markets, setMarkets] = useState<Types.Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        const [resultsData, marketsData] = await Promise.all([
          getResults(),
          getMarkets(),
        ]);

        setResults(resultsData);
        setMarkets(marketsData);
        setLoading(false);
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Build cumulative equity curve
  const buildEquityCurve = (): ChartDataPoint[] => {
    const sortedResults = [...results].sort(
      (a, b) =>
        new Date(a.week_start).getTime() - new Date(b.week_start).getTime()
    );

    let cumulativePnL = 0;
    return sortedResults.map((result) => {
      cumulativePnL += result.total_pnl_percent;
      return {
        week_start: result.week_start,
        cumulative_pnl: Math.round(cumulativePnL * 100) / 100,
      };
    });
  };

  // Calculate monthly statistics
  const buildMonthlyStats = (): MonthlyStats[] => {
    const monthlyMap = new Map<string, MonthlyStats>();

    results.forEach((result) => {
      const date = new Date(result.week_start);
      const month = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
      });

      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, {
          month,
          trades: 0,
          wins: 0,
          losses: 0,
          pnl_percent: 0,
        });
      }

      const stats = monthlyMap.get(month)!;
      stats.trades += result.total_trades;
      stats.wins += result.total_wins;
      stats.losses += result.total_losses;
      stats.pnl_percent += result.total_pnl_percent;
    });

    return Array.from(monthlyMap.values());
  };

  // Calculate summary statistics
  const getSummaryStats = () => {
    const totalTrades = results.reduce((sum, r) => sum + r.total_trades, 0);
    const totalWins = results.reduce((sum, r) => sum + r.total_wins, 0);
    const cumulativePnL = results.reduce((sum, r) => sum + r.total_pnl_percent, 0);

    const winRate =
      totalTrades > 0
        ? Math.round((totalWins / totalTrades) * 100 * 100) / 100
        : 0;

    const avgWeeklyPnL =
      results.length > 0
        ? Math.round((cumulativePnL / results.length) * 100) / 100
        : 0;

    return {
      weeksTracked: results.length,
      cumulativePnL: Math.round(cumulativePnL * 100) / 100,
      winRate,
      avgWeeklyPnL,
    };
  };

  const stats = getSummaryStats();
  const equityCurve = buildEquityCurve();
  const monthlyStats = buildMonthlyStats();
  const recentWeeks = [...results]
    .sort(
      (a, b) =>
        new Date(b.week_start).getTime() - new Date(a.week_start).getTime()
    )
    .slice(0, 8);

  const dateRange =
    results.length > 0
      ? `${new Date(results[0].week_start).toLocaleDateString()} — ${new Date(
          results[results.length - 1].week_start
        ).toLocaleDateString()}`
      : "No data";

  if (loading) {
    return (
      <div className="min-h-screen p-4 sm:p-6 lg:p-8">
        <div
          className="max-w-4xl mx-auto"
          style={{ color: "var(--text-heading)" }}
        >
          <SkeletonLoading />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: "var(--text-heading)" }}
          >
            LongEntry Market Scanner
          </h1>
          <p
            className="text-lg"
            style={{ color: "var(--text-muted)" }}
          >
            Live Performance Tracking
          </p>
          <p
            className="text-sm mt-2"
            style={{ color: "var(--text-muted)" }}
          >
            {dateRange}
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            className="mb-6 p-4 rounded-lg border flex items-start space-x-3"
            style={{
              backgroundColor: "rgba(244, 63, 94, 0.1)",
              borderColor: "var(--accent-red)",
            }}
          >
            <AlertCircle
              size={20}
              style={{
                color: "var(--accent-red)",
                flexShrink: 0,
                marginTop: "2px",
              }}
            />
            <div>
              <p
                className="font-medium"
                style={{ color: "var(--accent-red)" }}
              >
                Error loading data
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                {error}
              </p>
            </div>
          </div>
        )}

        {results.length === 0 ? (
          <div
            className="p-8 rounded-lg border text-center"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-solid)",
            }}
          >
            <p
              className="text-lg"
              style={{ color: "var(--text-muted)" }}
            >
              No performance data available yet.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Total Weeks"
                value={stats.weeksTracked.toString()}
              />
              <StatCard
                label="Cumulative P&L"
                value={`${stats.cumulativePnL > 0 ? "+" : ""}${stats.cumulativePnL.toFixed(2)}%`}
                positive={stats.cumulativePnL > 0}
              />
              <StatCard
                label="Win Rate"
                value={`${stats.winRate.toFixed(1)}%`}
              />
              <StatCard
                label="Avg Weekly P&L"
                value={`${stats.avgWeeklyPnL > 0 ? "+" : ""}${stats.avgWeeklyPnL.toFixed(2)}%`}
                positive={stats.avgWeeklyPnL > 0}
              />
            </div>

            {/* Equity Curve */}
            {equityCurve.length > 0 && (
              <div
                className="p-6 rounded-lg border mb-8"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-solid)",
                }}
              >
                <h2
                  className="text-xl font-semibold mb-4"
                  style={{ color: "var(--text-heading)" }}
                >
                  Cumulative Equity Curve
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={equityCurve}>
                    <defs>
                      <linearGradient
                        id="equityGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--accent-green)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--accent-green)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      opacity={0.3}
                    />
                    <XAxis
                      dataKey="week_start"
                      stroke="var(--text-muted)"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke="var(--text-muted)"
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-surface)",
                        border: `1px solid var(--border-solid)`,
                        borderRadius: "0.5rem",
                        color: "var(--text-body)",
                      }}
                      formatter={(value: number) => [
                        `${value > 0 ? "+" : ""}${value.toFixed(2)}%`,
                        "Cumulative P&L",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative_pnl"
                      stroke="var(--accent-green)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#equityGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Monthly Breakdown */}
            {monthlyStats.length > 0 && (
              <div
                className="p-6 rounded-lg border mb-8"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-solid)",
                }}
              >
                <h2
                  className="text-xl font-semibold mb-4"
                  style={{ color: "var(--text-heading)" }}
                >
                  Monthly Breakdown
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        style={{
                          borderBottom: `1px solid var(--border-solid)`,
                        }}
                      >
                        <th
                          className="text-left p-3 font-semibold"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Month
                        </th>
                        <th
                          className="text-center p-3 font-semibold"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Trades
                        </th>
                        <th
                          className="text-center p-3 font-semibold"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Win Rate
                        </th>
                        <th
                          className="text-right p-3 font-semibold"
                          style={{ color: "var(--text-muted)" }}
                        >
                          P&L %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyStats.map((month, idx) => {
                        const winRate =
                          month.trades > 0
                            ? Math.round(
                                (month.wins / month.trades) * 100 * 100
                              ) / 100
                            : 0;
                        return (
                          <tr
                            key={month.month}
                            style={{
                              borderBottom: `1px solid var(--border)`,
                              backgroundColor:
                                idx % 2 === 0 ? "transparent" : "var(--bg-surface)",
                            }}
                          >
                            <td
                              className="p-3"
                              style={{ color: "var(--text-heading)" }}
                            >
                              {month.month}
                            </td>
                            <td
                              className="text-center p-3"
                              style={{ color: "var(--text-body)" }}
                            >
                              {month.trades}
                            </td>
                            <td
                              className="text-center p-3"
                              style={{ color: "var(--text-body)" }}
                            >
                              {winRate.toFixed(1)}%
                            </td>
                            <td
                              className="text-right p-3 font-semibold"
                              style={{
                                color:
                                  month.pnl_percent > 0
                                    ? "var(--accent-green)"
                                    : month.pnl_percent < 0
                                      ? "var(--accent-red)"
                                      : "var(--text-body)",
                              }}
                            >
                              {month.pnl_percent > 0 ? "+" : ""}
                              {month.pnl_percent.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent Weeks */}
            <div
              className="p-6 rounded-lg border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-solid)",
              }}
            >
              <h2
                className="text-xl font-semibold mb-4"
                style={{ color: "var(--text-heading)" }}
              >
                Recent Weeks
              </h2>
              <div className="space-y-3">
                {recentWeeks.map((week) => {
                  const isPositive = week.total_pnl_percent > 0;
                  return (
                    <div
                      key={week.week_start}
                      className="flex items-center justify-between p-3 rounded"
                      style={{ backgroundColor: "var(--bg-surface)" }}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <p
                          className="font-medium w-32"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {new Date(week.week_start).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric" }
                          )}
                        </p>
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-body)" }}
                        >
                          {week.total_trades} trade
                          {week.total_trades !== 1 ? "s" : ""}
                          {" • "}
                          {week.active_markets} active market
                          {week.active_markets !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p
                          className="font-semibold"
                          style={{
                            color: isPositive
                              ? "var(--accent-green)"
                              : "var(--accent-red)",
                          }}
                        >
                          {isPositive ? "+" : ""}
                          {week.total_pnl_percent.toFixed(2)}%
                        </p>
                        {isPositive ? (
                          <TrendingUp
                            size={16}
                            style={{ color: "var(--accent-green)" }}
                          />
                        ) : (
                          <TrendingDown
                            size={16}
                            style={{ color: "var(--accent-red)" }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div
          className="mt-12 pt-6 text-center"
          style={{ borderTop: `1px solid var(--border-solid)` }}
        >
          <p
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Powered by LongEntry Market Scanner • AI-powered weekly analysis
          </p>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  positive?: boolean;
}

function StatCard({ label, value, positive }: StatCardProps) {
  return (
    <div
      className="p-4 rounded-lg border text-center"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-solid)",
      }}
    >
      <p
        className="text-xs font-medium uppercase tracking-wider mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="text-2xl font-bold"
        style={{
          color:
            positive !== undefined
              ? positive
                ? "var(--accent-green)"
                : "var(--accent-red)"
              : "var(--text-heading)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function SkeletonLoading() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div
          className="h-8 w-64 rounded-lg animate-pulse mx-auto mb-2"
          style={{ backgroundColor: "var(--bg-card)" }}
        />
        <div
          className="h-4 w-48 rounded-lg animate-pulse mx-auto"
          style={{ backgroundColor: "var(--bg-card)" }}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((card) => (
          <div
            key={card}
            className="h-20 rounded-lg animate-pulse"
            style={{ backgroundColor: "var(--bg-card)" }}
          />
        ))}
      </div>
      <div
        className="h-64 rounded-lg animate-pulse"
        style={{ backgroundColor: "var(--bg-card)" }}
      />
      <div
        className="h-48 rounded-lg animate-pulse"
        style={{ backgroundColor: "var(--bg-card)" }}
      />
    </div>
  );
}
