//+------------------------------------------------------------------+
//| ManualUpload.mq5 — One-shot upload of H1 data to LongEntry      |
//| Drag onto any chart to immediately send 2 years of H1 candles.  |
//| This is a SCRIPT (runs once), not an EA.                         |
//+------------------------------------------------------------------+
#property copyright "LongEntry"
#property version   "1.00"
#property script_show_inputs

input group "==== Server Settings ===="
input string   ServerURL = "";     // Server API URL (e.g., http://123.45.67.89/api)
input string   APIKey    = "";     // API Key for authentication

input group "==== Data Settings ===="
input int      HistoryYears = 2;   // Years of history to upload
input int      MaxRetries   = 3;   // Max upload retries on failure
input int      RetryDelaySec = 30; // Seconds between retries


//+------------------------------------------------------------------+
//| Script program start function                                     |
//+------------------------------------------------------------------+
void OnStart()
  {
   if(ServerURL == "")
     {
      Alert("[ManualUpload] ERROR: ServerURL is empty. Set it in the inputs.");
      return;
     }
   if(APIKey == "")
     {
      Alert("[ManualUpload] ERROR: APIKey is empty. Set it in the inputs.");
      return;
     }

   Print("[ManualUpload] Starting manual upload for ", _Symbol);
   Print("[ManualUpload] Server: ", ServerURL);
   Print("[ManualUpload] Fetching ", HistoryYears, " years of H1 data...");

   // Fetch H1 candle data
   datetime fromTime = TimeCurrent() - HistoryYears * 365 * 24 * 3600;
   MqlRates rates[];
   int copied = CopyRates(_Symbol, PERIOD_H1, fromTime, TimeCurrent(), rates);

   if(copied <= 0)
     {
      Alert("[ManualUpload] ERROR: CopyRates returned ", copied, " for ", _Symbol);
      return;
     }

   Print("[ManualUpload] Got ", copied, " candles. Uploading in chunks...");

   // Upload in chunks of 5000
   int chunkSize = 2000;
   int totalChunks = (int)MathCeil((double)copied / chunkSize);

   for(int chunk = 0; chunk < totalChunks; chunk++)
     {
      int startIdx = chunk * chunkSize;
      int endIdx = MathMin(startIdx + chunkSize, copied);

      string json = BuildJSON(rates, startIdx, endIdx);
      if(!SendChunk(json, chunk + 1, totalChunks))
        {
         Alert("[ManualUpload] FAILED at chunk ", chunk + 1, "/", totalChunks, " for ", _Symbol);
         return;
        }
     }

   // Update the DataSender's global variable so it doesn't re-upload
   string gvName = "DataSender_LastUpload_" + _Symbol;
   GlobalVariableSet(gvName, (double)TimeCurrent());

   Print("[ManualUpload] SUCCESS: ", copied, " candles uploaded for ", _Symbol);
   Alert("[ManualUpload] Done! ", _Symbol, ": ", copied, " candles uploaded.");
  }


//+------------------------------------------------------------------+
//| Build JSON payload for a chunk of candles                         |
//+------------------------------------------------------------------+
string BuildJSON(MqlRates &rates[], int startIdx, int endIdx)
  {
   string json = "{";
   json += "\"symbol\":\"" + _Symbol + "\",";
   json += "\"timeframe\":\"H1\",";
   json += "\"apiKey\":\"" + APIKey + "\",";
   json += "\"candles\":[";

   for(int i = startIdx; i < endIdx; i++)
     {
      if(i > startIdx)
         json += ",";

      json += "{";
      json += "\"time\":\"" + TimeToString(rates[i].time, TIME_DATE | TIME_SECONDS) + "\",";
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
         Print("[ManualUpload] Chunk ", chunkNum, "/", totalChunks, " OK: ", response);
         return true;
        }

      string errBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("[ManualUpload] Chunk ", chunkNum, "/", totalChunks,
            " attempt ", attempt, "/", MaxRetries,
            " failed (code ", res, "): ", errBody);

      if(attempt < MaxRetries)
        {
         Print("[ManualUpload] Retrying in ", RetryDelaySec, " seconds...");
         Sleep(RetryDelaySec * 1000);
        }
     }

   Print("[ManualUpload] ERROR: All attempts failed for chunk ", chunkNum);
   return false;
  }
