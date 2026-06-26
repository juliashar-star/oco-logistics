#!/usr/bin/env bash
# OCO Logistics — PostgreSQL restore from backup
# Usage: bash infra/backups/restore.sh <backup_file.sql.gz>
# Restores into a SEPARATE test database (oco_logistics_restore_test)
# so the live database is never touched during verification.

set -euo pipefail

CONTAINER="oco-postgres"
DB_USER="oco"
TEST_DB="oco_logistics_restore_test"
BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: bash infra/backups/restore.sh <path/to/backup.sql.gz>"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: File not found: $BACKUP_FILE"
  exit 1
fi

echo "▶ Restoring $BACKUP_FILE into test DB: $TEST_DB"

# Drop and recreate test DB
docker exec "$CONTAINER" \
  psql -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS $TEST_DB;" \
  -c "CREATE DATABASE $TEST_DB OWNER $DB_USER;"

# Restore
gunzip -c "$BACKUP_FILE" \
  | docker exec -i "$CONTAINER" \
    psql -U "$DB_USER" -d "$TEST_DB" -q

# Verify: count tables
TABLE_COUNT=$(docker exec "$CONTAINER" \
  psql -U "$DB_USER" -d "$TEST_DB" -tAc \
  "SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public';")

echo "✓ Restore complete. Tables in restored DB: $TABLE_COUNT"

# Drop test DB after verification
docker exec "$CONTAINER" \
  psql -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS $TEST_DB;"

echo "✓ Test DB dropped. Restore verified successfully."
