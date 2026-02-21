#!/bin/bash
# Install all LongEntry cron jobs.
#
# Usage:
#   bash /opt/longentry/scripts/install_crons.sh
#
# This script adds both cron entries (backup + weekly analysis) to the
# current user's crontab. It is safe to run multiple times — existing
# LongEntry entries are replaced, not duplicated.

set -euo pipefail

INSTALL_DIR="/opt/longentry"

# ── Cron entries ────────────────────────────────────────────────────
BACKUP_CRON="0 3 * * * /bin/bash ${INSTALL_DIR}/scripts/backup_db.sh >> /var/log/longentry/backup.log 2>&1"
ANALYSIS_CRON="0 6 * * 6 /bin/bash ${INSTALL_DIR}/scripts/run_weekly_analysis.sh >> /var/log/longentry/analysis.log 2>&1"

# ── Ensure log directory exists ─────────────────────────────────────
mkdir -p /var/log/longentry

# ── Install ─────────────────────────────────────────────────────────
# Strip any existing LongEntry lines, then append the current ones.
# This makes the script idempotent (safe to re-run).
EXISTING=$(crontab -l 2>/dev/null || true)
CLEANED=$(echo "$EXISTING" | grep -v "longentry" || true)

NEW_CRONTAB=$(cat <<EOF
${CLEANED}

# --- LongEntry Market Scanner ---
# Daily database backup at 03:00 UTC
${BACKUP_CRON}
# Weekly analysis every Saturday at 06:00 UTC
${ANALYSIS_CRON}
EOF
)

# Remove leading blank lines to keep crontab tidy
echo "$NEW_CRONTAB" | sed '/./,$!d' | crontab -

echo "Cron jobs installed successfully:"
echo ""
crontab -l | grep -A1 "LongEntry"
echo ""
echo "Verify with: crontab -l"
