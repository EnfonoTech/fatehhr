#!/usr/bin/env python3
"""Patch android/app/build.gradle so per-customer values come from env vars.

- defaultConfig is fully REPLACED (so Capacitor's hard-coded applicationId/
  versionCode/versionName below don't override our env lookups).
- signingConfigs.release: keystore from env, PKCS12-compatible.
- buildTypes.release: wires in the signingConfig.

Idempotent — running twice is safe.
"""
import re
import sys

if len(sys.argv) != 2:
    print("usage: _patch-build-gradle.py <path-to-build.gradle>", file=sys.stderr)
    sys.exit(1)

path = sys.argv[1]
src = open(path).read()

if "FATEHHR_KEYSTORE_PATH" in src:
    print("already patched")
    sys.exit(0)

# ---- 1) Replace the whole defaultConfig { ... } block ----
new_default = """    defaultConfig {
        applicationId System.getenv("APP_ID_ANDROID") ?: "com.enfono.fatehhr"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode Integer.parseInt(System.getenv("NATIVE_VERSION_CODE") ?: "1")
        versionName System.getenv("NATIVE_VERSION") ?: "1.0"
        resValue "string", "app_name", (System.getenv("CUSTOMER_BRAND_NAME") ?: "Fateh HR")
        resValue "color", "colorPrimary", (System.getenv("CUSTOMER_PRIMARY_COLOR") ?: "#2E5D5A")
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
            ignoreAssetsPattern '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }"""

start = src.find("    defaultConfig {")
if start < 0:
    print("Could not find `defaultConfig {` block", file=sys.stderr)
    sys.exit(1)
brace = src.find("{", start)
depth, j = 1, brace
while j < len(src) - 1 and depth > 0:
    j += 1
    if src[j] == "{":
        depth += 1
    elif src[j] == "}":
        depth -= 1
src = src[:start] + new_default + src[j + 1:]

# ---- 2) Inject signingConfigs before existing buildTypes ----
signing_block = """    signingConfigs {
        release {
            def ksPath = System.getenv("FATEHHR_KEYSTORE_PATH") ?: "../../keystore/fatehhr-release.keystore"
            storeFile file(ksPath)
            def pw = System.getenv("FATEHHR_KEYSTORE_PW")
            storePassword pw
            keyAlias "fatehhr"
            keyPassword pw
        }
    }

"""
src = re.sub(r"(    buildTypes\s*\{)", signing_block + r"\1", src, count=1)

# ---- 3) Wire signingConfig into buildTypes.release ----
src = re.sub(
    r"(buildTypes\s*\{\s*release\s*\{)",
    r"\1\n            signingConfig signingConfigs.release",
    src,
    count=1,
)

open(path, "w").write(src)
print(f"patched {path}")
