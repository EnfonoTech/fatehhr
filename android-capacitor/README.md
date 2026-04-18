# fatehhr — Android (Capacitor 6)

Thin wrapper around the `frontend/` Vue SPA, built for Play Store / sideload
distribution. One codebase, per-customer signed APK.

## Prerequisites (one-time on your Mac)

```bash
# JDK 17 (Capacitor 6 requires 17)
brew install openjdk@17
sudo ln -sfn "$(brew --prefix openjdk@17)/libexec/openjdk.jdk" /Library/Java/JavaVirtualMachines/openjdk-17.jdk

# Android SDK (command line only, no Studio required for builds)
brew install --cask android-commandlinetools
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

Set env vars (add to `~/.zshrc`):

```bash
export JAVA_HOME=/Library/Java/JavaVirtualMachines/openjdk-17.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

## First-time init (done by `scripts/first-time-android.sh`)

```bash
cd android-capacitor
pnpm install
npx cap add android      # creates android/ dir with Gradle project
```

## Per-customer build

```bash
# from repo root:
./scripts/build-customer.sh demo   # uses customers/.env.demo
# → dist/fatehhr-demo-<version>.apk
```

## Keystore

Generated once, reused for every release of every customer:

- `keystore/fatehhr-release.keystore` — **never committed**, `.gitignore`'d
- **Backed up to two locations** (1Password attachment + encrypted USB)
- Passwords stored in `.env.keystore` (local, never committed) OR
  passed as env vars `FATEHHR_KEYSTORE_PW` + `FATEHHR_KEY_PW`

See `scripts/generate-keystore.sh` for the one-time generation.

## Background sync (the PWA didn't have this — APK fixes issue #3)

Capacitor Network plugin fires events even when the web view is
backgrounded but the Android process is alive. `src/app/frappe.ts`
registers a listener that calls `sync.triggerDrain()` on `connectionChange`
→ queued check-ins / leave / expense land on the server without the user
opening the app.

## Version bumping

Every build bumps `NATIVE_VERSION` (web side) AND Android `versionCode`
(Gradle). The `scripts/bump-version.mjs` runner keeps both in lockstep —
see frappe-vue-pwa skill §5 commandment #15.
