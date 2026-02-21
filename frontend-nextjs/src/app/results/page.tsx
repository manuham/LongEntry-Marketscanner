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
  Legend,
} from "recharts";
import { getResults, getDrawdown, getErrorMessage } from "@/lib/api";
import type * as Types from "@/lib/types";

interface ChartDataPoint {
  week_start: string;
  cumulative_pnl: number;
}

export default function ResultsPage() {
  const [results, setResults] = useState<Types.WeeklyResult[]>([]);
  const [drawdown, setDrawdown] = useState<Types.DrawdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        const [resultsData, drawdownData] = await Promise.all([
          getResults(),
          getDrawdown(),
        ]);

        setResults(resultsData);
        setDrawdown(drawdownData);
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

  // Calculate summary statistics
  const getSummaryStats = () => {
    const totalTrades = results.reduce((sum, r) => sum + r.total_trades, 0);
    const totalWins = results.reduce((sum, r) => sum + r.total_wins, 0);
    const totalLosses = results.reduce((sum, r) => sum + r.total_losses, 0);
    const cumulativePnL = results.reduce((sum, r) => sum + r.total_pnl_percent, 0);

    const bestWeek = results.reduce((best, current) =>
      current.total_pnl_percent > (best?.total_pnl_percent ?? -Infinity)
        ? current
        : best
    );

    const worstWeek = results.reduce((worst, current) =>
      current.total_pnl_percent < (worst?.total_pnl_percent ?? Infinity)
        ? current
        : worst
    );

    const winRate =
      totalTrades > 0
        ? Math.round((totalWins / totalTrades) * 100 * 100) / 100
        : 0;

    return {
      totalTrades,
      totalWins,
      totalLosses,
      cumulativePnL: Math.round(cumulativePnL * 100) / 100,
      winRate,
      bestWeek: bestWeek?.total_pnl_percent ?? 0,
      worstWeek: worstWeek?.total_pnl_percent ?? 0,
    };
  };

  const stats = getSummaryStats();
  const equityCurve = buildEquityCurve();

  if (loading) {
    return (
      <div className="min-h-screen p-4 sm:p-6 lg:p-8">
        <div
          className="max-w-6xl mx-auto"
          style={{ color: "var(--text-heading)" }}
        >
          <h1 className="text-3xl font-bold mb-8">Performance Results</h1>
          <SkeletonLoading />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold mb-2"
            style={{ color: "var(--text-heading)" }}
          >
            Performance Results
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            Weekly trading performance and cumulative equity tracking
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
                Error loading results
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
              No results yet. Weekly results will appear here after trades are closed.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <SummaryCard
                label="Cumulative P&L"
                value={`${stats.cumulativePnL > 0 ? "+" : ""}${stats.cumulativePnL.toFixed(2)}%`}
                positive={stats.cumulativePnL > 0}
              />
              <SummaryCard
                label="Total Trades"
                value={stats.totalTrades.toString()}
              />
              <SummaryCard
                label="Win Rate"
                value={`${stats.winRate.toFixed(1)}%`}
              />
              <SummaryCard
                label="Best Week"
                value={`+${stats.bestWeek.toFixed(2)}%`}
                positive={true}
              />
              <SummaryCard
                label="Worst Week"
                value={`${stats.worstWeek.toFixed(2)}%`}
                positive={stats.worstWeek > 0}
              />
            </div>

            {/* Equity Curve Chart */}
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
                <ResponsiveContainer width="100%" height={350}>
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
                      label={{ value: "P&L %", angle: -90, position: "insideLeft" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-surface)",
                        border: `1px solid var(--border-solid)`,
                        borderRadius: "0.5rem",
                        color: "var(--text-body)",
                      }}
                      formatter={(value: string | number | (string | number)[]) => {
                        const v = Number(value);
                        return [`${v > 0 ? "+" : ""}${v.toFixed(2)}%`, "Cumulative P&L"];
                      }}
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

            {/* Week-by-Week Results */}
            <div className="space-y-4">
              <h2
                className="text-xl font-semibold"
                style={{ color: "var(--text-heading)" }}
              >
                Week-by-Week Breakdown
              </h2>

              {[...results]
                .sort(
                  (a, b) =>
                    new Date(b.week_start).getTime() -
                    new Date(a.week_start).getTime()
                )
                .map((week) => (
                  <WeeklyResultCard key={week.week_start} week={week} />
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: string;
  positive?: boolean;
}

function SummaryCard({ label, value, positive }: SummaryCardProps) {
  return (
    <div
      className="p-4 rounded-lg border"
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
      <div className="flex items-baseline gap-2">
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
        {positive !== undefined && (
          <>
            {positive ? (
              <TrendingUp size={16} style={{ color: "var(--accent-green)" }} />
            ) : (
              <TrendingDown size={16} style={{ color: "var(--accent-red)" }} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface WeeklyResultCardProps {
  week: Types.WeeklyResult;
}

function WeeklyResultCard({ week }: WeeklyResultCardProps) {
  const isPositive = week.total_pnl_percent > 0;
  const winRate =
    week.total_trades > 0
      ? Math.round((week.total_wins / week.total_trades) * 100 * 100) / 100
      : 0;

  return (
    <div
      className="p-6 rounded-lg border"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-solid)",
        borderLeftWidth: "4px",
        borderLeftColor: isPositive
          ? "var(--accent-green)"
          : "var(--accent-red)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Week of {new Date(week.week_start).toLocaleDateString()}
          </p>
          <h3
            className="text-xl font-semibold mt-1"
            style={{ color: "var(--text-heading)" }}
          >
            {isPositive ? "+" : ""}
            {week.total_pnl_percent.toFixed(2)}%
          </h3>
        </div>
        <div className="text-right">
          <p
            className="text-sm font-medium mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Active Markets
          </p>
          <p
            className="text-2xl font-bold"
            style={{ color: "var(--accent-blue)" }}
          >
            {week.active_markets}
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Trades
          </p>
          <p
            className="text-lg font-semibold mt-1"
            style={{ color: "var(--text-heading)" }}
          >
            {week.total_trades}
          </p>
        </div>
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Win Rate
          </p>
          <p
            className="text-lg font-semibold mt-1"
            style={{ color: "var(--text-heading)" }}
          >
            {winRate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            W/L
          </p>
          <p
            className="text-lg font-semibold mt-1"
            style={{ color: "var(--text-heading)" }}
          >
            {week.total_wins}/{week.total_losses}
          </p>
        </div>
      </div>

      {/* Per-Market Breakdown */}
      {week.results && week.results.length > 0 && (
        <div>
          <p
            className="text-xs font-medium uppercase tracking-wider mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Per-Market Breakdown
          </p>
          <div className="space-y-2">
            {week.results.map((market) => (
              <div
                key={market.symbol}
                className="flex items-center justify-between p-2 rounded"
                style={{ backgroundColor: "var(--bg-surface)" }}
              >
                <div className="flex items-center gap-3">
                  <p
                    className="font-semibold w-12"
                    style={{ color: "var(--text-heading)" }}
                  >
                    {market.symbol}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {market.trades_taken} trade{market.trades_taken !== 1 ? "s" : ""}
                  </p>
                </div>
                <p
                  className="font-semibold"
                  style={{
                    color:
                      market.total_pnl_percent > 0
                        ? "var(--accent-green)"
                        : market.total_pnl_percent < 0
                          ? "var(--accent-red)"
                          : "var(--text-body)",
                  }}
                >
                  {market.total_pnl_percent > 0 ? "+" : ""}
                  {market.total_pnl_percent.toFixed(2)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonLoading() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((card) => (
          <div
            key={card}
            className="h-24 rounded-lg animate-pulse"
            style={{ backgroundColor: "var(--bg-card)" }}
          />
        ))}
      </div>
      <div
        className="h-96 rounded-lg animate-pulse"
        style={{ backgroundColor: "var(--bg-card)" }}
      />
      <div className="space-y-4">
        {[1, 2, 3].map((week) => (
          <div
            key={week}
            className="h-32 rounded-lg animate-pulse"
            style={{ backgroundColor: "var(--bg-card)" }}
          />
        ))}
      </div>
    </div>
  );
}
