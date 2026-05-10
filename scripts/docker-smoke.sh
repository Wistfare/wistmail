#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WistMail Docker e2e smoke
#
# Brings up the full stack defined in docker-compose.yml, drives a
# representative happy-path flow through the API, and tears everything
# down. Exits non-zero with the offending response body on the first
# unexpected status code.
#
# Reviewer: a clean run prints "SMOKE OK" and leaves the stack down.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

API_HOST="${SMOKE_API_HOST:-http://localhost:3001}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-wistmail-smoke}"
export COMPOSE_PROJECT_NAME

# Fail fast if docker isn't available — this is a docker e2e, after all.
if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH — install Docker Desktop / Engine first" >&2
  exit 127
fi

# Bootstrap a .env from the example if the developer hasn't made one yet.
# Compose reads .env at the repo root, so all containers see the same vars.
if [[ ! -f .env ]]; then
  echo "── no .env present, copying from .env.example ──"
  cp .env.example .env
fi

# Pull INBOUND_SECRET so step 6 below can authenticate against the host.
INBOUND_SECRET_VALUE="$(grep -E '^INBOUND_SECRET=' .env | head -1 | cut -d= -f2-)"
if [[ -z "$INBOUND_SECRET_VALUE" ]]; then
  echo "INBOUND_SECRET is empty in .env — refusing to run smoke" >&2
  exit 1
fi

# Curl wrapper — fails the script when status isn't in the allowed set.
COOKIE_JAR="$(mktemp -t wistmail-smoke-cookies.XXXXXX)"
trap_exit() {
  local rc=$?
  echo
  echo "── teardown ──────────────────────────────────────────────────────────"
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$COOKIE_JAR"
  if [[ $rc -ne 0 ]]; then
    echo "SMOKE FAILED (exit $rc)" >&2
  fi
  exit $rc
}
trap trap_exit EXIT

# `expect_status METHOD PATH BODY EXPECTED_STATUS [EXTRA_HEADER]`
expect_status() {
  local method="$1"
  local path="$2"
  local body="$3"
  local expected="$4"
  local extra_header="${5:-}"

  local url="${API_HOST}${path}"
  local response_file
  response_file="$(mktemp -t wistmail-smoke-resp.XXXXXX)"
  local status

  local -a curl_args=(
    -sS
    -o "$response_file"
    -w '%{http_code}'
    -X "$method"
    -b "$COOKIE_JAR"
    -c "$COOKIE_JAR"
    -H 'Content-Type: application/json'
  )
  if [[ -n "$extra_header" ]]; then
    curl_args+=(-H "$extra_header")
  fi
  if [[ -n "$body" ]]; then
    curl_args+=(--data "$body")
  fi
  curl_args+=("$url")

  status="$(curl "${curl_args[@]}")"

  if [[ "$status" != "$expected" ]]; then
    echo "FAIL  $method $path → $status (expected $expected)" >&2
    echo "─── response body ─────────────────────────────────────" >&2
    cat "$response_file" >&2 || true
    echo >&2
    rm -f "$response_file"
    exit 1
  fi

  echo "ok    $method $path → $status"
  cat "$response_file"
  rm -f "$response_file"
}

# ── 0. Stack bring-up ────────────────────────────────────────────────────────

echo "── docker compose build & up ────────────────────────────────────────"
docker compose build postgres redis minio meilisearch api web docs mail-engine billing-cron >/dev/null
docker compose up -d postgres redis minio meilisearch api web docs mail-engine billing-cron

echo "── waiting for api healthcheck (up to 180s) ─────────────────────────"
for i in $(seq 1 60); do
  status="$(docker compose ps --format '{{.Service}} {{.Health}}' \
    | awk '$1=="api" {print $2}')"
  if [[ "$status" == "healthy" ]]; then
    echo "api is healthy after ${i}×3s"
    break
  fi
  sleep 3
done
if [[ "$status" != "healthy" ]]; then
  echo "api never went healthy. status=$status. Recent logs:" >&2
  docker compose logs --tail=80 api >&2 || true
  exit 1
fi

# ── 1. Smoke flow ────────────────────────────────────────────────────────────
#
# WistMail's "signup" is a multi-step setup wizard rather than an
# /auth/signup endpoint. The realistic happy path:
#
#   POST /setup/domain         → creates the domain + setup-token cookie
#   POST /setup/skip-dns       → advances past DNS verify (ALLOW_SKIP_DNS=true)
#   POST /setup/account        → creates user + org + session cookie
#   POST /admin/users/create   → invites a teammate
#   POST /billing/subscribe    → starts a trial sub (precondition for tick path)
#   POST /billing/topup        → kicks off Wistfare collection (stubbed in dev)
#   POST /billing/webhooks/wistfare → simulates the completed callback
#   POST /billing/internal/tick → advances renewal state machine
#   GET  /billing/wallet       → verify the credit landed in the ledger
#   POST /auth/logout          → clean up
#
# The setup token is HTTP-only — curl picks it up from $COOKIE_JAR.

DOMAIN="smoke-$(date +%s).local.test"
ADMIN_LOCAL="admin"
ADMIN_PASSWORD="Smoke-Pass-1234"

echo
echo "── smoke flow ───────────────────────────────────────────────────────"

# Step 1: claim the domain (replaces the "signup" step in the brief — there
# is no /auth/signup; setup wizard is the front door).
expect_status POST /api/v1/setup/domain \
  "$(printf '{"name":"%s"}' "$DOMAIN")" \
  201 >/dev/null

# Step 1b: skip DNS so we can advance to /account without a live nameserver.
expect_status POST /api/v1/setup/skip-dns '' 200 >/dev/null

# Step 1c: create the admin account (this is what actually issues the
# session cookie used by every authenticated step below).
expect_status POST /api/v1/setup/account \
  "$(printf '{"displayName":"Smoke Admin","emailLocal":"%s","password":"%s","orgName":"Smoke Co"}' \
    "$ADMIN_LOCAL" "$ADMIN_PASSWORD")" \
  201 >/dev/null

# Step 2: invite a teammate.
expect_status POST /api/v1/admin/users/create \
  '{"firstName":"Test","lastName":"User","emailLocal":"teammate","displayName":"Test User"}' \
  201 >/dev/null

# Step 3: subscribe to the seeded "team" plan so the renewal tick has
# something to act on. seedSystemData runs on api boot and is idempotent.
expect_status POST /api/v1/billing/subscribe \
  '{"planCode":"team","seats":1}' \
  201 >/dev/null

# Step 4: initiate a topup. WISTFARE_API_KEY is unset, so the client
# returns a stubbed col_stub_<idemKey> id and our attempt row is created
# with status=pending.
TOPUP_RESPONSE="$(expect_status POST /api/v1/billing/topup \
  '{"amountCents":50000,"method":"mtn_momo","msisdn":"250788000001","displayAmount":50000,"displayCurrency":"RWF"}' \
  201)"
TOPUP_ID="$(printf '%s' "$TOPUP_RESPONSE" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)"
PROVIDER_ID="$(printf '%s' "$TOPUP_RESPONSE" | sed -n 's/.*"providerCollectionId":"\([^"]*\)".*/\1/p' | head -1)"
echo "      topup attempt=$TOPUP_ID provider=$PROVIDER_ID"

# Step 5: simulate the completed webhook. The webhook handler accepts
# both reference_id (our idempotencyKey) and transaction_id (provider id).
expect_status POST /api/v1/billing/webhooks/wistfare \
  "$(printf '{"event":"collection.completed","reference_id":"%s","transaction_id":"%s"}' \
    "$TOPUP_ID" "$PROVIDER_ID")" \
  200 >/dev/null

# Step 6: force a renewal tick. We hit the same endpoint the cron does,
# from the host side, with the shared INBOUND_SECRET.
expect_status POST /api/v1/billing/internal/tick '' 200 \
  "X-Inbound-Secret: ${INBOUND_SECRET_VALUE}" >/dev/null

# Step 7: pull the wallet — confirm the credit landed.
WALLET_RESPONSE="$(expect_status GET /api/v1/billing/wallet '' 200)"
if ! printf '%s' "$WALLET_RESPONSE" | grep -q '"reason":"topup"'; then
  echo "FAIL  wallet has no topup transaction" >&2
  echo "$WALLET_RESPONSE" >&2
  exit 1
fi
echo "      wallet credited ✓"

# Step 8: log out.
expect_status POST /api/v1/auth/logout '' 200 >/dev/null

echo
echo "SMOKE OK"
