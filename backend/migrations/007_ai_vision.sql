-- AI Vision Analysis Infrastructure
-- Run with: psql -U longentry -d longentry -f 007_ai_vision.sql

-- Chart screenshots uploaded by ScreenshotSender EA
CREATE TABLE IF NOT EXISTS chart_screenshots (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(5) NOT NULL,          -- 'D1', 'H4', 'H1', 'M5'
    week_start DATE NOT NULL,
    file_path TEXT NOT NULL,                 -- /opt/longentry/screenshots/2026/week_8/XAUUSD_D1.jpg
    file_size_bytes INTEGER,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, timeframe, week_start)
);

CREATE INDEX IF NOT EXISTS idx_screenshots_symbol_week
    ON chart_screenshots(symbol, week_start);

-- AI analysis results from Claude Sonnet vision
CREATE TABLE IF NOT EXISTS ai_analysis_results (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    week_start DATE NOT NULL,
    ai_score DOUBLE PRECISION NOT NULL,      -- 0-100 overall score
    ai_confidence VARCHAR(10) NOT NULL,      -- 'high', 'medium', 'low'
    ai_bias VARCHAR(10) NOT NULL,            -- 'bullish', 'neutral', 'bearish'
    key_levels JSONB,                        -- {resistance_1: {price, type}, support_1: {price, type}}
    confluence JSONB,                        -- {description, strength, factors: [...]}
    risk_factors JSONB,                      -- ["factor1", "factor2", ...]
    reasoning TEXT,                          -- 2-3 sentence AI reasoning
    suggested_entry_window VARCHAR(20),      -- e.g. "09:00-12:00"
    suggested_sl_pct DOUBLE PRECISION,       -- AI-suggested SL %
    suggested_tp_pct DOUBLE PRECISION,       -- AI-suggested TP %
    model_used VARCHAR(50) DEFAULT 'claude-sonnet-4-5-20250929',
    tokens_used INTEGER,
    cost_usd DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, week_start)
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_symbol_week
    ON ai_analysis_results(symbol, week_start);

-- Post-trade reviews by Haiku (learning loop)
CREATE TABLE IF NOT EXISTS post_trade_reviews (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    trade_id BIGINT REFERENCES trades(id),
    trade_result VARCHAR(10),                -- 'win', 'loss'
    ai_confidence_at_entry VARCHAR(10),      -- 'high', 'medium', 'low'
    pnl_percent DOUBLE PRECISION,
    insight TEXT NOT NULL,                   -- ONE actionable takeaway
    reviewed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, trade_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_symbol
    ON post_trade_reviews(symbol, reviewed_at DESC);

-- Add AI columns to weekly_analysis (nullable for backward compat)
ALTER TABLE weekly_analysis
    ADD COLUMN IF NOT EXISTS ai_score DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS ai_confidence VARCHAR(10),
    ADD COLUMN IF NOT EXISTS ai_bias VARCHAR(10);
