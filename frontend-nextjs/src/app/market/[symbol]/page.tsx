"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getAnalytics,
  getTrades,
  getCandles,
  getBacktestHeatmap,
  getAIPredictions,
  getScreenshots,
  getAIAnalysis,
  getFundamental,
  getEconomicEvents,
  isAPIException,
  getErrorMessage,
} from "@/lib/api";
import * as Types from "@/lib/types";
import AIInsightPanel from "@/components/AIInsightPanel";
import TradeTable from "@/components/TradeTable";
import HeatmapGrid from "@/components/HeatmapGrid";
import PerformanceStats from "@/components/PerformanceStats";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Activity,
  TrendingUp,
  BarChart3,
} from "lucide-react";

type Tab = "chart" | "backtest" | "fundamentals";

export default function MarketDetailPage() {
  const params = useParams();
  const symbol = params.symbol as string;

  const [analytics, setAnalytics] = useState<Types.Analytics | null>(null);
  const [trades, setTrades] = useState<Types.Trade[]>([]);
  const [candles, setCandles] = useState<Types.Candle[]>([]);
  const [heatmap, setHeatmap] = useState<Types.HeatmapData | null>(null);
  const [aiPredictions, setAIPredictions] = useState<Types.AIPrediction[]>([]);
  const [screenshots, setScreenshots] = useState<Types.ScreenshotList | null>(
    null
  );
  const [aiAnalysis, setAIAnalysis] = useState<Types.AIAnalysisResult | null>(
    null
  );
  const [fundamentals, setFundamentals] = useState<
    Types.FundamentalOutlook[] | null
  >(null);
  const [economicEvents, setEconomicEvents] = useState<
    Types.EconomicEvent[] | null
  >(null);

  const [activeTab, setActiveTab] = useState<Tab>("chart");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiInsightOpen, setAIInsightOpen] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [
          analyticsData,
          tradesData,
          candlesData,
          heatmapData,
          predictionsData,
          screenshotsData,
          fundamentalsData,
          eventsData,
        ] = await Promise.all([
          getAnalytics(symbol),
          getTrades(symbol),
          getCandles(symbol, 500),
          getBacktestHeatmap(symbol),
          getAIPredictions(),
          getScreenshots(symbol),
          getFundamental(),
          getEconomicEvents(),
        ]);

        setAnalytics(analyticsData);
        setTrades(tradesData);
        setCandles(candlesData);
        setHeatmap(heatmapData);
        setAIPredictions(predictionsData);
        setScreenshots(screenshotsData);
        setFundamentals(fundamentalsData);
        setEconomicEvents(eventsData);

        // Try to fetch AI analysis, but don't fail if it's 404
        try {
          const aiAnalysisData = await getAIAnalysis(symbol);
          setAIAnalysis(aiAnalysisData);
        } catch (err) {
          if (isAPIException(err) && err.status === 404) {
            // AI analysis not available yet, that's ok
          } else {
            console.error("Error fetching AI analysis:", err);
          }
        }
      } catch (err) {
        console.error("Error fetching market data:", err);
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchData();
    }
  }, [symbol]);

  if (loading) {
    return (
      <div
        className="min-h-screen p-4"
        style={{ backgroundColor: "var(--bg-base)" }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <p style={{ color: "var(--text-muted)" }}>Loading market data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div
        className="min-h-screen p-4"
        style={{ backgroundColor: "var(--bg-base)" }}
      >
        <div className="max-w-7xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-lg transition-colors"
            style={{
              color: "var(--accent-blue)",
              backgroundColor: "var(--bg-card)",
            }}
          >
            <ArrowLeft size={18} />
            Back to Markets
          </Link>
          <div
            className="p-6 rounded-lg"
            style={{
              backgroundColor: "var(--bg-card)",
              borderLeft: "4px solid var(--accent-red)",
            }}
          >
            <h2 style={{ color: "var(--text-heading)" }} className="font-bold">
              Error
            </h2>
            <p style={{ color: "var(--text-body)" }}>{error || "Market not found"}</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate percentage change color
  const change1w = analytics.change_1w ?? 0;
  const changeColor = change1w >= 0 ? "var(--accent-green)" : "var(--accent-red)";

  // Find the market region for fundamental outlook
  let relatedFundamental: Types.FundamentalOutlook | null = null;
  if (fundamentals) {
    // Try to match region based on symbol patterns
    if (["EURUSD", "GBPUSD", "EURGBP"].includes(symbol)) {
      relatedFundamental = fundamentals.find((f) => f.region === "EU") || null;
    } else if (["USDJPY", "AUDUSD", "NZDUSD"].includes(symbol)) {
      relatedFundamental =
        fundamentals.find((f) => f.region === "Japan") ||
        fundamentals.find((f) => f.region === "AUS") ||
        null;
    } else if (["XAUUSD"].includes(symbol)) {
      relatedFundamental = fundamentals.find((f) => f.region === "US") || null;
    } else {
      relatedFundamental = fundamentals[0] || null;
    }
  }

  // Find related AI prediction
  const relatedPrediction = aiPredictions.find((p) => p.symbol === symbol);

  // Filter events for related region (simplified)
  const relatedEvents = economicEvents || [];

  return (
    <div
      className="min-h-screen p-4"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-lg transition-colors hover:opacity-70"
          style={{
            color: "var(--accent-blue)",
            backgroundColor: "var(--bg-card)",
          }}
        >
          <ArrowLeft size={18} />
          Back to Markets
        </Link>

        {/* Hero Header */}
        <div
          className="rounded-lg p-6 mb-6 sticky top-20 z-40"
          style={{ backgroundColor: "var(--bg-card)" }}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1
                style={{ color: "var(--text-heading)" }}
                className="text-3xl font-bold mb-2"
              >
                {symbol}
              </h1>
              <div className="flex items-center gap-4">
                <div className="text-2xl font-semibold" style={{ color: "var(--text-heading)" }}>
                  {analytics.current_price?.toFixed(2) ?? "N/A"}
                </div>
                <div
                  className="px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor:
                      change1w >= 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(244, 63, 94, 0.1)",
                    color: changeColor,
                  }}
                >
                  {change1w >= 0 ? "+" : ""}
                  {change1w?.toFixed(2)}%
                </div>
              </div>
            </div>
            <div className="text-right">
              {analytics.rank && (
                <div
                  className="text-lg font-bold px-3 py-1 rounded"
                  style={{
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    color: "var(--accent-blue)",
                  }}
                >
                  Rank #{analytics.rank}
                </div>
              )}
              <div className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                Score: {analytics.final_score?.toFixed(1) ?? "N/A"}
              </div>
            </div>
          </div>

          {/* Active Status Toggle */}
          <div className="flex items-center gap-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <Activity
                size={18}
                style={{
                  color: analytics.is_active
                    ? "var(--accent-green)"
                    : "var(--text-muted)",
                }}
              />
              <span style={{ color: "var(--text-body)" }}>
                Status:{" "}
                <span
                  style={{
                    color: analytics.is_active
                      ? "var(--accent-green)"
                      : "var(--accent-red)",
                    fontWeight: "bold",
                  }}
                >
                  {analytics.is_active ? "ACTIVE" : "INACTIVE"}
                </span>
              </span>
            </div>
            {analytics.is_manually_overridden && (
              <span
                className="text-xs px-2 py-1 rounded"
                style={{
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                  color: "var(--accent-amber)",
                }}
              >
                Manually Overridden
              </span>
            )}
          </div>
        </div>

        {/* Tab Bar */}
        <div
          className="flex gap-4 mb-6 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          {[
            { id: "chart", label: "Chart & Trades", icon: Activity },
            { id: "backtest", label: "Backtest", icon: BarChart3 },
            { id: "fundamentals", label: "Fundamentals", icon: TrendingUp },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as Tab)}
              className="flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2"
              style={{
                color:
                  activeTab === id ? "var(--accent-blue)" : "var(--text-muted)",
                borderBottomColor:
                  activeTab === id ? "var(--accent-blue)" : "transparent",
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        {activeTab === "chart" && (
          <div className="space-y-6">
            {/* AI Insight Panel */}
            {aiAnalysis && (
              <div>
                <button
                  onClick={() => setAIInsightOpen(!aiInsightOpen)}
                  className="w-full flex items-center justify-between p-4 rounded-lg transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderLeft: "4px solid var(--accent-purple)",
                  }}
                >
                  <span style={{ color: "var(--text-heading)" }} className="font-bold">
                    AI Vision Insight
                  </span>
                  <ChevronDown
                    size={20}
                    style={{
                      color: "var(--text-muted)",
                      transform: aiInsightOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                    }}
                  />
                </button>
                {aiInsightOpen && <AIInsightPanel analysis={aiAnalysis} />}
              </div>
            )}

            {/* Screenshot Viewer */}
            {screenshots && screenshots.screenshots.length > 0 && (
              <div
                className="rounded-lg p-6"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <h3
                  style={{ color: "var(--text-heading)" }}
                  className="text-lg font-bold mb-4"
                >
                  Chart Screenshots
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {screenshots.screenshots.map((screenshot) => (
                    <div
                      key={screenshot.timeframe}
                      className="rounded-lg overflow-hidden border"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div
                        className="aspect-video flex items-center justify-center"
                        style={{ backgroundColor: "var(--bg-surface)" }}
                      >
                        <div className="text-center">
                          <p style={{ color: "var(--text-muted)" }}>
                            {screenshot.timeframe}
                          </p>
                          <p
                            style={{ color: "var(--text-faint)" }}
                            className="text-sm"
                          >
                            Screenshot
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chart Placeholder */}
            <div
              className="rounded-lg p-12 text-center"
              style={{ backgroundColor: "var(--bg-card)" }}
            >
              <div
                id="chart-container"
                style={{ color: "var(--text-muted)" }}
              >
                <p>Chart requires lightweight-charts (client-side rendering)</p>
              </div>
            </div>

            {/* Performance Stats */}
            <PerformanceStats analytics={analytics} trades={trades} />

            {/* Trade Table */}
            {trades.length > 0 && (
              <div
                className="rounded-lg p-6 overflow-x-auto"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <h3
                  style={{ color: "var(--text-heading)" }}
                  className="text-lg font-bold mb-4"
                >
                  Trade History
                </h3>
                <TradeTable trades={trades} />
              </div>
            )}

            {/* Sidebar Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Config Card */}
              <div
                className="rounded-lg p-6"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <h4
                  style={{ color: "var(--text-heading)" }}
                  className="font-bold mb-4"
                >
                  Configuration
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Entry Hour:</span>
                    <span style={{ color: "var(--text-heading)" }} className="font-medium">
                      {analytics.opt_entry_hour ?? "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>SL %:</span>
                    <span style={{ color: "var(--text-heading)" }} className="font-medium">
                      {analytics.opt_sl_percent?.toFixed(2) ?? "N/A"}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>TP %:</span>
                    <span style={{ color: "var(--text-heading)" }} className="font-medium">
                      {analytics.opt_tp_percent?.toFixed(2) ?? "N/A"}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Trend & Momentum Card */}
              <div
                className="rounded-lg p-6"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <h4
                  style={{ color: "var(--text-heading)" }}
                  className="font-bold mb-4"
                >
                  Trend & Momentum
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>RSI(14):</span>
                    <span style={{ color: "var(--text-heading)" }} className="font-medium">
                      {analytics.rsi_14?.toFixed(1) ?? "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>SMA(20):</span>
                    <span style={{ color: "var(--text-heading)" }} className="font-medium">
                      {analytics.sma_20?.toFixed(2) ?? "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>SMA(50):</span>
                    <span style={{ color: "var(--text-heading)" }} className="font-medium">
                      {analytics.sma_50?.toFixed(2) ?? "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price Changes Card */}
              <div
                className="rounded-lg p-6 md:col-span-2"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <h4
                  style={{ color: "var(--text-heading)" }}
                  className="font-bold mb-4"
                >
                  Price Changes
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "1W", value: analytics.change_1w },
                    { label: "2W", value: analytics.change_2w },
                    { label: "1M", value: analytics.change_1m },
                    { label: "3M", value: analytics.change_3m },
                  ].map((item) => (
                    <div key={item.label}>
                      <p style={{ color: "var(--text-muted)" }} className="text-sm">
                        {item.label}
                      </p>
                      <p
                        className="font-bold text-lg"
                        style={{
                          color:
                            (item.value ?? 0) >= 0
                              ? "var(--accent-green)"
                              : "var(--accent-red)",
                        }}
                      >
                        {(item.value ?? 0) >= 0 ? "+" : ""}
                        {item.value?.toFixed(2) ?? "N/A"}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "backtest" && (
          <div className="space-y-6">
            {/* Backtest Results Card */}
            <div
              className="rounded-lg p-6"
              style={{ backgroundColor: "var(--bg-card)" }}
            >
              <h3
                style={{ color: "var(--text-heading)" }}
                className="text-lg font-bold mb-6"
              >
                2-Year Backtest Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {[
                  {
                    label: "Total Return",
                    value: `${analytics.bt_total_return?.toFixed(1) ?? "N/A"}%`,
                  },
                  {
                    label: "Win Rate",
                    value: `${analytics.bt_win_rate?.toFixed(1) ?? "N/A"}%`,
                  },
                  {
                    label: "Profit Factor",
                    value: analytics.bt_profit_factor?.toFixed(2) ?? "N/A",
                  },
                  {
                    label: "Max Drawdown",
                    value: `${analytics.bt_max_drawdown?.toFixed(1) ?? "N/A"}%`,
                  },
                  {
                    label: "Total Trades",
                    value: analytics.bt_total_trades ?? "N/A",
                  },
                  {
                    label: "Param Stability",
                    value: `${analytics.bt_param_stability?.toFixed(1) ?? "N/A"}%`,
                  },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p style={{ color: "var(--text-muted)" }} className="text-sm">
                      {stat.label}
                    </p>
                    <p
                      style={{ color: "var(--text-heading)" }}
                      className="text-2xl font-bold"
                    >
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Heatmap */}
            {heatmap && (
              <div
                className="rounded-lg p-6"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <h3
                  style={{ color: "var(--text-heading)" }}
                  className="text-lg font-bold mb-4"
                >
                  Parameter Sweep Heatmap
                </h3>
                <HeatmapGrid heatmapData={heatmap} />
              </div>
            )}
          </div>
        )}

        {activeTab === "fundamentals" && (
          <div className="space-y-6">
            {/* AI Market Analysis */}
            {relatedPrediction && (
              <div
                className="rounded-lg p-6"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <h3
                  style={{ color: "var(--text-heading)" }}
                  className="text-lg font-bold mb-4"
                >
                  AI Market Analysis
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p style={{ color: "var(--text-muted)" }} className="text-sm">
                      Prediction
                    </p>
                    <p
                      className="text-xl font-bold capitalize"
                      style={{
                        color:
                          relatedPrediction.prediction === "bullish"
                            ? "var(--accent-green)"
                            : relatedPrediction.prediction === "bearish"
                              ? "var(--accent-red)"
                              : "var(--text-heading)",
                      }}
                    >
                      {relatedPrediction.prediction}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "var(--text-muted)" }} className="text-sm">
                      Score
                    </p>
                    <p style={{ color: "var(--text-heading)" }} className="text-xl font-bold">
                      {relatedPrediction.score.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "var(--text-muted)" }} className="text-sm">
                      Updated
                    </p>
                    <p style={{ color: "var(--text-heading)" }} className="text-sm">
                      {relatedPrediction.updated_at
                        ? new Date(
                            relatedPrediction.updated_at
                          ).toLocaleDateString()
                        : "N/A"}
                    </p>
                  </div>
                </div>
                {relatedPrediction.reasoning && (
                  <div className="mt-4 p-4 rounded" style={{ backgroundColor: "var(--bg-surface)" }}>
                    <p style={{ color: "var(--text-body)" }}>
                      {relatedPrediction.reasoning}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Fundamental Outlook */}
            {relatedFundamental && (
              <div
                className="rounded-lg p-6"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <h3
                  style={{ color: "var(--text-heading)" }}
                  className="text-lg font-bold mb-4"
                >
                  Fundamental Outlook ({relatedFundamental.region})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p style={{ color: "var(--text-muted)" }} className="text-sm">
                      CB Stance
                    </p>
                    <p style={{ color: "var(--text-heading)" }} className="font-bold">
                      {relatedFundamental.cb_stance > 0
                        ? "Dovish"
                        : relatedFundamental.cb_stance < 0
                          ? "Hawkish"
                          : "Neutral"}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "var(--text-muted)" }} className="text-sm">
                      Growth Outlook
                    </p>
                    <p style={{ color: "var(--text-heading)" }} className="font-bold">
                      {relatedFundamental.growth_outlook > 0
                        ? "Expanding"
                        : relatedFundamental.growth_outlook < 0
                          ? "Contracting"
                          : "Stable"}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "var(--text-muted)" }} className="text-sm">
                      Inflation Trend
                    </p>
                    <p style={{ color: "var(--text-heading)" }} className="font-bold">
                      {relatedFundamental.inflation_trend > 0
                        ? "Rising"
                        : relatedFundamental.inflation_trend < 0
                          ? "Falling"
                          : "Stable"}
                    </p>
                  </div>
                  <div>
                    <p style={{ color: "var(--text-muted)" }} className="text-sm">
                      Risk Sentiment
                    </p>
                    <p style={{ color: "var(--text-heading)" }} className="font-bold">
                      {relatedFundamental.risk_sentiment > 0
                        ? "Risk On"
                        : relatedFundamental.risk_sentiment < 0
                          ? "Risk Off"
                          : "Neutral"}
                    </p>
                  </div>
                </div>
                {relatedFundamental.notes && (
                  <div className="mt-4 p-4 rounded" style={{ backgroundColor: "var(--bg-surface)" }}>
                    <p style={{ color: "var(--text-body)" }}>
                      {relatedFundamental.notes}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Upcoming Events */}
            {relatedEvents.length > 0 && (
              <div
                className="rounded-lg p-6"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <h3
                  style={{ color: "var(--text-heading)" }}
                  className="text-lg font-bold mb-4"
                >
                  Upcoming Economic Events
                </h3>
                <div className="space-y-3">
                  {relatedEvents.slice(0, 5).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start justify-between p-3 rounded"
                      style={{ backgroundColor: "var(--bg-surface)" }}
                    >
                      <div>
                        <p
                          style={{ color: "var(--text-heading)" }}
                          className="font-medium"
                        >
                          {event.title}
                        </p>
                        <p style={{ color: "var(--text-muted)" }} className="text-sm">
                          {new Date(event.event_date).toLocaleDateString()} •{" "}
                          {event.region}
                        </p>
                      </div>
                      <span
                        className="text-xs px-2 py-1 rounded font-medium"
                        style={{
                          backgroundColor:
                            event.impact === "high"
                              ? "rgba(244, 63, 94, 0.1)"
                              : event.impact === "medium"
                                ? "rgba(245, 158, 11, 0.1)"
                                : "rgba(59, 130, 246, 0.1)",
                          color:
                            event.impact === "high"
                              ? "var(--accent-red)"
                              : event.impact === "medium"
                                ? "var(--accent-amber)"
                                : "var(--accent-blue)",
                        }}
                      >
                        {event.impact.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
