#!/usr/bin/env python3
"""Patch android/app/build.gradle so values come from env vars at build time."""
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

# Inside `defaultConfig { ... }`, override applicationId + add resValues
default_config_injection = '''        applicationId System.getenv("APP_ID_ANDROID") ?: applicationId
        versionCode Integer.parseInt(System.getenv("NATIVE_VERSION_CODE") ?: "${versionCode}")
        versionName System.getenv("NATIVE_VERSION") ?: versionName
        resValue "string", "app_name", (System.getenv("CUSTOMER_BRAND_NAME") ?: "Fateh HR")
        resValue "color", "colorPrimary", (System.getenv("CUSTOMER_PRIMARY_COLOR") ?: "#2E5D5A")
'''

src = re.sub(
    r'(defaultConfig\s*\{)',
    r'\1\n' + default_config_injection,
    src,
    count=1,
)

# Add signingConfigs + release buildType signing before the closing `}` of `android { ... }`
signing_block = '''
    signingConfigs {
        release {
            def ksPath = System.getenv("FATEHHR_KEYSTORE_PATH") ?: "../../keystore/fatehhr-release.keystore"
            storeFile file(ksPath)
            storePassword System.getenv("FATEHHR_KEYSTORE_PW")
            keyAlias "fatehhr"
            keyPassword System.getenv("FATEHHR_KEY_PW")
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFiles('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
'''

# Find the last closing brace of the top-level android {} block
# Strategy: find "android {" then find matching close
depth = 0
i = src.find("android {")
if i < 0:
    print("Could not find 'android {' block", file=sys.stderr)
    sys.exit(1)
start = src.find("{", i)
j = start
depth = 1
while j < len(src) - 1 and depth > 0:
    j += 1
    if src[j] == "{":
        depth += 1
    elif src[j] == "}":
        depth -= 1

if depth != 0:
    print("Could not find matching close brace for 'android {'", file=sys.stderr)
    sys.exit(1)

# Insert signing_block right before that closing }
src = src[:j] + signing_block + src[j:]

open(path, "w").write(src)
print(f"patched {path}")
