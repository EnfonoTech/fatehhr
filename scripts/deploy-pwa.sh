#!/usr/bin/env bash
# Build and deploy the PWA for a customer to public/spa/
#
# USAGE:
#   bash scripts/deploy-pwa.sh <slug>
#
# Where <slug> matches customers/.env.<slug>
#
# Builds the Vue SPA with CUSTOMER_BUILD_TARGET=web and copies output
# into fatehhr/public/spa/ so Frappe serves it at /assets/fatehhr/spa/.
# Commit + push the result, then run server-side deploy.
set -euo pipefail

SLUG="${1:-}"
if [[ -z "$SLUG" ]]; then
  echo "usage: $0 <customer-slug>  (e.g. $0 cooperheat)" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/customers/.env.$SLUG"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  echo "create it from customers/.env.example" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "▶ Building PWA for $SLUG ($CUSTOMER_ERP_DOMAIN)"

(
  cd "$REPO_ROOT/frontend"
  CUSTOMER_BUILD_TARGET=web \
    CUSTOMER_ERP_DOMAIN="$CUSTOMER_ERP_DOMAIN" \
    CUSTOMER_BRAND_NAME="$CUSTOMER_BRAND_NAME" \
    CUSTOMER_PRIMARY_COLOR="$CUSTOMER_PRIMARY_COLOR" \
    CUSTOMER_LOCALE="$CUSTOMER_LOCALE" \
    CUSTOMER_SELFIE_MODE="$CUSTOMER_SELFIE_MODE" \
    pnpm build
)

echo "▶ Copying build output to fatehhr/public/spa/"
rm -rf "$REPO_ROOT/fatehhr/public/spa"
mkdir -p "$REPO_ROOT/fatehhr/public/spa"
cp -R "$REPO_ROOT/frontend/dist/"* "$REPO_ROOT/fatehhr/public/spa/"

echo "✅ PWA built and staged in fatehhr/public/spa/"
echo ""
echo "   Next steps:"
echo "   1. git add fatehhr/public/spa/ customers/.env.$SLUG"
echo "   2. git commit -m 'deploy: PWA build for $SLUG'"
echo "   3. git push"
echo "   4. Deploy to server: bench migrate or signal workers"
