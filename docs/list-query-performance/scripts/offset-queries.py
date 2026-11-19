"""Query set for the offset-paging states: `1` = before (exact count), `2` = after the index refactor (count capped at 10,001). Usage: offset-queries.py <state> <out.tsv>."""
import subprocess, sys
ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
stage = sys.argv[1]
def q(sql):
    r = subprocess.run(["docker","compose","exec","-T","database","psql","-At","-U","postgres","-d","perf_evidence","-c",sql], cwd=ROOT, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr)
    return r.stdout.strip()
heavy = q("select heavy_id from people"); normal = q("select normal_id from people")
ADMIN_SEL = "d.*, t.merchant_name, t.amount_cents, t.transacted_at, u.name, u.email"
ADMIN_FROM = 'dispute d join transaction t on d.transaction_id = t.id join "user" u on d.user_id = u.id'
CD_SEL = "d.id, d.description, d.resolution_note, d.resolved_at, d.status, d.reason, d.created_at, d.updated_at, d.transaction_id, t.merchant_name, t.amount_cents, t.transacted_at"
CD_FROM = "dispute d join transaction t on d.transaction_id = t.id"
TX_SEL = "t.id, t.amount_cents, t.merchant_name, t.transacted_at, t.created_at, t.updated_at"
TX_FROM = "transaction t"
SEARCH = "(d.description ilike '%merchant 42%' or t.merchant_name ilike '%merchant 42%' or u.name ilike '%merchant 42%' or u.email ilike '%merchant 42%')"
QUEUE = "d.status asc, d.created_at asc, d.id desc"
lists = {
  "admin": (ADMIN_SEL, ADMIN_FROM, "true"),
  "adminS": (ADMIN_SEL, ADMIN_FROM, "d.status = 'SUBMITTED'"),
  "adminQ": (ADMIN_SEL, ADMIN_FROM, SEARCH),
  "htx": (TX_SEL, TX_FROM, f"t.user_id = '{heavy}'"),
  "ntx": (TX_SEL, TX_FROM, f"t.user_id = '{normal}'"),
  "hcd": (CD_SEL, CD_FROM, f"d.user_id = '{heavy}'"),
  "ncd": (CD_SEL, CD_FROM, f"d.user_id = '{normal}'"),
}
pages = [
  ("P01 admin queue, first page", "admin", QUEUE, 0),
  ("P02 admin queue, row 10,000", "admin", QUEUE, 9990),
  ("P03 admin queue, row 500,000", "admin", QUEUE, 499990),
  ("P04 admin queue status=SUBMITTED, first page", "adminS", QUEUE, 0),
  ("P05 admin search 'merchant 42', first page", "adminQ", QUEUE, 0),
  ("P06 heavy customer transactions, first page", "htx", "t.transacted_at desc, t.id desc", 0),
  ("P07 heavy customer transactions, row 10,000", "htx", "t.transacted_at desc, t.id desc", 9990),
  ("P08 heavy customer transactions, row 100,000", "htx", "t.transacted_at desc, t.id desc", 99990),
  ("P09 heavy customer disputes, first page", "hcd", "d.created_at desc, d.id desc", 0),
  ("P10 heavy customer disputes, row 10,000", "hcd", "d.created_at desc, d.id desc", 9990),
  ("P11 heavy customer disputes, row 40,000", "hcd", "d.created_at desc, d.id desc", 39990),
  ("P12 normal customer transactions, first page", "ntx", "t.transacted_at desc, t.id desc", 0),
  ("P13 normal customer disputes, first page", "ncd", "d.created_at desc, d.id desc", 0),
  ("S01 admin sort=amount desc, first page", "admin", "t.amount_cents desc, d.id desc", 0),
  ("S02 admin sort=amount desc, row 10,000", "admin", "t.amount_cents desc, d.id desc", 9990),
  ("S03 admin sort=amount desc, row 500,000", "admin", "t.amount_cents desc, d.id desc", 499990),
  ("S04 admin sort=customer asc, first page", "admin", "u.name asc, d.id desc", 0),
  ("S05 admin sort=customer asc, row 10,000", "admin", "u.name asc, d.id desc", 9990),
  ("S06 admin sort=status asc, first page", "admin", "d.status asc, d.id desc", 0),
  ("S07 admin sort=status asc, row 10,000", "admin", "d.status asc, d.id desc", 9990),
  ("S08 heavy customer transactions sort=amount asc, first page", "htx", "t.amount_cents asc, t.id desc", 0),
  ("S09 heavy customer transactions sort=amount asc, row 10,000", "htx", "t.amount_cents asc, t.id desc", 9990),
  ("S10 heavy customer disputes sort=merchant asc, first page", "hcd", "t.merchant_name asc, d.id desc", 0),
  ("S11 heavy customer disputes sort=merchant asc, row 10,000", "hcd", "t.merchant_name asc, d.id desc", 9990),
]
counts = [
  ("C01 count: admin queue", "admin"), ("C02 count: admin queue status=SUBMITTED", "adminS"),
  ("C03 count: admin search", "adminQ"), ("C04 count: heavy customer transactions", "htx"),
  ("C05 count: heavy customer disputes", "hcd"), ("C06 count: normal customer transactions", "ntx"),
  ("C07 count: normal customer disputes", "ncd"),
]
out = open(sys.argv[2], "w")
for label, key, order, off in pages:
    sel, frm, where = lists[key]
    out.write(f"{label}\tselect {sel} from {frm} where {where} order by {order} limit 10 offset {off}\n")
for label, key in counts:
    _, frm, where = lists[key]
    if stage == "1":
        out.write(f"{label}\tselect count(*) from {frm} where {where}\n")
    else:
        out.write(f"{label}\tselect count(*) from (select 1 from {frm} where {where} limit 10001) m\n")
