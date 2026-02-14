#!/bin/bash
# Daily PostgreSQL backup for LongEntry Market Scanner
# Add to crontab: 0 3 * * * /opt/longentry/scripts/backup_db.sh
#
# Retains last 7 daily backups.

set -euo pipefail

BACKUP_DIR="/var/backups/longentry"
DB_NAME="longentry"
DB_USER="longentry"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup..."
pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"
echo "[$(date)] Backup saved to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Cleaned up backups older than $RETENTION_DAYS days"
