//+------------------------------------------------------------------+
//| LongEntry_Unified.mq5 — All-in-one LongEntry EA                  |
//|                                                                    |
//| Combines all functionality into a single EA per chart:             |
//|   1. TRADING   — Pulls config from server, enters at optimal time  |
//|                   Smart mode: split TP, break-even, trailing stop   |
//|   2. DATA FEED — Sends H1 + M5 candles to server                  |
//|                   First launch: 2 years of history                  |
//|                   Weekly: incremental M5 data (Fridays)             |
//|   3. TRADE LOG — Detects closed trades, reports to server          |
//|   4. RESULTS   — Sends weekly P&L summary (Fridays)                |
//|                                                                    |
//| Attach to each of the 14 charts — one EA does everything.         |
//+------------------------------------------------------------------+
#property copyright "LongEntry"
#property version   "3.00"
#property strict

#include <Trade\Trade.mqh>


//+------------------------------------------------------------------+
//| INPUTS                                                             |
//+------------------------------------------------------------------+
input group "==== Server Integration ===="
input string   ServerURL = "";              // Server API URL (e.g., http://123.45.67.89/api)
input string   APIKey    = "";              // API Key for authentication

input group "==== Risk Settings ===="
input double   RiskAmount = 100.0;          // Risk Amount in Account Currency

input group "==== Trading Settings ===="
input ulong    MagicNumber = 100001;        // Base Magic Number (runner uses +1)
input string   TradeComment = "LongEntry";  // Trade Comment
input int      ConfigRefreshHours = 4;      // Config refresh interval (hours)

input group "==== Data Feed Settings ===="
input int      InitialYears = 2;            // Years of history for first upload
input bool     SendM5Data = true;           // Enable M5 candle uploads (for accurate backtests)
input int      MaxRetries = 3;              // Max upload retries on failure
input int      RetryDelaySec = 30;          // Seconds between retries


//+------------------------------------------------------------------+
//| GLOBAL STATE                                                       |
//+------------------------------------------------------------------+

// ── Server config (refreshed periodically) ──
bool     g_active           = false;
int      g_entryHour        = 0;
int      g_entryMinute      = 0;
double   g_slPercent        = 0;
double   g_tpPercent        = 0;
string   g_weekStart        = "";

// ── Smart position management ──
double   g_tp1ClosePct      = 0.5;
double   g_tp2Percent       = 0.0;
string   g_aiConfidence     = "none";
bool     g_useTrailingStop  = false;
double   g_trailingStopDist = 0.0;

// ── Trading state ──
datetime g_lastConfigFetch  = 0;
bool     g_tradedToday      = false;
datetime g_lastTradeDate    = 0;
bool     g_tp1Hit           = false;
bool     g_breakEvenSet     = false;
double   g_entryPrice       = 0;
double   g_runnerOpenPrice  = 0;

// ── Data feed state ──
datetime g_lastH1Upload     = 0;
datetime g_lastM5Upload     = 0;

// ── Trade sender state ──
ulong    g_lastDealTicket   = 0;
datetime g_lastTradeCheck   = 0;

// ── Result sender state ──
datetime g_lastResultSend   = 0;

// ── Trade object ──
CTrade   g_trade;

// ── Clean symbol name (cached) ──
string   g_cleanSymbol      = "";


//+------------------------------------------------------------------+
//| INITIALIZATION                                                     |
//+------------------------------------------------------------------+
int OnInit()
  {
   g_trade.SetExpertMagicNumber(MagicNumber);

   // Cache clean symbol name (strip broker suffixes)
   g_cleanSymbol = _Symbol;
   StringReplace(g_cleanSymbol, ".cash", "");

   // Restore persistent state from global variables
   RestoreState();

   if(StringLen(ServerURL) == 0)
     {
      Print("[LongEntry] WARNING: ServerURL is empty — EA will not operate");
      return INIT_SUCCEEDED;
     }

   Print("[LongEntry] ═══════════════════════════════════════════");
   Print("[LongEntry] Unified EA v3.0 initialized for ", _Symbol);
   Print("[LongEntry]   Symbol (clean): ", g_cleanSymbol);
   Print("[LongEntry]   Magic: ", MagicNumber, " | Risk: $", DoubleToString(RiskAmount, 2));
   Print("[LongEntry]   M5 data: ", (SendM5Data ? "ENABLED" : "DISABLED"));
   Print("[LongEntry]   H1 last upload: ", (g_lastH1Upload > 0 ? TimeToString(g_lastH1Upload) : "never"));
   Print("[LongEntry]   M5 last upload: ", (g_lastM5Upload > 0 ? TimeToString(g_lastM5Upload) : "never"));
   Print("[LongEntry] ═══════════════════════════════════════════");

   // Fetch config immediately
   FetchConfig();

   return INIT_SUCCEEDED;
  }


//+------------------------------------------------------------------+
//| MAIN TICK HANDLER — orchestrates all subsystems                    |
//+------------------------------------------------------------------+
void OnTick()
  {
   if(StringLen(ServerURL) == 0)
      return;

   MqlDateTime dt;
   TimeCurrent(dt);

   // ── 1. TRADING (Mon-Fri, skip weekends) ──
   if(dt.day_of_week >= 1 && dt.day_of_week <= 5)
     {
      // Reset daily flags on new day
      datetime todayStart = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
      if(g_lastTradeDate < todayStart)
        {
         g_tradedToday = false;
         g_tp1Hit = false;
         g_breakEvenSet = false;
         g_entryPrice = 0;
         g_runnerOpenPrice = 0;
        }

      // Refresh config periodically
      int refreshSec = ConfigRefreshHours * 3600;
      if(refreshSec <= 0) refreshSec = 14400;
      if(TimeCurrent() - g_lastConfigFetch >= refreshSec)
         FetchConfig();

      // Check entry time
      if(g_active && !g_tradedToday && dt.hour == g_entryHour && dt.min >= g_entryMinute)
         ExecuteEntry();

      // Always manage open positions (break-even, trailing)
      ManageOpenPositions();
     }

   // ── 2. TRADE SENDER (every 60 seconds, Mon-Fri) ──
   if(dt.day_of_week >= 1 && dt.day_of_week <= 5)
     {
      if(TimeCurrent() - g_lastTradeCheck >= 60)
        {
         g_lastTradeCheck = TimeCurrent();
         ScanAndSendTrades();
        }
     }

   // ── 3. DATA FEED (Fridays after 12:00) ──
   if(dt.day_of_week == 5 && dt.hour >= 12)
     {
      datetime todayStart = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));

      // H1 candles
      if(g_lastH1Upload < todayStart)
         UploadCandles(PERIOD_H1, "H1");

      // M5 candles (if enabled)
      if(SendM5Data && g_lastM5Upload < todayStart)
         UploadCandles(PERIOD_M5, "M5");
     }

   // ── 4. WEEKLY RESULTS (Fridays after 15:00) ──
   if(dt.day_of_week == 5 && dt.hour >= 15)
     {
      datetime todayStart = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
      if(g_lastResultSend < todayStart)
         SendWeeklyResults();
     }
  }


//+==================================================================+
//| MODULE 1: TRADING                                                  |
//+==================================================================+

//+------------------------------------------------------------------+
//| Fetch trading config from server                                  |
//+------------------------------------------------------------------+
void FetchConfig()
  {
   string url = ServerURL + "/config/" + g_cleanSymbol;
   string headers = "X-API-Key: " + APIKey + "\r\n";

   char postData[];
   char result[];
   string resultHeaders;

   ResetLastError();
   int res = WebRequest("GET", url, headers, 30000, postData, result, resultHeaders);

   if(res != 200)
     {
      string errBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[LongEntry] Config fetch failed (code ", res, "): ", errBody);
      g_active = false;
      return;
     }

   string json = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   g_lastConfigFetch = TimeCurrent();

   // Parse config
   g_active      = GetJsonBool(json, "active");
   g_entryHour   = (int)GetJsonDouble(json, "entryHour");
   g_entryMinute = (int)GetJsonDouble(json, "entryMinute");
   g_slPercent   = GetJsonDouble(json, "slPercent");
   g_tpPercent   = GetJsonDouble(json, "tpPercent");
   g_weekStart   = GetJsonString(json, "weekStart");

   // Smart position management
   g_tp1ClosePct     = GetJsonDouble(json, "tp1ClosePct");
   g_tp2Percent      = GetJsonDouble(json, "tp2Percent");
   g_aiConfidence    = GetJsonString(json, "aiConfidence");
   g_useTrailingStop = GetJsonBool(json, "useTrailingStop");
   g_trailingStopDist = GetJsonDouble(json, "trailingStopDistance");

   if(g_tp1ClosePct <= 0 || g_tp1ClosePct > 1)
      g_tp1ClosePct = 0.5;
   if(g_trailingStopDist < 0)
      g_trailingStopDist = 0;

   string smartMode = (g_tp2Percent > 0) ? "SMART" : "LEGACY";
   Print("[LongEntry] Config: active=", g_active,
         " entry=", IntegerToString(g_entryHour), ":",
         StringFormat("%02d", g_entryMinute),
         " SL=", DoubleToString(g_slPercent, 2), "%",
         " TP=", DoubleToString(g_tpPercent, 2), "%",
         " week=", g_weekStart,
         " [", smartMode, "]");

   if(g_tp2Percent > 0)
      Print("[LongEntry] Smart: TP1Close=", DoubleToString(g_tp1ClosePct * 100, 1), "%",
            " TP2=", DoubleToString(g_tp2Percent, 2), "%",
            " AI=", g_aiConfidence,
            " Trail=", (g_useTrailingStop ? "YES" : "NO"));
  }


//+------------------------------------------------------------------+
//| Execute a BUY trade                                                |
//+------------------------------------------------------------------+
void ExecuteEntry()
  {
   if(HasOpenPosition())
     {
      g_tradedToday = true;
      return;
     }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(ask <= 0)
     {
      Print("[LongEntry] ERROR: Invalid Ask price");
      return;
     }

   g_entryPrice = ask;

   double slPrice = ask * (1.0 - g_slPercent / 100.0);
   double tpPrice = ask * (1.0 + g_tpPercent / 100.0);
   double tp2Price = 0;
   if(g_tp2Percent > 0)
      tp2Price = ask * (1.0 + g_tp2Percent / 100.0);

   // Normalize to tick size
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickSize > 0)
     {
      slPrice = MathRound(slPrice / tickSize) * tickSize;
      tpPrice = MathRound(tpPrice / tickSize) * tickSize;
      if(tp2Price > 0)
         tp2Price = MathRound(tp2Price / tickSize) * tickSize;
     }

   double totalLots = CalculateLotSize(ask, slPrice);
   if(totalLots <= 0)
     {
      Print("[LongEntry] ERROR: Could not calculate valid lot size");
      return;
     }

   // ── SMART MODE (Split TP) ──
   if(g_tp2Percent > 0)
     {
      double tp1Lots = totalLots * g_tp1ClosePct;
      double runnerLots = totalLots * (1.0 - g_tp1ClosePct);

      double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
      if(lotStep > 0)
        {
         tp1Lots = MathFloor(tp1Lots / lotStep) * lotStep;
         runnerLots = MathFloor(runnerLots / lotStep) * lotStep;
        }

      // Position 1: TP1
      if(tp1Lots > 0)
        {
         if(g_trade.Buy(tp1Lots, _Symbol, ask, slPrice, tpPrice, TradeComment))
            Print("[LongEntry] SMART TP1: BUY ", DoubleToString(tp1Lots, 2), " ", _Symbol,
                  " @ ", DoubleToString(ask, _Digits),
                  " SL=", DoubleToString(slPrice, _Digits),
                  " TP1=", DoubleToString(tpPrice, _Digits));
         else
           {
            Print("[LongEntry] ERROR: TP1 failed — ", g_trade.ResultRetcodeDescription());
            return;
           }
        }

      // Position 2: Runner with TP2
      if(runnerLots > 0)
        {
         g_trade.SetExpertMagicNumber(MagicNumber + 1);
         if(g_trade.Buy(runnerLots, _Symbol, ask, slPrice, tp2Price, TradeComment))
           {
            g_runnerOpenPrice = ask;
            Print("[LongEntry] SMART Runner: BUY ", DoubleToString(runnerLots, 2), " ", _Symbol,
                  " @ ", DoubleToString(ask, _Digits),
                  " SL=", DoubleToString(slPrice, _Digits),
                  " TP2=", DoubleToString(tp2Price, _Digits));
           }
         else
            Print("[LongEntry] ERROR: Runner failed — ", g_trade.ResultRetcodeDescription());
         g_trade.SetExpertMagicNumber(MagicNumber);
        }

      g_tradedToday = true;
      g_lastTradeDate = TimeCurrent();
     }
   // ── LEGACY MODE (Single Position) ──
   else
     {
      if(g_trade.Buy(totalLots, _Symbol, ask, slPrice, tpPrice, TradeComment))
        {
         Print("[LongEntry] LEGACY: BUY ", DoubleToString(totalLots, 2), " ", _Symbol,
               " @ ", DoubleToString(ask, _Digits),
               " SL=", DoubleToString(slPrice, _Digits),
               " TP=", DoubleToString(tpPrice, _Digits));
         g_tradedToday = true;
         g_lastTradeDate = TimeCurrent();
        }
      else
         Print("[LongEntry] ERROR: Buy failed — ", g_trade.ResultRetcodeDescription());
     }
  }


//+------------------------------------------------------------------+
//| Manage open positions: break-even, trailing stop                  |
//+------------------------------------------------------------------+
void ManageOpenPositions()
  {
   if(g_tp2Percent <= 0 || g_entryPrice <= 0)
      return;

   int runnerIdx = -1;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == _Symbol)
        {
         if(PositionGetInteger(POSITION_MAGIC) == (long)(MagicNumber + 1))
           {
            runnerIdx = i;
            break;
           }
        }
     }

   if(runnerIdx < 0)
      return;

   // Check if TP1 position has closed
   if(!g_tp1Hit)
     {
      bool tp1Closed = true;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
        {
         if(PositionGetSymbol(i) == _Symbol)
           {
            if(PositionGetInteger(POSITION_MAGIC) == (long)MagicNumber)
              {
               tp1Closed = false;
               break;
              }
           }
        }
      if(tp1Closed)
        {
         g_tp1Hit = true;
         Print("[LongEntry] TP1 closed — runner is now active");
        }
     }

   // Break-even after TP1 hit
   if(g_tp1Hit && !g_breakEvenSet)
     {
      if(PositionSelectByTicket(PositionGetTicket(runnerIdx)))
        {
         double currentSL = PositionGetDouble(POSITION_SL);
         if(currentSL < g_entryPrice)
           {
            double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
            double newSL = g_entryPrice;
            if(tickSize > 0)
               newSL = MathRound(newSL / tickSize) * tickSize;

            if(g_trade.PositionModify(PositionGetTicket(runnerIdx), newSL, PositionGetDouble(POSITION_TP)))
              {
               Print("[LongEntry] Break-Even: SL → ", DoubleToString(newSL, _Digits));
               g_breakEvenSet = true;
              }
            else
               Print("[LongEntry] WARNING: Break-even failed — ", g_trade.ResultRetcodeDescription());
           }
        }
     }

   // Trailing stop
   if(g_useTrailingStop && g_entryPrice > 0 && g_runnerOpenPrice > 0)
     {
      if(PositionSelectByTicket(PositionGetTicket(runnerIdx)))
        {
         double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
         double trailDist = g_entryPrice * g_trailingStopDist / 100.0;
         if(tickSize > 0)
            trailDist = MathRound(trailDist / tickSize) * tickSize;

         if(bid > g_entryPrice + trailDist)
           {
            double newSL = bid - trailDist;
            if(tickSize > 0)
               newSL = MathRound(newSL / tickSize) * tickSize;

            double currentSL = PositionGetDouble(POSITION_SL);
            if(newSL > currentSL)
              {
               if(g_trade.PositionModify(PositionGetTicket(runnerIdx), newSL, PositionGetDouble(POSITION_TP)))
                  Print("[LongEntry] Trail: SL → ", DoubleToString(newSL, _Digits));
              }
           }
        }
     }
  }


//+------------------------------------------------------------------+
//| Calculate lot size from risk amount                               |
//+------------------------------------------------------------------+
double CalculateLotSize(double entryPrice, double slPrice)
  {
   double slDistance = MathAbs(entryPrice - slPrice);
   if(slDistance <= 0) return 0;

   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double lotStep   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minLot    = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot    = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);

   if(tickSize <= 0 || tickValue <= 0 || lotStep <= 0)
     {
      Print("[LongEntry] ERROR: Invalid symbol properties for lot calc");
      return 0;
     }

   double riskPerLot = (slDistance / tickSize) * tickValue;
   if(riskPerLot <= 0) return 0;

   double lots = RiskAmount / riskPerLot;
   lots = MathFloor(lots / lotStep) * lotStep;
   lots = MathMax(lots, minLot);
   lots = MathMin(lots, maxLot);

   return NormalizeDouble(lots, 2);
  }


//+------------------------------------------------------------------+
//| Check if there's already an open position                         |
//+------------------------------------------------------------------+
bool HasOpenPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == _Symbol)
        {
         long magic = PositionGetInteger(POSITION_MAGIC);
         if(magic == (long)MagicNumber || magic == (long)(MagicNumber + 1))
            return true;
        }
     }
   return false;
  }


//+==================================================================+
//| MODULE 2: DATA FEED (H1 + M5 candle uploads)                      |
//+==================================================================+

//+------------------------------------------------------------------+
//| Upload candle data for a specific timeframe                       |
//+------------------------------------------------------------------+
bool UploadCandles(ENUM_TIMEFRAMES tf, string tfLabel)
  {
   // Determine start time
   datetime lastUpload = (tf == PERIOD_H1) ? g_lastH1Upload : g_lastM5Upload;
   datetime fromTime;

   if(lastUpload == 0)
     {
      // First run: full history
      fromTime = TimeCurrent() - InitialYears * 365 * 24 * 3600;
      Print("[LongEntry] First ", tfLabel, " upload — fetching ", InitialYears, " years");
     }
   else
     {
      // Incremental: from last upload
      fromTime = lastUpload;
     }

   // Get candle data
   MqlRates rates[];
   int copied = CopyRates(_Symbol, tf, fromTime, TimeCurrent(), rates);
   if(copied <= 0)
     {
      Print("[LongEntry] ", tfLabel, " CopyRates returned ", copied, " — skipping");
      return false;
     }

   Print("[LongEntry] Uploading ", copied, " ", tfLabel, " candles...");

   // Chunk size: smaller for M5 (more data per chunk)
   int chunkSize = (tf == PERIOD_M5) ? 1500 : 2000;
   int totalChunks = (int)MathCeil((double)copied / chunkSize);

   for(int chunk = 0; chunk < totalChunks; chunk++)
     {
      int startIdx = chunk * chunkSize;
      int endIdx = MathMin(startIdx + chunkSize, copied);

      string json = BuildCandleJSON(rates, startIdx, endIdx, tfLabel);
      if(!SendChunk(json, chunk + 1, totalChunks, tfLabel))
         return false;
     }

   // Update timestamp
   datetime now = TimeCurrent();
   if(tf == PERIOD_H1)
     {
      g_lastH1Upload = now;
      GlobalVariableSet("LE_H1Upload_" + _Symbol, (double)now);
     }
   else
     {
      g_lastM5Upload = now;
      GlobalVariableSet("LE_M5Upload_" + _Symbol, (double)now);
     }

   Print("[LongEntry] ", tfLabel, " upload complete: ", copied, " candles sent");
   return true;
  }


//+------------------------------------------------------------------+
//| Build JSON for a chunk of candles                                 |
//+------------------------------------------------------------------+
string BuildCandleJSON(MqlRates &rates[], int startIdx, int endIdx, string tfLabel)
  {
   string json = "{";
   json += "\"symbol\":\"" + g_cleanSymbol + "\",";
   json += "\"timeframe\":\"" + tfLabel + "\",";
   json += "\"apiKey\":\"" + APIKey + "\",";
   json += "\"candles\":[";

   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   for(int i = startIdx; i < endIdx; i++)
     {
      if(i > startIdx) json += ",";

      string timeStr = TimeToString(rates[i].time, TIME_DATE | TIME_SECONDS);
      StringReplace(timeStr, ".", "-");

      json += "{";
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
//| Send a JSON chunk with retry logic                                |
//+------------------------------------------------------------------+
bool SendChunk(string json, int chunkNum, int totalChunks, string label)
  {
   string url = ServerURL + "/candles";
   string headers = "Content-Type: application/json\r\n";

   char postData[];
   StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1);

   for(int attempt = 1; attempt <= MaxRetries; attempt++)
     {
      char result[];
      string resultHeaders;

      int res = WebRequest("POST", url, headers, 30000, postData, result, resultHeaders);

      if(res == 200)
        {
         string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
         Print("[LongEntry] ", label, " chunk ", chunkNum, "/", totalChunks, " OK");
         return true;
        }

      string errBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[LongEntry] ", label, " chunk ", chunkNum, "/", totalChunks,
            " attempt ", attempt, "/", MaxRetries,
            " failed (", res, "): ", errBody);

      if(attempt < MaxRetries)
        {
         Print("[LongEntry] Retrying in ", RetryDelaySec, "s...");
         Sleep(RetryDelaySec * 1000);
        }
     }

   Print("[LongEntry] ERROR: All ", MaxRetries, " attempts failed for ", label, " chunk ", chunkNum);
   return false;
  }


//+==================================================================+
//| MODULE 3: TRADE SENDER (closed trade detection)                    |
//+==================================================================+

//+------------------------------------------------------------------+
//| Scan deal history for closed trades and send to server            |
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
      if(ticket <= g_lastDealTicket) continue;
      if(HistoryDealGetString(ticket, DEAL_SYMBOL) != _Symbol) continue;

      int entry = (int)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT) continue;

      long dealMagic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
      if(dealMagic != (long)MagicNumber && dealMagic != (long)(MagicNumber + 1))
         continue;

      // Get close details
      datetime closeTime  = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      double   closePrice = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double   closeLots  = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double   profit     = HistoryDealGetDouble(ticket, DEAL_PROFIT)
                          + HistoryDealGetDouble(ticket, DEAL_SWAP)
                          + HistoryDealGetDouble(ticket, DEAL_COMMISSION);

      // Find matching entry deal
      long posId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      datetime openTime   = 0;
      double   openPrice  = 0;
      double   slPrice    = 0;
      double   tpPrice    = 0;
      double   lotSize    = closeLots;

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
         HistorySelect(fromTime, toTime);
        }

      // Get SL/TP from orders
      long orderTicket = HistoryDealGetInteger(ticket, DEAL_ORDER);
      if(orderTicket > 0 && HistoryOrderSelect(orderTicket))
        {
         slPrice = HistoryOrderGetDouble(orderTicket, ORDER_SL);
         tpPrice = HistoryOrderGetDouble(orderTicket, ORDER_TP);
        }

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

      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      double pnlPct  = (balance > 0) ? (profit / balance * 100.0) : 0.0;
      string result  = (profit > 0) ? "win" : "loss";

      if(tradeCount > 0) tradesJson += ",";
      tradesJson += "{";
      tradesJson += "\"symbol\":\"" + g_cleanSymbol + "\",";
      tradesJson += "\"open_time\":\"" + FormatISO(openTime) + "\",";
      tradesJson += "\"close_time\":\"" + FormatISO(closeTime) + "\",";
      tradesJson += "\"open_price\":" + DoubleToString(openPrice, _Digits) + ",";
      tradesJson += "\"close_price\":" + DoubleToString(closePrice, _Digits) + ",";
      tradesJson += "\"sl_price\":" + DoubleToString(slPrice, _Digits) + ",";
      tradesJson += "\"tp_price\":" + DoubleToString(tpPrice, _Digits) + ",";
      tradesJson += "\"lot_size\":" + DoubleToString(lotSize, 2) + ",";
      tradesJson += "\"pnl_amount\":" + DoubleToString(profit, 2) + ",";
      tradesJson += "\"pnl_percent\":" + DoubleToString(pnlPct, 4) + ",";
      tradesJson += "\"result\":\"" + result + "\",";
      tradesJson += "\"magic_number\":" + IntegerToString(dealMagic);
      tradesJson += "}";
      tradeCount++;

      g_lastDealTicket = ticket;
     }

   if(tradeCount > 0)
      SendTradesPayload(tradesJson, tradeCount);
  }


//+------------------------------------------------------------------+
//| Send trades JSON to server                                        |
//+------------------------------------------------------------------+
void SendTradesPayload(string tradesJson, int count)
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
      Print("[LongEntry] Trades sent: ", count, " trade(s) for ", g_cleanSymbol);
      GlobalVariableSet("LE_LastTicket_" + _Symbol, (double)g_lastDealTicket);
     }
   else
     {
      string resp = CharArrayToString(result);
      Print("[LongEntry] Trades FAILED — HTTP ", httpCode, ": ", resp);
      // Restore last ticket for retry
      string gvName = "LE_LastTicket_" + _Symbol;
      if(GlobalVariableCheck(gvName))
         g_lastDealTicket = (ulong)GlobalVariableGet(gvName);
     }
  }


//+==================================================================+
//| MODULE 4: WEEKLY RESULTS                                           |
//+==================================================================+

//+------------------------------------------------------------------+
//| Calculate and send weekly P&L summary                             |
//+------------------------------------------------------------------+
void SendWeeklyResults()
  {
   MqlDateTime dt;
   TimeCurrent(dt);

   // Calculate week start (Monday)
   datetime now = TimeCurrent();
   datetime weekStart = now - (dt.day_of_week - 1) * 86400;
   weekStart = StringToTime(TimeToString(weekStart, TIME_DATE));

   // Count this week's trades
   int trades = 0, wins = 0, losses = 0;
   double totalPnl = 0.0;

   datetime weekEnd = weekStart + 5 * 86400;
   if(HistorySelect(weekStart, weekEnd))
     {
      int totalDeals = HistoryDealsTotal();
      for(int i = 0; i < totalDeals; i++)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket == 0) continue;
         if(HistoryDealGetString(ticket, DEAL_SYMBOL) != _Symbol) continue;

         int entry = (int)HistoryDealGetInteger(ticket, DEAL_ENTRY);
         if(entry != DEAL_ENTRY_OUT) continue;

         // Include both magic numbers (TP1 + runner)
         long dealMagic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
         if(dealMagic != (long)MagicNumber && dealMagic != (long)(MagicNumber + 1))
            continue;

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
   double pnlPct = (balance > 0) ? (totalPnl / balance * 100.0) : 0.0;

   MqlDateTime wsDt;
   TimeToStruct(weekStart, wsDt);
   string weekStartStr = StringFormat("%04d-%02d-%02d", wsDt.year, wsDt.mon, wsDt.day);

   string json = "{";
   json += "\"symbol\":\"" + g_cleanSymbol + "\",";
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
      Print("[LongEntry] Results: ", g_cleanSymbol, " week ", weekStartStr,
            " — ", trades, " trades, ", wins, "W/", losses, "L, PnL ",
            DoubleToString(pnlPct, 2), "%");

      g_lastResultSend = TimeCurrent();
      GlobalVariableSet("LE_ResultSend_" + _Symbol, (double)g_lastResultSend);
     }
   else
     {
      string resp = CharArrayToString(result);
      Print("[LongEntry] Results FAILED — HTTP ", httpCode, ": ", resp);
     }
  }


//+==================================================================+
//| STATE PERSISTENCE — save/restore across restarts                   |
//+==================================================================+

//+------------------------------------------------------------------+
//| Restore state from MT5 global variables                           |
//+------------------------------------------------------------------+
void RestoreState()
  {
   string gv;

   gv = "LE_H1Upload_" + _Symbol;
   if(GlobalVariableCheck(gv))
      g_lastH1Upload = (datetime)GlobalVariableGet(gv);

   gv = "LE_M5Upload_" + _Symbol;
   if(GlobalVariableCheck(gv))
      g_lastM5Upload = (datetime)GlobalVariableGet(gv);

   gv = "LE_LastTicket_" + _Symbol;
   if(GlobalVariableCheck(gv))
      g_lastDealTicket = (ulong)GlobalVariableGet(gv);

   gv = "LE_ResultSend_" + _Symbol;
   if(GlobalVariableCheck(gv))
      g_lastResultSend = (datetime)GlobalVariableGet(gv);

   // Also check legacy global variable names (from old separate EAs)
   // This ensures smooth migration — the unified EA picks up where old EAs left off
   gv = "DataSender_LastUpload_" + _Symbol;
   if(GlobalVariableCheck(gv) && g_lastH1Upload == 0)
      g_lastH1Upload = (datetime)GlobalVariableGet(gv);

   gv = "DataSenderM5_LastUpload_" + _Symbol;
   if(GlobalVariableCheck(gv) && g_lastM5Upload == 0)
      g_lastM5Upload = (datetime)GlobalVariableGet(gv);

   gv = "TradeSender_LastTicket_" + _Symbol;
   if(GlobalVariableCheck(gv) && g_lastDealTicket == 0)
      g_lastDealTicket = (ulong)GlobalVariableGet(gv);

   gv = "ResultSender_LastSend_" + _Symbol;
   if(GlobalVariableCheck(gv) && g_lastResultSend == 0)
      g_lastResultSend = (datetime)GlobalVariableGet(gv);
  }


//+==================================================================+
//| UTILITY FUNCTIONS                                                  |
//+==================================================================+

//+------------------------------------------------------------------+
//| Format datetime as ISO 8601                                       |
//+------------------------------------------------------------------+
string FormatISO(datetime dt)
  {
   MqlDateTime mdt;
   TimeToStruct(dt, mdt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d",
                       mdt.year, mdt.mon, mdt.day,
                       mdt.hour, mdt.min, mdt.sec);
  }


//+------------------------------------------------------------------+
//| JSON parsing helpers                                               |
//+------------------------------------------------------------------+
string GetJsonString(string json, string key)
  {
   string search = "\"" + key + "\":\"";
   int pos = StringFind(json, search);
   if(pos < 0) return "";
   pos += StringLen(search);
   int endPos = StringFind(json, "\"", pos);
   if(endPos < 0) return "";
   return StringSubstr(json, pos, endPos - pos);
  }

double GetJsonDouble(string json, string key)
  {
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0) return 0;
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
   if(pos < 0) return false;
   pos += StringLen(search);

   while(pos < StringLen(json) && StringGetCharacter(json, pos) == ' ')
      pos++;

   if(StringSubstr(json, pos, 4) == "true")
      return true;
   return false;
  }


//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   Print("[LongEntry] ═══════════════════════════════════════════");
   Print("[LongEntry] Unified EA deinitialized for ", _Symbol, " (reason: ", reason, ")");
   Print("[LongEntry] ═══════════════════════════════════════════");
  }
