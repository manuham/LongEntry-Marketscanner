# LongEntry Market Scanner — Project Blueprint V2

## Project Overview

A web-based trading intelligence platform that analyzes 14 commodity and stock index markets, finds optimal trading parameters via backtesting, provides fundamental/AI analysis on market outlook, and tells the FixedLongEntry EA which markets to trade each week with what settings.

**Core Philosophy:** This is an "investing" approach. The EA opens simple long positions with small SLs and lets winners run. The website is the brain — it says "these markets look bullish based on fundamentals" and "these parameters have been profitable over 2 years." The EA is just the executor.

**Built with:** Claude Code

---

## Universe of Markets (14 Symbols)

| Category | FTMO Symbol | Full Name |
|----------|-------------|-----------|
| Commodity | XAUUSD | Gold |
| Commodity | XAGUSD | Silver |
| Index | US500 | S&P 500 |
| Index | US100 | Nasdaq 100 |
| Index | US30 | Dow Jones 30 |
| Index | GER40 | DAX 40 |
| Index | AUS200 | ASX 200 |
| Index | UK100 | FTSE 100 |
| Index | JP225 | Nikkei 225 |
| Index | SPN35 | IBEX 35 |
| Index | EU50 | Euro Stoxx 50 |
| Index | FRA40 | CAC 40 |
| Index | HK50 | Hang Seng 50 |
| Index | N25 | AEX 25 |

**Active per week:** Top 5–6 based on combined ranking score.

---

## The EA — Simplified FixedLongEntry

The EA for this project is intentionally simple. It does one thing well.

### What it does:
1. On each trading day, at the server-assigned entry time, open a BUY position
2. SL = Entry price × (1 - StopLossPercent / 100)
3. TP = Entry price × (1 + TakeProfitPercent / 100)
4. Position size = RiskAmount / loss-per-lot (risk-based sizing)
5. That's it. No break-even, no trailing stop, no filters.

### EA Input Parameters:
```
input group "==== Server Integration ===="
input string   ServerURL = "";            // Server API URL (e.g., http://123.45.67.89/api)
input string   APIKey = "";               // API Key for authentication

input group "==== Risk Settings ===="
input double   RiskAmount = 100.0;        // Risk Amount in Account Currency

input group "==== Trading Settings ===="
input ulong    MagicNumber = 100001;      // Magic Number
input string   TradeComment = "LongEntry"; // Trade Comment
```

### Server-Driven Parameters (pulled via WebRequest):
- `active` (bool) — should this EA trade this week?
- `entryHour` (int) — what hour to enter
- `entryMinute` (int) — what minute to enter
- `slPercent` (double) — stop loss as % of price
- `tpPercent` (double) — take profit as % of price

### How server config works:
- EA calls `GET {ServerURL}/config/{symbol}` once per day before entry time
- Request includes `X-API-Key` header for authentication (same key used by DataSender)
- If `active = false`, EA does nothing all day
- If `active = true`, EA uses the received parameters to trade
- If server is unreachable or returns auth error, EA does nothing (fail-safe)

### Multi-Account Setup:
- All FTMO accounts run the same EA on the same 14 symbols
- All accounts pull the same config from the same server
- Only `RiskAmount` differs per account (set locally in each EA instance)

---

## The DataSender Script (`DataSender.mq5`)

A separate MQL5 script/EA that runs on all 14 charts:

### What it does:
- Runs on each of the 14 charts independently
- **Trigger:** Friday, 1 hour before that symbol's market close (each chart uses its own session schedule in MT5; e.g., European indices close ~17:30 CET, US indices ~22:00 CET, Asian indices closed earlier in the day)
- Collects H1 (hourly) OHLCV candle data
- First run: sends ~2 years of H1 candles (one-time bulk load)
- Subsequent runs: sends only new candles since last upload
- POSTs JSON to `{ServerURL}/candles`
- Confirms successful upload via server response
- If upload fails, retries up to 3 times with 30-second intervals. Logs failure to MT5 journal if all retries fail.

### Why H1 candles:
- Allows precise entry time optimization (testing every hour)
- Daily metrics (avg daily growth, avg daily loss, etc.) are derived from H1 data on the server
- Enables visually rich dashboard with intraday price patterns

### Data volume estimate:
- 14 symbols × ~24 H1 candles/day × ~260 trading days × 2 years ≈ 175,000 candles initial load
- Weekly incremental: 14 × ~120 candles ≈ 1,680 candles (trivial)

---

## Weekly Cycle

```
┌─────────────────────────────────────────────────────────────┐
│  FRIDAY — 1 hour before market close                        │
│  DataSender sends H1 candle data to the web server          │
│  (new candles since last upload)                            │
├─────────────────────────────────────────────────────────────┤
│  SATURDAY — Server processing (automated)                   │
│  ► Market Analytics Bot computes trend metrics per symbol   │
│  ► Backtest Engine tests parameter combos over 2 years      │
│  ► Fundamental Scorer pulls macro/news data                 │
├─────────────────────────────────────────────────────────────┤
│  SUNDAY — Ranking & selection (automated)                   │
│  ► Combined score ranks all 14 markets                      │
│  ► Top 5-6 get "ACTIVE" status                              │
│  ► Best backtest parameters assigned to each active market  │
│  ► Dashboard displays the week's plan                       │
│  ► You review & optionally override via dashboard           │
├─────────────────────────────────────────────────────────────┤
│  MONDAY — EA pulls configuration                            │
│  ► Each EA instance calls GET /api/config/{symbol}          │
│  ► Receives: active, entryHour, entryMinute, slPercent,     │
│    tpPercent                                                │
│  ► Active EAs trade, inactive EAs stay dormant              │
├─────────────────────────────────────────────────────────────┤
│  MONDAY–FRIDAY — EAs trade with assigned settings           │
│  ► Only the top 5-6 markets are active                      │
│  ► Parameters are stable (based on 2-year backtest)         │
└─────────────────────────────────────────────────────────────┘
```

---

## System Architecture

```
┌──────────────────┐         ┌──────────────────────────────────┐
│   MetaTrader 5   │         │      VPS (Hetzner, ~€5/mo)       │
│                  │         │                                   │
│  14× FixedLong   │◄──GET──►│  FastAPI Backend (Python)         │
│  EA instances    │  config │  ├── GET  /api/config/{symbol}    │
│  (all accounts)  │         │  ├── POST /api/candles            │
│                  │         │  ├── GET  /api/markets             │
│  DataSender      │──POST──►│  ├── GET  /api/analytics/{symbol} │
│  (Fridays)       │ candles │  ├── GET  /api/rankings            │
│                  │         │  ├── POST /api/override/{symbol}   │
└──────────────────┘         │  │                                 │
                             │  ├── Analytics Engine (pandas)     │
                             │  ├── Backtest Engine (Python)      │
                             │  ├── Fundamental Scorer            │
                             │  ├── PostgreSQL Database            │
                             │  │                                 │
                             │  └── React Dashboard               │
                             │      ├── Weekly Overview (home)    │
                             │      ├── Market Detail Pages       │
                             │      ├── Rankings Table            │
                             │      ├── Backtest Results          │
                             │      ├── Performance History       │
                             │      └── Settings & Overrides      │
                             └──────────────────────────────────────┘
```

---

## Three Core Engines

### Engine 1 — Market Analytics Bot

Computes descriptive statistics for each market from H1 candle data. This is what makes the dashboard informative and visually compelling.

**Per symbol, calculates and displays:**
- Average daily growth % (on up days)
- Average daily loss % (on down days)
- Most bullish day: +X% (date)
- Most bearish day: -X% (date)
- Up-day win rate: X% of days closed green
- Price change: 1 week, 2 weeks, 1 month, 3 months
- Current price vs. moving averages (20, 50, 200 SMA)
- Momentum: RSI(14), rate of change
- Volatility: ATR, daily range %
- Trend strength composite score

**Output:** A `TechnicalScore` (0–100) per symbol

### Engine 2 — Backtest Engine (Full 2-Year Backtest)

Simulates the simple FixedLongEntry logic across all parameter combinations using 2 years of H1 data. No walk-forward — just a straightforward full-period backtest. If parameters work over 2 years, that's robust enough.

**Parameter grid to test:**
- `EntryHour`: every hour during market hours for that symbol
- `StopLossPercent`: 0.3, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0
- `TakeProfitPercent`: 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0

**Backtest logic (per parameter combination):**
1. For each trading day in the 2-year period:
   - Get the H1 candle at the entry hour
   - Entry price = open of that candle
   - SL price = Entry × (1 - SL% / 100)
   - TP price = Entry × (1 + TP% / 100)
   - Walk forward through subsequent H1 candles
   - If low hits SL → loss, record -SL%
   - If high hits TP → win, record +TP%
   - If both hit in same candle → assume SL hit first (conservative)
2. After all days, calculate: total P/L%, win rate, profit factor, max drawdown, avg trade

**Dashboard display per symbol:**
"If you entered every day at 15:00 with SL 0.5% and TP 2.0%, you would have made +34% profit over 2 years with a 42% win rate and 1.8 profit factor."

**Spread/slippage modeling:**
- Each symbol has a configured typical spread (e.g., XAUUSD = 0.30 points, US500 = 0.50 points)
- Backtest entry price = candle open + half-spread (simulates buying at ask)
- This prevents the backtest from overstating returns vs. live trading

**Overfitting safeguard — parameter stability tracking:**
- The 2-year full-period backtest tests 490–1,176 parameter combinations per symbol. The best combo will always look good in-sample.
- To detect overfitting: track the "best" parameters week-over-week. If a symbol's optimal entry hour, SL%, or TP% changes significantly each week, the result is likely fitting noise rather than a real edge.
- Each symbol gets a `ParameterStability` metric (0–100): 100 = same best params for 8+ consecutive weeks, 0 = different best params every week.
- Dashboard flags symbols with low parameter stability (< 50) as "unreliable backtest."
- Symbols with unstable parameters get a penalty applied to their `BacktestScore`.

**Output per symbol:**
- Best `EntryHour` and `EntryMinute` (on the hour for now)
- Best `StopLossPercent` and `TakeProfitPercent`
- Win rate, profit factor, total return, max drawdown
- `ParameterStability` score (0–100)
- These parameters are slow-moving — they probably stay the same for weeks/months. The stability metric validates this assumption.

### Engine 3 — Fundamental Scorer

AI-powered fundamental analysis for each market's outlook.

**Data sources (free or low-cost):**
- Economic calendar API (upcoming events per region)
- Central bank rate decisions and policy direction
- Major releases: CPI, PMI, NFP, GDP, employment data
- Market sentiment indicators (VIX, risk-on/risk-off flows)

**Per symbol, evaluates:**
- Is the macro environment supportive of this market going up?
- Any high-impact risk events this week?
- Central bank policy: hawkish or dovish for this market?
- Overall fundamental outlook: bullish / neutral / bearish

**Output:** A `FundamentalScore` (0–100) per symbol

**V1 approach (simple):** Flag upcoming high-impact events and basic macro trend direction. Gets smarter over time.

---

## Combined Ranking System

```
FinalScore = (TechnicalScore × 0.50) + (BacktestScore × 0.35) + (FundamentalScore × 0.15)
```

- Weights are adjustable in the dashboard settings
- Top 5–6 markets by FinalScore get `active = true`
- **Minimum score threshold:** Markets must score above a configurable minimum `FinalScore` (default: 40) to be activated, even if they rank in the top 5–6. If all markets score below the threshold, zero markets are activated that week. This prevents the system from going long when all markets look bearish.
- Manual override: you can force any market active or inactive from the dashboard

### BacktestScore Formula

`BacktestScore` is derived from the best parameter combination's results, normalized to 0–100:

```
RawBacktestScore = (NormalizedReturn × 0.35)
                 + (NormalizedProfitFactor × 0.30)
                 + (NormalizedWinRate × 0.15)
                 + (NormalizedDrawdown × 0.20)
```

**Normalization (each component scaled 0–100):**
- `NormalizedReturn`: 2-year total return %, capped at 100%. Score = min(return, 100).
- `NormalizedProfitFactor`: PF capped at 3.0. Score = min(PF / 3.0, 1.0) × 100.
- `NormalizedWinRate`: Win rate as-is (already 0–100 range).
- `NormalizedDrawdown`: Inverted — lower drawdown = higher score. Score = max(0, 100 - (maxDD% × 5)). A 20% drawdown scores 0.

**Parameter stability penalty:** If `ParameterStability` < 50, apply: `BacktestScore = RawBacktestScore × (ParameterStability / 100)`. This downgrades symbols where the backtest is likely overfitting.

---

## Dashboard Design

### Page 1: Weekly Overview (Home)
- Week header: "Week of Feb 17–21, 2026"
- 5-6 active markets shown prominently with green status badges
- 8-9 inactive markets shown dimmed
- Each market card shows: symbol name, current price, weekly change %, final score, assigned entry time / SL / TP
- One-line backtest summary: "Entry 15:00, SL 0.5%, TP 2.0% → +34% over 2yr"

### Page 2: Market Detail (per symbol)
- H1 candlestick chart (from stored data)
- All analytics metrics with visual display:
  - "Avg daily growth: +0.12%"
  - "Avg daily loss: -0.08%"
  - "Most bullish day: +3.4% (Jan 15)"
  - "Most bearish day: -2.1% (Dec 3)"
  - "Up-day win rate: 58%"
- Backtest results: best params, equity curve chart, trade statistics
- Fundamental factors and upcoming events
- Historical activation log: which weeks was this market active?

### Page 3: Rankings Table
- Sortable table of all 14 markets
- Columns: Rank, Symbol, Name, TechnicalScore, BacktestScore, FundamentalScore, FinalScore, Status (Active/Inactive)
- Color-coded rows (green = active, gray = inactive)
- Toggle buttons for manual override

### Page 4: Performance Tracker
- How did last week's picks actually perform?
- Cumulative P/L curve of the system over time
- Per-symbol weekly results
- Comparison: system picks vs. "trade all 14 markets" baseline

### Page 5: Settings
- Adjust scoring weights (technical / backtest / fundamental)
- Change number of active markets (5, 6, 7...)
- Manual overrides panel
- API key management
- Backtest parameter ranges configuration

---

## Development Phases

### Phase 1 — Foundation & Data Pipeline
**Goal:** Candle data flowing from MT5 to server, stored in database, visible on basic dashboard.

**Deliverables:**
1. VPS setup: Python 3.11+, PostgreSQL, Nginx, SSL (self-signed for IP)
2. FastAPI backend with endpoints:
   - `POST /api/candles` — receive H1 candle data from DataSender
   - `GET /api/markets` — list all 14 markets with latest price
   - `GET /api/health` — unauthenticated health check for monitoring
3. API key authentication on all endpoints (except health check)
4. `DataSender.mq5` — sends H1 candles via WebRequest
5. PostgreSQL database with `markets` and `candles` tables
6. **Database backups:** daily `pg_dump` cron job, retain last 7 daily backups, stored in a separate directory on the VPS
7. **Basic logging:** structured logging (JSON) for all API requests, DataSender uploads, and errors. Logs rotated daily.
8. Basic React dashboard showing all 14 markets with current prices
9. End-to-end test: MT5 → server → database → dashboard

### Phase 2 — Analytics Engine & Dashboard
**Goal:** Rich market statistics displayed beautifully on the dashboard.

**Deliverables:**
1. Analytics module (pandas): calculates all metrics from H1 data
2. Dashboard market cards with: avg daily growth/loss, most bullish/bearish day, up-day win rate, price vs. SMAs, trend score
3. Market detail pages with charts and full metrics
4. API: `GET /api/analytics/{symbol}`

### Phase 3 — Backtest Engine
**Goal:** Find optimal EA parameters per symbol and display results.

**Deliverables:**
1. Python backtest engine replicating simple FixedLongEntry logic
2. Full 2-year parameter sweep per symbol
3. Store results in database (`weekly_analysis` table)
4. Dashboard: backtest results page with equity curves and statistics
5. "If you entered every day at X with SL Y and TP Z → result" display
6. API: `GET /api/config/{symbol}` — returns best parameters

### Phase 4 — EA Integration & Activation
**Goal:** EA pulls config from server, only active markets trade.

**Deliverables:**
1. New simplified `FixedLongEntry_Server.mq5` EA
2. EA calls `GET /api/config/{symbol}` daily
3. Combined ranking system: Technical + Backtest + (placeholder) Fundamental
4. Top 5-6 auto-activated each week
5. Manual override toggle on dashboard
6. Cron job: Saturday analysis run

### Phase 5 — Fundamental Layer
**Goal:** Add macro/news data to scoring and dashboard.

**Deliverables:**
1. Economic calendar API integration
2. Fundamental scoring logic per symbol
3. FundamentalScore integrated into ranking
4. Dashboard: upcoming events, macro indicators per market

### Phase 6 — Performance Tracking & Polish
**Goal:** Track system performance, refine, polish.

**Deliverables:**
1. Weekly results recording and comparison
2. Performance dashboard page
3. Mobile-responsive design
4. Notifications (optional: Telegram/email weekly summary)
5. Security hardening

---

## Technology Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| Backend | Python 3.11+ / FastAPI | Async, fast, great for data |
| Database | PostgreSQL | Reliable, good with time-series |
| Frontend | React + Tailwind CSS | Modern, component-based |
| Charts | Lightweight Charts (TradingView) | Professional financial charts |
| Hosting | Hetzner VPS (~€5/mo) | European, great value |
| Data Analysis | pandas + numpy | Industry standard |
| Scheduling | cron | Simple, reliable for weekly jobs |
| MT5 ↔ Server | WebRequest (MQL5) ↔ REST API (JSON) | Native MQL5 support |

---

## Database Schema

```sql
-- Market definitions (seeded once)
CREATE TABLE markets (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL,       -- 'commodity' or 'index'
    is_in_universe BOOLEAN DEFAULT true
);

-- H1 OHLCV candle data
CREATE TABLE candles (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,       -- 'H1'
    open_time TIMESTAMP NOT NULL,
    open DOUBLE PRECISION NOT NULL,
    high DOUBLE PRECISION NOT NULL,
    low DOUBLE PRECISION NOT NULL,
    close DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION DEFAULT 0,
    UNIQUE(symbol, timeframe, open_time)
);
CREATE INDEX idx_candles_symbol_time ON candles(symbol, open_time);

-- Weekly analysis & configuration (one row per symbol per week)
CREATE TABLE weekly_analysis (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    week_start DATE NOT NULL,              -- Monday of the trading week
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
    bt_param_stability DOUBLE PRECISION,  -- 0-100, how stable best params are week-over-week
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
CREATE TABLE weekly_results (
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
```

---

## API Endpoints

**Authentication:** All endpoints require an `X-API-Key` header. The server validates the key against a hashed value stored in environment config. Requests without a valid key receive `401 Unauthorized`. The only unauthenticated endpoint is `GET /api/health` (used for uptime monitoring).

### `GET /api/config/{symbol}`
Called by EA daily. Returns trading configuration.
```json
{
    "symbol": "XAUUSD",
    "active": true,
    "entryHour": 15,
    "entryMinute": 0,
    "slPercent": 0.5,
    "tpPercent": 2.0,
    "weekStart": "2026-02-16"
}
```
If inactive: `"active": false` (other fields still present but EA ignores them).

### `POST /api/candles`
Called by DataSender on Friday.
```json
{
    "symbol": "XAUUSD",
    "timeframe": "H1",
    "apiKey": "your-key-here",
    "candles": [
        {
            "time": "2026-02-14T14:00:00",
            "open": 2850.50,
            "high": 2855.30,
            "low": 2848.10,
            "close": 2853.70,
            "volume": 1234
        }
    ]
}
```

### `GET /api/markets`
Returns all 14 markets with latest data for dashboard.

### `GET /api/analytics/{symbol}`
Returns full analytics for one market.

### `GET /api/rankings`
Returns ranked list of all markets for the current/upcoming week.

### `POST /api/override/{symbol}`
Manual override from dashboard: force active or inactive.

---

## Monitoring & Alerting

### What to monitor:
| Event | Expected | Alert if |
|-------|----------|----------|
| DataSender upload (per symbol) | Every Friday | Any symbol missing by Saturday 00:00 UTC |
| Saturday analysis cron job | Completes Saturday | Job fails or runs > 30 min |
| EA config fetch (per symbol) | Daily, Monday–Friday | No fetch for an active symbol by entry hour |
| Database size / disk usage | Steady growth | Disk usage > 80% |
| API health check | Responds 200 | Down for > 5 min |

### Alerting channel:
- **V1:** Telegram bot sends alerts to a private channel. Simple HTTP POST to Telegram Bot API — no external dependencies.
- Dashboard also shows a "System Health" indicator on the home page (green/yellow/red).

### Logging:
- All API requests logged with: timestamp, endpoint, symbol, response code, duration
- DataSender uploads logged with: symbol, candle count, success/failure
- Saturday cron job: start/end timestamps, per-symbol processing status
- Logs stored in `/var/log/longentry/` with daily rotation, 30-day retention

---

## Resolved Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Optimize BE/trailing stop? | **No.** EA is simplified — no BE, no trailing. | Keep it simple: open long, fixed SL, fixed TP, let winners run |
| Candle timeframe? | **H1 candles** | Precise entry time optimization + rich daily metrics |
| Walk-forward optimization? | **No.** Full 2-year backtest. | Parameters are slow-moving; 2-year robustness is enough |
| Manual overrides? | **Yes.** Dashboard toggle per market. | You have final say, system is the advisor |
| Multiple accounts? | **Yes, but same config.** All accounts pull identical settings. | Only RiskAmount differs, set locally per EA |
| Domain name? | **No.** VPS IP address for now. | Can add domain later if needed |
| Hosting? | **Hetzner VPS (~€5/mo)** | European, great specs for price, close to you |
| n8n / workflow tools? | **No.** Custom Python for everything. | Too computation-heavy for workflow tools |
| Overfitting mitigation? | **Parameter stability tracking.** Flag unstable params, penalize BacktestScore. | Walk-forward adds complexity; stability tracking catches the same problem more simply |
| All markets bearish? | **Minimum FinalScore threshold (default 40).** Zero markets activated if all below threshold. | Prevents going long in a broad downturn |
| Spread in backtest? | **Yes.** Per-symbol typical spread added to entry price. | Small cost but makes backtest returns realistic |
| API authentication? | **X-API-Key header on all endpoints.** Key hashed in server config. | Prevents unauthorized reading of trading config or injecting candle data |
| Database backups? | **Daily pg_dump, 7-day retention.** | Losing candle data means re-bootstrapping 2 years from MT5 |
| Alerting? | **Telegram bot for V1.** Dashboard health indicator. | Low-effort, no external dependencies beyond Telegram API |

---

*Document Version: 2.1 — Updated Feb 14, 2026*
*Status: All questions resolved. Blueprint reviewed and hardened (overfitting safeguards, authentication, backups, monitoring). Ready for Phase 1 development with Claude Code.*
