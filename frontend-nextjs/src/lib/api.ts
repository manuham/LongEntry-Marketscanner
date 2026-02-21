/**
 * API Client Library for LongEntry Market Scanner
 *
 * Wraps all FastAPI backend endpoints. The backend runs at the same origin,
 * with Next.js rewrites /api/* to http://127.0.0.1:8001/api/*
 *
 * Authentication: X-API-Key header. Key stored/retrieved from localStorage.
 */

import * as Types from "./types";

// ============================================================================
// Configuration & Utilities
// ============================================================================

const API_BASE = "/api";
const API_KEY_STORAGE_KEY = "longentry_api_key";
const API_TIMEOUT = 30000; // 30 seconds

/**
 * Get the stored API key from localStorage.
 */
export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}

/**
 * Set the API key in localStorage.
 */
export function setApiKey(key: string): void {
  if (typeof window === "undefined") return;
  if (key) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
}

/**
 * Clear the stored API key.
 */
export function clearApiKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

/**
 * Build fetch request headers with optional API key authentication.
 */
function buildHeaders(
  apiKey?: string,
  contentType = "application/json"
): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": contentType,
  };

  const key = apiKey || getApiKey();
  if (key) {
    headers["X-API-Key"] = key;
  }

  return headers;
}

/**
 * Generic fetch wrapper with error handling and typing.
 * Throws APIException on non-2xx response.
 */
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<T> {
  const { timeout = API_TIMEOUT, ...fetchOptions } = options;
  const url = `${API_BASE}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json();
        detail = errorBody.detail || errorBody.message || detail;
      } catch {
        // Could not parse error body
      }
      throw new Types.APIException(response.status, detail);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * GET request helper
 */
async function get<T>(
  endpoint: string,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  return fetchAPI<T>(endpoint, {
    ...options,
    method: "GET",
    headers: buildHeaders(),
  });
}

/**
 * POST request helper
 */
async function post<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  return fetchAPI<T>(endpoint, {
    ...options,
    method: "POST",
    headers: buildHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request helper
 */
async function put<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  return fetchAPI<T>(endpoint, {
    ...options,
    method: "PUT",
    headers: buildHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH request helper
 */
async function patch<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  return fetchAPI<T>(endpoint, {
    ...options,
    method: "PATCH",
    headers: buildHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request helper
 */
async function del<T>(
  endpoint: string,
  options?: RequestInit & { timeout?: number }
): Promise<T> {
  return fetchAPI<T>(endpoint, {
    ...options,
    method: "DELETE",
    headers: buildHeaders(),
  });
}

// ============================================================================
// Markets Endpoints
// ============================================================================

/**
 * GET /api/markets
 * List all 14 markets with current price info.
 */
export async function getMarkets(): Promise<Types.Market[]> {
  return get<Types.Market[]>("/markets");
}

/**
 * GET /api/config/{symbol}
 * Get EA configuration for a specific market.
 */
export async function getMarketConfig(
  symbol: string
): Promise<Types.MarketConfigResponse> {
  return get<Types.MarketConfigResponse>(`/config/${symbol}`);
}

/**
 * GET /api/config/max-active-markets
 * Get max active markets setting.
 */
export async function getMaxActiveMarkets(): Promise<Types.MaxActiveResponse> {
  return get<Types.MaxActiveResponse>("/config/max-active-markets");
}

/**
 * PUT /api/config/max-active-markets
 * Set max active markets and re-rank.
 */
export async function setMaxActiveMarkets(
  maxActive: number
): Promise<Types.MaxActiveResponse> {
  return put<Types.MaxActiveResponse>("/config/max-active-markets", {
    max_active: maxActive,
  });
}


/**
 * POST /api/override/{symbol}
 * Manually activate or deactivate a market (or clear override).
 */
export async function setMarketOverride(
  symbol: string,
  active: boolean | null
): Promise<void> {
  return post<void>(`/override/${symbol}`, { active });
}

/**
 * POST /api/config/apply-ranking
 * Re-rank markets and apply auto-activation based on scores.
 */
export async function applyRanking(): Promise<Types.ApplyRankingResponse> {
  return post<Types.ApplyRankingResponse>("/config/apply-ranking");
}

// ============================================================================
// Analytics Endpoints
// ============================================================================

/**
 * GET /api/analytics
 * Get all markets' analysis data for the current week.
 */
export async function getAllAnalytics(): Promise<Types.Analytics[]> {
  return get<Types.Analytics[]>("/analytics");
}

/**
 * GET /api/analytics/{symbol}
 * Get analysis data for a specific market.
 */
export async function getAnalytics(symbol: string): Promise<Types.Analytics> {
  return get<Types.Analytics>(`/analytics/${symbol}`);
}

/**
 * GET /api/analytics/history/{symbol}?weeks={weeks}
 * Get historical analysis data for a specific market over past N weeks.
 */
export async function getAnalyticsHistory(
  symbol: string,
  weeks = 12
): Promise<Types.HistoryPoint[]> {
  return get<Types.HistoryPoint[]>(
    `/analytics/history/${symbol}?weeks=${weeks}`
  );
}

/**
 * GET /api/analytics/history?weeks={weeks}
 * Get historical analysis data for all markets over past N weeks.
 */
export async function getAllAnalyticsHistory(
  weeks = 12
): Promise<Types.HistoryPoint[]> {
  return get<Types.HistoryPoint[]>(`/analytics/history?weeks=${weeks}`);
}

// ============================================================================
// Candle Endpoints
// ============================================================================

/**
 * GET /api/candles/{symbol}?limit={limit}
 * Get H1 candle data for a symbol. Default limit: 168 (1 week of hourly candles).
 */
export async function getCandles(
  symbol: string,
  limit = 168
): Promise<Types.Candle[]> {
  return get<Types.Candle[]>(`/candles/${symbol}?limit=${limit}`);
}

/**
 * POST /api/candles
 * Upload H1 candles from MT5 (typically Friday).
 * Authentication via X-API-Key header.
 */
export async function uploadCandles(
  upload: Types.CandleUploadRequest
): Promise<Types.CandleUploadResponse> {
  return post<Types.CandleUploadResponse>("/candles", upload);
}

// ============================================================================
// Trade Endpoints
// ============================================================================

/**
 * GET /api/trades/{symbol}
 * Get trade history for a specific market.
 */
export async function getTrades(symbol: string): Promise<Types.Trade[]> {
  return get<Types.Trade[]>(`/trades/${symbol}`);
}

/**
 * GET /api/trades/drawdown
 * Get active market drawdown info and weekly P&L.
 */
export async function getDrawdown(): Promise<Types.DrawdownItem[]> {
  return get<Types.DrawdownItem[]>("/trades/drawdown");
}

/**
 * POST /api/trades
 * Upload trade records from MT5.
 * Authentication via X-API-Key header.
 */
export async function uploadTrades(
  trades: Types.TradeUploadBatch
): Promise<Types.TradeUploadResponse> {
  return post<Types.TradeUploadResponse>("/trades", trades);
}

// ============================================================================
// Fundamental & Predictions Endpoints
// ============================================================================

/**
 * GET /api/fundamental
 * Get macro outlook for all regions.
 */
export async function getFundamental(): Promise<Types.FundamentalOutlook[]> {
  return get<Types.FundamentalOutlook[]>("/fundamental");
}

/**
 * GET /api/fundamental/events
 * Get economic calendar events.
 */
export async function getEconomicEvents(): Promise<Types.EconomicEvent[]> {
  return get<Types.EconomicEvent[]>("/fundamental/events");
}

/**
 * POST /api/fundamental/events
 * Create a new economic event.
 */
export async function createEconomicEvent(
  event: Types.CreateEvent
): Promise<Types.EconomicEvent> {
  return post<Types.EconomicEvent>("/fundamental/events", event);
}

/**
 * GET /api/fundamental/ai-predictions
 * Get AI market predictions based on fundamental analysis.
 */
export async function getAIPredictions(): Promise<Types.AIPrediction[]> {
  return get<Types.AIPrediction[]>("/fundamental/ai-predictions");
}

// ============================================================================
// AI Analysis Endpoints
// ============================================================================

/**
 * GET /api/ai-analysis/{symbol}?week_start=YYYY-MM-DD
 * Get AI vision analysis results for a market.
 */
export async function getAIAnalysis(
  symbol: string,
  weekStart?: string
): Promise<Types.AIAnalysisResult> {
  const params = weekStart ? `?week_start=${weekStart}` : "";
  return get<Types.AIAnalysisResult>(`/ai-analysis/${symbol}${params}`);
}

// ============================================================================
// Screenshot Endpoints
// ============================================================================

/**
 * GET /api/screenshots/{symbol}?week_start=YYYY-MM-DD
 * Get screenshot metadata for a market.
 */
export async function getScreenshots(
  symbol: string,
  weekStart?: string
): Promise<Types.ScreenshotList> {
  const params = weekStart ? `?week_start=${weekStart}` : "";
  return get<Types.ScreenshotList>(`/screenshots/${symbol}${params}`);
}

/**
 * POST /api/screenshots
 * Upload a screenshot from ScreenshotSender EA.
 * Authentication via X-API-Key header.
 */
export async function uploadScreenshot(
  upload: Types.ScreenshotUploadRequest
): Promise<Types.ScreenshotUploadResponse> {
  return post<Types.ScreenshotUploadResponse>("/screenshots", upload);
}

// ============================================================================
// Results Endpoints
// ============================================================================

/**
 * GET /api/results
 * Get all weekly performance results.
 */
export async function getResults(): Promise<Types.WeeklyResult[]> {
  return get<Types.WeeklyResult[]>("/results");
}

/**
 * POST /api/results
 * Upload weekly trade result summary from MT5.
 * Authentication via X-API-Key header.
 */
export async function uploadResults(
  result: Types.TradeResultUpload
): Promise<Types.TradeResultResponse> {
  return post<Types.TradeResultResponse>("/results", result);
}

// ============================================================================
// Backtest Endpoints
// ============================================================================

/**
 * GET /api/backtest/heatmap/{symbol}
 * Get parameter sweep heatmap (SL% vs TP% grid with returns).
 */
export async function getBacktestHeatmap(
  symbol: string
): Promise<Types.HeatmapData> {
  return get<Types.HeatmapData>(`/backtest/heatmap/${symbol}`);
}

// ============================================================================
// Health Endpoint
// ============================================================================

/**
 * GET /api/health
 * Health check endpoint (no auth required).
 */
export async function getHealth(): Promise<Types.Health> {
  return get<Types.Health>("/health");
}

// ============================================================================
// Export utilities
// ============================================================================

export { Types };
export { APIException } from "./types";

/**
 * Type guard to check if an error is an APIException
 */
export function isAPIException(error: unknown): error is Types.APIException {
  return error instanceof Types.APIException;
}

/**
 * Helper to format API error messages for display
 */
export function getErrorMessage(error: unknown): string {
  if (isAPIException(error)) {
    return error.detail || error.message || `API Error (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
