function getApiKey() {
  return localStorage.getItem("le_api_key") || "";
}

async function apiFetch(path) {
  const res = await fetch(path, {
    headers: { "X-API-Key": getApiKey() },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export function fetchMarkets() {
  return apiFetch("/api/markets");
}

export function fetchAnalytics() {
  return apiFetch("/api/analytics");
}

export function fetchSymbolAnalytics(symbol) {
  return apiFetch(`/api/analytics/${symbol}`);
}

export function fetchCandles(symbol, limit = 500) {
  return apiFetch(`/api/candles/${symbol}?limit=${limit}`);
}

export function overrideMarket(symbol, active) {
  return fetch(`/api/override/${symbol}`, {
    method: "POST",
    headers: {
      "X-API-Key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ active }),
  }).then((r) => {
    if (!r.ok) throw new Error(`API error ${r.status}: ${r.statusText}`);
    return r.json();
  });
}

export function fetchFundamental() {
  return apiFetch("/api/fundamental");
}

export function fetchFundamentalEvents() {
  return apiFetch("/api/fundamental/events");
}

export function fetchAIPredictions() {
  return apiFetch("/api/fundamental/ai-predictions");
}

export function fetchTrades(symbol) {
  return apiFetch(`/api/trades/${symbol}`);
}

export function fetchResults() {
  return apiFetch("/api/results");
}

export function fetchHealth() {
  return apiFetch("/api/health");
}

export function setApiKey(key) {
  localStorage.setItem("le_api_key", key);
  window.location.reload();
}

// ─── New endpoints for history, heatmap, drawdown ───

export function fetchSymbolHistory(symbol, weeks = 52) {
  return apiFetch(`/api/analytics/history/${symbol}?weeks=${weeks}`);
}

export function fetchAllHistory(weeks = 12) {
  return apiFetch(`/api/analytics/history?weeks=${weeks}`);
}

export function fetchHeatmap(symbol) {
  return apiFetch(`/api/backtest/heatmap/${symbol}`);
}

export function fetchDrawdown() {
  return apiFetch("/api/trades/drawdown");
}

export function fetchMaxActive() {
  return apiFetch("/api/config/max-active-markets");
}

export function updateMaxActive(maxActive) {
  return fetch("/api/config/max-active-markets", {
    method: "PUT",
    headers: {
      "X-API-Key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ max_active: maxActive }),
  }).then((r) => {
    if (!r.ok) throw new Error(`API error ${r.status}: ${r.statusText}`);
    return r.json();
  });
}

export function fetchMaxActiveStocks() {
  return apiFetch("/api/config/max-active-stocks");
}

export function updateMaxActiveStocks(maxActive) {
  return fetch("/api/config/max-active-stocks", {
    method: "PUT",
    headers: {
      "X-API-Key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ max_active: maxActive }),
  }).then((r) => {
    if (!r.ok) throw new Error(`API error ${r.status}: ${r.statusText}`);
    return r.json();
  });
}

export function fetchMaxActiveAll() {
  return apiFetch("/api/config/max-active-all");
}

export function applyRanking() {
  return fetch("/api/config/apply-ranking", {
    method: "POST",
    headers: {
      "X-API-Key": getApiKey(),
      "Content-Type": "application/json",
    },
  }).then((r) => {
    if (!r.ok) throw new Error(`API error ${r.status}: ${r.statusText}`);
    return r.json();
  });
}
