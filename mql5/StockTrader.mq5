//+------------------------------------------------------------------+
//| StockTrader.mq5 — Combined multi-symbol EA for stock trading     |
//| Runs on ONE chart, trades ALL configured stock symbols            |
//| Combines: Trading + DataSender + TradeSender + ResultSender       |
//+------------------------------------------------------------------+
#property copyright "LongEntry"
#property version   "1.00"
#property strict

#include <Trade\Trade.mqh>

//--- Maximum number of symbols this EA can handle
#define MAX_SYMBOLS 50

//+------------------------------------------------------------------+
//| Input parameters                                                  |
//+------------------------------------------------------------------+
input group "==== Server Settings ===="
input string   ServerURL = "";              // Server API URL (e.g., http://123.45.67.89/api)
input string   APIKey    = "";              // API Key for authentication

input group "==== Stock Symbols ===="
input string   StockSymbols = "AAPL,AMZN,BABA,BAC,GOOG,META,MSFT,NFLX,NVDA,PFE,T,TSLA,V,WMT,ZM,AIRF,ALVG,BAYGn,DBKGn,IBE,LVMH,RACE,VOWG_p";
                                            // Comma-separated BASE symbol names
input string   SymbolSuffix = "";           // Broker suffix appended to each (e.g., ".s", ".cash", "")

input group "==== Risk Settings ===="
input double   RiskAmount = 100.0;          // Risk Amount in Account Currency per trade

input group "==== Trading Settings ===="
input ulong    MagicNumber = 200001;        // Magic Number for all stock trades
input string   TradeComment = "StockTrader"; // Trade Comment
input int      ConfigRefreshHours = 4;      // Config refresh interval (hours)

input group "==== Data Upload Settings ===="
input int      InitialYears    = 2;         // Years of H1 history for first upload
input int      MaxUploadRetries = 3;        // Max retries per upload chunk
input int      RetryDelaySec   = 30;        // Seconds between upload retries

input group "==== Timing Settings ===="
input int      TimerIntervalSec = 30;       // Timer interval for multi-symbol checks (seconds)
input int      FridayUploadHour = 12;       // Hour (server time) to upload candle data on Fridays
input int      FridayResultHour = 15;       // Hour (server time) to send results on Fridays


//+------------------------------------------------------------------+
//| Per-symbol state arrays                                           |
//+------------------------------------------------------------------+
int      g_symbolCount = 0;
string   g_mtSymbols[MAX_SYMBOLS];       // MT5 symbol names (with suffix)
string   g_cleanSymbols[MAX_SYMBOLS];    // Clean names for server API
bool     g_symbolValid[MAX_SYMBOLS];     // Symbol exists in MT5

// Trading config (fetched from server)
bool     g_active[MAX_SYMBOLS];
int      g_entryHour[MAX_SYMBOLS];
int      g_entryMinute[MAX_SYMBOLS];
double   g_slPercent[MAX_SYMBOLS];
double   g_tpPercent[MAX_SYMBOLS];
string   g_weekStart[MAX_SYMBOLS];
bool     g_tradedToday[MAX_SYMBOLS];
datetime g_lastTradeDate[MAX_SYMBOLS];

// Data upload state
datetime g_lastUploadTime[MAX_SYMBOLS];

// Global state
datetime g_lastConfigFetch     = 0;
ulong    g_lastDealTicket      = 0;
datetime g_lastTradeCheckTime  = 0;
bool     g_uploadedToday       = false;
datetime g_lastUploadDate      = 0;
bool     g_resultsSentToday    = false;
datetime g_lastResultDate      = 0;

CTrade   g_trade;


//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
  {
   g_trade.SetExpertMagicNumber(MagicNumber);

   if(StringLen(ServerURL) == 0)
     {
      Print("[StockTrader] WARNING: ServerURL is empty — EA will not trade or send data");
      return INIT_SUCCEEDED;
     }

   // Parse symbol list
   g_symbolCount = ParseSymbols(StockSymbols);
   if(g_symbolCount == 0)
     {
      Print("[StockTrader] ERROR: No symbols parsed from input");
      return INIT_FAILED;
     }

   Print("[StockTrader] Parsed ", g_symbolCount, " symbols | Magic: ", MagicNumber,
         " | Risk: ", DoubleToString(RiskAmount, 2));

   // Validate symbols and add to Market Watch
   int validCount = 0;
   for(int i = 0; i < g_symbolCount; i++)
     {
      g_symbolValid[i] = SymbolSelect(g_mtSymbols[i], true);
      if(g_symbolValid[i])
        {
         validCount++;
         Print("[StockTrader] OK: ", g_mtSymbols[i], " → server name: ", g_cleanSymbols[i]);
        }
      else
         Print("[StockTrader] WARNING: Symbol not found: ", g_mtSymbols[i], " — will skip");
     }

   Print("[StockTrader] ", validCount, "/", g_symbolCount, " symbols validated");

   // Restore persistent state
   RestoreState();

   // Fetch all configs immediately
   FetchAllConfigs();

   // Start timer for periodic checks
   if(!EventSetTimer(TimerIntervalSec))
      Print("[StockTrader] WARNING: Failed to set timer, relying on OnTick only");

   return INIT_SUCCEEDED;
  }


//+------------------------------------------------------------------+
//| Parse comma-separated symbol string into arrays                   |
//+------------------------------------------------------------------+
int ParseSymbols(string symbolStr)
  {
   int count = 0;
   string remaining = symbolStr;

   // Remove spaces
   StringReplace(remaining, " ", "");

   while(StringLen(remaining) > 0 && count < MAX_SYMBOLS)
     {
      int commaPos = StringFind(remaining, ",");
      string sym;

      if(commaPos >= 0)
        {
         sym = StringSubstr(remaining, 0, commaPos);
         remaining = StringSubstr(remaining, commaPos + 1);
        }
      else
        {
         sym = remaining;
         remaining = "";
        }

      if(StringLen(sym) == 0) continue;

      // Clean name = base name (for server)
      g_cleanSymbols[count] = sym;
      // MT5 name = base name + broker suffix
      g_mtSymbols[count] = sym + SymbolSuffix;

      // Init per-symbol state
      g_active[count]         = false;
      g_entryHour[count]      = 0;
      g_entryMinute[count]    = 0;
      g_slPercent[count]      = 0;
      g_tpPercent[count]      = 0;
      g_weekStart[count]      = "";
      g_tradedToday[count]    = false;
      g_lastTradeDate[count]  = 0;
      g_lastUploadTime[count] = 0;

      count++;
     }

   return count;
  }


//+------------------------------------------------------------------+
//| Restore persistent state from global variables                    |
//+------------------------------------------------------------------+
void RestoreState()
  {
   // Restore last deal ticket
   string gvTicket = "StockTrader_LastTicket";
   if(GlobalVariableCheck(gvTicket))
      g_lastDealTicket = (ulong)GlobalVariableGet(gvTicket);

   // Restore per-symbol upload times
   for(int i = 0; i < g_symbolCount; i++)
     {
      string gvName = "StockTrader_Upload_" + g_cleanSymbols[i];
      if(GlobalVariableCheck(gvName))
         g_lastUploadTime[i] = (datetime)GlobalVariableGet(gvName);
     }

   Print("[StockTrader] Restored state | Last deal ticket: ", g_lastDealTicket);
  }


//+------------------------------------------------------------------+
//| Timer event — primary driver for multi-symbol checks              |
//+------------------------------------------------------------------+
void OnTimer()
  {
   MainLoop();
  }


//+------------------------------------------------------------------+
//| Tick event — secondary trigger                                    |
//+------------------------------------------------------------------+
void OnTick()
  {
   MainLoop();
  }


//+------------------------------------------------------------------+
//| Main logic loop (called from both OnTick and OnTimer)             |
//+------------------------------------------------------------------+
void MainLoop()
  {
   if(StringLen(ServerURL) == 0 || g_symbolCount == 0)
      return;

   MqlDateTime dt;
   TimeCurrent(dt);

   // Skip weekends
   if(dt.day_of_week == 0 || dt.day_of_week == 6)
      return;

   datetime todayStart = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));

   // Reset daily flags on new day
   if(g_lastUploadDate < todayStart)
      g_uploadedToday = false;
   if(g_lastResultDate < todayStart)
      g_resultsSentToday = false;

   for(int i = 0; i < g_symbolCount; i++)
     {
      if(g_lastTradeDate[i] < todayStart)
         g_tradedToday[i] = false;
     }

   // ---- CONFIG REFRESH ----
   int refreshSec = ConfigRefreshHours * 3600;
   if(refreshSec <= 0) refreshSec = 14400;
   if(TimeCurrent() - g_lastConfigFetch >= refreshSec)
      FetchAllConfigs();

   // ---- ENTRY CHECKS (all active symbols) ----
   for(int i = 0; i < g_symbolCount; i++)
     {
      if(!g_symbolValid[i] || !g_active[i] || g_tradedToday[i])
         continue;

      if(dt.hour == g_entryHour[i] && dt.min >= g_entryMinute[i])
         ExecuteEntry(i);
     }

   // ---- TRADE DETECTION (every minute) ----
   datetime now = TimeCurrent();
   if(now - g_lastTradeCheckTime >= 60)
     {
      g_lastTradeCheckTime = now;
      ScanAndSendTrades();
     }

   // ---- FRIDAY TASKS ----
   if(dt.day_of_week == 5)
     {
      // Upload candle data
      if(!g_uploadedToday && dt.hour >= FridayUploadHour)
         UploadAllCandles();

      // Send weekly results
      if(!g_resultsSentToday && dt.hour >= FridayResultHour)
         SendAllResults();
     }
  }


//+------------------------------------------------------------------+
//|                                                                    |
//|   === SECTION 1: TRADING (from FixedLongEntry_Server) ===         |
//|                                                                    |
//+------------------------------------------------------------------+


//+------------------------------------------------------------------+
//| Fetch config for all symbols from server                          |
//+------------------------------------------------------------------+
void FetchAllConfigs()
  {
   Print("[StockTrader] Refreshing configs for ", g_symbolCount, " symbols...");

   int activeCount = 0;
   for(int i = 0; i < g_symbolCount; i++)
     {
      if(!g_symbolValid[i]) continue;
      FetchConfig(i);
      if(g_active[i]) activeCount++;
      Sleep(200);  // Small delay between requests
     }

   g_lastConfigFetch = TimeCurrent();
   Print("[StockTrader] Config refresh done — ", activeCount, " active symbols");
  }


//+------------------------------------------------------------------+
//| Fetch config for a single symbol                                  |
//+------------------------------------------------------------------+
void FetchConfig(int idx)
  {
   string url = ServerURL + "/config/" + g_cleanSymbols[idx];
   string headers = "X-API-Key: " + APIKey + "\r\n";

   char postData[];
   char result[];
   string resultHeaders;

   ResetLastError();
   int res = WebRequest("GET", url, headers, 30000, postData, result, resultHeaders);

   if(res != 200)
     {
      string errBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[StockTrader] Config fetch failed for ", g_cleanSymbols[idx],
            " (code ", res, "): ", errBody);
      g_active[idx] = false;
      return;
     }

   string json = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);

   g_active[idx]      = GetJsonBool(json, "active");
   g_entryHour[idx]   = (int)GetJsonDouble(json, "entryHour");
   g_entryMinute[idx] = (int)GetJsonDouble(json, "entryMinute");
   g_slPercent[idx]   = GetJsonDouble(json, "slPercent");
   g_tpPercent[idx]   = GetJsonDouble(json, "tpPercent");
   g_weekStart[idx]   = GetJsonString(json, "weekStart");

   if(g_active[idx])
      Print("[StockTrader] ", g_cleanSymbols[idx], ": ACTIVE entry=",
            IntegerToString(g_entryHour[idx]), ":",
            StringFormat("%02d", g_entryMinute[idx]),
            " SL=", DoubleToString(g_slPercent[idx], 2), "%",
            " TP=", DoubleToString(g_tpPercent[idx], 2), "%");
  }


//+------------------------------------------------------------------+
//| Execute a BUY trade for symbol at index                           |
//+------------------------------------------------------------------+
void ExecuteEntry(int idx)
  {
   string sym = g_mtSymbols[idx];

   // Check if we already have an open position for this symbol
   if(HasOpenPosition(sym))
     {
      g_tradedToday[idx] = true;
      return;
     }

   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   if(ask <= 0)
     {
      Print("[StockTrader] ERROR: Invalid Ask price for ", sym);
      return;
     }

   // Calculate SL and TP prices
   double slPrice = ask * (1.0 - g_slPercent[idx] / 100.0);
   double tpPrice = ask * (1.0 + g_tpPercent[idx] / 100.0);

   // Normalize to tick size
   double tickSize = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   if(tickSize > 0)
     {
      slPrice = MathRound(slPrice / tickSize) * tickSize;
      tpPrice = MathRound(tpPrice / tickSize) * tickSize;
     }

   // Calculate lot size
   double lots = CalculateLotSize(sym, ask, slPrice);
   if(lots <= 0)
     {
      Print("[StockTrader] ERROR: Invalid lot size for ", sym);
      return;
     }

   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

   if(g_trade.Buy(lots, sym, ask, slPrice, tpPrice, TradeComment))
     {
      Print("[StockTrader] BUY ", DoubleToString(lots, 2), " ", g_cleanSymbols[idx],
            " @ ", DoubleToString(ask, digits),
            " SL=", DoubleToString(slPrice, digits),
            " TP=", DoubleToString(tpPrice, digits));
      g_tradedToday[idx] = true;
      g_lastTradeDate[idx] = TimeCurrent();
     }
   else
     {
      Print("[StockTrader] ERROR: Buy failed for ", g_cleanSymbols[idx],
            " — ", g_trade.ResultRetcodeDescription());
     }
  }


//+------------------------------------------------------------------+
//| Calculate lot size from risk amount for a specific symbol         |
//+------------------------------------------------------------------+
double CalculateLotSize(string sym, double entryPrice, double slPrice)
  {
   double slDistance = MathAbs(entryPrice - slPrice);
   if(slDistance <= 0)
      return 0;

   double tickSz  = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   double tickVal = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   double lotStep = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   double minLot  = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);

   if(tickSz <= 0 || tickVal <= 0 || lotStep <= 0)
     {
      Print("[StockTrader] ERROR: Invalid symbol properties for ", sym);
      return 0;
     }

   double riskPerLot = (slDistance / tickSz) * tickVal;
   if(riskPerLot <= 0)
      return 0;

   double lots = RiskAmount / riskPerLot;
   lots = MathFloor(lots / lotStep) * lotStep;
   lots = MathMax(lots, minLot);
   lots = MathMin(lots, maxLot);

   return NormalizeDouble(lots, 2);
  }


//+------------------------------------------------------------------+
//| Check if there's an open position for symbol with our magic       |
//+------------------------------------------------------------------+
bool HasOpenPosition(string sym)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == sym)
        {
         if(PositionGetInteger(POSITION_MAGIC) == (long)MagicNumber)
            return true;
        }
     }
   return false;
  }


//+------------------------------------------------------------------+
//|                                                                    |
//|   === SECTION 2: DATA UPLOAD (from DataSender) ===                |
//|                                                                    |
//+------------------------------------------------------------------+


//+------------------------------------------------------------------+
//| Upload H1 candle data for all symbols                             |
//+------------------------------------------------------------------+
void UploadAllCandles()
  {
   Print("[StockTrader] Starting candle upload for ", g_symbolCount, " symbols...");

   int successCount = 0;
   for(int i = 0; i < g_symbolCount; i++)
     {
      if(!g_symbolValid[i]) continue;

      if(UploadCandlesForSymbol(i))
        {
         successCount++;
         // Persist upload time
         g_lastUploadTime[i] = TimeCurrent();
         string gvName = "StockTrader_Upload_" + g_cleanSymbols[i];
         GlobalVariableSet(gvName, (double)g_lastUploadTime[i]);
        }

      Sleep(500);  // Delay between symbol uploads
     }

   g_uploadedToday = true;
   g_lastUploadDate = TimeCurrent();
   Print("[StockTrader] Candle upload complete — ", successCount, "/", g_symbolCount, " succeeded");
  }


//+------------------------------------------------------------------+
//| Upload candles for a single symbol                                |
//+------------------------------------------------------------------+
bool UploadCandlesForSymbol(int idx)
  {
   string sym = g_mtSymbols[idx];

   // Determine start time
   datetime fromTime;
   if(g_lastUploadTime[idx] == 0)
     {
      fromTime = TimeCurrent() - InitialYears * 365 * 24 * 3600;
      Print("[StockTrader] First upload for ", g_cleanSymbols[idx],
            " — fetching ", InitialYears, " years");
     }
   else
     {
      fromTime = g_lastUploadTime[idx];
     }

   // Get H1 candles
   MqlRates rates[];
   int copied = CopyRates(sym, PERIOD_H1, fromTime, TimeCurrent(), rates);
   if(copied <= 0)
     {
      Print("[StockTrader] ERROR: CopyRates returned ", copied, " for ", sym);
      return false;
     }

   Print("[StockTrader] Uploading ", copied, " candles for ", g_cleanSymbols[idx]);

   // Send in chunks
   int chunkSize = 2000;
   int totalChunks = (int)MathCeil((double)copied / chunkSize);

   for(int chunk = 0; chunk < totalChunks; chunk++)
     {
      int startIdx = chunk * chunkSize;
      int endIdx = MathMin(startIdx + chunkSize, copied);

      string json = BuildCandleJSON(idx, rates, startIdx, endIdx);
      if(!SendCandleChunk(idx, json, chunk + 1, totalChunks))
         return false;
     }

   return true;
  }


//+------------------------------------------------------------------+
//| Build JSON for a chunk of candles                                 |
//+------------------------------------------------------------------+
string BuildCandleJSON(int idx, MqlRates &rates[], int startIdx, int endIdx)
  {
   string sym = g_mtSymbols[idx];
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

   string json = "{";
   json += "\"symbol\":\"" + g_cleanSymbols[idx] + "\",";
   json += "\"timeframe\":\"H1\",";
   json += "\"apiKey\":\"" + APIKey + "\",";
   json += "\"candles\":[";

   for(int i = startIdx; i < endIdx; i++)
     {
      if(i > startIdx) json += ",";

      json += "{";
      string timeStr = TimeToString(rates[i].time, TIME_DATE | TIME_SECONDS);
      StringReplace(timeStr, ".", "-");
      json += "\"time\":\"" + timeStr + "\",";
      json += "\"open\":" + DoubleToString(rates[i].open, digits) + ",";
      json += "\"high\":" + DoubleToString(rates[i].high, digits) + ",";
      json += "\"low\":" + DoubleToString(rates[i].low, digits) + ",";
      json += "\"close\":" + DoubleToString(rates[i].close, digits) + ",";
      json += "\"volume\":" + IntegerToString(rates[i].tick_volume);
      json += "}";
     }

   json += "]}";
   return json;
  }


//+------------------------------------------------------------------+
//| Send a candle data chunk with retries                             |
//+------------------------------------------------------------------+
bool SendCandleChunk(int idx, string json, int chunkNum, int totalChunks)
  {
   string url = ServerURL + "/candles";
   string headers = "Content-Type: application/json\r\n";

   char postData[];
   StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1);

   for(int attempt = 1; attempt <= MaxUploadRetries; attempt++)
     {
      char result[];
      string resultHeaders;

      int res = WebRequest("POST", url, headers, 30000, postData, result, resultHeaders);

      if(res == 200)
        {
         string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
         Print("[StockTrader] ", g_cleanSymbols[idx], " chunk ", chunkNum,
               "/", totalChunks, " OK: ", response);
         return true;
        }

      string errBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[StockTrader] ", g_cleanSymbols[idx], " chunk ", chunkNum,
            "/", totalChunks, " attempt ", attempt, "/", MaxUploadRetries,
            " failed (code ", res, "): ", errBody);

      if(attempt < MaxUploadRetries)
        {
         Print("[StockTrader] Retrying in ", RetryDelaySec, " seconds...");
         Sleep(RetryDelaySec * 1000);
        }
     }

   Print("[StockTrader] ERROR: All retries failed for ", g_cleanSymbols[idx],
         " chunk ", chunkNum);
   return false;
  }


//+------------------------------------------------------------------+
//|                                                                    |
//|   === SECTION 3: TRADE REPORTING (from TradeSender) ===           |
//|                                                                    |
//+------------------------------------------------------------------+


//+------------------------------------------------------------------+
//| Scan deal history and send closed trades for all stock symbols    |
//+------------------------------------------------------------------+
void ScanAndSendTrades()
  {
   datetime fromTime = TimeCurrent() - 7 * 86400;
   datetime toTime   = TimeCurrent();

   if(!HistorySelect(fromTime, toTime))
      return;

   int totalDeals = HistoryDealsTotal();
   string tradesJson = "";
   int tradeCount = 0;

   for(int i = 0; i < totalDeals; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      // Skip already-sent deals
      if(ticket <= g_lastDealTicket) continue;

      // Only trade exits
      int entry = (int)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT) continue;

      // Only our magic number
      long dealMagic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
      if(dealMagic != (long)MagicNumber) continue;

      // Check if deal symbol is one of our stock symbols
      string dealSymbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
      int symIdx = FindSymbolIndex(dealSymbol);
      if(symIdx < 0) continue;

      int digits = (int)SymbolInfoInteger(dealSymbol, SYMBOL_DIGITS);

      // Get close details
      datetime closeTime  = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      double   closePrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double   closeLots  = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double   profit     = HistoryDealGetDouble(ticket, DEAL_PROFIT)
                          + HistoryDealGetDouble(ticket, DEAL_SWAP)
                          + HistoryDealGetDouble(ticket, DEAL_COMMISSION);

      // Find entry deal via position ID
      long posId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      datetime openTime  = 0;
      double   openPrice = 0;
      double   slPrice   = 0;
      double   tpPrice   = 0;
      double   lotSize   = closeLots;

      if(HistorySelectByPosition(posId))
        {
         int posDeals = HistoryDealsTotal();
         for(int j = 0; j < posDeals; j++)
           {
            ulong entryTicket = HistoryDealGetTicket(j);
            if(entryTicket == 0) continue;

            int dealEntry = (int)HistoryDealGetInteger(entryTicket, DEAL_ENTRY);
            if(dealEntry == DEAL_ENTRY_IN)
              {
               openTime  = (datetime)HistoryDealGetInteger(entryTicket, DEAL_TIME);
               openPrice = HistoryDealGetDouble(entryTicket, DEAL_PRICE);
               lotSize   = HistoryDealGetDouble(entryTicket, DEAL_VOLUME);
               break;
              }
           }

         // Re-select full history for continuation
         HistorySelect(fromTime, toTime);
        }

      // Get SL/TP from order
      long orderTicket = HistoryDealGetInteger(ticket, DEAL_ORDER);
      if(orderTicket > 0 && HistoryOrderSelect(orderTicket))
        {
         slPrice = HistoryOrderGetDouble(orderTicket, ORDER_SL);
         tpPrice = HistoryOrderGetDouble(orderTicket, ORDER_TP);
        }

      // Fallback: search orders for SL/TP
      if(slPrice == 0 && tpPrice == 0 && openTime > 0)
        {
         if(HistorySelect(fromTime, toTime))
           {
            int totalOrders = HistoryOrdersTotal();
            for(int k = 0; k < totalOrders; k++)
              {
               ulong oTicket = HistoryOrderGetTicket(k);
               if(oTicket == 0) continue;
               if(HistoryOrderGetInteger(oTicket, ORDER_POSITION_ID) == posId)
                 {
                  double oSl = HistoryOrderGetDouble(oTicket, ORDER_SL);
                  double oTp = HistoryOrderGetDouble(oTicket, ORDER_TP);
                  if(oSl > 0) slPrice = oSl;
                  if(oTp > 0) tpPrice = oTp;
                  if(slPrice > 0 && tpPrice > 0) break;
                 }
              }
           }
        }

      // Calculate PnL percent
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      double pnlPct  = (balance > 0) ? (profit / balance * 100.0) : 0.0;
      string result  = (profit > 0) ? "win" : "loss";

      // Build JSON for this trade — use clean symbol for server
      if(tradeCount > 0) tradesJson += ",";
      tradesJson += "{";
      tradesJson += "\"symbol\":\"" + g_cleanSymbols[symIdx] + "\",";
      tradesJson += "\"open_time\":\"" + FormatISO(openTime) + "\",";
      tradesJson += "\"close_time\":\"" + FormatISO(closeTime) + "\",";
      tradesJson += "\"open_price\":" + DoubleToString(openPrice, digits) + ",";
      tradesJson += "\"close_price\":" + DoubleToString(closePrice, digits) + ",";
      tradesJson += "\"sl_price\":" + DoubleToString(slPrice, digits) + ",";
      tradesJson += "\"tp_price\":" + DoubleToString(tpPrice, digits) + ",";
      tradesJson += "\"lot_size\":" + DoubleToString(lotSize, 2) + ",";
      tradesJson += "\"pnl_amount\":" + DoubleToString(profit, 2) + ",";
      tradesJson += "\"pnl_percent\":" + DoubleToString(pnlPct, 4) + ",";
      tradesJson += "\"result\":\"" + result + "\",";
      tradesJson += "\"magic_number\":" + IntegerToString(MagicNumber);
      tradesJson += "}";
      tradeCount++;

      g_lastDealTicket = ticket;
     }

   if(tradeCount > 0)
      SendTradesToServer(tradesJson, tradeCount);
  }


//+------------------------------------------------------------------+
//| Find which index a MT5 symbol corresponds to                      |
//+------------------------------------------------------------------+
int FindSymbolIndex(string dealSymbol)
  {
   for(int i = 0; i < g_symbolCount; i++)
     {
      if(g_mtSymbols[i] == dealSymbol)
         return i;
     }
   return -1;
  }


//+------------------------------------------------------------------+
//| Send trade batch to server                                        |
//+------------------------------------------------------------------+
void SendTradesToServer(string tradesJson, int count)
  {
   string json = "{";
   json += "\"apiKey\":\"" + APIKey + "\",";
   json += "\"trades\":[" + tradesJson + "]";
   json += "}";

   string url = ServerURL + "/trades";
   char postData[];
   StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1);

   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";

   int httpCode = WebRequest("POST", url, headers, 10000, postData, result, resultHeaders);

   if(httpCode == 200)
     {
      Print("[StockTrader] Trades sent OK — ", count, " trade(s)");

      // Persist last ticket
      string gvName = "StockTrader_LastTicket";
      GlobalVariableSet(gvName, (double)g_lastDealTicket);
     }
   else
     {
      string resp = CharArrayToString(result);
      Print("[StockTrader] Trades FAILED — HTTP ", httpCode, ": ", resp);

      // Reset ticket so we retry
      string gvName = "StockTrader_LastTicket";
      if(GlobalVariableCheck(gvName))
         g_lastDealTicket = (ulong)GlobalVariableGet(gvName);
     }
  }


//+------------------------------------------------------------------+
//|                                                                    |
//|   === SECTION 4: WEEKLY RESULTS (from ResultSender) ===           |
//|                                                                    |
//+------------------------------------------------------------------+


//+------------------------------------------------------------------+
//| Send weekly results for all stock symbols                         |
//+------------------------------------------------------------------+
void SendAllResults()
  {
   Print("[StockTrader] Sending weekly results for ", g_symbolCount, " symbols...");

   MqlDateTime dt;
   TimeCurrent(dt);

   // Calculate week start (Monday)
   datetime now = TimeCurrent();
   datetime weekStart = now - (dt.day_of_week - 1) * 86400;
   weekStart = StringToTime(TimeToString(weekStart, TIME_DATE));

   // Format week start
   MqlDateTime wsDt;
   TimeToStruct(weekStart, wsDt);
   string weekStartStr = StringFormat("%04d-%02d-%02d", wsDt.year, wsDt.mon, wsDt.day);

   datetime weekEnd = weekStart + 5 * 86400;

   int sentCount = 0;
   for(int i = 0; i < g_symbolCount; i++)
     {
      if(!g_symbolValid[i]) continue;

      if(SendResultForSymbol(i, weekStart, weekEnd, weekStartStr))
         sentCount++;

      Sleep(200);
     }

   g_resultsSentToday = true;
   g_lastResultDate = TimeCurrent();
   Print("[StockTrader] Results sent — ", sentCount, "/", g_symbolCount);
  }


//+------------------------------------------------------------------+
//| Send weekly result for a single symbol                            |
//+------------------------------------------------------------------+
bool SendResultForSymbol(int idx, datetime weekStart, datetime weekEnd, string weekStartStr)
  {
   string mtSym = g_mtSymbols[idx];

   int trades = 0, wins = 0, losses = 0;
   double totalPnl = 0.0;

   if(HistorySelect(weekStart, weekEnd))
     {
      int totalDeals = HistoryDealsTotal();
      for(int i = 0; i < totalDeals; i++)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket == 0) continue;

         if(HistoryDealGetString(ticket, DEAL_SYMBOL) != mtSym) continue;
         int entry = (int)HistoryDealGetInteger(ticket, DEAL_ENTRY);
         if(entry != DEAL_ENTRY_OUT) continue;

         // Only our magic number
         long dealMagic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
         if(dealMagic != (long)MagicNumber) continue;

         double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT)
                       + HistoryDealGetDouble(ticket, DEAL_SWAP)
                       + HistoryDealGetDouble(ticket, DEAL_COMMISSION);

         trades++;
         if(profit > 0) wins++;
         else losses++;
         totalPnl += profit;
        }
     }

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double pnlPct  = (balance > 0) ? (totalPnl / balance * 100.0) : 0.0;

   // Build JSON
   string json = "{";
   json += "\"symbol\":\"" + g_cleanSymbols[idx] + "\",";
   json += "\"weekStart\":\"" + weekStartStr + "\",";
   json += "\"apiKey\":\"" + APIKey + "\",";
   json += "\"trades_taken\":" + IntegerToString(trades) + ",";
   json += "\"wins\":" + IntegerToString(wins) + ",";
   json += "\"losses\":" + IntegerToString(losses) + ",";
   json += "\"total_pnl_percent\":" + DoubleToString(pnlPct, 4);
   json += "}";

   string url = ServerURL + "/results";
   char postData[];
   StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1);

   char result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";

   int httpCode = WebRequest("POST", url, headers, 5000, postData, result, resultHeaders);

   if(httpCode == 200)
     {
      if(trades > 0)
         Print("[StockTrader] Result OK — ", g_cleanSymbols[idx], " week ", weekStartStr,
               ": ", trades, " trades, ", wins, "W/", losses, "L, PnL ",
               DoubleToString(pnlPct, 2), "%");
      return true;
     }

   string resp = CharArrayToString(result);
   Print("[StockTrader] Result FAILED for ", g_cleanSymbols[idx],
         " — HTTP ", httpCode, ": ", resp);
   return false;
  }


//+------------------------------------------------------------------+
//|                                                                    |
//|   === SECTION 5: JSON HELPERS ===                                 |
//|                                                                    |
//+------------------------------------------------------------------+


string GetJsonString(string json, string key)
  {
   string search = "\"" + key + "\":\"";
   int pos = StringFind(json, search);
   if(pos < 0)
      return "";
   pos += StringLen(search);
   int endPos = StringFind(json, "\"", pos);
   if(endPos < 0)
      return "";
   return StringSubstr(json, pos, endPos - pos);
  }


double GetJsonDouble(string json, string key)
  {
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0)
      return 0;
   pos += StringLen(search);

   string numStr = "";
   for(int i = pos; i < StringLen(json); i++)
     {
      ushort ch = StringGetCharacter(json, i);
      if(ch == ',' || ch == '}' || ch == ' ' || ch == '\n')
         break;
      numStr += ShortToString(ch);
     }
   return StringToDouble(numStr);
  }


bool GetJsonBool(string json, string key)
  {
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0)
      return false;
   pos += StringLen(search);

   while(pos < StringLen(json) && StringGetCharacter(json, pos) == ' ')
      pos++;

   if(StringSubstr(json, pos, 4) == "true")
      return true;
   return false;
  }


string FormatISO(datetime dt)
  {
   MqlDateTime mdt;
   TimeToStruct(dt, mdt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d",
                       mdt.year, mdt.mon, mdt.day,
                       mdt.hour, mdt.min, mdt.sec);
  }


//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Print("[StockTrader] Deinitialized (reason: ", reason, ") | ",
         g_symbolCount, " symbols | Last ticket: ", g_lastDealTicket);
  }
