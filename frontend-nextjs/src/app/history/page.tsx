"use client";

import { useState, useEffect } from "react";
import { AlertCircle, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getAllAnalyticsHistory, getMarkets, getErrorMessage } from "@/lib/api";
import type * as Types from "@/lib/types";

const WEEK_OPTIONS = [
  { label: "4 weeks", value: 4 },
  { label: "8 weeks", value: 8 },
  { label: "12 weeks", value: 12 },
  { label: "26 weeks", value: 26 },
  { label: "52 weeks", value: 52 },
];

const COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f43f5e",
  "#14b8a6",
  "#84cc16",
  "#f97316",
  "#a855f7",
  "#06b6d4",
  "#0891b2",
  "#7c3aed",
];

export default function HistoryPage() {
  const [weeks, setWeeks] = useState(12);
  const [history, setHistory] = useState<Types.HistoryPoint[]>([]);
  const [markets, setMarkets] = useState<Types.Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"trends" | "ranks" | "parameters">(
    "trends"
  );
  const [visibleSymbols, setVisibleSymbols] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        const [historyData, marketsData] = await Promise.all([
          getAllAnalyticsHistory(weeks),
          getMarkets(),
        ]);

        setHistory(historyData);
        setMarkets(marketsData);

        // Initialize visible symbols (all on first load)
        if (visibleSymbols.size === 0) {
          const symbols = new Set(historyData.map((h) => h.symbol));
          setVisibleSymbols(symbols);
        }

        setLoading(false);
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        setLoading(false);
      }
    };

    fetchData();
  }, [weeks, visibleSymbols.size]);

  const toggleSymbolVisibility = (symbol: string) => {
    const updated = new Set(visibleSymbols);
    if (updated.has(symbol)) {
      updated.delete(symbol);
    } else {
      updated.add(symbol);
    }
    setVisibleSymbols(updated);
  };

  if (loading) {
    return (
      <div className="min-h-screen px-6 lg:px-10 py-8">
        <div
          className="w-full"
          style={{ color: "var(--text-heading)" }}
        >
          <h1 className="text-3xl font-bold mb-8">Analysis History</h1>
          <SkeletonLoading />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 lg:px-10 py-8">
      <div className="w-full">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold mb-2"
            style={{ color: "var(--text-heading)" }}
          >
            Analysis History
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            Historical analysis trends, rankings, and parameter evolution
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
                Error loading history
              </p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Week Range Selector */}
        <div className="mb-6 flex flex-wrap gap-2">
          {WEEK_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setWeeks(option.value)}
              className="px-4 py-2 rounded-lg font-medium transition-colors"
              style={{
                backgroundColor:
                  weeks === option.value
                    ? "var(--accent-blue)"
                    : "var(--bg-card)",
                color:
                  weeks === option.value
                    ? "#ffffff"
                    : "var(--text-body)",
                border:
                  weeks === option.value
                    ? "none"
                    : `1px solid var(--border-solid)`,
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div
          className="flex gap-0 mb-6 border-b"
          style={{ borderColor: "var(--border-solid)" }}
        >
          {["trends", "ranks", "parameters"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className="px-4 py-3 font-medium transition-colors relative"
              style={{
                color:
                  activeTab === tab
                    ? "var(--accent-blue)"
                    : "var(--text-muted)",
              }}
            >
              {tab === "trends" && "Score Trends"}
              {tab === "ranks" && "Rank Table"}
              {tab === "parameters" && "Parameter Changes"}
              {activeTab === tab && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ backgroundColor: "var(--accent-blue)" }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "trends" && (
          <ScoreTrendsTab
            history={history}
            markets={markets}
            visibleSymbols={visibleSymbols}
            onToggleSymbol={toggleSymbolVisibility}
          />
        )}
        {activeTab === "ranks" && (
          <RankTableTab history={history} markets={markets} />
        )}
        {activeTab === "parameters" && (
          <ParameterChangesTab history={history} markets={markets} />
        )}
      </div>
    </div>
  );
}

interface ScoreTrendsTabProps {
  history: Types.HistoryPoint[];
  markets: Types.Market[];
  visibleSymbols: Set<string>;
  onToggleSymbol: (symbol: string) => void;
}

function ScoreTrendsTab({
  history,
  markets,
  visibleSymbols,
  onToggleSymbol,
}: ScoreTrendsTabProps) {
  // Group by week, then by symbol
  const weekSet = new Set(history.map((h) => h.week_start));
  const sortedWeeks = Array.from(weekSet).sort();

  const chartData = sortedWeeks.map((week) => {
    const point: Record<string, unknown> = { week_start: week };
    history
      .filter((h) => h.week_start === week)
      .forEach((h) => {
        point[h.symbol] = h.final_score ?? 0;
      });
    return point;
  });

  const uniqueSymbols = Array.from(new Set(history.map((h) => h.symbol))).sort();

  return (
    <div>
      {/* Legend with toggles */}
      <div
        className="p-4 rounded-lg border mb-6"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-solid)",
        }}
      >
        <p
          className="text-sm font-medium mb-3"
          style={{ color: "var(--text-muted)" }}
        >
          Toggle symbols to show/hide
        </p>
        <div className="flex flex-wrap gap-2">
          {uniqueSymbols.map((symbol, idx) => (
            <button
              key={symbol}
              onClick={() => onToggleSymbol(symbol)}
              className="px-3 py-1 rounded-full text-sm font-medium transition-all"
              style={{
                backgroundColor: visibleSymbols.has(symbol)
                  ? COLORS[idx % COLORS.length]
                  : "var(--bg-surface)",
                color: visibleSymbols.has(symbol)
                  ? "#ffffff"
                  : "var(--text-muted)",
                opacity: visibleSymbols.has(symbol) ? 1 : 0.5,
              }}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-solid)",
        }}
      >
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
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
              domain={[0, 100]}
              label={{ value: "Score", angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--bg-surface)",
                border: `1px solid var(--border-solid)`,
                borderRadius: "0.5rem",
                color: "var(--text-body)",
              }}
              formatter={(value: any) => {
                if (typeof value === "number") {
                  return value.toFixed(1);
                }
                return value;
              }}
            />
            <Legend />
            {uniqueSymbols.map((symbol, idx) =>
              visibleSymbols.has(symbol) ? (
                <Line
                  key={symbol}
                  type="monotone"
                  dataKey={symbol}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface RankTableTabProps {
  history: Types.HistoryPoint[];
  markets: Types.Market[];
}

function RankTableTab({ history, markets }: RankTableTabProps) {
  // Get unique weeks and symbols
  const weeks = Array.from(new Set(history.map((h) => h.week_start))).sort();
  const symbols = Array.from(new Set(history.map((h) => h.symbol))).sort();

  // Create lookup map
  const historyMap = new Map<string, Types.HistoryPoint>();
  history.forEach((h) => {
    historyMap.set(`${h.symbol}|${h.week_start}`, h);
  });

  const getRankBadgeColor = (rank: number | null | undefined) => {
    if (rank === null || rank === undefined) return "var(--text-muted)";
    if (rank <= 3) return "var(--accent-amber)"; // Gold/Silver/Bronze
    if (rank <= 6) return "var(--accent-green)";
    return "var(--text-muted)";
  };

  return (
    <div
      className="p-4 rounded-lg border overflow-x-auto"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-solid)",
      }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: `1px solid var(--border)` }}>
            <th
              className="text-left p-3 font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Symbol
            </th>
            {weeks.map((week) => (
              <th
                key={week}
                className="text-center p-3 font-semibold whitespace-nowrap"
                style={{ color: "var(--text-muted)" }}
              >
                {new Date(week).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((symbol) => (
            <tr
              key={symbol}
              style={{
                borderBottom: `1px solid var(--border)`,
              }}
            >
              <td
                className="p-3 font-semibold"
                style={{ color: "var(--text-heading)" }}
              >
                {symbol}
              </td>
              {weeks.map((week) => {
                const point = historyMap.get(`${symbol}|${week}`);
                const rank = point?.rank;
                const isActive = point?.is_active;

                return (
                  <td key={week} className="text-center p-3">
                    <div
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-white"
                      style={{
                        backgroundColor: getRankBadgeColor(rank),
                        opacity: isActive ? 1 : 0.5,
                      }}
                    >
                      {rank !== null && rank !== undefined ? rank : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ParameterChangesTabProps {
  history: Types.HistoryPoint[];
  markets: Types.Market[];
}

function ParameterChangesTab({ history, markets }: ParameterChangesTabProps) {
  const symbols = Array.from(new Set(history.map((h) => h.symbol))).sort();
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());

  const toggleExpanded = (symbol: string) => {
    const updated = new Set(expandedSymbols);
    if (updated.has(symbol)) {
      updated.delete(symbol);
    } else {
      updated.add(symbol);
    }
    setExpandedSymbols(updated);
  };

  return (
    <div className="space-y-4">
      {symbols.map((symbol) => {
        const symbolHistory = history
          .filter((h) => h.symbol === symbol)
          .sort(
            (a, b) =>
              new Date(b.week_start).getTime() -
              new Date(a.week_start).getTime()
          )
          .slice(0, 8); // Last 8 weeks

        const isExpanded = expandedSymbols.has(symbol);

        return (
          <div
            key={symbol}
            className="border rounded-lg overflow-hidden"
            style={{ borderColor: "var(--border-solid)" }}
          >
            {/* Collapsible Header */}
            <button
              onClick={() => toggleExpanded(symbol)}
              className="w-full p-4 flex items-center justify-between"
              style={{
                backgroundColor: "var(--bg-card)",
                borderBottom: isExpanded
                  ? `1px solid var(--border-solid)`
                  : "none",
              }}
            >
              <p
                className="font-semibold"
                style={{ color: "var(--text-heading)" }}
              >
                {symbol}
              </p>
              {isExpanded ? (
                <ChevronUp size={18} style={{ color: "var(--text-muted)" }} />
              ) : (
                <ChevronDown size={18} style={{ color: "var(--text-muted)" }} />
              )}
            </button>

            {/* Content */}
            {isExpanded && (
              <div className="p-4" style={{ backgroundColor: "var(--bg-surface)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: `1px solid var(--border)` }}>
                      <th
                        className="text-left p-2 font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Week
                      </th>
                      <th
                        className="text-left p-2 font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Entry Hour
                      </th>
                      <th
                        className="text-left p-2 font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        SL %
                      </th>
                      <th
                        className="text-left p-2 font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        TP %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {symbolHistory.map((point, idx) => {
                      const prevPoint = symbolHistory[idx + 1];

                      const entryHourChanged =
                        prevPoint &&
                        point.opt_entry_hour !== prevPoint.opt_entry_hour;
                      const slChanged =
                        prevPoint &&
                        point.opt_sl_percent !== prevPoint.opt_sl_percent;
                      const tpChanged =
                        prevPoint &&
                        point.opt_tp_percent !== prevPoint.opt_tp_percent;

                      return (
                        <tr
                          key={point.week_start}
                          style={{
                            borderBottom: `1px solid var(--border)`,
                            backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(255, 255, 255, 0.02)",
                          }}
                        >
                          <td
                            className="p-2"
                            style={{ color: "var(--text-body)" }}
                          >
                            {new Date(point.week_start).toLocaleDateString()}
                          </td>
                          <td
                            className="p-2 flex items-center gap-2"
                            style={{
                              color: entryHourChanged
                                ? "var(--accent-amber)"
                                : "var(--text-body)",
                              fontWeight: entryHourChanged ? "600" : "400",
                            }}
                          >
                            {point.opt_entry_hour ?? "—"}
                            {entryHourChanged && (
                              <TrendingUp
                                size={14}
                                style={{ color: "var(--accent-amber)" }}
                              />
                            )}
                          </td>
                          <td
                            className="p-2 flex items-center gap-2"
                            style={{
                              color: slChanged
                                ? "var(--accent-amber)"
                                : "var(--text-body)",
                              fontWeight: slChanged ? "600" : "400",
                            }}
                          >
                            {point.opt_sl_percent
                              ? point.opt_sl_percent.toFixed(2)
                              : "—"}
                            %
                            {slChanged && (
                              <TrendingDown
                                size={14}
                                style={{ color: "var(--accent-amber)" }}
                              />
                            )}
                          </td>
                          <td
                            className="p-2 flex items-center gap-2"
                            style={{
                              color: tpChanged
                                ? "var(--accent-amber)"
                                : "var(--text-body)",
                              fontWeight: tpChanged ? "600" : "400",
                            }}
                          >
                            {point.opt_tp_percent
                              ? point.opt_tp_percent.toFixed(2)
                              : "—"}
                            %
                            {tpChanged && (
                              <TrendingUp
                                size={14}
                                style={{ color: "var(--accent-amber)" }}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SkeletonLoading() {
  return (
    <div className="space-y-6">
      <div
        className="h-10 rounded-lg animate-pulse"
        style={{ backgroundColor: "var(--bg-card)" }}
      />
      <div
        className="h-96 rounded-lg animate-pulse"
        style={{ backgroundColor: "var(--bg-card)" }}
      />
    </div>
  );
}
