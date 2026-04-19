#!/usr/bin/env bash
# v0.1.5 smoke test: hits every endpoint that changed in this phase and
# verifies the user-story outcomes. Safe to run against prod: creates a
# uniquely-named throwaway asset and cleans up on exit (including failure).
#
# Usage:
#   ./scripts/smoke-test.sh                               # localhost:8080
#   ./scripts/smoke-test.sh https://openportfolio.fly.dev # prod
#
# Requires: curl, jq on host. ADMIN_TOKEN env var or defaults to local test token.
set -euo pipefail

URL="${1:-http://localhost:8080}"
TOKEN="${ADMIN_TOKEN:-testtoken123}"
SUFFIX="$(date +%s)-$$"
TICKER="smoke-asset-${SUFFIX}"
ACCOUNT_LABEL="smoke-account-${SUFFIX}"

HDR=(-H "X-Admin-Token: ${TOKEN}" -H "Content-Type: application/json")
FAIL=0
PASS=0
ACCOUNT_ID=""
POSITION_IDS=()

say()  { printf "\033[1m%s\033[0m\n" "$*"; }
pass() { printf "  \033[32m✓\033[0m %s\n" "$*"; PASS=$((PASS+1)); }
fail() { printf "  \033[31m✗\033[0m %s\n" "$*"; FAIL=$((FAIL+1)); }
info() { printf "    \033[90m%s\033[0m\n" "$*"; }

cleanup() {
    # Best-effort cleanup. Runs on success, failure, or Ctrl-C.
    say "Cleanup"
    # ${arr[@]+"${arr[@]}"} pattern avoids "unbound variable" when the
    # array is empty and the script ran under set -u.
    for pid in ${POSITION_IDS[@]+"${POSITION_IDS[@]}"}; do
        curl -fsS -X DELETE "${HDR[@]}" "${URL}/api/positions/${pid}" >/dev/null 2>&1 \
            && info "deleted position #${pid}" \
            || info "position #${pid} already gone"
    done
    curl -fsS -X DELETE "${HDR[@]}" "${URL}/api/classifications/${TICKER}" >/dev/null 2>&1 \
        && info "deleted classification ${TICKER}" \
        || info "classification ${TICKER} already gone"
    if [ -n "${ACCOUNT_ID}" ]; then
        curl -fsS -X DELETE "${HDR[@]}" "${URL}/api/accounts/${ACCOUNT_ID}" >/dev/null 2>&1 \
            && info "deleted account #${ACCOUNT_ID}" \
            || info "account #${ACCOUNT_ID} already gone"
    fi
}
trap cleanup EXIT

say "Smoke test against ${URL}"
echo

# --- 1. Health -----------------------------------------------------------

say "1. Health"
if curl -fsS "${URL}/health" | jq -e '.ok == true' >/dev/null; then
    pass "GET /health returns ok"
else
    fail "GET /health did not return ok"
fi
echo

# --- 2. Auth -------------------------------------------------------------

say "2. Auth"
code=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/api/accounts")
if [ "$code" = "401" ]; then
    pass "no-token request returns 401"
else
    fail "expected 401 without token, got ${code}"
fi
echo

# --- 3. Taxonomy endpoint (v0.1.5 M3) ------------------------------------

say "3. Taxonomy"
taxonomy=$(curl -fsS "${HDR[@]}" "${URL}/api/classifications/taxonomy")
if echo "$taxonomy" | jq -e '.asset_classes | map(select(.value=="fixed_income")) | .[0].label == "Fixed Income"' >/dev/null; then
    pass "taxonomy returns friendly label for fixed_income"
else
    fail "taxonomy missing or mislabeled"
    info "got: $(echo "$taxonomy" | jq -c . 2>/dev/null || echo "$taxonomy")"
fi
echo

# --- 4. Classifications list (YAML baseline + user) ----------------------

say "4. Classifications list"
cls=$(curl -fsS "${HDR[@]}" "${URL}/api/classifications")
yaml_count=$(echo "$cls" | jq '[.[] | select(.source=="yaml")] | length')
if [ "$yaml_count" -gt 10 ]; then
    pass "YAML baseline present (${yaml_count} rows)"
else
    fail "expected >10 YAML rows, got ${yaml_count}"
fi
echo

# --- 5. Create account ---------------------------------------------------

say "5. Account CRUD"
ACCOUNT_ID=$(curl -fsS -X POST "${HDR[@]}" \
    -d "{\"label\":\"${ACCOUNT_LABEL}\",\"type\":\"smoke-test\"}" \
    "${URL}/api/accounts" | jq -r '.id')
if [ -n "${ACCOUNT_ID}" ] && [ "${ACCOUNT_ID}" != "null" ]; then
    pass "POST /api/accounts created account #${ACCOUNT_ID}"
else
    fail "account creation failed"
    exit 1
fi

# PATCH it
patched=$(curl -fsS -X PATCH "${HDR[@]}" \
    -d '{"label":"smoke-renamed","type":"smoke-hsa"}' \
    "${URL}/api/accounts/${ACCOUNT_ID}")
if [ "$(echo "$patched" | jq -r '.label')" = "smoke-renamed" ]; then
    pass "PATCH /api/accounts/{id} updates label and type"
else
    fail "PATCH response unexpected: $(echo "$patched" | jq -c .)"
fi
echo

# --- 6. Manual commit with classification (M4) ---------------------------

say "6. Manual commit + auto-suffix"
first=$(curl -fsS -X POST "${HDR[@]}" -d "{
    \"account_id\": ${ACCOUNT_ID},
    \"source\": \"smoke-test\",
    \"positions\": [{
        \"ticker\": \"${TICKER}\",
        \"shares\": 1.0,
        \"cost_basis\": null,
        \"market_value\": 1234.56,
        \"confidence\": 1.0,
        \"source_span\": \"\",
        \"classification\": {\"asset_class\": \"commodity\", \"sub_class\": \"smoke\"}
    }]
}" "${URL}/api/positions/commit")

first_ticker=$(echo "$first" | jq -r '.tickers[0]')
first_pid=$(echo "$first" | jq -r '.position_ids[0]')
POSITION_IDS+=("$first_pid")
if [ "$first_ticker" = "$TICKER" ]; then
    pass "first manual commit used proposed ticker (${TICKER})"
else
    fail "first commit ticker mismatch: got ${first_ticker}"
fi

# Commit the same label again → expect auto-suffix -2
second=$(curl -fsS -X POST "${HDR[@]}" -d "{
    \"account_id\": ${ACCOUNT_ID},
    \"source\": \"smoke-test\",
    \"positions\": [{
        \"ticker\": \"${TICKER}\",
        \"shares\": 1.0,
        \"cost_basis\": null,
        \"market_value\": 99.0,
        \"confidence\": 1.0,
        \"source_span\": \"\",
        \"classification\": {\"asset_class\": \"commodity\", \"sub_class\": \"smoke\"}
    }]
}" "${URL}/api/positions/commit")

second_ticker=$(echo "$second" | jq -r '.tickers[0]')
second_pid=$(echo "$second" | jq -r '.position_ids[0]')
POSITION_IDS+=("$second_pid")
if [ "$second_ticker" = "${TICKER}-2" ]; then
    pass "second commit auto-suffixed to ${TICKER}-2"
else
    fail "expected auto-suffix ${TICKER}-2, got ${second_ticker}"
fi
echo

# --- 7. Allocation shows classification_sources (M1 + M3) ----------------

say "7. Allocation reflects override"
alloc=$(curl -fsS "${HDR[@]}" "${URL}/api/allocation")
src=$(echo "$alloc" | jq -r ".classification_sources[\"${TICKER}\"] // \"\"")
if [ "$src" = "user" ]; then
    pass "classification_sources[${TICKER}] = 'user'"
else
    fail "expected source=user for ${TICKER}, got '${src}'"
fi

# commodity asset_class must exist in the tree
if echo "$alloc" | jq -e '.by_asset_class | map(select(.name=="commodity")) | length > 0' >/dev/null; then
    pass "allocation tree has commodity bucket"
else
    fail "commodity bucket missing from allocation"
fi
echo

# --- 8. Orphan-block on delete (M3, user story 6) ------------------------

say "8. Orphan-delete block"
code=$(curl -s -o /tmp/smoke-body.$$ -w "%{http_code}" -X DELETE "${HDR[@]}" \
    "${URL}/api/classifications/${TICKER}")
body=$(cat /tmp/smoke-body.$$ 2>/dev/null || echo "")
rm -f /tmp/smoke-body.$$
if [ "$code" = "409" ]; then
    pass "DELETE /api/classifications/${TICKER} returned 409 (positions reference it)"
    if echo "$body" | grep -qi "position"; then
        pass "409 body mentions 'position'"
    else
        fail "409 body missing 'position' in detail: $body"
    fi
else
    fail "expected 409, got ${code}: ${body}"
fi
echo

# --- 9. Snapshot-on-commit (M6) ------------------------------------------

say "9. Snapshot history"
snaps=$(curl -fsS "${HDR[@]}" "${URL}/api/export" | jq '.snapshots | length')
if [ "$snaps" -ge 2 ]; then
    pass "export contains ${snaps} snapshot row(s) (≥2 from our two commits)"
else
    fail "expected ≥2 snapshots, got ${snaps}"
fi
echo

# --- 10. PATCH a classification and see it land --------------------------

say "10. Classification PATCH"
patched=$(curl -fsS -X PATCH "${HDR[@]}" -d '{
    "asset_class": "commodity",
    "sub_class": "smoke-updated"
}' "${URL}/api/classifications/${TICKER}")
if [ "$(echo "$patched" | jq -r '.sub_class')" = "smoke-updated" ]; then
    pass "PATCH /api/classifications/{ticker} updates sub_class"
else
    fail "PATCH response unexpected: $(echo "$patched" | jq -c .)"
fi
echo

# --- Summary -------------------------------------------------------------

echo
say "Summary"
printf "  \033[32m%d passed\033[0m, \033[31m%d failed\033[0m\n" "$PASS" "$FAIL"
echo

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
