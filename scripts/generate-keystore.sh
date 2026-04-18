#!/usr/bin/env bash
# One-time: generate the fatehhr release keystore.
# Reused across all customers (applicationId differs, signing key is shared).
#
# USAGE:
#   export FATEHHR_KEYSTORE_PW=...    # pick a strong password
#   export FATEHHR_KEY_PW=...         # can be same as keystore PW
#   ./scripts/generate-keystore.sh
#
# After: back up the .keystore file to TWO locations (1Password + encrypted USB).
set -euo pipefail

: "${FATEHHR_KEYSTORE_PW:?set FATEHHR_KEYSTORE_PW before running}"
: "${FATEHHR_KEY_PW:?set FATEHHR_KEY_PW before running}"

KEYSTORE_DIR="$(cd "$(dirname "$0")/../android-capacitor/keystore" && pwd)"
KEYSTORE_PATH="$KEYSTORE_DIR/fatehhr-release.keystore"

if [[ -f "$KEYSTORE_PATH" ]]; then
  echo "Keystore already exists at $KEYSTORE_PATH — refusing to overwrite."
  echo "If you REALLY mean to replace it, delete it manually first. You will"
  echo "lose the ability to ship updates to anyone who installed from the old key."
  exit 1
fi

keytool -genkey -v \
  -keystore "$KEYSTORE_PATH" \
  -alias fatehhr \
  -keyalg RSA -keysize 4096 -validity 36500 \
  -storepass "$FATEHHR_KEYSTORE_PW" \
  -keypass  "$FATEHHR_KEY_PW" \
  -dname "CN=Enfono Technologies, OU=Engineering, O=Enfono, L=Riyadh, S=Riyadh, C=SA"

DIGEST=$(shasum -a 256 "$KEYSTORE_PATH" | awk '{print $1}')

cat > "$KEYSTORE_DIR/README.md" <<README
# fatehhr release keystore

- Alias: fatehhr
- Algorithm: RSA 4096
- Validity: ~100 years
- Generated: $(date -u +%Y-%m-%d)
- SHA-256: \`$DIGEST\`

**NEVER** commit \`fatehhr-release.keystore\`. Two backups required:

- [ ] 1Password vault entry tagged \`fatehhr-keystore\` (attach the file)
- [ ] Encrypted USB / second laptop

Passwords are in 1Password as \`fatehhr-keystore-pw\` and \`fatehhr-key-pw\`.
README

echo ""
echo "✅ Generated: $KEYSTORE_PATH"
echo "   SHA-256:  $DIGEST"
echo ""
echo "NOW DO THIS — non-negotiable:"
echo "   1. Drop the .keystore file into 1Password (attachment) tagged fatehhr-keystore"
echo "   2. Also copy it to an encrypted USB or second device"
echo "   3. Save both passwords in 1Password with the same tag"
echo ""
echo "If you lose the keystore, every existing installed APK can no longer be updated."
