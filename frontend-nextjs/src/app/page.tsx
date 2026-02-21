"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Grid3X3, List, RefreshCw } from "lucide-react";
import {
  getMarkets,
  getAllAnalytics,
  getDrawdown,
  getAIPredictions,
  getMaxActiveMarkets,
  getMaxActiveStocks,
  applyRanking,
  getErrorMessage,
  isAPIException,
} from "@/lib/api";
import type * as Types from "@/lib/types";
import MarketCard from "@/components/MarketCard";
import MarketRow from "@/components/MarketRow";
import DrawdownSidebar from "@/components/DrawdownSidebar";
import ActiveControl from "@/components/ActiveControl";

interface CombinedMarketData {
  market: Types.Market;
  analytics: Types.Analytics | null;
  prediction: Types.AIPrediction | null;
  drawdown: Types.DrawdownItem | null;
}

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export default function DashboardPage() {
  const [markets, setMarkets] = useState<Types.Market[]>([]);
  const [allAnalytics, setAllAnalytics] = useState<Types.Analytics[]>([]);
  const [drawdownData, setDrawdownData] = useState<Types.DrawdownItem[]>([]);
  const [predictions, setPredictions] = useState<Types.AIPrediction[]>([]);
  const [maxActiveMarkets, setMaxActiveMarkets] = useState(6);
  const [maxActiveStocks, setMaxActiveStocks] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [marketsData, analyticsData, drawdownData, predictionsData, maxMarketsData, maxStocksData] =
        await Promise.all([
          getMarkets(),
          getAllAnalytics(),
          getDrawdown(),
          getAIPredictions(),
          getMaxActiveMarkets(),
          getMaxActiveStocks(),
        ]);

      setMarkets(marketsData);
      setAllAnalytics(analyticsData);
      setDrawdownData(drawdownData);
      setPredictions(predictionsData);
      setMaxActiveMarkets(maxMarketsData.max_active);
      setMaxActiveStocks(maxStocksData.max_active);
      setLoading(false);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Combine data and organize by pool
  const combineData = (): {
    indices: CombinedMarketData[];
    stocks: CombinedMarketData[];
  } => {
    const combined: CombinedMarketData[] = markets.map((market) => ({
      market,
      analytics:
        allAnalytics.find((a) => a.symbol === market.symbol) || null,
      prediction:
        predictions.find((p) => p.symbol === market.symbol) || null,
      drawdown: drawdownData.find((d) => d.symbol === market.symbol) || null,
    }));

    return {
      indices: combined.filter((d) => d.market.category !== "stock"),
      stocks: combined.filter((d) => d.market.category === "stock"),
    };
  };

  const sortByRank = (data: CombinedMarketData[]): CombinedMarketData[] => {
    return [...data].sort((a, b) => {
      const aActive = a.analytics?.is_active ? 1 : 0;
      const bActive = b.analytics?.is_active ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aScore = a.analytics?.final_score ?? -Infinity;
      const bScore = b.analytics?.final_score ?? -Infinity;
      return bScore - aScore;
    });
  };

  const { indices, stocks } = combineData();
  const sortedIndices = sortByRank(indices);
  const sortedStocks = sortByRank(stocks);

  const activeIndicesCount = indices.filter(
    (d) => d.analytics?.is_active
  ).length;
  const activeStocksCount = stocks.filter((d) => d.analytics?.is_active).length;

  if (loading) {
    return (
      <div className="min-h-screen px-6 lg:px-10 py-8">
        <div style={{ color: "var(--text-heading)" }}>
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold tracking-tight">Market Dashboard</h1>
          </div>
          <SkeletonLoading />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="text-center mb-10">
        <h1
          className="text-3xl font-bold tracking-tight mb-2"
          style={{ color: "var(--text-heading)" }}
        >
          Market Dashboard
        </h1>
        <p
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {markets.length} markets tracked · {activeIndicesCount + activeStocksCount} active
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="mb-6 p-4 rounded-xl flex items-start space-x-3"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <AlertCircle
            size={18}
            style={{ color: "var(--accent-red)", flexShrink: 0, marginTop: "2px" }}
          />
          <div>
            <p
              className="font-medium text-sm"
              style={{ color: "var(--accent-red)" }}
            >
              Error loading data
            </p>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              {error}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-8">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Indices & Commodities Pool */}
          <MarketPool
            title="Indices & Commodities"
            data={sortedIndices}
            activeCount={activeIndicesCount}
            maxActive={maxActiveMarkets}
            onMaxActiveChange={setMaxActiveMarkets}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            isStocks={false}
            onRefresh={fetchData}
          />

          {/* Stocks Pool */}
          <MarketPool
            title="Stocks"
            data={sortedStocks}
            activeCount={activeStocksCount}
            maxActive={maxActiveStocks}
            onMaxActiveChange={setMaxActiveStocks}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            isStocks={true}
            onRefresh={fetchData}
          />
        </div>

        {/* Drawdown Sidebar */}
        <div className="hidden xl:block w-80 flex-shrink-0">
          <DrawdownSidebar data={drawdownData} />
        </div>
      </div>
    </div>
  );
}

interface MarketPoolProps {
  title: string;
  data: CombinedMarketData[];
  activeCount: number;
  maxActive: number;
  onMaxActiveChange: (value: number) => void;
  viewMode: "grid" | "table";
  onViewModeChange: (mode: "grid" | "table") => void;
  isStocks: boolean;
  onRefresh: () => void;
}

function MarketPool({
  title,
  data,
  activeCount,
  maxActive,
  onMaxActiveChange,
  viewMode,
  onViewModeChange,
  isStocks,
  onRefresh,
}: MarketPoolProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleApplyRanking = async () => {
    try {
      await applyRanking();
      onRefresh();
    } catch (err) {
      console.error("Failed to apply ranking:", err);
    }
  };

  return (
    <div className="mb-10">
      {/* Pool Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center space-x-3">
          <h2
            className="text-lg font-semibold tracking-tight"
            style={{ color: "var(--text-heading)" }}
          >
            {title}
          </h2>
          <div
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              color: "var(--accent-blue)",
            }}
          >
            <span>{activeCount} active</span>
            <span style={{ color: "var(--text-faint)" }}>/ {data.length}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* View Mode Toggle */}
          <div
            className="flex p-0.5 rounded-lg"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <button
              onClick={() => onViewModeChange("grid")}
              className="p-1.5 rounded-md transition-all"
              style={{
                backgroundColor: viewMode === "grid" ? "var(--bg-card)" : "transparent",
                color: viewMode === "grid" ? "var(--text-heading)" : "var(--text-faint)",
                boxShadow: viewMode === "grid" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
              }}
              title="Grid view"
            >
              <Grid3X3 size={14} />
            </button>
            <button
              onClick={() => onViewModeChange("table")}
              className="p-1.5 rounded-md transition-all"
              style={{
                backgroundColor: viewMode === "table" ? "var(--bg-card)" : "transparent",
                color: viewMode === "table" ? "var(--text-heading)" : "var(--text-faint)",
                boxShadow: viewMode === "table" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
              }}
              title="Table view"
            >
              <List size={14} />
            </button>
          </div>

          {/* Expand/Collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-md transition-colors text-sm"
            style={{
              color: "var(--text-muted)",
            }}
          >
            {isExpanded ? "−" : "+"}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Controls */}
          <div className="mb-5 flex items-center justify-between gap-4">
            <ActiveControl
              currentValue={maxActive}
              onValueChange={onMaxActiveChange}
              min={1}
              max={data.length}
              label={`Max Active: ${maxActive}`}
            />
            <button
              onClick={handleApplyRanking}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: "var(--accent-blue)",
                color: "#ffffff",
                boxShadow: "0 1px 3px rgba(59, 130, 246, 0.3)",
              }}
            >
              Apply Ranking
            </button>
          </div>

          {/* Markets Grid/Table */}
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {data.map((item) => (
                <MarketCard
                  key={item.market.symbol}
                  market={item.market}
                  analytics={item.analytics}
                  prediction={item.prediction}
                  drawdown={item.drawdown}
                  onRefresh={onRefresh}
                />
              ))}
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{
                border: "1px solid var(--border-solid)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <table className="w-full">
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderBottom: `1px solid var(--border-solid)`,
                    }}
                  >
                    {["Rank", "Symbol", "Price", "1W%", "Score", "AI", "BT", "Fund", "Status", ""].map((header) => (
                      <th
                        key={header}
                        className="text-left text-xs font-semibold uppercase tracking-wider p-3"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <MarketRow
                      key={item.market.symbol}
                      market={item.market}
                      analytics={item.analytics}
                      prediction={item.prediction}
                      drawdown={item.drawdown}
                      onRefresh={onRefresh}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SkeletonLoading() {
  return (
    <div className="space-y-8">
      {[1, 2].map((pool) => (
        <div key={pool}>
          <div
            className="h-12 rounded-xl mb-5 animate-pulse"
            style={{ backgroundColor: "var(--bg-surface)" }}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5].map((card) => (
              <div
                key={card}
                className="h-56 rounded-xl animate-pulse"
                style={{ backgroundColor: "var(--bg-card)" }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
