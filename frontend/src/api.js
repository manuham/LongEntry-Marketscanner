const API_KEY = localStorage.getItem("le_api_key") || "";

async function apiFetch(path) {
  const res = await fetch(path, {
    headers: { "X-API-Key": API_KEY },
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

export function setApiKey(key) {
  localStorage.setItem("le_api_key", key);
  window.location.reload();
}
