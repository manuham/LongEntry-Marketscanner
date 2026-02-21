-- Per-market AI predictions from auto_outlook.py
-- Claude researches each market via web search and predicts bullish/neutral/bearish

CREATE TABLE IF NOT EXISTS market_ai_prediction (
    id         SERIAL PRIMARY KEY,
    symbol     VARCHAR(20) UNIQUE NOT NULL,
    prediction VARCHAR(10) NOT NULL,          -- 'bullish', 'neutral', 'bearish'
    score      DOUBLE PRECISION NOT NULL,     -- 0-100 fundamental score
    reasoning  TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);
