-- LongEntry Market Scanner — Initial schema
-- Run with: psql -U longentry -d longentry -f 001_initial.sql

-- Market definitions (seeded once)
CREATE TABLE IF NOT EXISTS markets (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL,
    is_in_universe BOOLEAN DEFAULT true
);

-- H1 OHLCV candle data
CREATE TABLE IF NOT EXISTS candles (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    open_time TIMESTAMP NOT NULL,
    open DOUBLE PRECISION NOT NULL,
    high DOUBLE PRECISION NOT NULL,
    low DOUBLE PRECISION NOT NULL,
    close DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION DEFAULT 0,
    UNIQUE(symbol, timeframe, open_time)
);
CREATE INDEX IF NOT EXISTS idx_candles_symbol_time ON candles(symbol, open_time);

-- Weekly analysis & configuration (one row per symbol per week)
CREATE TABLE IF NOT EXISTS weekly_analysis (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    week_start DATE NOT NULL,
    -- Scores
    technical_score DOUBLE PRECISION,
    backtest_score DOUBLE PRECISION,
    fundamental_score DOUBLE PRECISION,
    final_score DOUBLE PRECISION,
    rank INTEGER,
    is_active BOOLEAN DEFAULT false,
    is_manually_overridden BOOLEAN DEFAULT false,
    -- Optimized parameters (from backtest)
    opt_entry_hour INTEGER,
    opt_entry_minute INTEGER DEFAULT 0,
    opt_sl_percent DOUBLE PRECISION,
    opt_tp_percent DOUBLE PRECISION,
    -- Backtest results for best params
    bt_total_return DOUBLE PRECISION,
    bt_win_rate DOUBLE PRECISION,
    bt_profit_factor DOUBLE PRECISION,
    bt_total_trades INTEGER,
    bt_max_drawdown DOUBLE PRECISION,
    bt_param_stability DOUBLE PRECISION,
    -- Analytics metrics
    avg_daily_growth DOUBLE PRECISION,
    avg_daily_loss DOUBLE PRECISION,
    most_bullish_day DOUBLE PRECISION,
    most_bearish_day DOUBLE PRECISION,
    up_day_win_rate DOUBLE PRECISION,
    --
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, week_start)
);

-- Actual trading results per week (for performance tracking)
CREATE TABLE IF NOT EXISTS weekly_results (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    week_start DATE NOT NULL,
    was_active BOOLEAN,
    trades_taken INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    total_pnl_percent DOUBLE PRECISION DEFAULT 0,
    UNIQUE(symbol, week_start)
);
