# LongEntry Market Scanner

A trading intelligence platform that analyzes 14 commodity and stock index markets, finds optimal trading parameters via backtesting, provides AI-powered fundamental analysis, and tells MetaTrader 5 EAs which markets to trade each week with what settings.

**Built with:** Claude Code
**Status:** Live and running in production

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  FRIDAY — DataSender uploads H1 candles from MetaTrader 5   │
├─────────────────────────────────────────────────────────────┤
│  SATURDAY 06:00 UTC — Automated analysis                    │
│  ► Technical metrics (trend, momentum, win rate)            │
│  ► 2-year backtest parameter sweep (entry time, SL%, TP%)   │
│  ► AI fundamental outlook (Anthropic API)                   │
├─────────────────────────────────────────────────────────────┤
│  SUNDAY — Dashboard shows ranked markets                    │
│  ► Top 6 activated, review & override via dashboard         │
├─────────────────────────────────────────────────────────────┤
│  MONDAY–FRIDAY — EAs trade with assigned parameters         │
│  ► Each EA pulls config: GET /api/config/{symbol}           │
│  ► Active EAs trade, inactive EAs stay dormant              │
└─────────────────────────────────────────────────────────────┘
```

---

## Universe of Markets (14 Symbols)

| Category | Symbol | Full Name |
|----------|--------|-----------|
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

---

## Architecture

```
┌──────────────────┐         ┌──────────────────────────────────┐
│   MetaTrader 5   │         │        Hetzner VPS               │
│                  │         │                                   │
│  14× FixedLong   │◄──GET──►│  FastAPI Backend (Python)         │
│  EA instances    │  config │  ├── /api/config/{symbol}         │
│                  │         │  ├── /api/candles                 │
│  DataSender      │──POST──►│  ├── /api/analytics              │
│  (Fridays)       │ candles │  ├── /api/override/{symbol}       │
│                  │         │  ├── /api/fundamental             │
│  TradeSender     │──POST──►│  ├── /api/trades                 │
│  (closed trades) │         │  ├── /api/results                 │
│                  │         │  └── /api/health                  │
│  ResultSender    │──POST──►│                                   │
│  (weekly P&L)    │         │  PostgreSQL Database              │
└──────────────────┘         │                                   │
                             │  React Dashboard                  │
        Browser ◄───────────►│  ├── Overview (market cards)      │
                             │  ├── Market Detail (chart/stats)  │
                             │  ├── Results (performance)        │
                             │  └── History (trends)             │
                             └──────────────────────────────────┘
```

---

## Three Scoring Engines

### 1. Technical Score (50% weight)
Computes from H1 candle data: average daily growth/loss, up-day win rate, trend strength, momentum (RSI), volatility (ATR), price vs moving averages.

### 2. Backtest Score (35% weight)
Full 2-year parameter sweep of the FixedLongEntry strategy. Tests every combination of entry hour, SL% (0.3–2.0), and TP% (0.5–4.0). Tracks parameter stability week-over-week to detect overfitting.

### 3. Fundamental Score (15% weight)
AI-powered macro outlook using Anthropic API. Evaluates economic calendar events, central bank policy, and market sentiment per region.

**Combined:** `FinalScore = (Technical × 0.50) + (Backtest × 0.35) + (Fundamental × 0.15)`

Top N markets above the minimum score threshold (default 40) get activated.

---

## The EA — FixedLongEntry

Simple long-entry strategy:
1. Pull config from server daily: entry time, SL%, TP%, active status
2. If active, open a BUY at the assigned time
3. SL = Entry × (1 - SL%), TP = Entry × (1 + TP%)
4. No break-even, no trailing stop — keep it simple

All FTMO accounts run the same EA, same config. Only `RiskAmount` differs.

---

## Dashboard Features

- **Overview**: 14 market cards with scores, ranks, prices. +/- control for active market count. Click Active/Off to toggle individual markets
- **Market Detail**: H1 candlestick chart, trade history with entry/exit markers, equity curve, performance stats, activate/deactivate buttons
- **Results**: Weekly performance tracking, win/loss records
- **History**: Historical analysis trends across weeks
- **Settings**: API key configuration via gear icon in header
- **Theme**: Dark/light mode toggle
- **Notifications**: Bell icon with system status, drawdown alerts

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python 3.11+ / FastAPI / Uvicorn |
| Database | PostgreSQL / asyncpg |
| Frontend | React 18 / Tailwind CSS / Vite |
| Charts | TradingView Lightweight Charts |
| AI | Anthropic API (Claude) |
| Hosting | Hetzner VPS / Nginx / systemd |
| Data | pandas / numpy |
| Scheduling | cron (backup + weekly analysis) |
| MT5 Integration | MQL5 WebRequest → REST API |

---

## Setup & Deployment

See [SETUP.md](SETUP.md) for the complete step-by-step deployment guide.

**Quick deploy after code changes:**
```bash
ssh root@46.225.66.110
cd /opt/longentry && git pull
cd frontend && npm run build && cd ..
systemctl restart longentry
```

---

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py, config.py, auth.py, database.py
│   │   ├── engines/      — analytics, backtest, fundamental scoring
│   │   ├── routers/      — API endpoints (10 routers)
│   │   ├── schemas/      — Pydantic models
│   │   └── scripts/      — Weekly analysis & AI outlook
│   └── migrations/       — SQL schema (5 migrations)
│
├── frontend/src/
│   ├── App.jsx           — Main app, routing, overview
│   ├── MarketCard.jsx    — Market cards with active toggle
│   ├── MarketDetail.jsx  — Full market detail page
│   ├── Results.jsx       — Performance tracking
│   ├── HistoryView.jsx   — Historical trends
│   └── api.js            — API client functions
│
├── mql5/                 — MetaTrader 5 scripts (5 files)
├── nginx/                — Nginx reverse proxy config
├── scripts/              — Backup & cron automation
├── CLAUDE.md             — Full context for Claude Code sessions
└── SETUP.md              — Deployment guide
```

---

## API Authentication

Write endpoints require an `X-API-Key` header. The key is validated against a SHA-256 hash stored in `LE_API_KEY_HASH`. If no hash is configured, authentication is disabled.

Generate a key:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
# Then hash it:
python -c "import hashlib; print(hashlib.sha256(b'your-key-here').hexdigest())"
```

Set in the browser via the gear icon in the dashboard header.

---

## Database

PostgreSQL with 5 tables:
- `markets` — 14 market definitions
- `candles` — H1 OHLCV data (~175k+ rows)
- `weekly_analysis` — Scores, ranks, parameters per symbol per week
- `weekly_results` — Actual trading performance
- `trades` — Individual trade records

Daily backups at 03:00 UTC with 7-day retention.

---

*Built with Claude Code*
