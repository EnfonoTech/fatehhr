# Fateh HR — Visual Direction (v1)

**Date:** 2026-04-17
**Status:** Draft — awaiting approval
**Scope:** v1 visual language, color system, typography, component inventory,
key screen compositions. No code yet.

---

## 1. Aesthetic Direction: "Majlis"

Named after the Gulf tradition of the gathering space — a room built for
presence, calm authority, and everyday use. The app should feel like a
premium Gulf hotel concierge crossed with Linear / Things 3, not like a
Frappe admin panel or a generic enterprise SaaS.

### The one thing people remember

**An Arabic-first editorial surface** — warm paper-colored canvas,
confident serif display type for moments of weight (hero numbers, screen
titles), and a quiet **khatam** (eight-point star) geometric motif used
as splash backdrop, empty-state canvas, and the "fully synced" mark.
Every customer's brand color lands on the same considered canvas, so the
app always looks resolved regardless of the accent plugged in.

### Why this for HR

- HR tools are daily, personal, intimate — **warm** beats **cold**.
- Gulf users have been served "Latin-first, Arabic-bolted-on" for a
  decade; an Arabic-first layout is immediately distinctive.
- Warm neutrals are a forgiving canvas for any `CUSTOMER_PRIMARY_COLOR`
  without re-tuning the palette per customer.
- The editorial serif signals "this is about you" (not "this is a form").

### What we explicitly avoid

- Purple gradients on white.
- Inter / Roboto / SF default pairings.
- Flat enterprise "Material" cards on a neutral gray.
- Neon semantic colors.
- Illustration library mascots.
- Skeuomorphic "paper" or glassmorphism.

---

## 2. Color System

Two layers: a **fixed neutral base** that doesn't change per customer,
and a **per-customer accent** that drives every call-to-action.

### 2.1 Neutral canvas (locked across customers)

Warm, slightly yellow-tinted to read as paper, not plastic.

| Token               | Light              | Dark               | Role                               |
|---------------------|--------------------|--------------------|------------------------------------|
| `--bg-canvas`       | `#FAF7F2` bone     | `#12100E` ember    | App background                     |
| `--bg-surface`      | `#FFFFFF` paper    | `#1C1916` slate    | Cards, sheets                      |
| `--bg-sunk`         | `#F3EEE5` sand     | `#0C0A08` pit      | Inputs, sunken areas               |
| `--ink-primary`     | `#1A1714` charcoal | `#F2EBE1` bone     | Headings, body                     |
| `--ink-secondary`   | `#6B615A` dusk     | `#8F857A` mist     | Labels, meta                       |
| `--ink-tertiary`    | `#A49A90`          | `#5E554D`          | Placeholder, disabled              |
| `--hairline`        | `#E5DED2`          | `#2A2521`          | Borders, dividers                  |
| `--hairline-strong` | `#D3CABD`          | `#3A342E`          | Focus hairlines, tab underlines    |

### 2.2 Per-customer accent (driven by `CUSTOMER_PRIMARY_COLOR`)

One env variable → five derived tokens at build time (HSL manipulation
in CSS via `color-mix`, or pre-computed in Vite plugin):

| Token               | Derivation                         | Role                          |
|---------------------|------------------------------------|-------------------------------|
| `--accent`          | raw `CUSTOMER_PRIMARY_COLOR`       | Primary buttons, active nav   |
| `--accent-strong`   | `color-mix(accent, black 12%)`     | Hover, pressed                |
| `--accent-soft`     | `color-mix(accent, canvas 88%)`    | Selection, chip backgrounds   |
| `--accent-ink`      | auto contrast (WCAG-tested)        | Text/icon on `--accent`       |
| `--accent-ring`     | `accent` at 28% alpha              | Focus ring                    |

**Contract:** accent is the ONLY brand color surface. We do not paint
backgrounds with it. It appears on: primary buttons, active nav pill,
active segmented-control, focus rings, selected calendar day, streak
marks, status-bar theme-color.

### 2.3 Semantic (locked)

Warm-tuned — never pure neon. Used sparingly, always paired with text.

| Token               | Hex         | Usage                             |
|---------------------|-------------|-----------------------------------|
| `--success`         | `#3D7A58`   | Approved, checked-in, paid        |
| `--success-soft`    | `#E8F1EB`   | Success chip bg                   |
| `--warning`         | `#B4802B`   | Pending, half-day, flagged        |
| `--warning-soft`    | `#F5ECD8`   | Warning chip bg                   |
| `--danger`          | `#B84B3E`   | Rejected, errors, queue failures  |
| `--danger-soft`     | `#F5E3DF`   | Danger chip bg                    |
| `--info`            | `#4D6E8E`   | On-leave, informational           |
| `--info-soft`       | `#E4EBF2`   | Info chip bg                      |

### 2.4 Attendance calendar state palette

Calendar cells use dedicated tokens, not the semantic palette directly —
so the customer accent never collides with "present" green.

| State     | Light bg       | Dark bg       | Label ink       |
|-----------|----------------|---------------|-----------------|
| Present   | `#D8E8DE`      | `#2B4236`     | `--success`     |
| Absent    | `#F2DBD6`      | `#4A2C26`     | `--danger`      |
| Half Day  | `#F2E4C7`      | `#4A3E21`     | `--warning`     |
| On Leave  | `#D8E0EA`      | `#2B3842`     | `--info`        |
| Holiday   | `--hairline`   | `--hairline`  | `--ink-tertiary`|
| Weekend   | `--bg-sunk`    | `--bg-sunk`   | `--ink-tertiary`|

---

## 3. Typography

### 3.1 Families

All open source, all with CJK/Arabic/Latin metrics-matched siblings so
RTL switching never introduces visual jolt.

| Role            | Family                      | Fallback                  |
|-----------------|-----------------------------|---------------------------|
| Display (Latin) | **Fraunces Variable**       | Georgia, serif            |
| Display (Arabic)| **29LT Bukra** or **Readex Pro** | Tahoma, sans-serif   |
| UI / Body (Latin) | **IBM Plex Sans**         | -apple-system             |
| UI / Body (Arabic)| **IBM Plex Sans Arabic**  | Tahoma                    |
| Tabular / Mono  | **IBM Plex Mono**           | ui-monospace, Menlo       |

**Locale rules:**
- In Arabic locale, body/UI fall through to Arabic siblings first.
- Fraunces only used for screen titles and hero numerics; in Arabic, use
  Readex Pro at its heaviest weight with optical-sizing.
- Never mix Latin and Arabic in one run if avoidable. Use `lang="ar"`
  spans so the font stack kicks in correctly.

### 3.2 Scale (4px base)

| Token         | Latin               | Arabic              | Usage                    |
|---------------|---------------------|---------------------|--------------------------|
| `display-xl`  | Fraunces 48/52 -2%  | Readex 44/52        | Payslip net pay, balance |
| `display-lg`  | Fraunces 32/40 -1%  | Readex 30/40        | Screen hero title        |
| `display-md`  | Fraunces 24/32      | Readex 22/32        | Section hero             |
| `title-lg`    | Plex 20/28 +0%      | Plex Ar 20/30       | Card title, dialog head  |
| `title-md`    | Plex 17/24 medium   | Plex Ar 17/26       | List row primary         |
| `body`        | Plex 15/22          | Plex Ar 15/24       | Body copy                |
| `label`       | Plex 13/18 +2% upper| Plex Ar 13/20       | Meta, captions           |
| `micro`       | Plex 11/16 +6% upper| Plex Ar 11/18       | Sync bar, badges, stamps |
| `num-lg`      | Plex Mono 28/32     | —                   | Hours logged, amounts    |
| `num-md`      | Plex Mono 17/22     | —                   | List trailing values     |

Micro and label tiers use mild letterspacing in Latin to match the
editorial character without looking trendy.

### 3.3 Arabic-first layout rules

- `dir="rtl"` set on `<html>` when `locale === 'ar'`.
- Mirror: navigation chevrons, back arrows, progress indicators.
- Do NOT mirror: clocks, phone icons, map pins, play/pause buttons,
  media controls, checkmarks.
- Numerals: Western Arabic (0-9) by default for data — Gulf business
  reality. Offer Eastern Arabic-Indic (٠-٩) as a user preference in
  Settings, not a locale default.
- Dates: Gregorian primary, Hijri secondary (small line under primary on
  attendance calendar).

---

## 4. Spacing, Radius, Elevation

**Base unit:** 4px. **Scale:** 4, 8, 12, 16, 20, 24, 32, 48, 64, 96.
Mobile screen gutter is 20px — not 16 (too dense), not 24 (too airy).

**Radius:**

| Token     | Value    | Use                              |
|-----------|----------|----------------------------------|
| `--r-sm`  | 6px      | Inputs, chips                    |
| `--r-md`  | 10px     | Buttons, list rows with bg       |
| `--r-lg`  | 14px     | Cards, sheets                    |
| `--r-xl`  | 22px     | Hero cards, sync bar             |
| `--r-full`| 9999px   | Avatars, FAB, pill badges        |

**Elevation** — always hairline + soft shadow, never naked shadow:

| Token     | Box-shadow                                                                    |
|-----------|-------------------------------------------------------------------------------|
| `--e-0`   | `inset 0 0 0 1px var(--hairline)`                                             |
| `--e-1`   | `0 1px 2px rgba(26,23,20,.04), 0 0 0 1px var(--hairline)`                     |
| `--e-2`   | `0 4px 14px rgba(26,23,20,.06), 0 0 0 1px var(--hairline)`                    |
| `--e-3`   | `0 14px 36px rgba(26,23,20,.08), 0 0 0 1px var(--hairline)`                   |

---

## 5. Motion

Restraint over bounce. iOS-feeling timing, no spring overshoot.

| Token            | Duration | Curve                              | Use                        |
|------------------|----------|------------------------------------|----------------------------|
| `--m-micro`      | 140ms    | `cubic-bezier(.2, 0, 0, 1)`        | Button press, toggle       |
| `--m-base`       | 240ms    | `cubic-bezier(.2, .8, .2, 1)`      | Card in, sheet in          |
| `--m-page`       | 320ms    | `cubic-bezier(.2, .8, .2, 1)`      | Route transitions          |
| `--m-drain`      | 3s loop  | `ease-in-out`                      | Sync bar draining pulse    |

**Haptics (Capacitor Haptics plugin):**
- `impact.light` — toggle, check tap
- `impact.medium` — check-in succeeds, timer start/stop
- `impact.heavy` — approve / reject submitted
- `notification.success` — queue fully drained
- `notification.error` — sync error recorded

**Staggered reveals:** dashboard cards cascade in with 40ms stagger on
first paint. One shot only — not on every mount.

---

## 6. The Khatam Motif (signature element)

An eight-point star line drawing (khatam), stroke-only, used as a
subtle signature across the app. Universally legible as "Gulf" without
religious association.

**Appearances:**
1. Splash screen backdrop, `--hairline` at 40% opacity, 480px, centered.
2. Login/PIN backdrop, same treatment.
3. "Fully synced" sync-bar icon (12×12, replaces the spinner).
4. Empty states (e.g., "No announcements yet") — single 64px mark
   centered above copy.
5. Settings → About screen, 120px hero mark.
6. The app's adaptive icon background composition (not the foreground).

Never used: in dense UI chrome, on accent backgrounds, or large enough
to dominate. One mark per screen maximum.

---

## 7. Component Inventory

Twenty core components. Each inherits tokens above. Restyled from
Damage PWA conventions where noted (skill §4.7 for PhotoSlot behavior).

### 7.1 Structure

1. **TopAppBar** — transparent over content, translucent frosted on
   scroll, screen title in `display-md` (Fraunces/Readex), left back
   affordance, right overflow.
2. **SyncBar** — full-width, under app bar. Four states:
   - `SYNCED 2 MIN AGO` — `--success` khatam icon, `--ink-secondary`.
   - `3 CHANGES PENDING · TAP TO SYNC` — `--accent-soft` bg.
   - `SYNCING…` — draining pulse animation.
   - `OFFLINE — WORKING LOCALLY` — `--warning` outline.
   Reuses Damage PWA `SyncBar` state machine, restyled.
3. **BottomNav** — 5 slots: Home / Attendance / Leave / Tasks / More.
   Active: icon fills + `--accent-soft` pill behind, label bolds. Safe
   area inset padded. Icons from Phosphor Duotone (custom pair of duotone
   fills for active/inactive).
4. **BottomSheet** — sheets for filters, pickers, destructive confirms.
   Rounded top `--r-xl`. Drag handle (36×4 pill, `--hairline-strong`).
5. **EmptyState** — khatam mark + title + body + optional button.

### 7.2 Surfaces

6. **Card** — `--bg-surface`, `--e-1`, `--r-lg`, 16px padding.
7. **HeroCard** — `--bg-surface`, `--e-2`, `--r-xl`, 24px padding. Used
   on dashboard for "Today's status" and "Leave balance."
8. **ListRow** — 56px min height (≥44 tap area), leading icon (24×24)
   OR avatar (36×36), primary `title-md`, secondary `label`, trailing
   chevron or `num-md`. Hairline divider unless last.

### 7.3 Controls

9. **Button.Primary** — `--accent` fill, `--accent-ink` label,
   `--r-md`, 48px height, `title-md`. Pressed: `--accent-strong`.
10. **Button.Secondary** — `--ink-primary` outline (1.5px), transparent
    bg. Pressed: `--bg-sunk`.
11. **Button.Ghost** — no border, `--ink-primary` label. Used for
    "Cancel", "Later".
12. **Button.Destructive** — `--danger` outline, `--danger` label.
    Pressed: `--danger-soft` bg.
13. **FAB** — 56px, `--accent` fill, `--e-3`, positioned bottom-right
    20px from edge (24px from bottom safe area). Single on-screen max.
14. **Input** — `--bg-sunk` fill, no border on idle, `--accent-ring`
    2px focus ring (outside), `--r-md`, 48px, label floats above.
15. **SegmentedControl** — `--bg-sunk` track, active cell `--bg-surface`
    with `--e-1`, `--r-md`. Used for calendar month view / list toggle,
    history filters.
16. **Chip** — `--r-full`, used for status badges and filter selections.
    Status variants: draft (neutral), pending (warning), approved
    (success), rejected (danger), paid (success with dot).
17. **DateRangePicker** — bottom sheet, two-month calendar, big tap
    targets, preset chips ("This month", "Last month").
18. **Switch** — iOS-style, track `--hairline-strong` off, `--accent` on.

### 7.4 Data

19. **AmountDisplay** — `num-lg` amount + `label` currency code tucked
    to the right with 8px baseline offset. E.g., `2,430.50 SAR`.
20. **PhotoSlot** — 3:4 aspect, `--bg-sunk`, dashed `--hairline-strong`
    when empty, crisp thumbnail when filled. Overlay: remove (×) top-right,
    retry-upload if errored, preview tap-through to full. Auto-clears
    slot when `photo:<id>` blob is missing (skill §4.7).
21. **MapPreview** — 16:9 Leaflet thumbnail, `--r-lg`, hairline overlay,
    pin in `--accent`, tap expands to full-screen map sheet.

### 7.5 Feedback

22. **SkeletonBlock** — soft 2-color pulse (not shimmer), matches
    component geometry, `--bg-sunk` ↔ `--hairline`. 1.4s duration.
23. **Toast** — bottom-centered above nav, `--bg-surface`, `--e-3`,
    dismisses in 3s. Icon + message, optional action.
24. **SyncErrorRow** — list row with `--danger` icon, `title-md` error
    reason, trailing "Retry" ghost button.

### 7.6 Manager/approval

25. **ApprovalSwipeCard** — list row with swipeable actions: swipe-left
    rejects (danger track), swipe-right approves (success track). Tap
    opens detail sheet. Haptic on action trigger.

---

## 8. Key Screen Compositions

Brief narratives. Full Figma-equivalent mockups to follow in a
dedicated pass after approval.

### 8.1 Login / PIN

- **Email + password (first login):** Khatam backdrop, logo 40px top,
  `display-md` greeting ("Welcome to {CUSTOMER_BRAND_NAME}"), two
  inputs, primary button "Continue", ghost "Forgot password?". Arabic
  locale toggle bottom-right as text link.
- **PIN (returning):** 4–6 dot indicator, large numeric keypad
  (circular buttons, 72×72, `--bg-surface`, `--e-1`), backspace,
  biometric CTA placeholder (disabled in v1). Subtle khatam backdrop.

### 8.2 Dashboard

Staggered reveal on first mount:
1. **Greeting strip** — `display-md` "Good morning, {name}" +
   current date (Gregorian + Hijri micro line below).
2. **HeroCard: Today** — check-in/out status (big pill), work hours
   accumulated today (`num-lg`), primary CTA "Check In" or "Check
   Out" filling the card's lower half.
3. **Row of 2 chips:** Leave balance peek (trailing count), Pending
   approvals badge (manager only, conditional).
4. **Quick actions grid (2×2):** Apply Leave, Add Expense, Start
   Timer, Announcements (unread count dot).
5. **Latest announcement card** — condensed.
6. **Bottom safe-area + FAB** (quick check-in shortcut).

### 8.3 Attendance Check-in / Check-out

- Map preview hero (16:9), pin in `--accent`, reverse-geocoded address
  label underneath.
- Geofence state callout: green "Within {Office Name}" or amber
  "Outside office radius — check-in disabled" (if geofence on).
- Optional selfie PhotoSlot below.
- Primary button: "Check In" (or "Check Out" if already in).
- History list below: grouped by day; each row has time, location
  name, tiny inline map thumb (32×32 rounded), status chip.

### 8.4 Attendance Calendar

- Month header with segmented control (List / Calendar), left/right
  swipe navigation; today ringed in `--accent`.
- Calendar cell: 40px, state-colored bg per §2.4, Hijri subscript
  micro if enabled.
- Tap a day → bottom sheet: check-in/out times, hours, shift,
  discrepancy note if any.
- Summary strip at bottom: Present / Absent / Leaves / Total hours,
  each `num-md` with `label`.

### 8.5 Leave Application

- Segmented control: Apply / My Leaves.
- Apply form:
  - Leave type picker (bottom sheet, live balance per type beside name).
  - Date range picker (inline calendar, preset chips).
  - Half Day switch.
  - Reason textarea.
  - Attachment photo slot (optional).
  - Live balance widget (card, `num-lg` remaining days, breakdown).
  - Submit → primary button, shows "Pending sync" inline toast if offline.
- My Leaves: list of status-chipped rows, tap for detail sheet, cancel
  button for pending.

### 8.6 Leave Approvals (manager)

- Tab chip at top: Pending / All.
- List of `ApprovalSwipeCard`s. Avatar + name + date range + leave
  type chip + reason one-liner.
- Detail sheet on tap: full reason, attachments, approve/reject with
  comment textarea. Approve/reject also accessible via swipe.

### 8.7 Expense Claim

- Multi-line form. Each line card: expense type picker, date, amount
  input with currency chip, description, **required** PhotoSlot
  (receipt).
- Add line button (ghost).
- Totals card at bottom: sum amount (`num-lg`), currency.
- Submit primary. Claim list below (Draft / Submitted / Approved /
  Paid / Rejected chips).
- Offline contract: ONE uploader per photo (skill §4.3). No
  fire-and-forget.

### 8.8 Payslip

- List: month/year rows, trailing net pay (`num-md`), status chip.
- Detail: hero `display-xl` net pay + currency. Earnings / Deductions
  / Tax / Net Pay breakdown cards, each a list of line items with
  `num-md` amounts. Download PDF / Share sheet buttons at bottom.
- Offline: last 3 months cached as blobs in IndexedDB.

### 8.9 To-Do & Tasks

- Group headers (projects) with count.
- Task card: title (`title-md`), priority dot (color by P1/P2/P3),
  due chip, elapsed today (`num-md`), big Start/Stop timer button.
- Running timer: card adopts `--accent-soft` bg, elapsed time lives
  in `num-lg` with subtle pulse. Stop writes timesheet detail +
  checkout.
- Daily/weekly view toggle (segmented control).

### 8.10 Announcements

- Pinned pins at top (list w/ pin icon leading).
- Recent feed: thumb (optional) + title + first line + date micro.
- Tap → full article sheet, rich text, unread→read state on view.

### 8.11 Profile & Settings

- **Profile:** avatar 96px circle with optional edit overlay,
  `display-md` name, designation/department meta, employee ID chip,
  sections (Contact / Bank / Emergency) as expandable cards. Edit
  CTAs inline where allowed.
- **Settings:** grouped list — Security (Change PIN), Language
  (EN/AR), Appearance (Light/Dark/System), Sync (Force sync, Discard
  pending — destructive), About (Version). Logout bottom, destructive
  button, full width.

---

## 9. Accessibility (WCAG 2.1 AA)

- Text contrast: `--ink-primary` on `--bg-canvas` ≥ 12:1.
  `--ink-secondary` on `--bg-canvas` ≥ 4.8:1. All accent-ink pairings
  pre-tested by a build-time Vite plugin that fails the build if a
  customer color produces insufficient contrast.
- Tap targets ≥ 44×44 px.
- Focus ring on every interactive element: 2px `--accent-ring` offset
  2px. Visible on keyboard and switch-control nav.
- Reduced motion: respect `prefers-reduced-motion`. Stagger → instant,
  sync bar pulse → static icon.
- Screen readers: semantic headings, sync bar status uses `role="status"`
  polite, queue count has `aria-live="polite"` updates.
- Color is never the only channel. Status chips always have text label +
  icon, not just color.

---

## 10. Per-customer Theming — the one-line switch

A single env var set at `vite build` time:

```env
CUSTOMER_PRIMARY_COLOR=#2E5D5A
```

A Vite plugin (`fatehhr/vite-theme-plugin`) reads `CUSTOMER_*` vars and:

1. Computes the 5 derived accent tokens.
2. Validates contrast against `--accent-ink` candidates
   (auto-picks `#FFFFFF` or `--ink-primary`).
3. Injects resolved tokens into `:root` at build time.
4. Generates the Android adaptive icon + splash with the accent.
5. Writes `theme-color` meta for mobile browser chrome.
6. Writes `manifest.json` (name, short_name, colors).

Nothing else in the codebase references raw customer values.

---

## 11. Open Questions (for approval discussion)

1. **Icon pack** — Phosphor Duotone proposed. Alternatives: Lucide
   (more generic), custom drawn (highest brand lift, most effort).
   Recommend: Phosphor Duotone with a custom-drawn bottom-nav set (5
   icons only). Low cost, high distinctiveness.
2. **Arabic display font** — 29LT Bukra has a commercial license.
   **Readex Pro** (Google Fonts, SIL OFL) is a strong free alternative
   and is what I'd ship unless licensing is sorted. Calling out so you
   can veto.
3. **Numeric system default** — recommending Western Arabic (0-9) even
   in Arabic locale, with Eastern Arabic-Indic as a Setting. Gulf
   business reality leans Western. Flag if wrong.
4. **Dark mode first paint** — locale + color scheme read from system
   only on first launch; persists after user overrides in Settings.
5. **The khatam motif** — if any customer has a reason not to ship
   Islamic-geometry imagery (e.g., a non-Gulf deployment), we need a
   fallback motif. Recommend: a generic diamond-lattice fallback that
   activates when a `CUSTOMER_MOTIF=neutral` env var is set.

---

## 12. What this document does NOT commit to

- No implementation. No code. No component library structure. No
  Vue single-file component scaffolds. Those belong in the
  `superpowers:writing-plans` output that follows.
- No pixel-perfect mockup exports. Mockup pass happens after you
  approve direction; optional if the plan's first tasks scope a
  vertical-slice prototype.

**Next step after approval:** `superpowers:brainstorming` to
challenge v1 scope (per-user prompt: task-timer→checkin linkage,
geofencing, and push notifications — in v1 or v1.1?).
