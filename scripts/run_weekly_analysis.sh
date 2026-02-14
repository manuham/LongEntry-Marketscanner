#!/bin/bash
# Weekly analytics cron job for LongEntry Market Scanner
# Runs every Saturday morning to compute technical scores for all markets.
#
# Add to crontab:
#   0 6 * * 6 /bin/bash /opt/longentry/scripts/run_weekly_analysis.sh >> /var/log/longentry/analysis.log 2>&1
#
# This runs at 06:00 UTC on Saturday — after DataSender uploads on Friday.

set -euo pipefail

BACKEND_DIR="/opt/longentry/backend"

echo "[$(date)] Starting weekly analysis..."

cd "$BACKEND_DIR"
source venv/bin/activate

python -m app.scripts.run_analysis

echo "[$(date)] Weekly analysis complete"
