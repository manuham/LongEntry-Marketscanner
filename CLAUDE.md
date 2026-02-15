# CLAUDE.md — Project Context for Claude Code

## What Is This Project?

LongEntry Market Scanner is a **live, deployed** trading intelligence platform. It analyzes 14 commodity/index markets weekly, finds optimal trading parameters via backtesting, scores them with technical + backtest + AI fundamental analysis, and tells MetaTrader 5 EAs which markets to trade and with what settings.

**Stack:** Python 3.11 / FastAPI / PostgreSQL / React + Tailwind / Nginx / Hetzner VPS
**Status:** Fully built and running in production at `http://46.225.66.110`

---

## Quick Reference

### Run Locally (Development)

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Edit with your DB credentials
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload

# Frontend
cd frontend
npm install
npm run dev   # Vite dev server on port 5173, proxies /api to :8001
```

### Build Frontend for Production

```bash
cd frontend && npm run build   # Output: frontend/dist/
```

### Deploy to VPS

```bash
ssh root@46.225.66.110
cd /opt/longentry && git pull
cd frontend && npm run build && cd ..
systemctl restart longentry
# Verify: systemctl status longentry
```

### View Logs

```bash
journalctl -u longentry -f          # Live backend logs
journalctl -u longentry -n 100      # Last 100 lines
cat /var/log/longentry/analysis.log  # Weekly analysis logs
```

---

## Architecture

```
MT5 (14 charts)
  ├── DataSender.mq5      → POST /api/candles (H1 candles, Fridays)
  ├── FixedLongEntry.mq5   → GET  /api/config/{symbol} (daily)
  ├── TradeSender.mq5      → POST /api/trades (closed trades)
  └── ResultSender.mq5     → POST /api/results (weekly summaries)

FastAPI Backend (:8001)
  ├── /api/markets                    — List all 14 markets
  ├── /api/candles                    — Receive candle data from MT5
  ├── /api/analytics                  — All markets' analysis
  ├── /api/analytics/{symbol}         — Single market analysis
  ├── /api/config/max-active-markets  — GET/PUT active market count
  ├── /api/config/{symbol}            — EA config (entry time, SL, TP)
  ├── /api/override/{symbol}          — Manual activate/deactivate
  ├── /api/fundamental                — Macro outlook data
  ├── /api/fundamental/events         — Economic calendar events
  ├── /api/fundamental/ai-predictions — AI market predictions
  ├── /api/trades/{symbol}            — Individual trade history
  ├── /api/trades/drawdown            — Active market drawdown
  ├── /api/results                    — Weekly performance results
  ├── /api/analytics/history          — Historical analysis data
  ├── /api/backtest/heatmap/{symbol}  — Parameter sweep heatmap
  └── /api/health                     — Health check (no auth)

React Dashboard (Nginx serves frontend/dist/)
  ├── /                — Overview: 14 market cards, +/- active control, toggles
  ├── /market/:symbol  — Detail: chart, trades, stats, activate/deactivate
  ├── /results         — Weekly performance tracking
  └── /history         — Historical analysis trends
```

### Weekly Cycle
1. **Friday**: DataSender uploads H1 candles from MT5
2. **Saturday 06:00 UTC**: Cron runs analysis (technical + backtest + AI fundamental)
3. **Sunday**: Dashboard shows the week's rankings, you review/override
4. **Monday-Friday**: EAs pull config and trade active markets

---

## File Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              — FastAPI app, middleware, router registration
│   │   ├── config.py            — Pydantic settings (from .env / LE_ env vars)
│   │   ├── auth.py              — API key auth (skipped if no hash configured)
│   │   ├── database.py          — asyncpg connection pool
│   │   ├── logging_config.py    — Structured JSON logging
│   │   ├── telegram.py          — Telegram alert notifications
│   │   │
│   │   ├── engines/
│   │   │   ├── analytics.py     — Technical metrics from H1 candles → TechnicalScore
│   │   │   ├── backtest.py      — 2-year parameter sweep → BacktestScore
│   │   │   └── fundamental.py   — AI macro outlook → FundamentalScore
│   │   │
│   │   ├── routers/
│   │   │   ├── analytics.py     — /api/analytics endpoints
│   │   │   ├── candles.py       — /api/candles (POST from MT5)
│   │   │   ├── config.py        — /api/config/* (EA config + max-active)
│   │   │   ├── fundamental.py   — /api/fundamental endpoints
│   │   │   ├── health.py        — /api/health
│   │   │   ├── history.py       — /api/analytics/history
│   │   │   ├── markets.py       — /api/markets
│   │   │   ├── results.py       — /api/results
│   │   │   └── trades.py        — /api/trades endpoints
│   │   │
│   │   ├── schemas/             — Pydantic request/response models
│   │   │   ├── analytics.py, candle.py, fundamental.py, history.py,
│   │   │   ├── market.py, results.py, trades.py
│   │   │
│   │   └── scripts/
│   │       ├── run_analysis.py  — Weekly analysis pipeline (cron)
│   │       └── auto_outlook.py  — AI fundamental outlook (Anthropic API)
│   │
│   ├── migrations/
│   │   ├── 001_initial.sql      — markets, candles, weekly_analysis tables
│   │   ├── 002_seed_markets.sql — Insert 14 market symbols
│   │   ├── 003_fundamental.sql  — Fundamental outlook tables
│   │   ├── 004_market_ai_prediction.sql — AI prediction storage
│   │   └── 005_trades.sql       — Individual trade records
│   │
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx              — Main app: routing, header, overview, +/- control
│   │   ├── MarketCard.jsx       — Market card (grid + table view) with active toggle
│   │   ├── MarketDetail.jsx     — Full market page: chart, trades, override buttons
│   │   ├── Results.jsx          — Performance tracking page
│   │   ├── HistoryView.jsx      — Historical analysis trends
│   │   ├── ThemeContext.jsx     — Dark/light theme provider
│   │   ├── api.js               — All API fetch functions
│   │   ├── main.jsx             — React entry point
│   │   └── index.css            — Tailwind + custom theme variables
│   │
│   ├── vite.config.js           — Dev proxy: /api → localhost:8001
│   ├── tailwind.config.js
│   └── package.json
│
├── mql5/
│   ├── DataSender.mq5           — Sends H1 candles to server (Fridays)
│   ├── FixedLongEntry_Server.mq5 — Trading EA, pulls config from server
│   ├── TradeSender.mq5          — Reports closed trades to server
│   ├── ResultSender.mq5         — Reports weekly results to server
│   └── ManualUpload.mq5         — Manual candle upload utility
│
├── nginx/
│   └── longentry.conf           — Nginx config (frontend + API proxy)
│
├── scripts/
│   ├── backup_db.sh             — Daily pg_dump, 7-day retention
│   ├── install_crons.sh         — Install backup + analysis cron jobs
│   └── run_weekly_analysis.sh   — Saturday analysis runner
│
├── README.md                    — Project overview and architecture
├── SETUP.md                     — Step-by-step VPS deployment guide
└── PLAN.md                      — Implementation plan (trade visualization)
```

---

## Key Patterns & Conventions

### Backend
- **Router prefix**: All routers mounted with `prefix="/api"` in `main.py`
- **Route ordering**: Static routes (e.g., `/config/max-active-markets`) MUST be defined BEFORE parameterized routes (e.g., `/config/{symbol}`) in FastAPI
- **Auth**: `Depends(require_api_key)` on write endpoints. If `LE_API_KEY_HASH` is empty, auth is skipped
- **Database**: asyncpg pool via `get_pool()`, raw SQL queries (no ORM)
- **Settings**: Pydantic `BaseSettings` with `LE_` env prefix, reads from `.env`
- **Scoring**: `FinalScore = Technical(50%) + Backtest(35%) + Fundamental(15%)`
- **Week boundary**: `week_start` = Monday of current week (used in all weekly queries)

### Frontend
- **API calls**: All in `api.js`. Use `getApiKey()` (reads from localStorage) for auth headers
- **Theme**: CSS variables (`--th-*`) with dark/light mode via `ThemeContext`
- **Routing**: React Router — `/`, `/market/:symbol`, `/results`, `/history`
- **State**: App-level state in `App.jsx`, passed as props. No Redux/Zustand
- **Build**: Vite → `frontend/dist/` (served by Nginx in production)

### VPS Deployment
- **Path**: `/opt/longentry/`
- **Service**: systemd `longentry.service` → uvicorn on `:8001`
- **Web**: Nginx reverse proxy — static files from `dist/`, `/api/` → `:8001`
- **Crons**: Daily backup at 03:00 UTC, weekly analysis Saturday 06:00 UTC
- **Logs**: `/var/log/longentry/`

---

## Environment Variables (backend/.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `LE_DATABASE_URL` | Yes | PostgreSQL connection string |
| `LE_API_KEY_HASH` | No | SHA-256 hash of API key. Empty = auth disabled |
| `LE_MAX_ACTIVE_MARKETS` | No | Default: 6. How many top markets to activate |
| `LE_MIN_FINAL_SCORE` | No | Default: 40. Minimum score to be activated |
| `LE_ANTHROPIC_API_KEY` | No | For AI fundamental outlook |
| `LE_LOG_LEVEL` | No | Default: INFO |
| `LE_LOG_DIR` | No | Default: /var/log/longentry |
| `LE_TELEGRAM_BOT_TOKEN` | No | For alert notifications |
| `LE_TELEGRAM_CHAT_ID` | No | Telegram channel for alerts |

---

## Common Development Tasks

### Add a new API endpoint
1. Create/edit schema in `backend/app/schemas/`
2. Create/edit router in `backend/app/routers/`
3. Register router in `backend/app/main.py` with `prefix="/api"`
4. Add fetch function in `frontend/src/api.js`
5. Use in React component

### Add a database migration
1. Create `backend/migrations/00N_description.sql`
2. Run on VPS: `psql -U longentry -d longentry -f migrations/00N_description.sql`

### Change market activation logic
- Backend: `backend/app/routers/config.py` → `set_max_active()` re-ranks markets
- Backend: `backend/app/engines/analytics.py` → scoring formulas
- Frontend: `App.jsx` → `ActiveMarketsInput` component (+/- buttons)
- Frontend: `MarketCard.jsx` → Active/Off toggle buttons

### Debug API issues
- Check browser Network tab for HTTP status codes
- Backend logs: `journalctl -u longentry -f`
- Common: 401 = API key mismatch, 404 = route ordering issue
