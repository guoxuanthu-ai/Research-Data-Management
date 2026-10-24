#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
archive="${1:?usage: restore-check.sh /path/to/rds-YYYYmmddTHHMMSSZ.sql.gz}"
test -s "$archive"
if test -f "$archive.sha256"; then (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256"); fi
work="$(mktemp -d)"
database="rds_restore_check_$(date +%s)_$$"
cleanup() {
  if test -f "$work/client.cnf"; then mysql --defaults-extra-file="$work/client.cnf" -e "DROP DATABASE IF EXISTS \`$database\`" >/dev/null 2>&1 || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
node -e 'const fs=require("fs");const u=new URL(process.env.DATABASE_URL);const esc=s=>s.replace(/\\/g,"\\\\").replace(/"/g,"\\\"");fs.writeFileSync(process.argv[1],`[client]\nuser="${esc(decodeURIComponent(u.username))}"\npassword="${esc(decodeURIComponent(u.password))}"\nhost="${u.hostname}"\nport="${u.port||3306}"\n`,{mode:0o600})' "$work/client.cnf"
mysql --defaults-extra-file="$work/client.cnf" -e "CREATE DATABASE \`$database\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
gzip -dc "$archive" | mysql --defaults-extra-file="$work/client.cnf" "$database"
mysql --defaults-extra-file="$work/client.cnf" --batch --skip-column-names "$database" -e "SELECT CONCAT('users=',COUNT(*)) FROM users; SELECT CONCAT('records=',COUNT(*)) FROM records; SELECT CONCAT('audit_logs=',COUNT(*)) FROM audit_logs;"
printf 'Restore check passed; temporary database %s will be removed.\n' "$database"
