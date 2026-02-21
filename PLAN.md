# Symbol Dashboard with Trade Visualization — Implementation Plan

## Overview
Upgrade the existing Market Detail page into a professional trading dashboard with interactive chart showing all bot trades as visual markers, a trade history table, equity curve, and performance statistics.

## Current State
- `MarketDetail.jsx` already shows an H1 candlestick chart using **lightweight-charts** (TradingView's library) with zoom/pan
- Backend serves H1 candles via `GET /api/candles/{symbol}`
- EA uploads **weekly summaries** only (wins/losses/PnL%) — no individual trade records
- No trade markers on the chart

## What's Missing
**Individual trade data.** The EA currently only reports weekly totals. We need each trade's open time, close time, prices, SL/TP levels, and result to plot them on the chart.

---

## Phase 1: Backend — Individual Trade Storage

### 1.1 New migration: `005_trades.sql`
```sql
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
CREATE INDEX idx_trades_symbol_time ON trades(symbol, open_time);
```

### 1.2 New Pydantic schemas: `schemas/trades.py`
- `TradeUpload` — single trade record from EA (with apiKey body auth)
- `TradeUploadBatch` — batch of trades
- `TradeResponse` — returned to frontend

### 1.3 New API router: `routers/trades.py`
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/trades` | Body key | EA uploads individual trade(s) when closed |
| GET | `/api/trades/{symbol}` | No | Get all trades for a symbol (optional `?from=&to=` date filter) |

### 1.4 Register router in `main.py`

---

## Phase 2: MQL5 — Trade Reporter EA

### 2.1 New EA: `TradeSender.mq5`
- Runs on each chart alongside the existing EAs
- On each tick, scans deal history for newly closed trades with the LongEntry magic number
- Sends individual trade details to `POST /api/trades`:
  ```json
  {
    "apiKey": "...",
    "trades": [{
      "symbol": "XAUUSD",
      "open_time": "2025-02-10T09:00:00",
      "close_time": "2025-02-10T14:30:00",
      "open_price": 2890.50,
      "close_price": 2920.10,
      "sl_price": 2860.00,
      "tp_price": 2930.00,
      "lot_size": 0.05,
      "pnl_amount": 148.00,
      "pnl_percent": 1.02,
      "result": "win",
      "magic_number": 100001
    }]
  }
  ```
- Tracks last-sent deal ticket in a global variable to avoid duplicates

---

## Phase 3: Frontend — Professional Symbol Dashboard

### 3.1 Add `fetchTrades` to `api.js`
```js
export function fetchTrades(symbol) {
  return apiFetch(`/api/trades/${symbol}`);
}
```

### 3.2 Upgrade `MarketDetail.jsx` — Enhanced Chart with Trade Markers

**Chart upgrades using lightweight-charts API:**
- **Markers** — Entry arrows (green ▲ at open_time/open_price) and exit arrows (red ▼ or green ▼ at close_time/close_price)
- **Horizontal price lines** — SL (red dashed) and TP (green dashed) for the most recent/active trade
- Load **2000 candles** (instead of 1000) for more history
- Larger chart height (500-600px) to be more prominent

**lightweight-charts marker format:**
```js
candleSeries.setMarkers([
  { time: 1707555600, position: 'belowBar', color: '#22C55E', shape: 'arrowUp', text: 'BUY 0.05' },
  { time: 1707577200, position: 'aboveBar', color: '#EF4444', shape: 'arrowDown', text: 'TP +1.02%' },
]);
```

### 3.3 New section: Trade History Table
Below the chart, a sortable table showing all trades:
| Date | Direction | Entry | Exit | SL | TP | Lots | P&L | Result |
|------|-----------|-------|------|----|----|------|-----|--------|
| 2025-02-10 09:00 | BUY | 2890.50 | 2920.10 | 2860.00 | 2930.00 | 0.05 | +$148.00 (+1.02%) | WIN |

- Click a row → chart scrolls/zooms to that trade
- Color-coded rows (green for wins, red for losses)

### 3.4 New section: Equity Curve
- A **line chart** (using lightweight-charts `addLineSeries`) showing cumulative PnL% over time
- Computed from the trades array: start at 0, add each trade's pnl_percent chronologically
- Shows the bot's performance trajectory for this symbol

### 3.5 New section: Performance Stats Panel
Key metrics calculated from individual trades:
- Total trades / Win rate
- Average win % / Average loss %
- Best trade / Worst trade
- Profit factor (gross wins / gross losses)
- Current streak (consecutive wins/losses)
- Max drawdown
- Average trade duration

### 3.6 Layout
```
┌─────────────────────────────────────────────────────────┐
│  ← Back    XAUUSD  Gold  commodity   [Active] Score: 72│
│  $2,890.50                                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│              H1 Chart (600px tall)                       │
│        with entry/exit markers + SL/TP lines            │
│              zoom / pan / crosshair                      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                    Equity Curve                          │
├──────────────────────┬──────────────────────────────────┤
│  Performance Stats   │   Current Week Config            │
│  Win Rate: 65%       │   Entry: 09:00                   │
│  Avg Win: +1.2%      │   SL: 0.75%  TP: 2.0%           │
│  Avg Loss: -0.6%     │   Status: Active (Rank #3)       │
│  Profit Factor: 2.0  │   Param Stability: 78%           │
│  Max DD: -3.2%       │                                  │
│  ...                 │                                  │
├──────────────────────┴──────────────────────────────────┤
│              Trade History Table                         │
│  Date | Entry | Exit | SL | TP | Lots | P&L | Result   │
│  ...                                                    │
├─────────────────────────────────────────────────────────┤
│  [Existing sections: Daily Stats, Trend, Backtest, AI]  │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Order

1. **Backend first** — migration, schemas, router (can test with manual inserts)
2. **MQL5 EA** — TradeSender to populate trade data going forward
3. **Frontend** — chart markers, equity curve, trade table, stats panel
4. **Build & deploy**

---

## Files to Create
- `backend/migrations/005_trades.sql`
- `backend/app/schemas/trades.py`
- `backend/app/routers/trades.py`
- `mql5/TradeSender.mq5`

## Files to Modify
- `backend/app/main.py` — register trades router
- `frontend/src/api.js` — add `fetchTrades()`
- `frontend/src/MarketDetail.jsx` — chart markers, trade table, equity curve, stats panel
