#!/usr/bin/env bash
set -u

accounts=(
  "vigilvault.vigilowner.testnet"
)

accounts+=("$@")

for account_id in "${accounts[@]}"; do
  echo "Checking $account_id"
  near account view-account-summary "$account_id" network-config testnet now || true
done
