-- Phase 5 — Fundamental Layer tables
-- Run with: psql -U longentry -d longentry -f 003_fundamental.sql

-- Per-region macro outlook (manually updated, later API-automated)
CREATE TABLE IF NOT EXISTS fundamental_outlook (
    id SERIAL PRIMARY KEY,
    region VARCHAR(20) UNIQUE NOT NULL,
    cb_stance INTEGER DEFAULT 0,          -- -1=hawkish, 0=neutral, 1=dovish
    growth_outlook INTEGER DEFAULT 0,     -- -1=contracting, 0=stable, 1=expanding
    inflation_trend INTEGER DEFAULT 0,    -- -1=falling, 0=stable, 1=rising
    risk_sentiment INTEGER DEFAULT 0,     -- -1=risk_off, 0=neutral, 1=risk_on
    notes TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed the 7 regions (all neutral defaults)
INSERT INTO fundamental_outlook (region) VALUES
    ('US'), ('EU'), ('UK'), ('JP'), ('AU'), ('HK'), ('commodities')
ON CONFLICT (region) DO NOTHING;

-- Upcoming economic events that affect trading decisions
CREATE TABLE IF NOT EXISTS economic_events (
    id SERIAL PRIMARY KEY,
    region VARCHAR(20) NOT NULL,
    event_date DATE NOT NULL,
    title VARCHAR(200) NOT NULL,
    impact VARCHAR(10) NOT NULL DEFAULT 'medium',  -- high, medium, low
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_region_date ON economic_events(region, event_date);
