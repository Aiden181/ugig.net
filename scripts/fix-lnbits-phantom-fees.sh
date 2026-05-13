#!/usr/bin/env bash
# Fix LNbits phantom-fee balance bug.
#
# Symptom: an incoming LNURL-p payment row gets `fee = -amount` instead of 0,
# zeroing out the wallet balance via the `balances` view (SUM(amount - ABS(fee))).
# Affects any wallet that received sats via lnurlp on this LNbits instance.
#
# Usage:
#   ./scripts/fix-lnbits-phantom-fees.sh           # dry-run: report only
#   ./scripts/fix-lnbits-phantom-fees.sh --apply   # backup + UPDATE
#
# Requires SSH access to the LN host as ubuntu@ln.coinpayportal.com.

set -euo pipefail

HOST="${LN_HOST:-ubuntu@ln.coinpayportal.com}"
DB="/opt/lnbits-data/database.sqlite3"

run_remote() {
  ssh -o StrictHostKeyChecking=no "$HOST" "$@"
}

echo "Scanning $HOST:$DB for phantom-fee rows..."
SUMMARY=$(run_remote "sudo sqlite3 -header $DB \"SELECT COUNT(*) AS rows, IFNULL(SUM(ABS(fee))/1000,0) AS phantom_sats FROM apipayments WHERE status='success' AND amount>0 AND fee<0;\"")
echo "$SUMMARY"

ROWS=$(echo "$SUMMARY" | awk -F'|' 'NR==2 {print $1}')
if [[ "${ROWS:-0}" -eq 0 ]]; then
  echo "Nothing to fix."
  exit 0
fi

if [[ "${1:-}" != "--apply" ]]; then
  echo
  echo "Dry run. Re-run with --apply to backup + UPDATE."
  exit 0
fi

STAMP=$(date +%Y%m%d-%H%M%S)
echo "Backing up to $DB.bak-$STAMP..."
run_remote "sudo cp $DB $DB.bak-$STAMP"

echo "Applying UPDATE..."
run_remote "sudo sqlite3 $DB \"UPDATE apipayments SET fee = 0 WHERE status='success' AND amount > 0 AND fee < 0;\""

echo "Verifying..."
run_remote "sudo sqlite3 -header $DB \"SELECT COUNT(*) AS remaining FROM apipayments WHERE status='success' AND amount>0 AND fee<0;\""
echo "Done. LNbits balances view recomputes on read — no service restart needed."
