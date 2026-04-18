#!/usr/bin/env bash
# Per-customer build: one env file in, one signed APK out.
#
# USAGE:
#   export FATEHHR_KEYSTORE_PW=...
#   export FATEHHR_KEY_PW=...
#   ./scripts/build-customer.sh <slug>
#
# Where <slug> matches customers/.env.<slug>
set -euo pipefail

SLUG="${1:-}"
if [[ -z "$SLUG" ]]; then
  echo "usage: $0 <customer-slug>  (e.g. $0 demo)" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/customers/.env.$SLUG"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  echo "copy customers/.env.example to customers/.env.$SLUG and fill it in" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${FATEHHR_KEYSTORE_PW:?set FATEHHR_KEYSTORE_PW in your shell}"
: "${FATEHHR_KEY_PW:?set FATEHHR_KEY_PW in your shell}"

KEYSTORE_PATH="$REPO_ROOT/android-capacitor/keystore/fatehhr-release.keystore"
if [[ ! -f "$KEYSTORE_PATH" ]]; then
  echo "Keystore not found at $KEYSTORE_PATH" >&2
  echo "Run scripts/generate-keystore.sh first." >&2
  exit 1
fi

echo "▶ Bumping version"
node "$REPO_ROOT/scripts/bump-version.mjs" patch
NATIVE_VERSION=$(grep -oE 'NATIVE_VERSION\s*=\s*"[^"]+"' "$REPO_ROOT/frontend/src/app/native-version.ts" | cut -d'"' -f2)
NATIVE_VERSION_CODE=$(grep -oE 'NATIVE_VERSION_CODE\s*=\s*[0-9]+' "$REPO_ROOT/frontend/src/app/native-version.ts" | grep -oE '[0-9]+')
echo "   version=$NATIVE_VERSION  code=$NATIVE_VERSION_CODE"

echo "▶ Building web (native target)"
(
  cd "$REPO_ROOT/frontend"
  CUSTOMER_BUILD_TARGET=native \
    CUSTOMER_ERP_DOMAIN="$CUSTOMER_ERP_DOMAIN" \
    CUSTOMER_BRAND_NAME="$CUSTOMER_BRAND_NAME" \
    CUSTOMER_PRIMARY_COLOR="$CUSTOMER_PRIMARY_COLOR" \
    CUSTOMER_LOCALE="$CUSTOMER_LOCALE" \
    CUSTOMER_SELFIE_MODE="$CUSTOMER_SELFIE_MODE" \
    pnpm build
)

echo "▶ Generating customer assets"
CUSTOMER_PRIMARY_COLOR="$CUSTOMER_PRIMARY_COLOR" \
  CUSTOMER_BRAND_NAME="$CUSTOMER_BRAND_NAME" \
  node "$REPO_ROOT/scripts/generate-customer-assets.mjs"

echo "▶ Copying web into Android project"
(
  cd "$REPO_ROOT/android-capacitor"
  npx cap copy android
)

echo "▶ Assembling release APK"
(
  cd "$REPO_ROOT/android-capacitor/android"
  APP_ID_ANDROID="$APP_ID_ANDROID" \
    CUSTOMER_BRAND_NAME="$CUSTOMER_BRAND_NAME" \
    CUSTOMER_PRIMARY_COLOR="$CUSTOMER_PRIMARY_COLOR" \
    NATIVE_VERSION="$NATIVE_VERSION" \
    NATIVE_VERSION_CODE="$NATIVE_VERSION_CODE" \
    FATEHHR_KEYSTORE_PATH="$KEYSTORE_PATH" \
    FATEHHR_KEYSTORE_PW="$FATEHHR_KEYSTORE_PW" \
    FATEHHR_KEY_PW="$FATEHHR_KEY_PW" \
    ./gradlew assembleRelease --no-daemon
)

mkdir -p "$REPO_ROOT/dist"
SRC_APK="$REPO_ROOT/android-capacitor/android/app/build/outputs/apk/release/app-release.apk"
DEST_APK="$REPO_ROOT/dist/fatehhr-${SLUG}-${NATIVE_VERSION}.apk"
cp "$SRC_APK" "$DEST_APK"

echo ""
echo "✅ Built: $DEST_APK"
echo "   Install on device: adb install -r \"$DEST_APK\""
