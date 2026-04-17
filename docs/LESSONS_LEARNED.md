# Lessons Learned

## Source of truth: `frappe-vue-pwa` skill

Every architectural rule for this codebase lives in the
`frappe-vue-pwa` skill:

- §3.3 `platform.ts` shape — `isNative()` + `API_BASE()`
- §3.4 Static imports of `@capacitor/*`
- §3.5 `doc.get_password()` + stable `api_secret` reuse (never regenerate per call)
- §3.6 `ensure_capacitor_cors()` via `after_migrate`
- §3.7 Router — `createWebHashHistory()` on native, `createWebHistory("/fatehhr/")` on web
- §4.1–§4.8 Sync engine: online = synchronous, queue = offline-only;
  `saveItem` dedups, `effectiveImages` threads through; ONE photo
  uploader; drain never sends `client_modified`; `flagOrphans` marks
  rather than deletes; `PhotoSlot` auto-clears missing blobs;
  absolute URLs on native
- §5 Commandments, especially #15 (bump `versionCode` AND
  `NATIVE_VERSION` every build) and #17 (fresh keystore backed up
  twice)
- §6 Forensic debug loop — always check server state and Frappe
  Error Log before a client-side fix

When a rule conflicts with what seems obvious, the skill wins.

## Phase 1 notes (2026-04-18)

- CORS in Frappe v15 is **not** on System Settings — it's in
  `site_config.json` under key `allow_cors`. `ensure_capacitor_cors()`
  writes there, not to a DocType.
- Module name in `modules.txt` is `Fatehhr` (single token), so the
  module directory is `fatehhr/fatehhr/fatehhr/`. All fixtures use
  `"module": "Fatehhr"`.
- `bench new-app` on the GS DEV bench failed its final `bench build`
  step because of an unrelated broken app (`management_reports`) on
  that shared bench. The scaffold itself was produced fine; we
  ignored the build failure and moved on.
- GS DEV's bench has a `custom` app whose Python package name is
  `develop`. Frappe tries to `import custom` during every
  `frappe.init()`. We fixed it once by symlinking the venv
  site-package:
  `ln -sf /home/v15/frappe-bench/apps/custom/develop /home/v15/frappe-bench/env/lib/python3.10/site-packages/custom`.
  This is a workaround for the shared dev bench — our production
  benches will not have this problem.
- Offline PIN verification (§5.5) uses a **separate** client-side
  hash (sha256 of `${api_secret}:${pin}`) stored in SecureStorage /
  localStorage. The server's hash is never exposed to the client.
