# Fateh HR — Phase 2: Offline Engine + Check-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the hardened offline sync engine (queue + drain + ONE photo uploader + orphan detection) and the field-team Check-in / Check-out feature end-to-end: tap → capture GPS + address + optional selfie → record Employee Checkin with task link + geofence flag. Offline → queue. Online → direct. Drain → idempotent. Brief §12 verification gates rows 1–2 pass.

**Architecture:** Follow the `frappe-vue-pwa` skill §4 to the letter. `offline/db.ts` bootstraps `idb` with versioned migrations, four object stores (`queue`, `photos`, `cache`, `meta`). `offline/queue.ts` exposes `saveItem(kind, logicalKey, payload, effectiveImages)` with `(kind, logicalKey)` dedup. `offline/drain.ts` iterates queue in insertion order, skips pending prerequisites (for paired ops in later phases), calls `processors[kind]`, sets `lastError` on failure, deletes only when the server accepted the op or `isUnrecoverable(error)` returns true (narrow regex). `offline/photos.ts` is the **ONE uploader** — identical code path whether the op originated online or in drain. `components/PhotoSlot.vue` watches the `photos` store and auto-clears when the blob is missing. `components/SyncBar.vue` renders four states reading from `stores/sync.ts`. Backend adds `fatehhr.api.checkin.create` + `list`, custom fields on Employee Checkin + Task, a `geofence` helper (haversine), and `fatehhr.api.util.reverse_geocode` (server-proxied OSM Nominatim with Redis cache).

**Tech Stack:** `idb` v8 (frontend), Leaflet.js + OSM tiles (web map), `@capacitor/geolocation`, `@capacitor/camera`, `@capacitor/haptics` (native); Nominatim (server-proxied); Redis (Frappe cache backend).

**Companion docs:**
- Visual direction: [`docs/superpowers/specs/2026-04-17-fatehhr-visual-direction.md`](../specs/2026-04-17-fatehhr-visual-direction.md)
- v1 design spec: [`docs/superpowers/specs/2026-04-18-fatehhr-v1-design.md`](../specs/2026-04-18-fatehhr-v1-design.md)
- Previous phase: [Phase 1](./2026-04-18-fatehhr-phase1-foundation.md)

---

## File structure added in Phase 2

```
apps/fatehhr/fatehhr/
  api/
    checkin.py                  # create, list
    util.py                     # +reverse_geocode
  utils/
    geofence.py                 # haversine, classify(task, coords) → "inside"|"outside"|"unknown"|"disabled"
  fixtures/
    custom_field.json           # +6 Employee Checkin fields, +3 Task fields
  tests/
    test_geofence.py
    test_checkin.py
    test_reverse_geocode.py

frontend/
  src/
    offline/
      db.ts                     # idb bootstrap + migrations
      queue.ts                  # saveItem + dedup + effectiveImages
      drain.ts                  # drain engine (skill §4.5)
      photos.ts                 # capturePhoto + uploader (skill §4.3)
      orphans.ts                # flagOrphans (skill §4.6)
      processors/
        checkin.ts              # CheckinProcessor
    stores/
      sync.ts                   # queue count, lastSyncedAt, online/offline, isDraining
      checkin.ts                # today state, history page cache
    api/
      checkin.ts                # create, list
      util.ts                   # reverseGeocode
    components/
      SyncBar.vue
      PhotoSlot.vue
      MapPreview.vue
      BottomNav.vue
      Card.vue
      ListRow.vue
    views/
      CheckinView.vue
      CheckinHistoryView.vue
  tests/
    unit/
      queue.spec.ts
      drain.spec.ts
      photos.spec.ts
      photoslot.spec.ts
      geofence.spec.ts
```

---

## Tasks

### Task 1: Ship Employee Checkin + Task custom fields (fixtures)

**Files:**
- Modify: `apps/fatehhr/fatehhr/fixtures/custom_field.json`
- Modify: `apps/fatehhr/fatehhr/hooks.py`
- Create: `apps/fatehhr/fatehhr/tests/test_fixtures_p2.py`

- [ ] **Step 1: Write the failing test**

`apps/fatehhr/fatehhr/tests/test_fixtures_p2.py`:

```python
import frappe
import unittest


class TestP2Fixtures(unittest.TestCase):
    def test_checkin_has_custom_fields(self):
        meta = frappe.get_meta("Employee Checkin")
        for f in ("custom_latitude", "custom_longitude",
                  "custom_location_address", "custom_task",
                  "custom_selfie", "custom_geofence_status"):
            self.assertIsNotNone(meta.get_field(f), f"missing Employee Checkin.{f}")

    def test_checkin_geofence_status_options(self):
        f = frappe.get_meta("Employee Checkin").get_field("custom_geofence_status")
        self.assertEqual(f.fieldtype, "Select")
        opts = {o.strip() for o in (f.options or "").split("\n") if o.strip()}
        self.assertEqual(opts,
            {"inside", "outside", "unknown", "disabled"})

    def test_task_has_geofence_fields(self):
        meta = frappe.get_meta("Task")
        for f in ("custom_latitude", "custom_longitude", "custom_geofence_radius_m"):
            self.assertIsNotNone(meta.get_field(f), f"missing Task.{f}")
```

- [ ] **Step 2: Run — fail**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_fixtures_p2
```

- [ ] **Step 3: Append fields to `fixtures/custom_field.json`**

Append to the JSON array:

```json
[
  {"doctype":"Custom Field","name":"Employee Checkin-custom_latitude","dt":"Employee Checkin","fieldname":"custom_latitude","label":"Latitude","fieldtype":"Float","insert_after":"device_id","module":"Fatehhr","precision":"8"},
  {"doctype":"Custom Field","name":"Employee Checkin-custom_longitude","dt":"Employee Checkin","fieldname":"custom_longitude","label":"Longitude","fieldtype":"Float","insert_after":"custom_latitude","module":"Fatehhr","precision":"8"},
  {"doctype":"Custom Field","name":"Employee Checkin-custom_location_address","dt":"Employee Checkin","fieldname":"custom_location_address","label":"Location Address","fieldtype":"Small Text","insert_after":"custom_longitude","module":"Fatehhr"},
  {"doctype":"Custom Field","name":"Employee Checkin-custom_task","dt":"Employee Checkin","fieldname":"custom_task","label":"Task","fieldtype":"Link","options":"Task","insert_after":"custom_location_address","module":"Fatehhr"},
  {"doctype":"Custom Field","name":"Employee Checkin-custom_selfie","dt":"Employee Checkin","fieldname":"custom_selfie","label":"Selfie","fieldtype":"Attach Image","insert_after":"custom_task","module":"Fatehhr"},
  {"doctype":"Custom Field","name":"Employee Checkin-custom_geofence_status","dt":"Employee Checkin","fieldname":"custom_geofence_status","label":"Geofence Status","fieldtype":"Select","options":"disabled\ninside\noutside\nunknown","default":"disabled","insert_after":"custom_selfie","module":"Fatehhr"},

  {"doctype":"Custom Field","name":"Task-custom_latitude","dt":"Task","fieldname":"custom_latitude","label":"Latitude","fieldtype":"Float","insert_after":"project","module":"Fatehhr","precision":"8"},
  {"doctype":"Custom Field","name":"Task-custom_longitude","dt":"Task","fieldname":"custom_longitude","label":"Longitude","fieldtype":"Float","insert_after":"custom_latitude","module":"Fatehhr","precision":"8"},
  {"doctype":"Custom Field","name":"Task-custom_geofence_radius_m","dt":"Task","fieldname":"custom_geofence_radius_m","label":"Geofence Radius (m)","fieldtype":"Int","insert_after":"custom_longitude","module":"Fatehhr"}
]
```

(Remember to keep valid JSON — concatenate into the single array that already has the Employee fields.)

- [ ] **Step 4: Expand the hooks fixtures filter**

In `apps/fatehhr/fatehhr/hooks.py`, replace the `fixtures` list with:

```python
fixtures = [
    {"doctype": "Custom Field",
     "filters": [["dt", "in", ["Employee", "Employee Checkin", "Task"]],
                 ["module", "=", "Fatehhr"]]},
]
```

- [ ] **Step 5: Migrate + test**

```bash
bench --site fatehhr_dev migrate
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_fixtures_p2
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add fatehhr/fixtures/custom_field.json fatehhr/hooks.py fatehhr/tests/test_fixtures_p2.py
git commit -m "feat(fixtures): Employee Checkin + Task geofence + GPS fields"
git push
```

---

### Task 2: Implement `fatehhr.utils.geofence` — haversine + classify

**Files:**
- Create: `apps/fatehhr/fatehhr/utils/geofence.py`
- Create: `apps/fatehhr/fatehhr/tests/test_geofence.py`

- [ ] **Step 1: Write failing tests**

`apps/fatehhr/fatehhr/tests/test_geofence.py`:

```python
import unittest


class TestGeofence(unittest.TestCase):
    def test_haversine_zero_for_identical(self):
        from fatehhr.utils.geofence import haversine_m
        self.assertAlmostEqual(haversine_m(24.7136, 46.6753, 24.7136, 46.6753), 0, places=1)

    def test_haversine_roughly_correct_for_short_distance(self):
        from fatehhr.utils.geofence import haversine_m
        # ~111m north (0.001° latitude)
        d = haversine_m(24.7136, 46.6753, 24.7146, 46.6753)
        self.assertGreater(d, 100)
        self.assertLess(d, 115)

    def test_classify_disabled_when_task_lacks_coords(self):
        from fatehhr.utils.geofence import classify
        self.assertEqual(classify(None, None, None, 24.71, 46.67), "disabled")
        self.assertEqual(classify(24.71, 46.67, None, 24.71, 46.67), "disabled")
        self.assertEqual(classify(24.71, 46.67, 50, None, 46.67), "unknown")

    def test_classify_inside_outside(self):
        from fatehhr.utils.geofence import classify
        # Exact center → inside
        self.assertEqual(classify(24.7136, 46.6753, 50, 24.7136, 46.6753), "inside")
        # Far away → outside
        self.assertEqual(classify(24.7136, 46.6753, 50, 24.9000, 46.6753), "outside")
```

- [ ] **Step 2: Run — fail**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_geofence
```

- [ ] **Step 3: Implement `geofence.py`**

```python
import math
from typing import Optional

EARTH_M = 6_371_000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_M * c


def classify(
    task_lat: Optional[float],
    task_lng: Optional[float],
    task_radius_m: Optional[int],
    user_lat: Optional[float],
    user_lng: Optional[float],
) -> str:
    """Return "disabled" | "unknown" | "inside" | "outside"."""
    if task_lat is None or task_lng is None or not task_radius_m:
        return "disabled"
    if user_lat is None or user_lng is None:
        return "unknown"
    d = haversine_m(task_lat, task_lng, user_lat, user_lng)
    return "inside" if d <= float(task_radius_m) else "outside"
```

- [ ] **Step 4: Run — pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_geofence
```

- [ ] **Step 5: Commit**

```bash
git add fatehhr/utils/geofence.py fatehhr/tests/test_geofence.py
git commit -m "feat(utils): haversine + geofence classify"
git push
```

---

### Task 3: Implement `fatehhr.api.util.reverse_geocode` with Redis cache

**Files:**
- Modify: `apps/fatehhr/fatehhr/api/util.py`
- Create: `apps/fatehhr/fatehhr/tests/test_reverse_geocode.py`

- [ ] **Step 1: Write failing test (mocking Nominatim)**

`apps/fatehhr/fatehhr/tests/test_reverse_geocode.py`:

```python
import unittest
from unittest.mock import patch

import frappe


class TestReverseGeocode(unittest.TestCase):
    def setUp(self):
        frappe.cache().delete_keys("fatehhr:geocode:*")

    def _fake_nominatim(self, lat, lng):
        return {"display_name": f"Mock St. {lat:.5f},{lng:.5f}", "address": {"city": "Riyadh"}}

    def test_returns_display_name(self):
        from fatehhr.api.util import reverse_geocode
        with patch("fatehhr.api.util._fetch_nominatim", return_value=self._fake_nominatim(24.71, 46.67)):
            r = reverse_geocode(24.71, 46.67)
            self.assertIn("Mock St.", r["address"])

    def test_caches_on_rounded_coords(self):
        from fatehhr.api.util import reverse_geocode
        with patch("fatehhr.api.util._fetch_nominatim", return_value=self._fake_nominatim(24.71, 46.67)) as mock:
            reverse_geocode(24.71234567, 46.67123456)
            reverse_geocode(24.71234111, 46.67123999)  # rounds to same key
            self.assertEqual(mock.call_count, 1)
```

- [ ] **Step 2: Run — fail**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_reverse_geocode
```

- [ ] **Step 3: Implement**

Replace `apps/fatehhr/fatehhr/api/util.py` with:

```python
import frappe
import requests

MIN_CLIENT_VERSION = "1.0.0"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
CACHE_TTL_SEC = 60 * 60 * 24 * 7  # 7 days
CACHE_PRECISION = 5  # rounding decimals → ~1.1 m


@frappe.whitelist(allow_guest=True)
def version_compat(client_version: str = "0.0.0") -> dict:
    return {
        "min_client_version": MIN_CLIENT_VERSION,
        "server_app_version": _server_version(),
    }


@frappe.whitelist()
def reverse_geocode(lat: float, lng: float) -> dict:
    lat = float(lat)
    lng = float(lng)
    key = f"fatehhr:geocode:{round(lat, CACHE_PRECISION)}:{round(lng, CACHE_PRECISION)}"
    cached = frappe.cache().get_value(key)
    if cached:
        return cached

    try:
        data = _fetch_nominatim(lat, lng)
    except Exception as e:
        frappe.log_error(f"reverse_geocode failed: {e}", "fatehhr.reverse_geocode")
        return {"address": None, "raw": None}

    response = {
        "address": (data or {}).get("display_name"),
        "city": ((data or {}).get("address") or {}).get("city"),
        "raw": data,
    }
    frappe.cache().set_value(key, response, expires_in_sec=CACHE_TTL_SEC)
    return response


def _fetch_nominatim(lat: float, lng: float) -> dict:
    r = requests.get(
        NOMINATIM_URL,
        params={"lat": lat, "lon": lng, "format": "jsonv2", "zoom": 18},
        headers={"User-Agent": "FatehHR/1.0 (contact: dev@enfonotech.com)"},
        timeout=6,
    )
    r.raise_for_status()
    return r.json()


def _server_version() -> str:
    import fatehhr
    return getattr(fatehhr, "__version__", "0.0.0")
```

- [ ] **Step 4: Run — pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_reverse_geocode
```

- [ ] **Step 5: Commit**

```bash
git add fatehhr/api/util.py fatehhr/tests/test_reverse_geocode.py
git commit -m "feat(api): reverse_geocode proxy with 7-day Redis cache"
git push
```

---

### Task 4: Implement `fatehhr.api.checkin.create` + `list`

**Files:**
- Create: `apps/fatehhr/fatehhr/api/checkin.py`
- Create: `apps/fatehhr/fatehhr/tests/test_checkin.py`

- [ ] **Step 1: Write failing tests**

`apps/fatehhr/fatehhr/tests/test_checkin.py`:

```python
import frappe
import unittest

from fatehhr.tests.test_auth import _make_user, TEST_PASSWORD


def _ensure_employee(email):
    name = frappe.db.get_value("Employee", {"user_id": email}, "name")
    if not name:
        emp = frappe.get_doc({
            "doctype": "Employee",
            "first_name": "Check", "last_name": "In",
            "user_id": email, "status": "Active", "gender": "Male",
            "date_of_birth": "1990-01-01", "date_of_joining": "2020-01-01",
        }).insert(ignore_permissions=True)
        frappe.db.commit()
        return emp.name
    return name


def _ensure_task_with_geofence():
    task_name = "fatehhr-test-task"
    if frappe.db.exists("Task", task_name):
        frappe.delete_doc("Task", task_name, force=True)
    if not frappe.db.exists("Project", "fatehhr-test-proj"):
        frappe.get_doc({"doctype": "Project", "project_name": "fatehhr-test-proj"}).insert(ignore_permissions=True)
    return frappe.get_doc({
        "doctype": "Task",
        "subject": task_name,
        "project": "fatehhr-test-proj",
        "custom_latitude": 24.7136,
        "custom_longitude": 46.6753,
        "custom_geofence_radius_m": 50,
    }).insert(ignore_permissions=True).name


class TestCheckinCreate(unittest.TestCase):
    def setUp(self):
        self.user = _make_user("checkin-test@example.com")
        _ensure_employee(self.user.email)
        self.task = _ensure_task_with_geofence()
        frappe.set_user(self.user.email)

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_create_without_geofence_returns_disabled(self):
        from fatehhr.api.checkin import create
        r = create(log_type="IN", latitude=24.0, longitude=46.0, address="nowhere", timestamp=None)
        self.assertEqual(r["custom_geofence_status"], "disabled")

    def test_create_inside_geofence(self):
        from fatehhr.api.checkin import create
        r = create(log_type="IN", latitude=24.7136, longitude=46.6753,
                   address="task site", task=self.task, timestamp=None)
        self.assertEqual(r["custom_geofence_status"], "inside")
        self.assertEqual(r["custom_task"], self.task)

    def test_create_outside_geofence(self):
        from fatehhr.api.checkin import create
        r = create(log_type="IN", latitude=24.9, longitude=46.6753,
                   address="far", task=self.task, timestamp=None)
        self.assertEqual(r["custom_geofence_status"], "outside")

    def test_list_returns_my_checkins_only(self):
        from fatehhr.api.checkin import create, list as list_checkins
        create(log_type="IN", latitude=24.0, longitude=46.0, address=None, timestamp=None)
        rows = list_checkins(from_date=None, to_date=None, page=1, page_size=10)
        self.assertTrue(all(r["employee_user"] == self.user.email for r in rows))
```

- [ ] **Step 2: Run — fail**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_checkin
```

- [ ] **Step 3: Implement `checkin.py`**

```python
import frappe
from frappe.utils import now_datetime, get_datetime

from fatehhr.utils.geofence import classify


@frappe.whitelist()
def create(
    log_type: str,
    latitude: float | None = None,
    longitude: float | None = None,
    address: str | None = None,
    task: str | None = None,
    selfie_file_url: str | None = None,
    timestamp: str | None = None,  # ISO; NEVER used as client_modified (skill §4.5)
) -> dict:
    """Create an Employee Checkin (IN/OUT) with optional GPS + task + selfie."""
    if log_type not in ("IN", "OUT"):
        frappe.throw(frappe._("log_type must be IN or OUT"))

    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not employee:
        frappe.throw(frappe._("No Employee linked to this user."))

    # Geofence status
    t_lat = t_lng = t_rad = None
    if task:
        t_lat, t_lng, t_rad = frappe.db.get_value(
            "Task", task,
            ["custom_latitude", "custom_longitude", "custom_geofence_radius_m"],
        ) or (None, None, None)
    gf_status = classify(
        _f(t_lat), _f(t_lng), _i(t_rad), _f(latitude), _f(longitude)
    )

    ts = get_datetime(timestamp) if timestamp else now_datetime()
    doc = frappe.get_doc({
        "doctype": "Employee Checkin",
        "employee": employee,
        "log_type": log_type,
        "time": ts,
        "custom_latitude": _f(latitude),
        "custom_longitude": _f(longitude),
        "custom_location_address": address,
        "custom_task": task or None,
        "custom_selfie": selfie_file_url or None,
        "custom_geofence_status": gf_status,
    })
    doc.flags.ignore_permissions = False
    doc.insert()
    frappe.db.commit()

    return {
        "name": doc.name,
        "log_type": log_type,
        "time": ts.isoformat(),
        "custom_task": task,
        "custom_latitude": _f(latitude),
        "custom_longitude": _f(longitude),
        "custom_location_address": address,
        "custom_selfie": selfie_file_url,
        "custom_geofence_status": gf_status,
    }


@frappe.whitelist()
def list(
    from_date: str | None = None,
    to_date: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> list[dict]:
    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not employee:
        return []
    filters: dict = {"employee": employee}
    if from_date:
        filters["time"] = [">=", from_date]
    if from_date and to_date:
        filters["time"] = ["between", [from_date, to_date]]
    rows = frappe.get_all(
        "Employee Checkin",
        filters=filters,
        fields=[
            "name", "log_type", "time",
            "custom_task", "custom_latitude", "custom_longitude",
            "custom_location_address", "custom_selfie",
            "custom_geofence_status",
        ],
        order_by="time desc",
        start=max(0, (int(page) - 1)) * int(page_size),
        page_length=int(page_size),
    )
    # Attach user email for tests / audit
    for r in rows:
        r["employee_user"] = frappe.session.user
    return rows


def _f(v):
    try:
        return None if v in (None, "") else float(v)
    except (TypeError, ValueError):
        return None


def _i(v):
    try:
        return None if v in (None, "") else int(v)
    except (TypeError, ValueError):
        return None
```

- [ ] **Step 4: Run — pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_checkin
```

- [ ] **Step 5: Commit**

```bash
git add fatehhr/api/checkin.py fatehhr/tests/test_checkin.py
git commit -m "feat(api): checkin.create (with geofence) + checkin.list"
git push
```

---

### Task 5: Install `idb` + bootstrap `offline/db.ts`

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/offline/db.ts`
- Create: `frontend/tests/unit/db.spec.ts`

- [ ] **Step 1: Install packages**

```bash
cd frontend && pnpm add idb uuid && pnpm add -D @types/uuid
```

- [ ] **Step 2: Write the failing test**

`frontend/tests/unit/db.spec.ts`:

```typescript
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, STORE } from "@/offline/db";

describe("offline/db", () => {
  beforeEach(async () => {
    (globalThis as any).indexedDB = new (await import("fake-indexeddb/lib/FDBFactory")).default();
  });

  it("creates all four stores", async () => {
    const db = await openDb();
    expect(db.objectStoreNames.contains(STORE.queue)).toBe(true);
    expect(db.objectStoreNames.contains(STORE.photos)).toBe(true);
    expect(db.objectStoreNames.contains(STORE.cache)).toBe(true);
    expect(db.objectStoreNames.contains(STORE.meta)).toBe(true);
  });

  it("queue store has insertionOrder index", async () => {
    const db = await openDb();
    const tx = db.transaction(STORE.queue, "readonly");
    const idxNames = Array.from(tx.store.indexNames);
    expect(idxNames).toContain("insertionOrder");
  });
});
```

Add dev dep:

```bash
pnpm add -D fake-indexeddb
```

- [ ] **Step 3: Run — fail**

```bash
pnpm test
```

- [ ] **Step 4: Implement `db.ts`**

```typescript
import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "fatehhr";
export const DB_VERSION = 1;

export const STORE = {
  queue: "queue",
  photos: "photos",
  cache: "cache",
  meta: "meta",
} as const;

export interface QueueRecord {
  id: string;
  kind: string;
  logicalKey: string;
  payload: unknown;
  effectiveImages: string[];
  createdAt: string;
  insertionOrder: number;
  attempts: number;
  lastError?: { at: string; code: string; message: string };
}

export interface PhotoRecord {
  id: string;               // "photo:<uuid>"
  blob: Blob;
  mime: string;
  serverUrl?: string;       // set once uploaded
  createdAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

export function openDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const q = db.createObjectStore(STORE.queue, { keyPath: "id" });
          q.createIndex("insertionOrder", "insertionOrder");
          q.createIndex("kindLogical", ["kind", "logicalKey"], { unique: false });
          db.createObjectStore(STORE.photos, { keyPath: "id" });
          db.createObjectStore(STORE.cache);
          db.createObjectStore(STORE.meta);
        }
      },
    });
  }
  return dbPromise;
}

export async function resetDb() {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  await indexedDB.deleteDatabase(DB_NAME);
  dbPromise = null;
}
```

- [ ] **Step 5: Run — pass**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/offline/db.ts frontend/tests/unit/db.spec.ts
git commit -m "feat(offline): idb bootstrap with four stores"
```

---

### Task 6: Implement `offline/queue.ts` with `saveItem` (dedup + effectiveImages)

**Files:**
- Create: `frontend/src/offline/queue.ts`
- Create: `frontend/tests/unit/queue.spec.ts`

- [ ] **Step 1: Write failing tests**

`frontend/tests/unit/queue.spec.ts`:

```typescript
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "@/offline/db";
import { saveItem, listPending, removeEntry } from "@/offline/queue";

describe("offline/queue", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("appends an entry", async () => {
    await saveItem("checkin", "logical-1", { a: 1 }, []);
    const rows = await listPending();
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe("checkin");
  });

  it("dedups on (kind, logicalKey) — second save replaces first", async () => {
    await saveItem("checkin", "logical-1", { a: 1 }, []);
    await saveItem("checkin", "logical-1", { a: 2 }, ["photo:x"]);
    const rows = await listPending();
    expect(rows.length).toBe(1);
    expect((rows[0].payload as any).a).toBe(2);
    expect(rows[0].effectiveImages).toEqual(["photo:x"]);
  });

  it("keeps distinct logicalKeys separate", async () => {
    await saveItem("checkin", "a", {}, []);
    await saveItem("checkin", "b", {}, []);
    const rows = await listPending();
    expect(rows.length).toBe(2);
  });

  it("preserves insertion order", async () => {
    await saveItem("checkin", "a", {}, []);
    await saveItem("leave", "b", {}, []);
    const rows = await listPending();
    expect(rows[0].kind).toBe("checkin");
    expect(rows[1].kind).toBe("leave");
  });

  it("removeEntry deletes a queue row", async () => {
    await saveItem("checkin", "a", {}, []);
    const [row] = await listPending();
    await removeEntry(row.id);
    expect(await listPending()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
pnpm test
```

- [ ] **Step 3: Implement `queue.ts`**

```typescript
import { openDb, STORE, type QueueRecord } from "./db";
import { v4 as uuid } from "uuid";

export async function saveItem(
  kind: string,
  logicalKey: string,
  payload: unknown,
  effectiveImages: string[],
): Promise<QueueRecord> {
  const db = await openDb();
  const tx = db.transaction(STORE.queue, "readwrite");
  const index = tx.store.index("kindLogical");
  const existing = await index.get([kind, logicalKey]);
  const nowOrder = await nextInsertionOrder(db);
  const record: QueueRecord = {
    id: existing?.id ?? uuid(),
    kind,
    logicalKey,
    payload,
    effectiveImages: [...effectiveImages],
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    insertionOrder: existing?.insertionOrder ?? nowOrder,
    attempts: existing?.attempts ?? 0,
    lastError: undefined,
  };
  await tx.store.put(record);
  await tx.done;
  return record;
}

export async function listPending(): Promise<QueueRecord[]> {
  const db = await openDb();
  const rows = await db.getAllFromIndex(STORE.queue, "insertionOrder");
  return rows as QueueRecord[];
}

export async function countPending(): Promise<number> {
  const db = await openDb();
  return (await db.count(STORE.queue));
}

export async function setError(id: string, error: { code: string; message: string }): Promise<void> {
  const db = await openDb();
  const row = (await db.get(STORE.queue, id)) as QueueRecord | undefined;
  if (!row) return;
  row.attempts += 1;
  row.lastError = { at: new Date().toISOString(), ...error };
  await db.put(STORE.queue, row);
}

export async function removeEntry(id: string): Promise<void> {
  const db = await openDb();
  await db.delete(STORE.queue, id);
}

async function nextInsertionOrder(db: Awaited<ReturnType<typeof openDb>>): Promise<number> {
  const meta = await db.get(STORE.meta, "insertionCounter") as number | undefined;
  const next = (meta ?? 0) + 1;
  await db.put(STORE.meta, next, "insertionCounter");
  return next;
}
```

- [ ] **Step 4: Run — pass**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/offline/queue.ts frontend/tests/unit/queue.spec.ts
git commit -m "feat(offline): queue.saveItem with (kind,logicalKey) dedup"
```

---

### Task 7: Implement `offline/photos.ts` — the ONE uploader (skill §4.3)

**Files:**
- Create: `frontend/src/offline/photos.ts`
- Create: `frontend/tests/unit/photos.spec.ts`

- [ ] **Step 1: Write failing tests**

`frontend/tests/unit/photos.spec.ts`:

```typescript
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDb } from "@/offline/db";
import { savePhoto, getPhoto, uploadPhoto } from "@/offline/photos";

describe("offline/photos", () => {
  beforeEach(async () => await resetDb());

  it("savePhoto stores the blob and returns a photo id", async () => {
    const blob = new Blob(["abc"], { type: "image/jpeg" });
    const id = await savePhoto(blob, "image/jpeg");
    expect(id).toMatch(/^photo:/);
    const r = await getPhoto(id);
    expect(r?.blob).toBeDefined();
  });

  it("uploadPhoto uploads once; second call returns cached URL", async () => {
    const blob = new Blob(["abc"], { type: "image/jpeg" });
    const id = await savePhoto(blob, "image/jpeg");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        message: { file_url: "/files/abc.jpg" }
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const url1 = await uploadPhoto(id);
    const url2 = await uploadPhoto(id);
    expect(url1).toBe("/files/abc.jpg");
    expect(url2).toBe("/files/abc.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
pnpm test
```

- [ ] **Step 3: Implement `photos.ts`**

```typescript
import { openDb, STORE, type PhotoRecord } from "./db";
import { v4 as uuid } from "uuid";
import { API_BASE } from "@/app/platform";
import { useSessionStore } from "@/stores/session";

export async function savePhoto(blob: Blob, mime: string): Promise<string> {
  const id = `photo:${uuid()}`;
  const db = await openDb();
  const rec: PhotoRecord = { id, blob, mime, createdAt: new Date().toISOString() };
  await db.put(STORE.photos, rec);
  return id;
}

export async function getPhoto(id: string): Promise<PhotoRecord | null> {
  const db = await openDb();
  return (await db.get(STORE.photos, id)) ?? null;
}

export async function removePhoto(id: string): Promise<void> {
  const db = await openDb();
  await db.delete(STORE.photos, id);
}

/**
 * The ONE uploader (skill §4.3). Identical path whether the op came
 * from the online happy path or from drain.
 *
 * Contract:
 * - Returns the server file_url.
 * - Idempotent: a second call for the same photo id returns the same URL
 *   without re-hitting the server.
 * - On network failure, throws. Callers route the failure through their
 *   own error handling (queue drain will set lastError; online path
 *   will fall through to queue).
 */
export async function uploadPhoto(photoId: string): Promise<string> {
  const db = await openDb();
  const row = (await db.get(STORE.photos, photoId)) as PhotoRecord | undefined;
  if (!row) throw new Error(`photo blob missing: ${photoId}`);
  if (row.serverUrl) return row.serverUrl;

  const session = useSessionStore();
  const form = new FormData();
  form.append("file", row.blob, `${photoId.replace(":", "-")}.jpg`);
  form.append("is_private", "0");

  const headers: Record<string, string> = {};
  if (session.apiKey && session.apiSecret) {
    headers["Authorization"] = `token ${session.apiKey}:${session.apiSecret}`;
  }

  const r = await fetch(`${API_BASE()}/api/method/upload_file`, {
    method: "POST",
    headers,
    credentials: API_BASE() ? "omit" : "include",
    body: form,
  });
  if (!r.ok) throw new Error(`upload failed (${r.status})`);
  const data = await r.json();
  const url = data?.message?.file_url;
  if (!url) throw new Error("upload returned no file_url");

  row.serverUrl = url;
  await db.put(STORE.photos, row);
  return url;
}
```

- [ ] **Step 4: Run — pass**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/offline/photos.ts frontend/tests/unit/photos.spec.ts
git commit -m "feat(offline): ONE photo uploader with server-url memoization"
```

---

### Task 8: Implement `offline/drain.ts` with processor registry

**Files:**
- Create: `frontend/src/offline/drain.ts`
- Create: `frontend/src/offline/processors/checkin.ts`
- Create: `frontend/tests/unit/drain.spec.ts`

- [ ] **Step 1: Write failing tests**

`frontend/tests/unit/drain.spec.ts`:

```typescript
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDb } from "@/offline/db";
import { saveItem, listPending } from "@/offline/queue";
import { drain, registerProcessor, isUnrecoverable } from "@/offline/drain";

describe("offline/drain", () => {
  beforeEach(async () => await resetDb());

  it("runs processor in insertion order and deletes on success", async () => {
    const seen: string[] = [];
    registerProcessor("t1", async (e) => { seen.push(e.logicalKey); });
    await saveItem("t1", "a", {}, []);
    await saveItem("t1", "b", {}, []);
    await drain();
    expect(seen).toEqual(["a", "b"]);
    expect(await listPending()).toEqual([]);
  });

  it("sets lastError and leaves entry on recoverable failure", async () => {
    registerProcessor("t2", async () => { throw new Error("offline"); });
    await saveItem("t2", "a", {}, []);
    await drain();
    const rows = await listPending();
    expect(rows.length).toBe(1);
    expect(rows[0].lastError?.message).toMatch(/offline/);
  });

  it("deletes entry on unrecoverable (duplicate) error", async () => {
    registerProcessor("t3", async () => { throw new Error("DuplicateEntryError: already exists"); });
    await saveItem("t3", "a", {}, []);
    await drain();
    expect(await listPending()).toEqual([]);
  });

  it("isUnrecoverable matches narrow regex", () => {
    expect(isUnrecoverable(new Error("DuplicateEntryError"))).toBe(true);
    expect(isUnrecoverable(new Error("random network failure"))).toBe(false);
    // near-miss substring must not match (skill §4.5)
    expect(isUnrecoverable(new Error("things are not duplicated"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
pnpm test
```

- [ ] **Step 3: Implement `drain.ts`**

```typescript
import { listPending, setError, removeEntry } from "./queue";
import type { QueueRecord } from "./db";

export type Processor = (entry: QueueRecord) => Promise<void>;

const processors = new Map<string, Processor>();

export function registerProcessor(kind: string, fn: Processor) {
  processors.set(kind, fn);
}

let draining = false;

export async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const rows = await listPending();
    for (const row of rows) {
      const p = processors.get(row.kind);
      if (!p) continue;
      try {
        await p(row);
        await removeEntry(row.id);
      } catch (e) {
        if (isUnrecoverable(e)) {
          await removeEntry(row.id);
        } else {
          await setError(row.id, {
            code: (e as any)?.name || "Error",
            message: (e as any)?.message || String(e),
          });
        }
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * Narrow — match only server-signalled definitive failures (skill §4.5).
 * Bare substrings like "duplicate" without word boundary would misfire;
 * require a known error token.
 */
const UNRECOVERABLE_RE = /\b(DuplicateEntryError|ValidationError:\s+Already\s+exists|LinkExistsError)\b/;

export function isUnrecoverable(e: unknown): boolean {
  const msg = (e as any)?.message || String(e);
  return UNRECOVERABLE_RE.test(msg);
}

export function isDraining() { return draining; }
```

- [ ] **Step 4: Implement the checkin processor**

`frontend/src/offline/processors/checkin.ts`:

```typescript
import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { uploadPhoto } from "@/offline/photos";
import { apiCall } from "@/api/client";

interface CheckinPayload {
  log_type: "IN" | "OUT";
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  task: string | null;
  selfie_photo_id?: string | null;
  selfie_file_url?: string | null;
  timestamp: string;   // queued ts — NEVER sent as client_modified
}

registerProcessor("checkin", async (entry: QueueRecord) => {
  const p = entry.payload as CheckinPayload;

  // Resolve any pending photo via the ONE uploader
  let selfie_file_url = p.selfie_file_url ?? null;
  if (!selfie_file_url && p.selfie_photo_id) {
    selfie_file_url = await uploadPhoto(p.selfie_photo_id);
  }

  await apiCall("POST", "fatehhr.api.checkin.create", {
    log_type: p.log_type,
    latitude: p.latitude,
    longitude: p.longitude,
    address: p.address,
    task: p.task,
    selfie_file_url,
    timestamp: p.timestamp,
  });
});
```

- [ ] **Step 5: Run — pass**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/offline/drain.ts frontend/src/offline/processors/checkin.ts frontend/tests/unit/drain.spec.ts
git commit -m "feat(offline): drain engine with processor registry + checkin processor"
```

---

### Task 9: Implement `offline/orphans.ts` (flagOrphans — skill §4.6)

**Files:**
- Create: `frontend/src/offline/orphans.ts`

- [ ] **Step 1: Implement**

```typescript
import { openDb, STORE, type QueueRecord } from "./db";
import { setError } from "./queue";

/**
 * Marks queue entries whose referenced photo blobs are missing
 * (skill §4.6). NEVER deletes the queue entry — only annotates
 * with lastError so the user can see and decide in Sync Errors.
 */
export async function flagOrphans(): Promise<number> {
  const db = await openDb();
  const queue = (await db.getAll(STORE.queue)) as QueueRecord[];
  let flagged = 0;
  for (const entry of queue) {
    for (const photoId of entry.effectiveImages) {
      const exists = await db.get(STORE.photos, photoId);
      if (!exists) {
        await setError(entry.id, {
          code: "BlobMissing",
          message: `Photo ${photoId} blob is missing — cannot submit.`,
        });
        flagged++;
        break;
      }
    }
  }
  return flagged;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/offline/orphans.ts
git commit -m "feat(offline): flagOrphans marks corrupt entries (never deletes)"
```

---

### Task 10: `stores/sync.ts` + SyncBar component

**Files:**
- Create: `frontend/src/stores/sync.ts`
- Create: `frontend/src/components/SyncBar.vue`

- [ ] **Step 1: Implement `sync.ts`**

```typescript
import { defineStore } from "pinia";
import { drain } from "@/offline/drain";
import { countPending, listPending } from "@/offline/queue";
import { flagOrphans } from "@/offline/orphans";
import { openDb, STORE } from "@/offline/db";

export type SyncStatus = "idle" | "syncing" | "offline" | "errored";

export const useSyncStore = defineStore("sync", {
  state: () => ({
    status: "idle" as SyncStatus,
    pending: 0,
    lastSyncedAt: null as string | null,
    isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    errorCount: 0,
  }),
  actions: {
    async refresh() {
      this.pending = await countPending();
      const rows = await listPending();
      this.errorCount = rows.filter((r) => r.lastError).length;
      const db = await openDb();
      this.lastSyncedAt = (await db.get(STORE.meta, "lastSyncedAt")) || null;
    },
    async triggerDrain() {
      if (!this.isOnline) { this.status = "offline"; return; }
      this.status = "syncing";
      await flagOrphans();
      await drain();
      const db = await openDb();
      await db.put(STORE.meta, new Date().toISOString(), "lastSyncedAt");
      await this.refresh();
      this.status = this.errorCount > 0 ? "errored" : "idle";
    },
    setOnline(online: boolean) {
      this.isOnline = online;
      if (online) this.triggerDrain();
      else this.status = "offline";
    },
  },
});
```

- [ ] **Step 2: Implement `SyncBar.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useSyncStore } from "@/stores/sync";
import { useI18n } from "vue-i18n";

const sync = useSyncStore();
const { t } = useI18n();

function onOnline() { sync.setOnline(true); }
function onOffline() { sync.setOnline(false); }

onMounted(async () => {
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  await sync.refresh();
  if (sync.isOnline && sync.pending > 0) await sync.triggerDrain();
});

onUnmounted(() => {
  window.removeEventListener("online", onOnline);
  window.removeEventListener("offline", onOffline);
});

const label = computed(() => {
  if (!sync.isOnline) return t("sync.offline");
  if (sync.status === "syncing") return t("sync.syncing");
  if (sync.errorCount > 0) return t("sync.errored", { n: sync.errorCount });
  if (sync.pending > 0) return t("sync.pending", { n: sync.pending });
  if (sync.lastSyncedAt) return t("sync.synced", { when: shortRelative(sync.lastSyncedAt) });
  return t("sync.ready");
});

const className = computed(() => {
  if (!sync.isOnline) return "sync-bar sync-bar--offline";
  if (sync.status === "syncing") return "sync-bar sync-bar--syncing";
  if (sync.errorCount > 0) return "sync-bar sync-bar--errored";
  if (sync.pending > 0) return "sync-bar sync-bar--pending";
  return "sync-bar sync-bar--ok";
});

function shortRelative(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

async function onTap() {
  if (sync.pending > 0 && sync.isOnline) await sync.triggerDrain();
}
</script>

<template>
  <button :class="className" role="status" @click="onTap">
    <span class="sync-bar__label">{{ label }}</span>
  </button>
</template>

<style scoped>
.sync-bar {
  display: block; width: 100%;
  padding: 8px var(--page-gutter);
  font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  text-align: center; background: transparent; color: var(--ink-secondary);
}
.sync-bar--pending { background: var(--accent-soft); color: var(--ink-primary); }
.sync-bar--syncing { background: var(--accent-soft); color: var(--ink-primary); animation: breathe 3s ease-in-out infinite; }
.sync-bar--offline { background: var(--warning-soft); color: var(--warning); }
.sync-bar--errored { background: var(--danger-soft); color: var(--danger); }
@keyframes breathe {
  0%, 100% { opacity: 1; } 50% { opacity: .7; }
}
@media (prefers-reduced-motion: reduce) { .sync-bar--syncing { animation: none; } }
</style>
```

- [ ] **Step 3: Add sync keys to locales**

Append to `frontend/src/locales/en.json` under root:

```json
  ,"sync": {
    "synced": "Synced {when} ago",
    "pending": "{n} changes pending · tap to sync",
    "syncing": "Syncing…",
    "offline": "Offline — working locally",
    "errored": "{n} sync errors · tap Settings → Sync Errors",
    "ready": "Ready"
  }
```

And `ar.json`:

```json
  ,"sync": {
    "synced": "تم المزامنة قبل {when}",
    "pending": "{n} تغييرات بانتظار المزامنة · اضغط للمزامنة",
    "syncing": "جارٍ المزامنة…",
    "offline": "غير متصل — العمل محلياً",
    "errored": "{n} أخطاء مزامنة · افتح الإعدادات → أخطاء المزامنة",
    "ready": "جاهز"
  }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/sync.ts frontend/src/components/SyncBar.vue frontend/src/locales/
git commit -m "feat(sync): SyncBar with 4 states + background drain on online"
```

---

### Task 11: `PhotoSlot.vue` with auto-clear on missing blob (skill §4.7)

**Files:**
- Create: `frontend/src/components/PhotoSlot.vue`
- Create: `frontend/tests/unit/photoslot.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import PhotoSlot from "@/components/PhotoSlot.vue";
import { resetDb } from "@/offline/db";
import { savePhoto } from "@/offline/photos";

describe("PhotoSlot", () => {
  beforeEach(async () => await resetDb());

  it("renders empty slot when no modelValue", () => {
    const w = mount(PhotoSlot, { props: { modelValue: null } });
    expect(w.find(".photoslot--empty").exists()).toBe(true);
  });

  it("auto-clears when modelValue refers to missing blob", async () => {
    const w = mount(PhotoSlot, { props: { modelValue: "photo:nope" } });
    await new Promise((r) => setTimeout(r, 50));
    await nextTick();
    expect(w.emitted()["update:modelValue"]?.[0]).toEqual([null]);
  });

  it("renders thumbnail when blob exists", async () => {
    const id = await savePhoto(new Blob(["x"], { type: "image/jpeg" }), "image/jpeg");
    const w = mount(PhotoSlot, { props: { modelValue: id } });
    await new Promise((r) => setTimeout(r, 50));
    await nextTick();
    expect(w.find("img").exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
pnpm test
```

- [ ] **Step 3: Implement `PhotoSlot.vue`**

```vue
<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { getPhoto, savePhoto, removePhoto } from "@/offline/photos";

const props = defineProps<{
  modelValue: string | null;
  aspect?: "3:4" | "16:9" | "1:1";
  label?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

const thumbUrl = ref<string | null>(null);
const busy = ref(false);

async function load(id: string | null) {
  if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value);
  thumbUrl.value = null;
  if (!id) return;
  const row = await getPhoto(id);
  if (!row) {
    // skill §4.7: auto-clear when blob is missing
    emit("update:modelValue", null);
    return;
  }
  thumbUrl.value = URL.createObjectURL(row.blob);
}

onMounted(() => load(props.modelValue));
watch(() => props.modelValue, load);
onBeforeUnmount(() => {
  if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value);
});

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  busy.value = true;
  try {
    const id = await savePhoto(file, file.type || "image/jpeg");
    emit("update:modelValue", id);
  } finally {
    busy.value = false;
    input.value = "";
  }
}

async function onClear() {
  if (props.modelValue) await removePhoto(props.modelValue);
  emit("update:modelValue", null);
}
</script>

<template>
  <div class="photoslot" :class="[modelValue ? 'photoslot--filled' : 'photoslot--empty',
                                  `photoslot--${aspect ?? '3:4'}`]">
    <label v-if="!modelValue" class="photoslot__picker">
      <input type="file" accept="image/*" capture="environment" @change="onPick" hidden />
      <span>{{ label ?? "+ Add photo" }}</span>
    </label>
    <template v-else>
      <img v-if="thumbUrl" :src="thumbUrl" alt="" />
      <button class="photoslot__remove" aria-label="Remove photo" @click="onClear">×</button>
    </template>
  </div>
</template>

<style scoped>
.photoslot {
  position: relative; display: block; border-radius: var(--r-md);
  background: var(--bg-sunk); overflow: hidden;
}
.photoslot--3\:4 { aspect-ratio: 3 / 4; }
.photoslot--16\:9 { aspect-ratio: 16 / 9; }
.photoslot--1\:1 { aspect-ratio: 1 / 1; }
.photoslot--empty {
  box-shadow: inset 0 0 0 1.5px var(--hairline-strong);
  border-radius: var(--r-md);
}
.photoslot__picker {
  display: grid; place-items: center; height: 100%; cursor: pointer;
  color: var(--ink-secondary); font-size: 13px;
}
.photoslot img { width: 100%; height: 100%; object-fit: cover; }
.photoslot__remove {
  position: absolute; top: 8px; right: 8px;
  width: 28px; height: 28px; border-radius: var(--r-full);
  background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 18px; line-height: 1;
}
[dir="rtl"] .photoslot__remove { left: 8px; right: auto; }
</style>
```

- [ ] **Step 4: Run — pass**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PhotoSlot.vue frontend/tests/unit/photoslot.spec.ts
git commit -m "feat(frontend): PhotoSlot with blob auto-clear (skill §4.7)"
```

---

### Task 12: Install Capacitor + Leaflet deps; add `frappe.ts` helpers

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/app/frappe.ts`

- [ ] **Step 1: Install packages**

```bash
cd frontend && pnpm add @capacitor/geolocation @capacitor/camera @capacitor/haptics @capacitor/filesystem leaflet
pnpm add -D @types/leaflet
```

- [ ] **Step 2: Extend `frappe.ts`**

Replace `frontend/src/app/frappe.ts` with:

```typescript
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Geolocation } from "@capacitor/geolocation";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export function isNativePlatform(): boolean {
  return (Capacitor as any).isNativePlatform?.() ?? false;
}

export async function secureSet(k: string, v: string) {
  isNativePlatform() ? await Preferences.set({ key: k, value: v }) : localStorage.setItem(k, v);
}
export async function secureGet(k: string) {
  if (isNativePlatform()) return (await Preferences.get({ key: k })).value ?? null;
  return localStorage.getItem(k);
}
export async function secureRemove(k: string) {
  isNativePlatform() ? await Preferences.remove({ key: k }) : localStorage.removeItem(k);
}

export async function getCurrentCoords(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

export async function takePhotoBlob(): Promise<{ blob: Blob; mime: string } | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 75,
      allowEditing: false,
      source: CameraSource.Camera,
      resultType: CameraResultType.DataUrl,
    });
    if (!photo.dataUrl) return null;
    const [meta, b64] = photo.dataUrl.split(",");
    const mime = meta.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
    const bytes = atob(b64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    return { blob: new Blob([buf], { type: mime }), mime };
  } catch {
    return null;
  }
}

export async function hapticLight() { try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {} }
export async function hapticMedium() { try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {} }
export async function hapticHeavy() { try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {} }
export async function hapticSuccess() { try { await Haptics.notification({ type: NotificationType.Success }); } catch {} }
export async function hapticError() { try { await Haptics.notification({ type: NotificationType.Error }); } catch {} }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/app/frappe.ts
git commit -m "feat(frontend): capacitor + leaflet deps; GPS/Camera/Haptics helpers"
```

---

### Task 13: `api/checkin.ts` + `api/util.ts`

**Files:**
- Create: `frontend/src/api/checkin.ts`
- Create: `frontend/src/api/util.ts`

- [ ] **Step 1: Implement**

`frontend/src/api/checkin.ts`:

```typescript
import { apiCall } from "./client";

export interface CheckinRow {
  name: string;
  log_type: "IN" | "OUT";
  time: string;
  custom_task: string | null;
  custom_latitude: number | null;
  custom_longitude: number | null;
  custom_location_address: string | null;
  custom_selfie: string | null;
  custom_geofence_status: "disabled" | "inside" | "outside" | "unknown";
}

export const checkinApi = {
  create: (p: {
    log_type: "IN" | "OUT";
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    task: string | null;
    selfie_file_url?: string | null;
    timestamp: string;
  }) => apiCall<CheckinRow>("POST", "fatehhr.api.checkin.create", p),

  list: (p: { from_date?: string; to_date?: string; page?: number; page_size?: number }) =>
    apiCall<CheckinRow[]>("POST", "fatehhr.api.checkin.list", p),
};
```

`frontend/src/api/util.ts`:

```typescript
import { apiCall } from "./client";

export const utilApi = {
  reverseGeocode: (lat: number, lng: number) =>
    apiCall<{ address: string | null; city: string | null; raw: unknown }>(
      "POST", "fatehhr.api.util.reverse_geocode", { lat, lng },
    ),
  versionCompat: (client_version: string) =>
    apiCall<{ min_client_version: string; server_app_version: string | null }>(
      "POST", "fatehhr.api.util.version_compat", { client_version },
    ),
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/checkin.ts frontend/src/api/util.ts
git commit -m "feat(api): checkin + util client modules"
```

---

### Task 14: `MapPreview.vue` Leaflet thumbnail

**Files:**
- Create: `frontend/src/components/MapPreview.vue`

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { onMounted, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{
  latitude: number | null;
  longitude: number | null;
  interactive?: boolean;
  height?: string;
}>();

const container = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let marker: L.Marker | null = null;

onMounted(() => {
  if (!container.value) return;
  map = L.map(container.value, {
    zoomControl: false,
    dragging: !!props.interactive,
    scrollWheelZoom: !!props.interactive,
    doubleClickZoom: !!props.interactive,
    touchZoom: !!props.interactive,
    keyboard: !!props.interactive,
  }).setView([props.latitude ?? 24.7136, props.longitude ?? 46.6753], 15);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);

  if (props.latitude != null && props.longitude != null) {
    marker = L.marker([props.latitude, props.longitude]).addTo(map);
  }
});

watch(
  () => [props.latitude, props.longitude] as const,
  ([lat, lng]) => {
    if (!map) return;
    if (lat != null && lng != null) {
      if (!marker) marker = L.marker([lat, lng]).addTo(map);
      else marker.setLatLng([lat, lng]);
      map.setView([lat, lng]);
    }
  },
);

onBeforeUnmount(() => { map?.remove(); map = null; marker = null; });
</script>

<template>
  <div class="mapprev" :style="{ height: height ?? '180px' }" ref="container" />
</template>

<style scoped>
.mapprev {
  width: 100%; border-radius: var(--r-lg);
  box-shadow: var(--e-1); overflow: hidden;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/MapPreview.vue
git commit -m "feat(frontend): MapPreview Leaflet component"
```

---

### Task 15: `stores/checkin.ts` with today-state + online+offline create

**Files:**
- Create: `frontend/src/stores/checkin.ts`

- [ ] **Step 1: Implement**

```typescript
import { defineStore } from "pinia";
import { checkinApi, type CheckinRow } from "@/api/checkin";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { v4 as uuid } from "uuid";
import { uploadPhoto } from "@/offline/photos";

interface TodayState {
  currentStatus: "IN" | "OUT" | null;
  currentTask: string | null;
  lastRow: CheckinRow | null;
}

export const useCheckinStore = defineStore("checkin", {
  state: () => ({
    today: { currentStatus: null, currentTask: null, lastRow: null } as TodayState,
    history: [] as CheckinRow[],
  }),
  actions: {
    async refreshToday() {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const rows = await checkinApi.list({ from_date: today + " 00:00:00", to_date: today + " 23:59:59" });
        const last = rows[0] ?? null;
        this.today.currentStatus = last?.log_type ?? null;
        this.today.currentTask = last?.custom_task ?? null;
        this.today.lastRow = last;
      } catch { /* offline is fine */ }
    },

    /**
     * Online path: direct POST. On network failure, fall through to queue.
     * Photo id is threaded via effectiveImages so the drain engine can
     * upload via the ONE uploader if we go offline mid-request.
     */
    async submit(payload: {
      log_type: "IN" | "OUT";
      latitude: number | null;
      longitude: number | null;
      address: string | null;
      task: string | null;
      selfie_photo_id: string | null;
    }) {
      const sync = useSyncStore();
      const timestamp = new Date().toISOString();
      const sessionId = uuid();
      const logicalKey = `checkin:${sessionId}`;
      const effectiveImages = payload.selfie_photo_id ? [payload.selfie_photo_id] : [];

      if (sync.isOnline) {
        try {
          // Upload the selfie first via the ONE uploader (skill §4.3)
          let selfie_file_url: string | null = null;
          if (payload.selfie_photo_id) {
            selfie_file_url = await uploadPhoto(payload.selfie_photo_id);
          }
          const row = await checkinApi.create({
            log_type: payload.log_type,
            latitude: payload.latitude,
            longitude: payload.longitude,
            address: payload.address,
            task: payload.task,
            selfie_file_url,
            timestamp,
          });
          this.today.currentStatus = row.log_type;
          this.today.currentTask = row.custom_task;
          this.today.lastRow = row;
          return { mode: "online" as const, row };
        } catch (e) {
          // fall through to queue
        }
      }

      await saveItem("checkin", logicalKey, {
        log_type: payload.log_type,
        latitude: payload.latitude,
        longitude: payload.longitude,
        address: payload.address,
        task: payload.task,
        selfie_photo_id: payload.selfie_photo_id,
        timestamp,
      }, effectiveImages);

      // Optimistic local update
      this.today.currentStatus = payload.log_type;
      this.today.currentTask = payload.task;
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async loadHistoryPage(from: string | null, to: string | null, page: number) {
      const rows = await checkinApi.list({
        from_date: from ?? undefined, to_date: to ?? undefined, page, page_size: 20,
      });
      if (page === 1) this.history = rows;
      else this.history.push(...rows);
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/checkin.ts
git commit -m "feat(store): checkin store with online→queue fallback"
```

---

### Task 16: `CheckinView.vue` + router entry

**Files:**
- Modify: `frontend/src/app/router.ts`
- Create: `frontend/src/views/CheckinView.vue`
- Create: `frontend/src/components/BottomNav.vue`

- [ ] **Step 1: Add the route**

In `frontend/src/app/router.ts`, extend the child array:

```typescript
children: [
  { path: "", name: "dashboard", component: () => import("@/views/DashboardView.vue") },
  { path: "checkin", name: "checkin", component: () => import("@/views/CheckinView.vue") },
  { path: "checkin/history", name: "checkin.history", component: () => import("@/views/CheckinHistoryView.vue") },
],
```

- [ ] **Step 2: Implement `BottomNav.vue` (Phase 2 stub with 5 slots)**

```vue
<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
const { t } = useI18n();
const tabs = [
  { to: "/",         key: "nav.home",        icon: "◉" },
  { to: "/checkin",  key: "nav.attendance",  icon: "◎" },
  { to: "/leave",    key: "nav.leave",       icon: "◈" },
  { to: "/tasks",    key: "nav.tasks",       icon: "◆" },
  { to: "/more",     key: "nav.more",        icon: "⋯" },
];
</script>

<template>
  <nav class="bnav">
    <RouterLink v-for="t2 in tabs" :key="t2.to" :to="t2.to" class="bnav__tab">
      <span class="bnav__icon">{{ t2.icon }}</span>
      <span class="bnav__label">{{ t(t2.key) }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bnav {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: grid; grid-template-columns: repeat(5, 1fr);
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom)) 0;
  background: var(--bg-surface); box-shadow: var(--e-1);
}
.bnav__tab {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  color: var(--ink-secondary); font-size: 11px; text-decoration: none;
  padding: 8px 4px; border-radius: var(--r-md); margin: 0 4px;
}
.bnav__tab.router-link-active { color: var(--accent); background: var(--accent-soft); }
.bnav__icon { font-size: 18px; line-height: 1; }
</style>
```

Add nav keys to `en.json`:

```json
  ,"nav": { "home": "Home", "attendance": "Attendance", "leave": "Leave", "tasks": "Tasks", "more": "More" }
```

And `ar.json`:

```json
  ,"nav": { "home": "الرئيسية", "attendance": "الحضور", "leave": "الإجازة", "tasks": "المهام", "more": "المزيد" }
```

- [ ] **Step 3: Implement `CheckinView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import AppButton from "@/components/Button.vue";
import SyncBar from "@/components/SyncBar.vue";
import MapPreview from "@/components/MapPreview.vue";
import PhotoSlot from "@/components/PhotoSlot.vue";
import BottomNav from "@/components/BottomNav.vue";
import { useCheckinStore } from "@/stores/checkin";
import { getCurrentCoords, hapticMedium, hapticError } from "@/app/frappe";
import { utilApi } from "@/api/util";
import { classify } from "@/offline/geofence-shim";
import { CUSTOMER_SELFIE_MODE } from "virtual:fatehhr-theme";

const { t } = useI18n();
const store = useCheckinStore();
const router = useRouter();
const lat = ref<number | null>(null);
const lng = ref<number | null>(null);
const address = ref<string | null>(null);
const task = ref<string | null>(null);   // Phase 2: free-type; task picker in Phase 4
const selfiePhotoId = ref<string | null>(null);
const busy = ref(false);
const geofence = ref<"disabled"|"inside"|"outside"|"unknown">("unknown");

onMounted(async () => {
  await store.refreshToday();
  const coords = await getCurrentCoords();
  if (coords) {
    lat.value = coords.latitude; lng.value = coords.longitude;
    try {
      const g = await utilApi.reverseGeocode(coords.latitude, coords.longitude);
      address.value = g.address;
    } catch { /* offline */ }
  }
  geofence.value = classify(null, null, null, lat.value, lng.value);
});

const needsSelfie = computed(() => {
  if (CUSTOMER_SELFIE_MODE === "every") return true;
  if (CUSTOMER_SELFIE_MODE === "first") {
    // naive: if current status is not IN, we're going to check IN → require selfie
    return store.today.currentStatus !== "IN";
  }
  return false;
});

const nextLogType = computed<"IN"|"OUT">(() => (store.today.currentStatus === "IN" ? "OUT" : "IN"));

async function submit() {
  if (needsSelfie.value && !selfiePhotoId.value) {
    await hapticError();
    return;
  }
  busy.value = true;
  try {
    const res = await store.submit({
      log_type: nextLogType.value,
      latitude: lat.value,
      longitude: lng.value,
      address: address.value,
      task: task.value,
      selfie_photo_id: selfiePhotoId.value,
    });
    await hapticMedium();
    if (res.mode === "online" && res.row) {
      geofence.value = res.row.custom_geofence_status;
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="checkin">
    <TopAppBar :title="t('checkin.title')" back @back="router.back()" />
    <SyncBar />
    <MapPreview :latitude="lat" :longitude="lng" height="200px" />
    <p class="checkin__address">{{ address ?? t("checkin.unknown_location") }}</p>

    <p class="checkin__geofence" :class="`is-${geofence}`">
      {{ t(`checkin.geofence.${geofence}`) }}
    </p>

    <section v-if="needsSelfie" class="checkin__selfie">
      <h3>{{ t("checkin.selfie") }}</h3>
      <PhotoSlot v-model="selfiePhotoId" aspect="3:4" />
    </section>

    <AppButton block @click="submit" :disabled="busy">
      {{ nextLogType === "IN" ? t("checkin.check_in") : t("checkin.check_out") }}
    </AppButton>

    <RouterLink to="/checkin/history" class="checkin__history-link">
      {{ t("checkin.history") }} →
    </RouterLink>

    <BottomNav />
  </main>
</template>

<style scoped>
.checkin { padding: 0 var(--page-gutter) 120px; }
.checkin__address { margin: 8px 0 0; color: var(--ink-secondary); }
.checkin__geofence { margin: 12px 0; font-size: 13px; padding: 8px 12px; border-radius: var(--r-full); display: inline-block; }
.checkin__geofence.is-inside { background: var(--success-soft); color: var(--success); }
.checkin__geofence.is-outside { background: var(--warning-soft); color: var(--warning); }
.checkin__geofence.is-unknown { background: var(--hairline); color: var(--ink-secondary); }
.checkin__geofence.is-disabled { background: var(--bg-sunk); color: var(--ink-secondary); }
.checkin__selfie h3 { font-family: var(--font-display); font-size: 17px; margin: 16px 0 8px; font-weight: 400; }
.checkin__history-link { display: block; margin: 24px 0 0; color: var(--ink-secondary); }
</style>
```

- [ ] **Step 4: Add `checkin` translations**

`en.json`:

```json
  ,"checkin": {
    "title": "Check In",
    "check_in": "Check In",
    "check_out": "Check Out",
    "selfie": "Selfie",
    "history": "Check-in history",
    "unknown_location": "Finding your location…",
    "geofence": {
      "inside": "Within task radius",
      "outside": "Outside task radius — will be flagged",
      "unknown": "Location unavailable",
      "disabled": "No task radius set"
    }
  }
```

`ar.json`:

```json
  ,"checkin": {
    "title": "تسجيل الحضور",
    "check_in": "تسجيل دخول",
    "check_out": "تسجيل خروج",
    "selfie": "صورة شخصية",
    "history": "سجل الحضور",
    "unknown_location": "جاري تحديد موقعك…",
    "geofence": {
      "inside": "داخل نطاق المهمة",
      "outside": "خارج نطاق المهمة — سيتم تمييزه",
      "unknown": "الموقع غير متوفر",
      "disabled": "لا يوجد نطاق محدد للمهمة"
    }
  }
```

- [ ] **Step 5: Create the client-side geofence shim**

`frontend/src/offline/geofence-shim.ts`:

```typescript
const EARTH_M = 6_371_000;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const phi1 = toRad(lat1), phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1), dlam = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return EARTH_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function classify(
  taskLat: number | null, taskLng: number | null, taskRadius: number | null,
  userLat: number | null, userLng: number | null,
): "disabled" | "unknown" | "inside" | "outside" {
  if (taskLat == null || taskLng == null || !taskRadius) return "disabled";
  if (userLat == null || userLng == null) return "unknown";
  return haversineM(taskLat, taskLng, userLat, userLng) <= taskRadius ? "inside" : "outside";
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/router.ts frontend/src/components/BottomNav.vue \
  frontend/src/views/CheckinView.vue frontend/src/offline/geofence-shim.ts \
  frontend/src/locales/
git commit -m "feat(checkin): CheckinView + BottomNav + client-side geofence shim"
```

---

### Task 17: `CheckinHistoryView.vue`

**Files:**
- Create: `frontend/src/views/CheckinHistoryView.vue`
- Create: `frontend/src/components/ListRow.vue`

- [ ] **Step 1: `ListRow.vue`**

```vue
<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
  trailing?: string;
  icon?: string;
}>();
</script>

<template>
  <div class="row">
    <div v-if="icon" class="row__icon">{{ icon }}</div>
    <div class="row__body">
      <div class="row__title">{{ title }}</div>
      <div v-if="subtitle" class="row__sub">{{ subtitle }}</div>
    </div>
    <div v-if="trailing" class="row__trailing">{{ trailing }}</div>
  </div>
</template>

<style scoped>
.row {
  display: flex; align-items: center; gap: 12px;
  min-height: 56px; padding: 10px var(--page-gutter);
  border-bottom: 1px solid var(--hairline);
}
.row__icon {
  width: 36px; height: 36px; border-radius: var(--r-full);
  background: var(--bg-sunk); display: grid; place-items: center;
}
.row__body { flex: 1; min-width: 0; }
.row__title { font-size: 15px; font-weight: 500; color: var(--ink-primary); }
.row__sub { font-size: 13px; color: var(--ink-secondary); }
.row__trailing { font-family: var(--font-mono); color: var(--ink-secondary); }
</style>
```

- [ ] **Step 2: `CheckinHistoryView.vue`**

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import ListRow from "@/components/ListRow.vue";
import BottomNav from "@/components/BottomNav.vue";
import { useCheckinStore } from "@/stores/checkin";

const { t } = useI18n();
const router = useRouter();
const store = useCheckinStore();

onMounted(() => store.loadHistoryPage(null, null, 1));

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}
</script>

<template>
  <main class="hist">
    <TopAppBar :title="t('checkin.history')" back @back="router.back()" />
    <SyncBar />
    <ListRow v-for="r in store.history" :key="r.name"
             :title="r.log_type === 'IN' ? t('checkin.check_in') : t('checkin.check_out')"
             :subtitle="r.custom_location_address || (r.custom_task ?? '')"
             :trailing="fmt(r.time)"
             :icon="r.log_type === 'IN' ? '↑' : '↓'" />
    <BottomNav />
  </main>
</template>

<style scoped>
.hist { padding-bottom: 120px; }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ListRow.vue frontend/src/views/CheckinHistoryView.vue
git commit -m "feat(checkin): history view with ListRow component"
```

---

### Task 18: Register the checkin processor + kick drain from `main.ts`

**Files:**
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Modify `main.ts`**

Prepend imports after the pinia setup:

```typescript
import "@/offline/processors/checkin"; // registers the processor
import { useSyncStore } from "@/stores/sync";
```

Add after `app.mount("#app");`:

```typescript
// Kick a drain on boot if online
const sync = useSyncStore();
sync.refresh().then(() => { if (sync.isOnline && sync.pending > 0) sync.triggerDrain(); });
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/main.ts
git commit -m "chore(boot): register processors + initial drain"
```

---

### Task 19: End-of-phase verification

- [ ] **Step 1: Backend tests green**

```bash
bench --site fatehhr_dev run-tests --app fatehhr
```

- [ ] **Step 2: Frontend tests green**

```bash
cd frontend && pnpm test && pnpm build
```

- [ ] **Step 3: Manual gate — brief §12 rows 1 and 2**

Ship gate:
- [ ] **Row 1.** Fresh **online check-in**: tap → server records timestamp immediately; `listPending()` returns 0 immediately after.
- [ ] **Row 2.** **Offline check-in**: open DevTools, switch to Offline; tap Check In → queued (SyncBar shows "1 changes pending"); switch back to Online → drain fires → server row exists with queued timestamp + GPS; queue empty.
- [ ] Selfie `every` mode blocks submit until a selfie photo is attached.
- [ ] Selfie `first` mode only requires selfie on the first IN of the day.
- [ ] Selfie `off` mode hides the selfie section entirely.
- [ ] PhotoSlot: manually `indexedDB.delete('fatehhr', 'photos', 'photo:<id>')` via DevTools while slot is mounted → slot clears automatically.
- [ ] Offline after taking a selfie, come online: photo uploads **exactly once** (check Frappe File count before/after).
- [ ] Geofence chip:
  - With task coords 24.7136,46.6753 radius 50m + user at same coords → `inside` (green).
  - User 500m away → `outside` (amber, still allows check-in).
  - No task / no radius → `disabled`.
  - GPS denied → `unknown`.

- [ ] **Step 4: Tag**

```bash
cd apps/fatehhr && git tag -a phase-2-offline-checkin -m "Phase 2 complete" && git push --tags
cd /path/to/fatehhr && git tag -a phase-2-offline-checkin -m "Phase 2 complete" && git push --tags
```

---

## Phase 2 Definition of Done

All boxes in Task 19 ticked. Queue empty after online path. Photo uploads once. Ready for [Phase 3](./2026-04-18-fatehhr-phase3-attendance-leave-expense.md).
