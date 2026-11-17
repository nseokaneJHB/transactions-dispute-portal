#!/usr/bin/env bash
set -euo pipefail
queries="$1"; out="$2"
cd "$(git rev-parse --show-toplevel)"
psqlc() { docker compose exec -T database psql -U postgres -d perf_evidence "$@"; }
plans="${out%.tsv}.plans.txt"
: > "$out"; : > "$plans"
while IFS=$'\t' read -r label q; do
  times=$( { echo 'set statement_timeout = 60000;'; echo '\timing on'; for i in 1 2 3 4 5 6; do echo "$q;"; done; } | psqlc -o /dev/null 2>&1 | grep '^Time:' | awk '{print $2}' | tail -5 | tr '\n' ' ')
  median=$(echo $times | tr ' ' '\n' | sort -g | sed -n 3p)
  idx=$(echo "explain $q;" | psqlc -At 2>/dev/null | grep -oE '(Index|Index Only|Bitmap Index) Scan( Backward)? using [a-z_0-9]+|Seq Scan on [a-z_"]+|Sort  |Incremental Sort' | sed 's/  $//' | tr '\n' ',' )
  printf '%s\t%s\t%s\n' "$label" "$median" "$idx" >> "$out"
  { echo "== $label"; echo "explain $q;" | psqlc -At 2>/dev/null; } >> "$plans"
done < "$queries"
column -t -s $'\t' "$out"
