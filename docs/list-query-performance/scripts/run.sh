#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$here/../results}"
cd "$(git rev-parse --show-toplevel)"
db() { docker compose exec -T database psql -q -v ON_ERROR_STOP=1 -U postgres "$@"; }
migration() { db -d perf_evidence < "api/src/database/migrations/$1.sql"; }
docker compose up -d database
db -c "drop database if exists perf_evidence" -c "create database perf_evidence"
migration 000_init
db -d perf_evidence < "$here/load.sql"

db -d perf_evidence -c "vacuum analyze"
python3 "$here/offset-queries.py" 1 "$out/1-before.queries.tsv"
"$here/time-queries.sh" "$out/1-before.queries.tsv" "$out/1-before.tsv"
"$here/writes.sh" "$out/1-before.writes.tsv"

migration 0001_prune_unused_indexes_add_dispute_list_indexes
db -d perf_evidence -c "vacuum analyze"
python3 "$here/offset-queries.py" 2 "$out/2-after-index-refactor.queries.tsv"
"$here/time-queries.sh" "$out/2-after-index-refactor.queries.tsv" "$out/2-after-index-refactor.tsv"
"$here/writes.sh" "$out/2-after-index-refactor.writes.tsv"

migration 0002_add_list_sort_indexes
db -d perf_evidence -c "vacuum analyze"
cp "$here/capture-current.ts" api/capture-current.ts
(cd api && node_modules/.bin/tsx capture-current.ts "$out/3-current.queries.tsv") || { rm -f api/capture-current.ts; exit 1; }
rm -f api/capture-current.ts
"$here/time-queries.sh" "$out/3-current.queries.tsv" "$out/3-current.tsv"
"$here/writes.sh" "$out/3-current.writes.tsv"

db -c "drop database perf_evidence"
