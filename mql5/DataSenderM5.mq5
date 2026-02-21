//+------------------------------------------------------------------+
//| DataSenderM5.mq5 — Sends M5 candle data to LongEntry server     |
//| Runs on each of the 14 charts independently (alongside DataSender)|
//| Trigger: Friday, same timing as H1 DataSender                    |
//|                                                                    |
//| M5 data is used by the backtest engine to resolve intra-H1 bar   |
//| ambiguity when both SL and TP are hit in the same hourly candle. |
//| This dramatically improves backtest accuracy vs real MT5 results. |
//+------------------------------------------------------------------+
#property copyright "LongEntry"
#property version   "1.00"
#property strict

input group "==== Server Settings ===="
input string   ServerURL = "";     // Server API URL (e.g., http://123.45.67.89/api)
input string   APIKey    = "";     // API Key for authentication

input group "==== Data Settings ===="
input int      InitialYears = 2;   // Years of history for first upload
input int      MaxRetries   = 3;   // Max upload retries on failure
input int      RetryDelaySec = 30; // Seconds between retries

// Persistent storage for last upload time
datetime g_lastUploadTime = 0;


//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
  {
   // Load last upload time from global variable
   string gvName = "DataSenderM5_LastUpload_" + _Symbol;
   if(GlobalVariableCheck(gvName))
      g_lastUploadTime = (datetime)GlobalVariableGet(gvName);

   Print("[DataSenderM5] Initialized for ", _Symbol,
         " | Last upload: ", (g_lastUploadTime > 0 ? TimeToString(g_lastUploadTime) : "never"));
   return INIT_SUCCEEDED;
  }


//+------------------------------------------------------------------+
//| Expert tick function                                              |
//+------------------------------------------------------------------+
void OnTick()
  {
   // Only run on Fridays
   MqlDateTime dt;
   TimeCurrent(dt);
   if(dt.day_of_week != 5)
      return;

   // Check if we already uploaded today
   datetime todayStart = StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
   if(g_lastUploadTime >= todayStart)
      return;

   // Run after 12:00 (same timing as H1 DataSender)
   if(dt.hour < 12)
      return;

   // Perform the upload
   if(UploadCandles())
     {
      g_lastUploadTime = TimeCurrent();
      string gvName = "DataSenderM5_LastUpload_" + _Symbol;
      GlobalVariableSet(gvName, (double)g_lastUploadTime);
      Print("[DataSenderM5] Upload successful for ", _Symbol);
     }
  }


//+------------------------------------------------------------------+
//| Upload M5 candle data to server                                   |
//+------------------------------------------------------------------+
bool UploadCandles()
  {
   // Determine how far back to fetch
   datetime fromTime;
   if(g_lastUploadTime == 0)
     {
      // First run: fetch InitialYears of history
      fromTime = TimeCurrent() - InitialYears * 365 * 24 * 3600;
      Print("[DataSenderM5] First upload — fetching ", InitialYears, " years of M5 data");
     }
   else
     {
      // Incremental: fetch from last upload
      fromTime = g_lastUploadTime;
     }

   // Get M5 candle data
   MqlRates rates[];
   int copied = CopyRates(_Symbol, PERIOD_M5, fromTime, TimeCurrent(), rates);
   if(copied <= 0)
     {
      Print("[DataSenderM5] ERROR: CopyRates returned ", copied);
      return false;
     }

   Print("[DataSenderM5] Preparing ", copied, " M5 candles for upload");

   // M5 data is ~12x larger than H1, use smaller chunks to stay under
   // WebRequest payload limits and avoid timeouts
   int chunkSize = 1500;
   int totalChunks = (int)MathCeil((double)copied / chunkSize);

   for(int chunk = 0; chunk < totalChunks; chunk++)
     {
      int startIdx = chunk * chunkSize;
      int endIdx = MathMin(startIdx + chunkSize, copied);

      string json = BuildJSON(rates, startIdx, endIdx);
      if(!SendChunk(json, chunk + 1, totalChunks))
         return false;
     }

   return true;
  }


//+------------------------------------------------------------------+
//| Build JSON payload for a chunk of M5 candles                      |
//+------------------------------------------------------------------+
string BuildJSON(MqlRates &rates[], int startIdx, int endIdx)
  {
   // Strip broker suffixes like ".cash" so symbol matches database
   string symbol = _Symbol;
   StringReplace(symbol, ".cash", "");

   string json = "{";
   json += "\"symbol\":\"" + symbol + "\",";
   json += "\"timeframe\":\"M5\",";
   json += "\"apiKey\":\"" + APIKey + "\",";
   json += "\"candles\":[";

   for(int i = startIdx; i < endIdx; i++)
     {
      if(i > startIdx)
         json += ",";

      json += "{";
      string timeStr = TimeToString(rates[i].time, TIME_DATE | TIME_SECONDS);
      StringReplace(timeStr, ".", "-");
      json += "\"time\":\"" + timeStr + "\",";
      json += "\"open\":" + DoubleToString(rates[i].open, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)) + ",";
      json += "\"high\":" + DoubleToString(rates[i].high, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)) + ",";
      json += "\"low\":" + DoubleToString(rates[i].low, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)) + ",";
      json += "\"close\":" + DoubleToString(rates[i].close, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS)) + ",";
      json += "\"volume\":" + IntegerToString(rates[i].tick_volume);
      json += "}";
     }

   json += "]}";
   return json;
  }


//+------------------------------------------------------------------+
//| Send a JSON chunk to the server with retries                      |
//+------------------------------------------------------------------+
bool SendChunk(string json, int chunkNum, int totalChunks)
  {
   string url = ServerURL + "/candles";
   string headers = "Content-Type: application/json\r\n";

   char postData[];
   StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   // Remove null terminator that StringToCharArray adds
   ArrayResize(postData, ArraySize(postData) - 1);

   for(int attempt = 1; attempt <= MaxRetries; attempt++)
     {
      char result[];
      string resultHeaders;
      int timeout = 30000; // 30 seconds

      int res = WebRequest("POST", url, headers, timeout, postData, result, resultHeaders);

      if(res == 200)
        {
         string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
         Print("[DataSenderM5] Chunk ", chunkNum, "/", totalChunks, " sent OK: ", response);
         return true;
        }

      string errBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[DataSenderM5] Chunk ", chunkNum, "/", totalChunks,
            " attempt ", attempt, "/", MaxRetries,
            " failed (code ", res, "): ", errBody);

      if(attempt < MaxRetries)
        {
         Print("[DataSenderM5] Retrying in ", RetryDelaySec, " seconds...");
         Sleep(RetryDelaySec * 1000);
        }
     }

   Print("[DataSenderM5] ERROR: All ", MaxRetries, " attempts failed for chunk ", chunkNum);
   return false;
  }


//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   Print("[DataSenderM5] Deinitialized for ", _Symbol);
  }
