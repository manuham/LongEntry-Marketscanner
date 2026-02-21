/**
 * TypeScript types for LongEntry Market Scanner API
 * Mirrors backend Pydantic models from app/schemas/
 */

// ============================================================================
// Market Types
// ============================================================================

export interface Market {
  symbol: string;
  name: string;
  category: string; // "index" | "commodity" | "stock"
  latest_price: number | null;
  latest_time?: string | null;
}

export interface MarketConfigResponse {
  symbol: string;
  active: boolean;
  entryHour: number;
  entryMinute: number;
  slPercent: number;
  tpPercent: number;
  weekStart: string;
}

export interface OverrideRequest {
  active: boolean | null; // true/false = force, null = clear override
}

export interface MaxActiveRequest {
  max_active: number;
}

export interface MaxActiveResponse {
  max_active: number;
  active_count: number;
}

export interface MaxActiveAllResponse {
  markets: MaxActiveResponse;
  stocks: MaxActiveResponse;
}

export interface ApplyRankingResponse {
  max_active: number;
  active_count: number;
  applied: boolean;
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface Analytics {
  symbol: string;
  week_start: string; // ISO date format YYYY-MM-DD
  technical_score: number | null;
  avg_daily_growth: number | null;
  avg_daily_loss: number | null;
  most_bullish_day: number | null;
  most_bearish_day: number | null;
  up_day_win_rate: number | null;
  current_price: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  rsi_14: number | null;
  atr_14: number | null;
  daily_range_pct: number | null;
  change_1w: number | null;
  change_2w: number | null;
  change_1m: number | null;
  change_3m: number | null;
  candle_count: number;
  daily_bar_count: number;
  // Backtest fields
  backtest_score: number | null;
  fundamental_score: number | null;
  final_score: number | null;
  rank: number | null;
  is_active: boolean;
  is_manually_overridden: boolean;
  opt_entry_hour: number | null;
  opt_sl_percent: number | null;
  opt_tp_percent: number | null;
  bt_total_return: number | null;
  bt_win_rate: number | null;
  bt_profit_factor: number | null;
  bt_total_trades: number | null;
  bt_max_drawdown: number | null;
  bt_param_stability: number | null;
}

export interface AnalysisSummary {
  symbol: string;
  week_start: string;
  technical_score: number | null;
  avg_daily_growth: number | null;
  avg_daily_loss: number | null;
  most_bullish_day: number | null;
  most_bearish_day: number | null;
  up_day_win_rate: number | null;
  backtest_score: number | null;
  fundamental_score: number | null;
  final_score: number | null;
  rank: number | null;
  is_active: boolean;
  is_manually_overridden: boolean;
  opt_entry_hour: number | null;
  opt_sl_percent: number | null;
  opt_tp_percent: number | null;
  bt_total_return: number | null;
  bt_win_rate: number | null;
  bt_profit_factor: number | null;
  bt_total_trades: number | null;
  bt_max_drawdown: number | null;
  bt_param_stability: number | null;
}

export interface RunAnalysisResponse {
  week_start: string;
  analyzed: number;
  failed: number;
  results: Record<string, any>[];
}

// ============================================================================
// Candle Types
// ============================================================================

export interface CandleData {
  time: string; // ISO datetime
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Candle {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleUploadRequest {
  symbol: string;
  timeframe: string;
  apiKey: string;
  candles: CandleData[];
}

export interface CandleUploadResponse {
  symbol: string;
  received: number;
  inserted: number;
  duplicates: number;
}

// ============================================================================
// Trade Types
// ============================================================================

export interface TradeRecord {
  symbol: string;
  open_time: string; // ISO datetime
  close_time?: string | null;
  open_price: number;
  close_price?: number | null;
  sl_price?: number | null;
  tp_price?: number | null;
  lot_size?: number | null;
  pnl_amount?: number | null;
  pnl_percent?: number | null;
  result?: string | null; // 'win', 'loss', 'open'
  magic_number?: number | null;
}

export interface TradeResponse {
  id: number;
  symbol: string;
  open_time: string;
  close_time?: string | null;
  open_price: number;
  close_price?: number | null;
  sl_price?: number | null;
  tp_price?: number | null;
  lot_size?: number | null;
  pnl_amount?: number | null;
  pnl_percent?: number | null;
  result?: string | null;
  week_start?: string | null;
}

export interface TradeUploadBatch {
  apiKey: string;
  trades: TradeRecord[];
}

export interface TradeUploadResponse {
  received: number;
  inserted: number;
  duplicates: number;
}

export interface Trade extends TradeResponse {
  entry_hour?: number;
}

// ============================================================================
// Fundamental & Predictions Types
// ============================================================================

export interface RegionOutlook {
  region: string;
  cb_stance: number; // -1=hawkish, 0=neutral, 1=dovish
  growth_outlook: number; // -1=contracting, 0=stable, 1=expanding
  inflation_trend: number; // -1=falling, 0=stable, 1=rising
  risk_sentiment: number; // -1=risk_off, 0=neutral, 1=risk_on
  notes?: string | null;
  updated_at?: string | null;
}

export interface UpdateOutlook {
  cb_stance?: number | null;
  growth_outlook?: number | null;
  inflation_trend?: number | null;
  risk_sentiment?: number | null;
  notes?: string | null;
}

export interface EconomicEvent {
  id?: number | null;
  region: string;
  event_date: string; // ISO date YYYY-MM-DD
  title: string;
  impact: string; // "high" | "medium" | "low"
  description?: string | null;
}

export interface CreateEvent {
  region: string;
  event_date: string;
  title: string;
  impact: string;
  description?: string | null;
}

export interface AIPrediction {
  symbol: string;
  prediction: string; // "bullish" | "neutral" | "bearish"
  score: number;
  reasoning?: string | null;
  updated_at?: string | null;
}

export interface FundamentalOutlook extends RegionOutlook {}

// ============================================================================
// AI Analysis Types
// ============================================================================

export interface KeyLevels {
  support: number[];
  resistance: number[];
}

export interface Confluence {
  factors: string[];
  strength: string;
}

export interface RiskFactors {
  factors: string[];
  severity: string;
}

export interface AIAnalysisResult {
  symbol: string;
  week_start: string;
  ai_score: number;
  ai_confidence: string; // "high" | "medium" | "low"
  ai_bias: string; // "bullish" | "neutral" | "bearish"
  key_levels?: KeyLevels | null;
  confluence?: Confluence | null;
  risk_factors?: string[] | null;
  reasoning?: string | null;
  suggested_entry_window?: string | null;
  suggested_sl_pct?: number | null;
  suggested_tp_pct?: number | null;
  model_used?: string | null;
  tokens_used?: number | null;
  cost_usd?: number | null;
  created_at?: string | null;
}

export interface AIAnalysisSummary {
  symbol: string;
  ai_score: number;
  ai_confidence: string;
  ai_bias: string;
  reasoning?: string | null;
  created_at?: string | null;
}

// Convenience type combining analytics with AI
export interface AIAnalysis extends AIAnalysisResult {}

// ============================================================================
// Screenshot Types
// ============================================================================

export interface ScreenshotUploadRequest {
  symbol: string;
  timeframe: string; // "D1" | "H4" | "H1" | "M5"
  week_start: string;
  apiKey: string;
  image_base64: string;
}

export interface ScreenshotUploadResponse {
  symbol: string;
  timeframe: string;
  file_path: string;
  stored_at: string;
  ready_for_analysis: boolean;
}

export interface ScreenshotInfo {
  timeframe: string;
  file_path: string;
  file_size_bytes?: number | null;
  uploaded_at?: string | null;
}

export interface ScreenshotListResponse {
  symbol: string;
  week_start: string;
  screenshots: ScreenshotInfo[];
  complete: boolean;
}

// Convenience type
export interface ScreenshotList extends ScreenshotListResponse {}

// ============================================================================
// Results Types
// ============================================================================

export interface TradeResultUpload {
  symbol: string;
  week_start: string;
  apiKey: string;
  trades_taken: number;
  wins: number;
  losses: number;
  total_pnl_percent: number;
}

export interface TradeResultResponse {
  symbol: string;
  week_start: string;
  trades_taken: number;
  wins: number;
  losses: number;
  total_pnl_percent: number;
  was_active?: boolean | null;
}

export interface WeeklyResultSummary {
  week_start: string;
  total_trades: number;
  total_wins: number;
  total_losses: number;
  total_pnl_percent: number;
  active_markets: number;
  results: TradeResultResponse[];
}

export interface WeeklyResult extends WeeklyResultSummary {}

// ============================================================================
// History Types
// ============================================================================

export interface WeeklyScoreRecord {
  symbol: string;
  week_start: string;
  technical_score?: number | null;
  backtest_score?: number | null;
  fundamental_score?: number | null;
  final_score?: number | null;
  rank?: number | null;
  is_active: boolean;
  opt_entry_hour?: number | null;
  opt_sl_percent?: number | null;
  opt_tp_percent?: number | null;
  bt_total_return?: number | null;
  bt_win_rate?: number | null;
  bt_max_drawdown?: number | null;
}

export interface HistoryPoint extends WeeklyScoreRecord {}

export interface HeatmapCell {
  sl_pct: number;
  tp_pct: number;
  total_return: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
}

export interface HourReturn {
  hour: number;
  total_return: number;
  win_rate: number;
}

export interface HeatmapResponse {
  symbol: string;
  entry_hour: number;
  grid: HeatmapCell[];
  entry_hour_returns: HourReturn[];
}

export interface HeatmapData extends HeatmapResponse {}

export interface DrawdownInfo {
  symbol: string;
  is_active: boolean;
  open_trades: number;
  week_pnl_percent: number;
  week_trades: number;
  week_wins: number;
  week_losses: number;
}

export interface DrawdownItem extends DrawdownInfo {}

// ============================================================================
// Health Types
// ============================================================================

export interface Health {
  status: string;
  checks?: Record<string, any>;
}

// ============================================================================
// API Error Types
// ============================================================================

export interface ApiError {
  detail?: string;
  message?: string;
  status?: number;
}

export class APIException extends Error {
  status: number;
  detail?: string;

  constructor(status: number, detail?: string) {
    super(detail || `API Error (${status})`);
    this.status = status;
    this.detail = detail;
    this.name = "APIException";
  }
}
