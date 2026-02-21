-- Individual trade records (reported by TradeSender EA)
-- Run with: psql -U longentry -d longentry -f 005_trades.sql

CREATE TABLE IF NOT EXISTS trades (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    open_time TIMESTAMP NOT NULL,
    close_time TIMESTAMP,
    open_price DOUBLE PRECISION NOT NULL,
    close_price DOUBLE PRECISION,
    sl_price DOUBLE PRECISION,
    tp_price DOUBLE PRECISION,
    lot_size DOUBLE PRECISION,
    pnl_amount DOUBLE PRECISION,
    pnl_percent DOUBLE PRECISION,
    result VARCHAR(10),              -- 'win', 'loss', or 'open'
    week_start DATE,
    magic_number BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, open_time, magic_number)
);

CREATE INDEX IF NOT EXISTS idx_trades_symbol_time ON trades(symbol, open_time);
CREATE INDEX IF NOT EXISTS idx_trades_symbol_close ON trades(symbol, close_time);
