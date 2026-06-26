#!/usr/bin/env bash
# OCO Logistics — PostgreSQL backup via docker exec
# Usage: bash infra/backups/backup.sh
# Output: infra/backups/oco_YYYYMMDD_HHMMSS.sql.gz

set -euo pipefail

CONTAINER="oco-postgres"
DB_NAME="oco_logistics"
DB_USER="oco"
BACKUP_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/oco_${TIMESTAMP}.sql.gz"
KEEP_LAST=7   # number of backups to keep

echo "▶ Starting backup: $BACKUP_FILE"

docker exec "$CONTAINER" \
  pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip > "$BACKUP_FILE"

echo "✓ Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Clean up old backups, keep last $KEEP_LAST
echo "▶ Cleaning old backups (keeping last $KEEP_LAST)..."
ls -t "$BACKUP_DIR"/oco_*.sql.gz 2>/dev/null \
  | tail -n +$((KEEP_LAST + 1)) \
  | xargs -r rm --
echo "✓ Done."
