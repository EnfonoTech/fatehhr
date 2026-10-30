#!/usr/bin/env bash
# Publish the native (APK) screens for live update: frontend/dist -> fatehhr/public/native/
#
# USAGE (right after a native build, e.g. scripts/build-customer.sh <slug>, so the APK and the
# published bundle are the same build):
#   bash scripts/publish-native-bundle.sh
#
# Frappe then serves /assets/fatehhr/native/manifest.json and /assets/fatehhr/native/<version>/...
# Installed APKs download a newer version and switch to it on their next start
# (frontend/src/app/live-update.ts). Only the two newest versions are kept. Commit + deploy after.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$REPO_ROOT/frontend/dist"
OUT="$REPO_ROOT/fatehhr/public/native"

[[ -f "$DIST/bundle-version.txt" ]] || { echo "no bundle-version.txt in $DIST: build first" >&2; exit 1; }
[[ ! -f "$DIST/sw.js" ]] || grep -q "unregister" "$DIST/sw.js" || { echo "$DIST is not a native build (live service worker)" >&2; exit 1; }
grep -q 'src="./assets/index-' "$DIST/index.html" || { echo "$DIST is a web build, not native" >&2; exit 1; }

VERSION="$(cat "$DIST/bundle-version.txt")"
mkdir -p "$OUT"
rm -rf "$OUT/$VERSION"
cp -R "$DIST" "$OUT/$VERSION"

python3 - "$OUT" "$VERSION" <<'EOF'
import json, os, sys
out, version = sys.argv[1], sys.argv[2]
root = os.path.join(out, version)
files = []
for d, _, names in os.walk(root):
    for n in names:
        p = os.path.join(d, n)
        files.append({"path": os.path.relpath(p, root).replace(os.sep, "/"), "size": os.path.getsize(p)})
files.sort(key=lambda f: f["path"])
with open(os.path.join(out, "manifest.json"), "w") as f:
    json.dump({"version": version, "files": files}, f, indent=1)
# keep the two newest versions (a phone may be half-way through the previous one)
versions = sorted((v for v in os.listdir(out) if v.isdigit()), key=int)
for old in versions[:-2]:
    import shutil
    shutil.rmtree(os.path.join(out, old))
print(f"published {version}: {len(files)} files")
EOF
