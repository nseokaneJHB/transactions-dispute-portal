#!/usr/bin/env bash
set -euo pipefail
out="$1"
cd "$(git rev-parse --show-toplevel)"
run() { docker compose exec -T database psql -U postgres -d perf_evidence 2>&1 <<SQL | grep -E "^Time" | awk '{print $2}'
\timing on
$1
SQL
}
INS="begin; insert into transaction(amount_cents, merchant_name, transacted_at, user_id) select (random()*500000)::bigint, 'Merchant '||(g%5000), now(), (select normal_id from people) from generate_series(1,200000) g; rollback;"
UPD="begin; update dispute set resolution_note = 'bench', updated_at = now() where id in (select id from sample_ids); rollback;"
med() { sort -g | awk '{a[NR]=$1} END {print a[int((NR+1)/2)]}'; }
ins=$(for i in 1 2 3; do run "$INS" | sort -g | tail -1; done)
upd=$(for i in 1 2 3; do run "$UPD" | sort -g | tail -1; done)
{
  printf 'W01 insert 200k transactions\t%s\t%s\n' "$(echo "$ins" | med)" "$(echo $ins)"
  printf 'W02 update 20k disputes\t%s\t%s\n' "$(echo "$upd" | med)" "$(echo $upd)"
  docker compose exec -T database psql -At -F $'\t' -U postgres -d perf_evidence -c "select 'X01 index count', count(*) from pg_indexes where schemaname='public'" -c "select 'X02 index size transaction / dispute / user', pg_size_pretty(pg_indexes_size('transaction'))||' / '||pg_size_pretty(pg_indexes_size('dispute'))||' / '||pg_size_pretty(pg_indexes_size('\"user\"'))"
} > "$out"
cat "$out"
