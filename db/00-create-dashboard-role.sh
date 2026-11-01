#!/bin/bash
set -euo pipefail

if [[ -z "${LOADER_PASSWORD:-}" || -z "${DASHBOARD_PASSWORD:-}" ]]; then
  echo "LOADER_PASSWORD and DASHBOARD_PASSWORD must be set when initializing Postgres" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=loader_password="$LOADER_PASSWORD" \
  --set=dashboard_password="$DASHBOARD_PASSWORD" \
  <<'SQL'
CREATE ROLE loader LOGIN PASSWORD :'loader_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE dashboard LOGIN PASSWORD :'dashboard_password';
SQL
