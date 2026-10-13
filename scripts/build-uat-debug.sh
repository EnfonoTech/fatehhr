#!/usr/bin/env bash
# Debug-signed UAT APK for a customer (no release keystore needed).
#
# USAGE:  bash scripts/build-uat-debug.sh <slug>     e.g. cooperheat-uat
#         SKIP_BUMP=1 bash scripts/build-uat-debug.sh cooperheat-uat   (rebuild same version)
#
# Same steps as build-customer.sh, but assembleDebug. The committed branded
# launcher icons are kept: generate-customer-assets.mjs would overwrite them
# with plain colour icons, so res/ is restored from git before assembling.
set -euo pipefail

SLUG="${1:?usage: $0 <customer-slug>}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/customers/.env.$SLUG"
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 1; }

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"
set -a; source "$ENV_FILE"; set +a

[[ -n "${SKIP_BUMP:-}" ]] || node "$REPO_ROOT/scripts/bump-version.mjs" patch
NATIVE_VERSION=$(grep -oE 'NATIVE_VERSION\s*=\s*"[^"]+"' "$REPO_ROOT/frontend/src/app/native-version.ts" | cut -d'"' -f2)
NATIVE_VERSION_CODE=$(grep -oE 'NATIVE_VERSION_CODE\s*=\s*[0-9]+' "$REPO_ROOT/frontend/src/app/native-version.ts" | grep -oE '[0-9]+')
echo "▶ $SLUG $NATIVE_VERSION ($NATIVE_VERSION_CODE) → $CUSTOMER_ERP_DOMAIN"

(cd "$REPO_ROOT/frontend" && CUSTOMER_BUILD_TARGET=native pnpm build)
(cd "$REPO_ROOT/android-capacitor" && npx cap sync android)
git -C "$REPO_ROOT" checkout -- android-capacitor/android/app/src/main/res
(cd "$REPO_ROOT/android-capacitor/android" && \
	NATIVE_VERSION="$NATIVE_VERSION" NATIVE_VERSION_CODE="$NATIVE_VERSION_CODE" ./gradlew assembleDebug --no-daemon -q)

mkdir -p "$REPO_ROOT/dist"
OUT="$REPO_ROOT/dist/fatehhr-$SLUG-$NATIVE_VERSION-debug.apk"
cp "$REPO_ROOT/android-capacitor/android/app/build/outputs/apk/debug/app-debug.apk" "$OUT"
echo "✅ $OUT"
