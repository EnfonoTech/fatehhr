# Handoff — Fateh HR

**From session:** 2026-08-05 (runtime server switching + icon + docs)
**Branch:** `develop` @ `fec2509` (pushed)
**Next focus:** signed release APK · rotate leaked AGENT_SECRET · two known defects · cooperheat demo site

---

## Goal of next session

1. **Rotate the leaked `AGENT_SECRET`** — highest priority, it is in git history.
2. Ship a **signed release** APK (current hosted build is debug-signed).
3. Close two known defects (below).
4. Decide whether Cooperheat gets its own demo site.

---

## State of play

**Done (all pushed, all verified live):**
- Runtime server switching — design + rules in `docs/AGENT_HANDOFF.md` §4.5
- `hr_demo` deployed and verified: `fatehhr.api.auth.site_info` 200, CORS OK for
  `https://localhost`, all 11 AQRAR co-tenants match their pre-deploy baseline
- APK **1.0.39** (versionCode 40) hosted, md5-verified end-to-end
- hr-demo settled as the **Fateh HR** demo; `cooperheat-demo` slug deleted
- Docs: new `docs/USER_GUIDE.md`; `README.md` + `docs/AGENT_HANDOFF.md` refreshed
- agentsync enabled here (`agentsync init` + `sync`)

**Blocking / not done:**
- **Signed release APK** — needs `FATEHHR_KEYSTORE_PW` + `FATEHHR_KEY_PW`. Only Sayanth
  can supply these; the agent must not handle them. Recipe: `AGENT_HANDOFF.md` §4.2.
- **Backend tests never executed** — no bench locally. `fatehhr/api/test_auth.py`:
  `bench --site hr_demo run-tests --app fatehhr --module fatehhr.api.test_auth`
- `graphify` step of `agentsync sync` fails rc=1 (claude-cli backend, first build).
  Non-fatal, old graph restored — same as the HBRC repo. Not investigated.

**Known defects (both have spawned task chips):**
- `fatehhr/__init__.py` is `__version__ = "0.1.0"` while the app ships **1.0.39**. So
  `site_info` and `version_compat` both report 0.1.0 — "what version are you on" is
  useless during support.
- `frontend/src/views/LeaveHubView.vue:59` and `LeaveListView.vue:35` gate destructive
  actions on `window.confirm`, which the **Android WebView silently drops** — those
  cancel buttons do nothing on the APK. `SyncErrorsView.vue:18` documents the two-tap
  pattern to use instead.

---

## Open decisions

1. **Cooperheat demo site.** `cooperheat-demo` was removed to enforce one-slug-per-site.
   Cooperheat proper is untouched on `cooperheat.enfonoerp.com`. *Lean:* give it its own
   domain if a demo is still wanted; do not re-point hr-demo.
2. **Approvals on hr-demo.** Now **off** — `.env.demo` sets
   `CUSTOMER_APPROVALS_ENABLED=false`. Backend + workflow are still installed.
   *Lean:* leave off unless Sayanth wants the approvals demo there.
3. **Server-agnostic APK.** A slug with `CUSTOMER_ERP_DOMAIN` empty gives an APK that
   asks for its server on first launch — the actual point of the feature. *Lean:* add a
   `generic` slug for client hand-outs.
4. **Release vs debug lineage.** Hosted builds since 1.0.35 are debug-signed. Switching
   to release forces an uninstall on every test device. *Lean:* switch at the next real
   client rollout, not mid-testing.

---

## Skills to use (next session)

- `enfono-servers` — **mandatory** before any server op; read `LIVE_STATE.md` first
  (top entries cover this session's deploy, the 417 finding, and the build toolchain)
- `frappe-vue-pwa` — commandments 21–25 + `references/runtime-site-switching.md`
- `frappe-erpnext-expert` — any DocType/hook/API work; use the brain MCP, don't guess
- `agentsync` — `sync` at session start/end

---

## Artifacts (reference only)

- **System docs:** `docs/AGENT_HANDOFF.md` (deploy pipeline, toolchain, gotchas 1–24)
- **User guide:** `docs/USER_GUIDE.md`
- **Lessons:** `docs/LESSONS_LEARNED.md`
- **Live state:** `~/.claude/skills/enfono-servers/LIVE_STATE.md` (top 2 entries = this session)
- **Commits:** `0d3b360` feature · `c716c48` slug/approvals fix · `c2e3ec7` hr-demo=Fateh HR · `fec2509` docs
- **PWA:** https://hr-demo.enfonoerp.com/fatehhr
- **APK:** https://hr-demo.enfonoerp.com/files/fatehhr-demo-1.0.39-debug.apk — **public to anyone with the link; delete when testing ends**
- **Server backups (AQRAR `185.193.19.184`):** `/root/fatehhr-*20260805T005200Z*` — pre-deploy app tarball, tracked-diff patch, untracked inventory, old SPA
- **Tests run:** `vue-tsc -b` clean · `vitest` 30/30 · full native build green
