# E2E regression tests

Runs against the deployed PWA at `https://hr-demo.enfonoerp.com/fatehhr`.
Playwright drives a headless Chromium through every ship-gate in each
phase's plan. Replaces the "curl + hope" shortcut that let the PIN-persist
bug slip through.

## Setup (one-time)

```bash
cd frontend/tests/e2e
pnpm install
pnpm exec playwright install chromium
```

## Run a phase's gates

```bash
# Reset the demo user's PIN on the server first (tests need a fresh state):
# (run via Server Manager API on AQRAR as v15)
# bench --site hr_demo execute ... to set custom_pin_hash=None on FHR-DEMO

node phase1.mjs
```

Exits non-zero on any gate failure. Each gate prints `✅` / `❌` with details.

## Convention

- One `phaseN.mjs` per phase. Gates match the "§12 verification gates" and
  the phase plan's "End-of-phase verification" task.
- Tests hit the **deployed** URL, not a local dev server — they validate
  what real users actually see, including the asset pipeline + CORS.
- When a bug is reported, add a named regression-guard gate BEFORE fixing,
  so the fix is provably tied to a test.
