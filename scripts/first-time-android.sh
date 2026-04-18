#!/usr/bin/env bash
# One-time: initialise the Capacitor Android project.
# Prereqs: JDK 17 + Android SDK installed (see android-capacitor/README.md)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Verifying prereqs"
java -version 2>&1 | head -1 || { echo "JDK not found" >&2; exit 1; }
[[ -n "${ANDROID_HOME:-}" ]] || { echo "ANDROID_HOME not set" >&2; exit 1; }

# Build web once so cap add android has a dist/ to look at
echo "▶ Initial web build"
(
  cd "$REPO_ROOT/frontend"
  [[ -d node_modules ]] || pnpm install
  CUSTOMER_BUILD_TARGET=native pnpm build
)

echo "▶ Installing Capacitor packages"
(
  cd "$REPO_ROOT/android-capacitor"
  [[ -d node_modules ]] || pnpm install
)

echo "▶ Running cap add android"
(
  cd "$REPO_ROOT/android-capacitor"
  if [[ -d android ]]; then
    echo "  android/ already exists — skipping cap add"
  else
    npx cap add android
  fi
)

echo "▶ Patching android/app/build.gradle for env-driven signing + app name"
BUILD_GRADLE="$REPO_ROOT/android-capacitor/android/app/build.gradle"
if grep -q "FATEHHR_KEYSTORE_PATH" "$BUILD_GRADLE"; then
  echo "  already patched"
else
  # Append signing config + resValue block before the android { ... } closing brace
  python3 "$REPO_ROOT/scripts/_patch-build-gradle.py" "$BUILD_GRADLE"
fi

echo "▶ Copying web assets in"
(
  cd "$REPO_ROOT/android-capacitor"
  npx cap copy android
)

echo ""
echo "✅ Android project initialised at android-capacitor/android/"
echo ""
echo "Next steps:"
echo "   1. scripts/generate-keystore.sh    (one time, with keystore passwords)"
echo "   2. scripts/build-customer.sh demo   (builds signed APK → dist/)"
