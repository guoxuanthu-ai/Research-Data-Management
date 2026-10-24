#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/rds}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
node -e 'const fs=require("fs");const u=new URL(process.env.DATABASE_URL);const esc=s=>s.replace(/\\/g,"\\\\").replace(/"/g,"\\\"");fs.writeFileSync(process.argv[1],`[client]\nuser="${esc(decodeURIComponent(u.username))}"\npassword="${esc(decodeURIComponent(u.password))}"\nhost="${u.hostname}"\nport="${u.port||3306}"\n`,{mode:0o600});fs.writeFileSync(process.argv[2],decodeURIComponent(u.pathname.slice(1)),{mode:0o600})' "$work/client.cnf" "$work/database"
database="$(cat "$work/database")"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/rds-$stamp.sql.gz"
mysqldump --defaults-extra-file="$work/client.cnf" --single-transaction --routines --triggers --set-gtid-purged=OFF "$database" | gzip -9 > "$target"
sha256sum "$target" > "$target.sha256"
find "$BACKUP_DIR" -type f \( -name 'rds-*.sql.gz' -o -name 'rds-*.sql.gz.sha256' \) -mtime +30 -delete
printf '%s\n' "$target"
