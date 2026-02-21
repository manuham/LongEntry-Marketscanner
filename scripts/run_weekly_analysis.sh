#!/bin/bash
# Weekly analytics cron job for LongEntry Market Scanner
# Runs every Saturday morning to compute scores for all markets.
#
# Add to crontab:
#   0 6 * * 6 /bin/bash /opt/longentry/scripts/run_weekly_analysis.sh >> /var/log/longentry/analysis.log 2>&1
#
# This runs at 06:00 UTC on Saturday — after DataSender uploads on Friday.
# Steps: 1) AI updates fundamental outlook  2) Full analysis (tech + backtest + fundamental)

set -euo pipefail

BACKEND_DIR="/opt/longentry/backend"

cd "$BACKEND_DIR"
source venv/bin/activate

# Step 1: AI-powered fundamental outlook (fetches news, asks Claude, updates DB)
echo "[$(date)] Running auto outlook..."
python -m app.scripts.auto_outlook || echo "[$(date)] Auto outlook failed — continuing with existing data"

# Step 2: Full weekly analysis (technical + backtest + fundamental scoring)
echo "[$(date)] Starting weekly analysis..."
python -m app.scripts.run_analysis

echo "[$(date)] Weekly analysis complete"
