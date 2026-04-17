# Fateh HR — Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `fatehhr` Frappe app on a fresh `fatehhr_dev` site, ship auth (email/pwd → PIN → stable `api_secret`), CORS, theming plugin, and a Vue 3 SPA skeleton that lets a user log in, set a PIN, re-open, enter PIN, and see a stub dashboard with their name. Online-only in this phase — no offline engine yet.

**Architecture:** Backend = a single `fatehhr` Frappe app installed on a fresh site alongside `erpnext` + `hrms`, with custom fields as fixtures, one new DocType, a small whitelisted API surface, and `ensure_capacitor_cors()` installed via `after_migrate`. Frontend = Vue 3 + Pinia + vue-router + vue-i18n skeleton with platform detection, hash-vs-path router, theming via a Vite plugin that reads `CUSTOMER_*` env vars, and Login + PIN + stub Dashboard views. Login cookie session → sets PIN → server stores PIN hash via `doc.get_password("pin_hash")` and generates a **stable** `api_secret` that is reused on every subsequent PIN unlock.

**Tech Stack:** Frappe v15, ERPNext v15, HRMS v15, Python 3.10+, MariaDB 10.11; Vue 3, Pinia, vue-router, vue-i18n, Vite 5, idb; Node 20+, pnpm (or npm); reference skill: `frappe-vue-pwa` (§3.3–§3.7).

**Companion docs:**
- Visual direction: [`docs/superpowers/specs/2026-04-17-fatehhr-visual-direction.md`](../specs/2026-04-17-fatehhr-visual-direction.md)
- v1 design spec: [`docs/superpowers/specs/2026-04-18-fatehhr-v1-design.md`](../specs/2026-04-18-fatehhr-v1-design.md)

---

## File structure created in Phase 1

```
fatehhr/                                      # Frappe app (bench new-app fatehhr)
  fatehhr/
    __init__.py
    hooks.py                                  # after_migrate → ensure_capacitor_cors, fixtures
    install.py                                # ensure_capacitor_cors()
    patches.txt
    modules.txt
    fixtures/                                 # custom fields & doctype exports
      custom_field.json
      hr_announcement.json                    # stub in P1; full in P4
    api/
      __init__.py
      auth.py                                 # login, set_pin, verify_pin, change_pin
      me.py                                   # profile (stub in P1)
      util.py                                 # version_compat
    utils/
      __init__.py
      secrets.py                              # api_secret generation (stable, reused)
    tests/
      __init__.py
      test_auth.py
      test_cors.py

  setup.py
  pyproject.toml
  MANIFEST.in
  README.md
  .gitignore
  license.txt

frontend/                                     # Vue 3 SPA (Phase 1 skeleton)
  package.json
  pnpm-lock.yaml
  vite.config.ts
  tsconfig.json
  index.html
  .env.example
  plugins/
    vite-theme-plugin.ts                      # reads CUSTOMER_* → injects CSS vars, manifest, icons
  src/
    main.ts
    app/
      App.vue
      router.ts
      platform.ts
      frappe.ts
      i18n.ts
    stores/
      session.ts
    api/
      client.ts
      auth.ts
      me.ts
    views/
      LoginView.vue
      PinView.vue
      DashboardView.vue
    components/
      TopAppBar.vue
      Button.vue
    styles/
      tokens.css                              # neutral tokens (locked)
      base.css                                # reset + font imports
    locales/
      en.json
      ar.json
  tests/
    unit/
      session.spec.ts

docs/
  LESSONS_LEARNED.md                          # points to frappe-vue-pwa skill

android-capacitor/                            # created empty in P5
```

---

## Tasks

> **Convention:** every task ends with a commit. Commit messages use
> `type(scope): message` (feat, fix, chore, docs, test, refactor).
> Backend commits happen in the `fatehhr` app repo; frontend commits
> in the top-level `fatehhr` repo (same GitHub repo — the Frappe app
> lives in `fatehhr/fatehhr/` while the SPA lives in `fatehhr/frontend/`).

### Task 1: Initialize the `fatehhr` Frappe app on the server

**Files:**
- Create: `fatehhr/` (via `bench new-app`)

- [ ] **Step 1: On the server (via Enfono Server Manager), create the app**

Skill to use: `enfono-servers`. The server is:
- URL: `http://207.180.209.80:3847/api/servers/41ef79dc-a2fd-418a-bd88-b5f5173aeaf7/command`
- Bench: `/home/v15/frappe-bench` (user `v15`)

Run:

```bash
cd /home/v15/frappe-bench && bench new-app fatehhr \
  --app-title "Fateh HR" \
  --app-description "Field-team HR PWA on top of Frappe HRMS" \
  --app-publisher "Enfono Technologies" \
  --app-email "dev@enfonotech.com" \
  --app-license "MIT"
```

Expected: `./apps/fatehhr` created. Confirm with `ls apps/fatehhr/fatehhr/`.

- [ ] **Step 2: Initialize git in the app and push to `github.com/EnfonoTech/fatehhr`**

```bash
cd /home/v15/frappe-bench/apps/fatehhr
git init -b develop
git remote add origin git@github.com:EnfonoTech/fatehhr.git
git add .
git commit -m "chore: scaffold fatehhr via bench new-app"
git push -u origin develop
```

Expected: green push to `develop`. On GitHub, make `develop` the default branch.

- [ ] **Step 3: Commit nothing extra; move on.**

Task 1 commit already landed in Step 2.

---

### Task 2: Create a fresh `fatehhr_dev` site with erpnext + hrms + fatehhr

**Files (server):**
- Create site: `fatehhr_dev`

- [ ] **Step 1: Create the site**

```bash
cd /home/v15/frappe-bench && bench new-site fatehhr_dev \
  --mariadb-root-password "$MARIADB_ROOT_PASSWORD" \
  --admin-password "$ADMIN_PASSWORD" \
  --install-app erpnext \
  --install-app hrms \
  --install-app fatehhr
```

Expected: `sites/fatehhr_dev/` created; `bench --site fatehhr_dev list-apps` shows frappe, erpnext, hrms, fatehhr.

- [ ] **Step 2: Add site to hosts & confirm it serves**

```bash
bench --site fatehhr_dev add-to-hosts
bench --site fatehhr_dev execute "frappe.get_meta('Employee').get_field('status')" | head
```

Expected: returns a DocField object (proves DB + app wiring).

- [ ] **Step 3: Commit: nothing app-side; this is a bench-level operation.**

No commit.

---

### Task 3: Write `ensure_capacitor_cors()` + hook into `after_migrate`

**Files:**
- Create: `apps/fatehhr/fatehhr/install.py`
- Modify: `apps/fatehhr/fatehhr/hooks.py`
- Create: `apps/fatehhr/fatehhr/tests/__init__.py`
- Create: `apps/fatehhr/fatehhr/tests/test_cors.py`

- [ ] **Step 1: Write the failing test**

Create `apps/fatehhr/fatehhr/tests/__init__.py` (empty) and `apps/fatehhr/fatehhr/tests/test_cors.py`:

```python
import frappe
import unittest


class TestCapacitorCors(unittest.TestCase):
    def test_capacitor_cors_origins_installed(self):
        from fatehhr.install import ensure_capacitor_cors
        ensure_capacitor_cors()
        frappe.db.commit()
        settings = frappe.get_single("System Settings")
        allow = frappe.db.get_single_value("System Settings", "allow_cors") or ""
        origins = [o.strip() for o in allow.split(",") if o.strip()]
        for required in ("https://localhost", "capacitor://localhost", "http://localhost"):
            self.assertIn(required, origins, f"missing origin {required}")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_cors
```

Expected: FAIL — `ensure_capacitor_cors` does not exist yet.

- [ ] **Step 3: Implement `ensure_capacitor_cors`**

Create `apps/fatehhr/fatehhr/install.py`:

```python
import frappe

CAPACITOR_ORIGINS = (
    "https://localhost",
    "capacitor://localhost",
    "http://localhost",
)


def ensure_capacitor_cors():
    """Idempotently append Capacitor origins to System Settings → allow_cors."""
    settings = frappe.get_single("System Settings")
    current = (settings.allow_cors or "").strip()
    existing = {o.strip() for o in current.split(",") if o.strip()}
    missing = [o for o in CAPACITOR_ORIGINS if o not in existing]
    if not missing:
        return
    merged = ",".join(sorted(existing.union(missing)))
    settings.allow_cors = merged
    settings.flags.ignore_permissions = True
    settings.save()
```

- [ ] **Step 4: Wire hook in `hooks.py`**

Open `apps/fatehhr/fatehhr/hooks.py` and add:

```python
after_migrate = ["fatehhr.install.ensure_capacitor_cors"]
```

- [ ] **Step 5: Run the test again — pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_cors
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/v15/frappe-bench/apps/fatehhr
git add fatehhr/install.py fatehhr/hooks.py fatehhr/tests/__init__.py fatehhr/tests/test_cors.py
git commit -m "feat(install): ensure_capacitor_cors() via after_migrate"
git push
```

---

### Task 4: Ship Employee custom fields (`custom_pin_hash`, `custom_api_secret`) as fixtures

**Files:**
- Modify: `apps/fatehhr/fatehhr/hooks.py`
- Create: `apps/fatehhr/fatehhr/fixtures/custom_field.json`

- [ ] **Step 1: Write the failing test**

Create `apps/fatehhr/fatehhr/tests/test_fixtures.py`:

```python
import frappe
import unittest


class TestEmployeeCustomFields(unittest.TestCase):
    def test_employee_has_pin_hash_and_api_secret_fields(self):
        meta = frappe.get_meta("Employee")
        self.assertIsNotNone(meta.get_field("custom_pin_hash"),
            "Employee.custom_pin_hash fixture not applied")
        self.assertEqual(meta.get_field("custom_pin_hash").fieldtype, "Password")
        self.assertIsNotNone(meta.get_field("custom_api_secret"),
            "Employee.custom_api_secret fixture not applied")
        self.assertEqual(meta.get_field("custom_api_secret").fieldtype, "Password")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_fixtures
```

Expected: FAIL — fields missing.

- [ ] **Step 3: Write fixtures file**

Create `apps/fatehhr/fatehhr/fixtures/custom_field.json`:

```json
[
  {
    "doctype": "Custom Field",
    "name": "Employee-custom_pin_hash",
    "dt": "Employee",
    "fieldname": "custom_pin_hash",
    "label": "PIN Hash",
    "fieldtype": "Password",
    "insert_after": "user_id",
    "hidden": 1,
    "no_copy": 1,
    "module": "Fatehhr"
  },
  {
    "doctype": "Custom Field",
    "name": "Employee-custom_api_secret",
    "dt": "Employee",
    "fieldname": "custom_api_secret",
    "label": "API Secret",
    "fieldtype": "Password",
    "insert_after": "custom_pin_hash",
    "hidden": 1,
    "no_copy": 1,
    "module": "Fatehhr"
  }
]
```

- [ ] **Step 4: Register the fixture in hooks**

Append to `apps/fatehhr/fatehhr/hooks.py`:

```python
fixtures = [
    {"doctype": "Custom Field",
     "filters": [["name", "in", [
        "Employee-custom_pin_hash",
        "Employee-custom_api_secret",
     ]]]},
]
```

- [ ] **Step 5: Apply and verify**

```bash
bench --site fatehhr_dev migrate
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_fixtures
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add fatehhr/fixtures/custom_field.json fatehhr/hooks.py fatehhr/tests/test_fixtures.py
git commit -m "feat(employee): custom_pin_hash + custom_api_secret fixtures"
git push
```

---

### Task 5: Implement `fatehhr.utils.secrets` — stable api_secret generator + reuse

**Files:**
- Create: `apps/fatehhr/fatehhr/utils/__init__.py` (empty)
- Create: `apps/fatehhr/fatehhr/utils/secrets.py`
- Create: `apps/fatehhr/fatehhr/tests/test_secrets.py`

- [ ] **Step 1: Write the failing test**

`apps/fatehhr/fatehhr/tests/test_secrets.py`:

```python
import frappe
import unittest


class TestApiSecret(unittest.TestCase):
    def setUp(self):
        # Use Administrator's attached Employee if present, else create one
        self.user = "Administrator"

    def test_get_or_create_is_stable_across_calls(self):
        from fatehhr.utils.secrets import get_or_create_api_secret
        s1 = get_or_create_api_secret(self.user)
        s2 = get_or_create_api_secret(self.user)
        self.assertEqual(s1, s2, "api_secret must be reused, not regenerated")

    def test_get_or_create_returns_a_nonempty_string(self):
        from fatehhr.utils.secrets import get_or_create_api_secret
        s = get_or_create_api_secret(self.user)
        self.assertIsInstance(s, str)
        self.assertGreaterEqual(len(s), 32)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_secrets
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `get_or_create_api_secret`**

`apps/fatehhr/fatehhr/utils/secrets.py`:

```python
import frappe
from frappe.utils.password import get_decrypted_password
from frappe.utils import random_string


def get_or_create_api_secret(user: str) -> str:
    """Return the stable api_secret for the given user.

    Rule (skill §3.5): never regenerate per call. Reuse the stored secret
    unless it is missing/empty, in which case generate once and persist.
    """
    user_doc = frappe.get_doc("User", user)
    api_key = user_doc.api_key
    if not api_key:
        user_doc.api_key = frappe.generate_hash(length=15)
        user_doc.save(ignore_permissions=True)

    try:
        api_secret = get_decrypted_password(
            "User", user, fieldname="api_secret", raise_exception=False
        )
    except Exception:
        api_secret = None

    if api_secret:
        return api_secret

    api_secret = frappe.generate_hash(length=32)
    user_doc.api_secret = api_secret
    user_doc.save(ignore_permissions=True)
    frappe.db.commit()
    return api_secret
```

- [ ] **Step 4: Run tests — pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_secrets
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fatehhr/utils/__init__.py fatehhr/utils/secrets.py fatehhr/tests/test_secrets.py
git commit -m "feat(utils): stable api_secret generator (reuse, never regenerate)"
git push
```

---

### Task 6: Implement `fatehhr.api.auth.login` (email + password → api_key + api_secret)

**Files:**
- Create: `apps/fatehhr/fatehhr/api/__init__.py` (empty)
- Create: `apps/fatehhr/fatehhr/api/auth.py`
- Create: `apps/fatehhr/fatehhr/tests/test_auth.py`

- [ ] **Step 1: Write the failing test**

`apps/fatehhr/fatehhr/tests/test_auth.py`:

```python
import frappe
import unittest


TEST_PASSWORD = "p@ssw0rd123"


def _make_user(email="login-test@example.com"):
    if frappe.db.exists("User", email):
        frappe.delete_doc("User", email, force=True)
    doc = frappe.get_doc({
        "doctype": "User",
        "email": email,
        "first_name": "Login",
        "send_welcome_email": 0,
        "enabled": 1,
        "new_password": TEST_PASSWORD,
        "roles": [{"role": "Employee"}],
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc


class TestAuthLogin(unittest.TestCase):
    def test_login_returns_stable_api_secret(self):
        from fatehhr.api.auth import login
        user = _make_user()
        r1 = login(usr=user.email, pwd=TEST_PASSWORD)
        r2 = login(usr=user.email, pwd=TEST_PASSWORD)
        self.assertEqual(r1["api_secret"], r2["api_secret"])
        self.assertEqual(r1["api_key"], r2["api_key"])
        self.assertIn("require_pin_setup", r1)

    def test_login_rejects_bad_password(self):
        from fatehhr.api.auth import login
        user = _make_user("login-test-bad@example.com")
        with self.assertRaises(frappe.AuthenticationError):
            login(usr=user.email, pwd="wrong-password")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_auth
```

Expected: FAIL — `fatehhr.api.auth` missing.

- [ ] **Step 3: Implement `login`**

`apps/fatehhr/fatehhr/api/auth.py`:

```python
import frappe
from frappe.auth import LoginManager

from fatehhr.utils.secrets import get_or_create_api_secret


@frappe.whitelist(allow_guest=True)
def login(usr: str, pwd: str) -> dict:
    """Email + password first-time login.

    Returns {api_key, api_secret, require_pin_setup, user}.
    Raises frappe.AuthenticationError on bad credentials.
    """
    lm = LoginManager()
    lm.authenticate(user=usr, pwd=pwd)
    lm.post_login()

    user = frappe.session.user
    api_secret = get_or_create_api_secret(user)
    api_key = frappe.db.get_value("User", user, "api_key")
    require_pin_setup = _require_pin_setup(user)

    return {
        "user": user,
        "api_key": api_key,
        "api_secret": api_secret,
        "require_pin_setup": require_pin_setup,
    }


def _require_pin_setup(user: str) -> bool:
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        # No Employee record → still allow login but prompt for PIN post-setup
        return True
    from frappe.utils.password import get_decrypted_password
    try:
        pin_hash = get_decrypted_password(
            "Employee", employee, fieldname="custom_pin_hash", raise_exception=False
        )
    except Exception:
        pin_hash = None
    return not bool(pin_hash)
```

- [ ] **Step 4: Run tests — pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_auth
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fatehhr/api/__init__.py fatehhr/api/auth.py fatehhr/tests/test_auth.py
git commit -m "feat(auth): login endpoint returns stable api_key/api_secret"
git push
```

---

### Task 7: Implement `set_pin`, `verify_pin`, `change_pin` + lockout counter

**Files:**
- Modify: `apps/fatehhr/fatehhr/api/auth.py`
- Modify: `apps/fatehhr/fatehhr/tests/test_auth.py`

- [ ] **Step 1: Write the failing tests**

Append to `apps/fatehhr/fatehhr/tests/test_auth.py`:

```python
import time


class TestAuthPin(unittest.TestCase):
    def setUp(self):
        self.user_email = "pin-test@example.com"
        self.user = _make_user(self.user_email)
        # Attach an Employee to the user for PIN storage
        if not frappe.db.exists("Employee", {"user_id": self.user.email}):
            emp = frappe.get_doc({
                "doctype": "Employee",
                "first_name": "Pin",
                "last_name": "Tester",
                "user_id": self.user.email,
                "status": "Active",
                "gender": "Male",
                "date_of_birth": "1990-01-01",
                "date_of_joining": "2020-01-01",
            })
            emp.insert(ignore_permissions=True)
            frappe.db.commit()

    def _login(self):
        from fatehhr.api.auth import login
        return login(usr=self.user_email, pwd=TEST_PASSWORD)

    def test_set_pin_then_verify_pin_returns_same_secret(self):
        from fatehhr.api.auth import set_pin, verify_pin
        self._login()
        set_pin(pin="1234")
        r1 = self._login()
        r2 = verify_pin(user=self.user_email, pin="1234")
        self.assertEqual(r1["api_secret"], r2["api_secret"])
        self.assertFalse(r1["require_pin_setup"])

    def test_verify_pin_rejects_wrong_pin(self):
        from fatehhr.api.auth import set_pin, verify_pin
        self._login()
        set_pin(pin="1234")
        with self.assertRaises(frappe.AuthenticationError):
            verify_pin(user=self.user_email, pin="0000")

    def test_verify_pin_locks_after_five_wrong(self):
        from fatehhr.api.auth import set_pin, verify_pin, PinLockoutError
        self._login()
        set_pin(pin="1234")
        for _ in range(5):
            with self.assertRaises(frappe.AuthenticationError):
                verify_pin(user=self.user_email, pin="0000")
        with self.assertRaises(PinLockoutError):
            verify_pin(user=self.user_email, pin="1234")

    def test_change_pin_updates_hash(self):
        from fatehhr.api.auth import set_pin, verify_pin, change_pin
        self._login()
        set_pin(pin="1234")
        change_pin(old_pin="1234", new_pin="5678")
        verify_pin(user=self.user_email, pin="5678")  # no raise
        with self.assertRaises(frappe.AuthenticationError):
            verify_pin(user=self.user_email, pin="1234")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_auth
```

Expected: FAIL — `set_pin`, `verify_pin`, `change_pin`, `PinLockoutError` missing.

- [ ] **Step 3: Implement the PIN endpoints**

Replace `apps/fatehhr/fatehhr/api/auth.py` with:

```python
import frappe
from frappe.auth import LoginManager
from frappe.utils.password import get_decrypted_password

from fatehhr.utils.secrets import get_or_create_api_secret

PIN_LOCKOUT_THRESHOLD = 5


class PinLockoutError(frappe.AuthenticationError):
    http_status_code = 423  # Locked


@frappe.whitelist(allow_guest=True)
def login(usr: str, pwd: str) -> dict:
    lm = LoginManager()
    lm.authenticate(user=usr, pwd=pwd)
    lm.post_login()
    user = frappe.session.user
    api_secret = get_or_create_api_secret(user)
    api_key = frappe.db.get_value("User", user, "api_key")
    return {
        "user": user,
        "api_key": api_key,
        "api_secret": api_secret,
        "require_pin_setup": _require_pin_setup(user),
    }


@frappe.whitelist()
def set_pin(pin: str) -> dict:
    _validate_pin_shape(pin)
    employee = _current_employee()
    employee.custom_pin_hash = _hash_pin(pin)
    employee.flags.ignore_permissions = True
    employee.save()
    frappe.db.commit()
    return {"ok": True}


@frappe.whitelist(allow_guest=True)
def verify_pin(user: str, pin: str) -> dict:
    employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee_name:
        raise frappe.AuthenticationError("No employee linked to this user.")

    if _is_locked_out(employee_name):
        raise PinLockoutError("PIN locked. Please sign in with your password.")

    stored = get_decrypted_password(
        "Employee", employee_name, fieldname="custom_pin_hash", raise_exception=False
    )
    if not stored or stored != _hash_pin(pin):
        _record_failed_attempt(employee_name)
        raise frappe.AuthenticationError("Invalid PIN.")

    _reset_failed_attempts(employee_name)
    api_secret = get_or_create_api_secret(user)
    api_key = frappe.db.get_value("User", user, "api_key")
    return {"user": user, "api_key": api_key, "api_secret": api_secret}


@frappe.whitelist()
def change_pin(old_pin: str, new_pin: str) -> dict:
    _validate_pin_shape(new_pin)
    employee = _current_employee()
    stored = get_decrypted_password(
        "Employee", employee.name, fieldname="custom_pin_hash", raise_exception=False
    )
    if not stored or stored != _hash_pin(old_pin):
        raise frappe.AuthenticationError("Current PIN incorrect.")
    employee.custom_pin_hash = _hash_pin(new_pin)
    employee.flags.ignore_permissions = True
    employee.save()
    frappe.db.commit()
    return {"ok": True}


# --- helpers ---------------------------------------------------------------


def _require_pin_setup(user: str) -> bool:
    employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee_name:
        return True
    stored = get_decrypted_password(
        "Employee", employee_name, fieldname="custom_pin_hash", raise_exception=False
    )
    return not bool(stored)


def _current_employee():
    user = frappe.session.user
    employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee_name:
        frappe.throw(frappe._("No employee linked to your user."))
    return frappe.get_doc("Employee", employee_name)


def _validate_pin_shape(pin: str) -> None:
    if not isinstance(pin, str) or not pin.isdigit() or not (4 <= len(pin) <= 6):
        frappe.throw(frappe._("PIN must be 4 to 6 digits."))


def _hash_pin(pin: str) -> str:
    import hashlib
    salt = frappe.local.conf.get("secret_hash_salt") or frappe.local.conf.get("secret_key") or "fatehhr-pin-salt"
    return hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()


def _failed_key(employee: str) -> str:
    return f"fatehhr:pin_fail:{employee}"


def _record_failed_attempt(employee: str) -> None:
    key = _failed_key(employee)
    count = (frappe.cache().get_value(key) or 0) + 1
    frappe.cache().set_value(key, count, expires_in_sec=60 * 60)


def _reset_failed_attempts(employee: str) -> None:
    frappe.cache().delete_value(_failed_key(employee))


def _is_locked_out(employee: str) -> bool:
    count = frappe.cache().get_value(_failed_key(employee)) or 0
    return count >= PIN_LOCKOUT_THRESHOLD
```

- [ ] **Step 4: Run tests — pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_auth
```

Expected: PASS (all 4 PIN tests + 2 login tests).

- [ ] **Step 5: Commit**

```bash
git add fatehhr/api/auth.py fatehhr/tests/test_auth.py
git commit -m "feat(auth): set_pin / verify_pin / change_pin with lockout"
git push
```

---

### Task 8: Add `fatehhr.api.me.profile` (stub; returns basic employee info)

**Files:**
- Create: `apps/fatehhr/fatehhr/api/me.py`
- Create: `apps/fatehhr/fatehhr/tests/test_me.py`

- [ ] **Step 1: Write the failing test**

`apps/fatehhr/fatehhr/tests/test_me.py`:

```python
import frappe
import unittest

from fatehhr.tests.test_auth import _make_user, TEST_PASSWORD


class TestMeProfile(unittest.TestCase):
    def test_profile_returns_employee_shape(self):
        user = _make_user("me-test@example.com")
        if not frappe.db.exists("Employee", {"user_id": user.email}):
            frappe.get_doc({
                "doctype": "Employee",
                "first_name": "Me",
                "last_name": "Tester",
                "user_id": user.email,
                "status": "Active",
                "gender": "Female",
                "date_of_birth": "1991-02-02",
                "date_of_joining": "2021-02-02",
            }).insert(ignore_permissions=True)
            frappe.db.commit()

        frappe.set_user(user.email)
        try:
            from fatehhr.api.me import profile
            p = profile()
            self.assertEqual(p["user"], user.email)
            self.assertEqual(p["full_name"], "Me Tester")
            self.assertIn("employee", p)
            self.assertIn("designation", p)
            self.assertIn("department", p)
        finally:
            frappe.set_user("Administrator")
```

- [ ] **Step 2: Run — fail**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_me
```

Expected: FAIL.

- [ ] **Step 3: Implement `profile`**

`apps/fatehhr/fatehhr/api/me.py`:

```python
import frappe


@frappe.whitelist()
def profile() -> dict:
    user = frappe.session.user
    if user in ("Guest", ""):
        frappe.throw(frappe._("Not signed in."), frappe.AuthenticationError)

    employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee_name:
        return {
            "user": user,
            "full_name": frappe.db.get_value("User", user, "full_name") or user,
            "employee": None,
            "designation": None,
            "department": None,
        }

    emp = frappe.get_doc("Employee", employee_name)
    return {
        "user": user,
        "full_name": emp.employee_name,
        "employee": emp.name,
        "designation": emp.designation,
        "department": emp.department,
        "employee_id": emp.employee_number or emp.name,
        "photo": emp.image,
    }
```

- [ ] **Step 4: Run — pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_me
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add fatehhr/api/me.py fatehhr/tests/test_me.py
git commit -m "feat(me): profile endpoint stub"
git push
```

---

### Task 9: Add `fatehhr.api.util.version_compat`

**Files:**
- Create: `apps/fatehhr/fatehhr/api/util.py`

- [ ] **Step 1: Implement endpoint (trivial — skip TDD for the whitelist one-liner)**

`apps/fatehhr/fatehhr/api/util.py`:

```python
import frappe

MIN_CLIENT_VERSION = "1.0.0"


@frappe.whitelist(allow_guest=True)
def version_compat(client_version: str = "0.0.0") -> dict:
    """Return whether the client build is compatible.

    The client reads min_client_version on launch and, if newer than
    its own NATIVE_VERSION, blocks the UI with an "Update required"
    screen.
    """
    return {
        "min_client_version": MIN_CLIENT_VERSION,
        "server_app_version": frappe.get_attr("fatehhr.__version__") if _has_version() else None,
    }


def _has_version() -> bool:
    try:
        import fatehhr  # noqa
        return hasattr(fatehhr, "__version__")
    except Exception:
        return False
```

Add to `apps/fatehhr/fatehhr/__init__.py`:

```python
__version__ = "0.1.0"
```

- [ ] **Step 2: Commit**

```bash
git add fatehhr/api/util.py fatehhr/__init__.py
git commit -m "feat(util): version_compat endpoint; set app __version__"
git push
```

---

### Task 10: Scaffold the SPA — `frontend/` with Vite + Vue 3 + Pinia + Router + i18n

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/.env.example`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/app/App.vue`
- Create: `frontend/src/app/router.ts`
- Create: `frontend/src/app/platform.ts`
- Create: `frontend/src/app/i18n.ts`
- Create: `frontend/src/locales/en.json`
- Create: `frontend/src/locales/ar.json`
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/base.css`
- Create: `frontend/.gitignore`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "fatehhr-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.3.0",
    "pinia": "^2.1.7",
    "vue-i18n": "^9.13.1",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.4",
    "typescript": "^5.4.0",
    "vue-tsc": "^2.0.0",
    "vite": "^5.2.0",
    "vitest": "^1.5.0",
    "@vue/test-utils": "^2.4.5",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "useDefineForClassFields": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {"@/*": ["src/*"]},
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*", "plugins/**/*"]
}
```

- [ ] **Step 3: Create `frontend/vite.config.ts`**

```typescript
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fatehhrThemePlugin } from "./plugins/vite-theme-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "CUSTOMER_");
  const base = env.CUSTOMER_BUILD_TARGET === "native" ? "" : "/fatehhr/";

  return {
    base,
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    plugins: [vue(), fatehhrThemePlugin(env)],
    server: { port: 5173, host: true },
    test: {
      environment: "jsdom",
      globals: true,
    },
  };
});
```

- [ ] **Step 4: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="__THEME_COLOR__" />
    <title>__BRAND_NAME__</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `frontend/.env.example`**

```env
CUSTOMER_ERP_DOMAIN=hrms.example.com
CUSTOMER_BRAND_NAME=Fateh HR
CUSTOMER_PRIMARY_COLOR=#2E5D5A
CUSTOMER_LOCALE=en
CUSTOMER_SELFIE_MODE=first
CUSTOMER_BUILD_TARGET=web
```

- [ ] **Step 6: Create `frontend/.gitignore`**

```
node_modules/
dist/
.env
.env.local
```

- [ ] **Step 7: Commit**

```bash
cd /path/to/fatehhr   # top-level repo (outside the Frappe bench)
mkdir -p frontend
# move the above files into frontend/
git add frontend/package.json frontend/vite.config.ts frontend/tsconfig.json \
  frontend/index.html frontend/.env.example frontend/.gitignore
git commit -m "chore(frontend): Vite + Vue 3 + Pinia + i18n scaffold"
```

---

### Task 11: Write the theming Vite plugin (`plugins/vite-theme-plugin.ts`)

**Files:**
- Create: `frontend/plugins/vite-theme-plugin.ts`
- Create: `frontend/plugins/theme-utils.ts`
- Create: `frontend/tests/unit/theme.spec.ts`

- [ ] **Step 1: Write failing tests for the colour math**

`frontend/tests/unit/theme.spec.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deriveAccentTokens, pickContrastInk } from "../../plugins/theme-utils";

describe("theme-utils", () => {
  it("derives all five accent tokens from a base color", () => {
    const t = deriveAccentTokens("#2E5D5A");
    expect(t.accent).toBe("#2E5D5A");
    expect(t.accentStrong).toMatch(/^#/);
    expect(t.accentSoft).toMatch(/^#/);
    expect(t.accentInk).toBe("#FFFFFF"); // dark accent → white ink
    expect(t.accentRing).toMatch(/rgba/);
  });

  it("picks #1A1714 ink for a very light accent", () => {
    expect(pickContrastInk("#FFE9A8")).toBe("#1A1714");
  });

  it("picks #FFFFFF ink for a dark accent", () => {
    expect(pickContrastInk("#123456")).toBe("#FFFFFF");
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
cd frontend && pnpm test
```

Expected: FAIL — utils not present.

- [ ] **Step 3: Implement `plugins/theme-utils.ts`**

```typescript
export interface AccentTokens {
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentInk: string;
  accentRing: string;
}

export function deriveAccentTokens(hex: string): AccentTokens {
  const [r, g, b] = hexToRgb(hex);
  return {
    accent: hex.toUpperCase(),
    accentStrong: rgbToHex(mix([r, g, b], [0, 0, 0], 0.12)),
    accentSoft: rgbToHex(mix([r, g, b], [250, 247, 242], 0.88)), // towards --bg-canvas
    accentInk: pickContrastInk(hex),
    accentRing: `rgba(${r}, ${g}, ${b}, 0.28)`,
  };
}

export function pickContrastInk(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? "#1A1714" : "#FFFFFF";
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const bigint = parseInt(
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean,
    16,
  );
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function rgbToHex([r, g, b]: [number, number, number] | number[]): string {
  return (
    "#" +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function mix(
  a: [number, number, number] | number[],
  b: [number, number, number] | number[],
  t: number,
): [number, number, number] {
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
  ];
}
```

- [ ] **Step 4: Run — pass**

```bash
cd frontend && pnpm test
```

Expected: PASS.

- [ ] **Step 5: Implement the plugin**

`frontend/plugins/vite-theme-plugin.ts`:

```typescript
import type { Plugin } from "vite";
import { deriveAccentTokens } from "./theme-utils";

interface CustomerEnv {
  CUSTOMER_ERP_DOMAIN?: string;
  CUSTOMER_BRAND_NAME?: string;
  CUSTOMER_PRIMARY_COLOR?: string;
  CUSTOMER_LOCALE?: string;
  CUSTOMER_SELFIE_MODE?: string;
  CUSTOMER_BUILD_TARGET?: string;
}

export function fatehhrThemePlugin(env: CustomerEnv): Plugin {
  const accent = env.CUSTOMER_PRIMARY_COLOR ?? "#2E5D5A";
  const brand = env.CUSTOMER_BRAND_NAME ?? "Fateh HR";
  const tokens = deriveAccentTokens(accent);

  return {
    name: "fatehhr-theme-plugin",
    transformIndexHtml(html) {
      return html
        .replace(/__THEME_COLOR__/g, tokens.accent)
        .replace(/__BRAND_NAME__/g, brand);
    },
    resolveId(id) {
      if (id === "virtual:fatehhr-theme") return "\0virtual:fatehhr-theme";
      return null;
    },
    load(id) {
      if (id !== "\0virtual:fatehhr-theme") return null;
      return `
        export const CUSTOMER_ERP_DOMAIN = ${JSON.stringify(env.CUSTOMER_ERP_DOMAIN ?? "")};
        export const CUSTOMER_BRAND_NAME = ${JSON.stringify(brand)};
        export const CUSTOMER_PRIMARY_COLOR = ${JSON.stringify(tokens.accent)};
        export const CUSTOMER_LOCALE = ${JSON.stringify(env.CUSTOMER_LOCALE ?? "en")};
        export const CUSTOMER_SELFIE_MODE = ${JSON.stringify(env.CUSTOMER_SELFIE_MODE ?? "off")};
        export const CUSTOMER_BUILD_TARGET = ${JSON.stringify(env.CUSTOMER_BUILD_TARGET ?? "web")};
        export const ACCENT_TOKENS = ${JSON.stringify(tokens)};
      `;
    },
    transform(code, id) {
      // Inject accent CSS vars into the first loaded stylesheet that imports the marker
      if (!id.endsWith("tokens.css")) return null;
      const inject = `
:root {
  --accent: ${tokens.accent};
  --accent-strong: ${tokens.accentStrong};
  --accent-soft: ${tokens.accentSoft};
  --accent-ink: ${tokens.accentInk};
  --accent-ring: ${tokens.accentRing};
}
`;
      return code + "\n" + inject;
    },
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/plugins/ frontend/tests/unit/theme.spec.ts
git commit -m "feat(frontend): vite theme plugin + contrast-safe accent derivation"
```

---

### Task 12: Ship `tokens.css` + `base.css` (fixed neutral tokens)

**Files:**
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/base.css`

- [ ] **Step 1: Write `tokens.css`**

```css
/* neutrals locked across customers — accent vars are injected by vite-theme-plugin */
:root {
  --bg-canvas: #FAF7F2;
  --bg-surface: #FFFFFF;
  --bg-sunk: #F3EEE5;
  --ink-primary: #1A1714;
  --ink-secondary: #6B615A;
  --ink-tertiary: #A49A90;
  --hairline: #E5DED2;
  --hairline-strong: #D3CABD;

  --success: #3D7A58;
  --success-soft: #E8F1EB;
  --warning: #B4802B;
  --warning-soft: #F5ECD8;
  --danger: #B84B3E;
  --danger-soft: #F5E3DF;
  --info: #4D6E8E;
  --info-soft: #E4EBF2;

  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 14px;
  --r-xl: 22px;
  --r-full: 9999px;

  --e-0: inset 0 0 0 1px var(--hairline);
  --e-1: 0 1px 2px rgba(26,23,20,.04), 0 0 0 1px var(--hairline);
  --e-2: 0 4px 14px rgba(26,23,20,.06), 0 0 0 1px var(--hairline);
  --e-3: 0 14px 36px rgba(26,23,20,.08), 0 0 0 1px var(--hairline);

  --m-micro: 140ms cubic-bezier(.2, 0, 0, 1);
  --m-base: 240ms cubic-bezier(.2, .8, .2, 1);
  --m-page: 320ms cubic-bezier(.2, .8, .2, 1);

  --page-gutter: 20px;
  --font-ui: "IBM Plex Sans", -apple-system, Segoe UI, sans-serif;
  --font-ui-ar: "IBM Plex Sans Arabic", Tahoma, sans-serif;
  --font-display: "Fraunces", Georgia, serif;
  --font-display-ar: "Readex Pro", "IBM Plex Sans Arabic", Tahoma, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}

@media (prefers-color-scheme: dark) {
  :root.auto-theme, :root.dark-theme {
    --bg-canvas: #12100E;
    --bg-surface: #1C1916;
    --bg-sunk: #0C0A08;
    --ink-primary: #F2EBE1;
    --ink-secondary: #8F857A;
    --ink-tertiary: #5E554D;
    --hairline: #2A2521;
    --hairline-strong: #3A342E;
  }
}

[dir="rtl"] body {
  font-family: var(--font-ui-ar);
}
```

- [ ] **Step 2: Write `base.css`**

```css
@import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900&family=IBM+Plex+Mono:wght@300..700&family=IBM+Plex+Sans:wght@300..700&family=IBM+Plex+Sans+Arabic:wght@300..700&family=Readex+Pro:wght@300..700&display=swap");

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg-canvas);
  color: var(--ink-primary);
  font-family: var(--font-ui);
  font-size: 15px;
  line-height: 1.46;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
button, input, textarea, select { font: inherit; color: inherit; }
button { background: none; border: 0; padding: 0; cursor: pointer; }
a { color: var(--accent); text-decoration: none; }
img { max-width: 100%; display: block; }
#app { min-height: 100vh; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/
git commit -m "feat(frontend): design tokens + base stylesheet"
```

---

### Task 13: Write `app/platform.ts`, `app/frappe.ts`, `app/router.ts`, `app/i18n.ts`

**Files:**
- Create: `frontend/src/app/platform.ts`
- Create: `frontend/src/app/frappe.ts`
- Create: `frontend/src/app/router.ts`
- Create: `frontend/src/app/i18n.ts`
- Create: `frontend/src/locales/en.json`
- Create: `frontend/src/locales/ar.json`
- Create: `frontend/src/api/client.ts`

- [ ] **Step 1: `platform.ts` (skill §3.3)**

```typescript
import { CUSTOMER_ERP_DOMAIN, CUSTOMER_BUILD_TARGET } from "virtual:fatehhr-theme";

export function isNative(): boolean {
  if (CUSTOMER_BUILD_TARGET === "native") return true;
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

export function API_BASE(): string {
  if (isNative()) return `https://${CUSTOMER_ERP_DOMAIN}`;
  return ""; // same-origin on web
}
```

- [ ] **Step 2: `frappe.ts` (skill §3.4 — static imports)**

```typescript
// STATIC imports per skill §3.4. Do NOT dynamic-import @capacitor/*.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

// Filesystem, Camera, Haptics are declared here; individual features import what they need.
// (Phase 1 only uses Preferences. Camera/Filesystem/Haptics added in Phase 2.)

export async function secureSet(key: string, value: string): Promise<void> {
  if ((Capacitor as any).isNativePlatform?.()) {
    await Preferences.set({ key, value });
    return;
  }
  localStorage.setItem(key, value);
}

export async function secureGet(key: string): Promise<string | null> {
  if ((Capacitor as any).isNativePlatform?.()) {
    const r = await Preferences.get({ key });
    return r.value ?? null;
  }
  return localStorage.getItem(key);
}

export async function secureRemove(key: string): Promise<void> {
  if ((Capacitor as any).isNativePlatform?.()) {
    await Preferences.remove({ key });
    return;
  }
  localStorage.removeItem(key);
}
```

Add `@capacitor/core` and `@capacitor/preferences` to `package.json` dependencies:

```bash
cd frontend && pnpm add @capacitor/core @capacitor/preferences
```

- [ ] **Step 3: `router.ts` (skill §3.7)**

```typescript
import { createRouter, createWebHistory, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import { isNative } from "./platform";
import { useSessionStore } from "@/stores/session";

const routes: RouteRecordRaw[] = [
  { path: "/login", name: "login", component: () => import("@/views/LoginView.vue") },
  { path: "/pin", name: "pin", component: () => import("@/views/PinView.vue") },
  {
    path: "/",
    component: () => import("@/app/App.vue"),
    children: [
      { path: "", name: "dashboard", component: () => import("@/views/DashboardView.vue") },
    ],
  },
];

export function createAppRouter() {
  const history = isNative() ? createWebHashHistory() : createWebHistory("/fatehhr/");
  const router = createRouter({ history, routes });

  router.beforeEach(async (to) => {
    const session = useSessionStore();
    await session.hydrate();
    if (!session.hasApiSecret && to.name !== "login" && to.name !== "pin") {
      return { name: "login" };
    }
    if (session.hasApiSecret && !session.isPinVerified && to.name !== "pin" && to.name !== "login") {
      return { name: "pin" };
    }
    return true;
  });

  return router;
}
```

- [ ] **Step 4: `i18n.ts`**

```typescript
import { createI18n } from "vue-i18n";
import en from "@/locales/en.json";
import ar from "@/locales/ar.json";
import { CUSTOMER_LOCALE } from "virtual:fatehhr-theme";

const stored = typeof localStorage !== "undefined"
  ? localStorage.getItem("fatehhr.locale")
  : null;

export const appI18n = createI18n({
  legacy: false,
  locale: (stored as "en" | "ar") || (CUSTOMER_LOCALE as "en" | "ar") || "en",
  fallbackLocale: "en",
  messages: { en, ar },
});

export function setLocale(locale: "en" | "ar") {
  appI18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  localStorage.setItem("fatehhr.locale", locale);
}
```

- [ ] **Step 5: `locales/en.json`**

```json
{
  "app": { "name": "Fateh HR" },
  "login": {
    "title": "Welcome",
    "email": "Work email",
    "password": "Password",
    "continue": "Continue",
    "forgot": "Forgot password?",
    "wrong": "That email or password didn't match."
  },
  "pin": {
    "title": "Enter PIN",
    "setup_title": "Set a PIN",
    "setup_hint": "4 to 6 digits you'll use to open the app.",
    "wrong": "Wrong PIN. {n} attempts left.",
    "locked": "Too many wrong attempts. Please sign in with your password.",
    "forgot": "Forgot PIN"
  },
  "dashboard": {
    "greeting_morning": "Good morning, {name}",
    "greeting_afternoon": "Good afternoon, {name}",
    "greeting_evening": "Good evening, {name}"
  }
}
```

- [ ] **Step 6: `locales/ar.json`**

```json
{
  "app": { "name": "فاتح للموارد البشرية" },
  "login": {
    "title": "أهلاً بك",
    "email": "بريد العمل",
    "password": "كلمة المرور",
    "continue": "متابعة",
    "forgot": "نسيت كلمة المرور؟",
    "wrong": "البريد أو كلمة المرور غير صحيحة."
  },
  "pin": {
    "title": "أدخل الرمز السري",
    "setup_title": "حدد رمزاً سرياً",
    "setup_hint": "4 إلى 6 أرقام تستخدمها لفتح التطبيق.",
    "wrong": "رمز خاطئ. تبقى {n} محاولات.",
    "locked": "عدد محاولات كثير. يرجى تسجيل الدخول بكلمة المرور.",
    "forgot": "نسيت الرمز"
  },
  "dashboard": {
    "greeting_morning": "صباح الخير، {name}",
    "greeting_afternoon": "نهارك سعيد، {name}",
    "greeting_evening": "مساء الخير، {name}"
  }
}
```

- [ ] **Step 7: `api/client.ts`**

```typescript
import { API_BASE } from "@/app/platform";
import { useSessionStore } from "@/stores/session";

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

export async function apiCall<T = unknown>(
  method: "GET" | "POST",
  endpoint: string,
  body?: unknown,
): Promise<T> {
  const session = useSessionStore();
  const url = `${API_BASE()}/api/method/${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Frappe-Site-Name": new URL(API_BASE() || window.location.origin).hostname,
  };
  if (session.apiKey && session.apiSecret) {
    headers["Authorization"] = `token ${session.apiKey}:${session.apiSecret}`;
  }

  const resp = await fetch(url, {
    method,
    headers,
    credentials: API_BASE() ? "omit" : "include",
    body: method === "POST" && body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let data: any = undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { /* ignore */ }

  if (!resp.ok) {
    const msg = data?.exception || data?.message || resp.statusText;
    if (resp.status === 401) {
      session.clear();
    }
    throw new ApiError(resp.status, data, msg);
  }

  return (data?.message ?? data) as T;
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/ frontend/src/locales/ frontend/src/api/client.ts
git commit -m "feat(frontend): platform, router, i18n, api client, capacitor shim"
```

---

### Task 14: `stores/session.ts` + `api/auth.ts` + `api/me.ts`

**Files:**
- Create: `frontend/src/stores/session.ts`
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/api/me.ts`
- Create: `frontend/tests/unit/session.spec.ts`

- [ ] **Step 1: Write the failing test**

`frontend/tests/unit/session.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useSessionStore } from "@/stores/session";

vi.mock("@/app/frappe", () => ({
  secureSet: vi.fn(async (k: string, v: string) => localStorage.setItem(k, v)),
  secureGet: vi.fn(async (k: string) => localStorage.getItem(k)),
  secureRemove: vi.fn(async (k: string) => localStorage.removeItem(k)),
}));

describe("session store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it("stores api_secret on credential login", async () => {
    const s = useSessionStore();
    await s.applyLogin({ user: "a@b.com", api_key: "k", api_secret: "s", require_pin_setup: true });
    expect(s.hasApiSecret).toBe(true);
    expect(s.requirePinSetup).toBe(true);
  });

  it("hydrate restores from secure storage", async () => {
    const s = useSessionStore();
    await s.applyLogin({ user: "a@b.com", api_key: "k", api_secret: "s", require_pin_setup: false });
    const s2 = useSessionStore();
    s2.$reset();
    await s2.hydrate();
    expect(s2.apiKey).toBe("k");
    expect(s2.apiSecret).toBe("s");
  });

  it("clear wipes tokens", async () => {
    const s = useSessionStore();
    await s.applyLogin({ user: "a@b.com", api_key: "k", api_secret: "s", require_pin_setup: false });
    await s.clear();
    expect(s.apiKey).toBe(null);
    expect(s.apiSecret).toBe(null);
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
cd frontend && pnpm test
```

Expected: FAIL.

- [ ] **Step 3: Implement the store**

`frontend/src/stores/session.ts`:

```typescript
import { defineStore } from "pinia";
import { secureGet, secureSet, secureRemove } from "@/app/frappe";

export interface LoginPayload {
  user: string;
  api_key: string;
  api_secret: string;
  require_pin_setup: boolean;
}

const KEY_USER = "fatehhr.user";
const KEY_API_KEY = "fatehhr.api_key";
const KEY_API_SECRET = "fatehhr.api_secret";
const KEY_PIN_PRESENT = "fatehhr.pin_present";

export const useSessionStore = defineStore("session", {
  state: () => ({
    user: null as string | null,
    apiKey: null as string | null,
    apiSecret: null as string | null,
    requirePinSetup: false,
    isPinVerified: false,
    hydrated: false,
  }),
  getters: {
    hasApiSecret: (s) => Boolean(s.apiKey && s.apiSecret),
  },
  actions: {
    async hydrate() {
      if (this.hydrated) return;
      this.user = await secureGet(KEY_USER);
      this.apiKey = await secureGet(KEY_API_KEY);
      this.apiSecret = await secureGet(KEY_API_SECRET);
      const pinPresent = await secureGet(KEY_PIN_PRESENT);
      this.requirePinSetup = pinPresent !== "1";
      this.hydrated = true;
    },
    async applyLogin(p: LoginPayload) {
      this.user = p.user;
      this.apiKey = p.api_key;
      this.apiSecret = p.api_secret;
      this.requirePinSetup = p.require_pin_setup;
      this.isPinVerified = !p.require_pin_setup;
      await secureSet(KEY_USER, p.user);
      await secureSet(KEY_API_KEY, p.api_key);
      await secureSet(KEY_API_SECRET, p.api_secret);
      await secureSet(KEY_PIN_PRESENT, p.require_pin_setup ? "0" : "1");
    },
    markPinVerified() {
      this.isPinVerified = true;
    },
    async clear() {
      this.user = null;
      this.apiKey = null;
      this.apiSecret = null;
      this.requirePinSetup = false;
      this.isPinVerified = false;
      await secureRemove(KEY_USER);
      await secureRemove(KEY_API_KEY);
      await secureRemove(KEY_API_SECRET);
      await secureRemove(KEY_PIN_PRESENT);
    },
  },
});
```

- [ ] **Step 4: Implement `api/auth.ts`**

```typescript
import { apiCall } from "./client";

export interface LoginResp {
  user: string;
  api_key: string;
  api_secret: string;
  require_pin_setup: boolean;
}

export const authApi = {
  login: (usr: string, pwd: string) =>
    apiCall<LoginResp>("POST", "fatehhr.api.auth.login", { usr, pwd }),
  setPin: (pin: string) =>
    apiCall<{ ok: true }>("POST", "fatehhr.api.auth.set_pin", { pin }),
  verifyPin: (user: string, pin: string) =>
    apiCall<LoginResp>("POST", "fatehhr.api.auth.verify_pin", { user, pin }),
  changePin: (old_pin: string, new_pin: string) =>
    apiCall<{ ok: true }>("POST", "fatehhr.api.auth.change_pin", { old_pin, new_pin }),
};
```

- [ ] **Step 5: Implement `api/me.ts`**

```typescript
import { apiCall } from "./client";

export interface Profile {
  user: string;
  full_name: string;
  employee: string | null;
  designation: string | null;
  department: string | null;
  employee_id?: string;
  photo?: string | null;
}

export const meApi = {
  profile: () => apiCall<Profile>("GET", "fatehhr.api.me.profile"),
};
```

- [ ] **Step 6: Run tests — pass**

```bash
cd frontend && pnpm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/stores/session.ts frontend/src/api/auth.ts frontend/src/api/me.ts frontend/tests/unit/session.spec.ts
git commit -m "feat(session): pinia session store + auth/me API clients"
```

---

### Task 15: Build the three Phase 1 views — `LoginView`, `PinView`, `DashboardView` — plus `App.vue` + `main.ts`

**Files:**
- Create: `frontend/src/app/App.vue`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/views/LoginView.vue`
- Create: `frontend/src/views/PinView.vue`
- Create: `frontend/src/views/DashboardView.vue`
- Create: `frontend/src/components/TopAppBar.vue`
- Create: `frontend/src/components/Button.vue`

- [ ] **Step 1: `main.ts`**

```typescript
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "@/app/App.vue";
import { createAppRouter } from "@/app/router";
import { appI18n, setLocale } from "@/app/i18n";
import "@/styles/tokens.css";
import "@/styles/base.css";

const app = createApp(App);
app.use(createPinia());
app.use(createAppRouter());
app.use(appI18n);

// apply initial locale / dir
setLocale(appI18n.global.locale.value as "en" | "ar");

app.mount("#app");
```

- [ ] **Step 2: `App.vue`**

```vue
<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
  <RouterView />
</template>
```

- [ ] **Step 3: `components/Button.vue`**

```vue
<script setup lang="ts">
defineProps<{
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  disabled?: boolean;
  block?: boolean;
  type?: "button" | "submit";
}>();
</script>

<template>
  <button
    :type="type ?? 'button'"
    :disabled="disabled"
    class="btn"
    :class="[`btn--${variant ?? 'primary'}`, block ? 'btn--block' : '']"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  height: 48px;
  padding: 0 20px;
  border-radius: var(--r-md);
  font-weight: 500;
  font-size: 15px;
  transition: background var(--m-micro), color var(--m-micro),
              box-shadow var(--m-micro), transform var(--m-micro);
  display: inline-flex; align-items: center; justify-content: center;
}
.btn--block { width: 100%; }
.btn--primary { background: var(--accent); color: var(--accent-ink); }
.btn--primary:active { background: var(--accent-strong); }
.btn--secondary { background: transparent; color: var(--ink-primary);
  box-shadow: inset 0 0 0 1.5px var(--ink-primary); }
.btn--secondary:active { background: var(--bg-sunk); }
.btn--ghost { background: transparent; color: var(--ink-primary); }
.btn--ghost:active { background: var(--bg-sunk); }
.btn--destructive { background: transparent; color: var(--danger);
  box-shadow: inset 0 0 0 1.5px var(--danger); }
.btn--destructive:active { background: var(--danger-soft); }
.btn:disabled { opacity: 0.5; pointer-events: none; }
</style>
```

- [ ] **Step 4: `components/TopAppBar.vue`**

```vue
<script setup lang="ts">
defineProps<{ title: string; back?: boolean }>();
defineEmits<{ back: [] }>();
</script>

<template>
  <header class="bar">
    <button v-if="back" class="bar__back" aria-label="Back" @click="$emit('back')">‹</button>
    <h1 class="bar__title">{{ title }}</h1>
  </header>
</template>

<style scoped>
.bar {
  display: flex; align-items: center; gap: 8px;
  padding: 16px var(--page-gutter);
  min-height: 56px;
  background: transparent;
}
.bar__back {
  width: 36px; height: 36px; border-radius: var(--r-full);
  color: var(--ink-primary); font-size: 24px;
  display: inline-flex; align-items: center; justify-content: center;
}
.bar__back:active { background: var(--bg-sunk); }
.bar__title {
  font-family: var(--font-display); font-weight: 400;
  font-size: 24px; margin: 0; letter-spacing: -0.01em;
}
[dir="rtl"] .bar__back { transform: scaleX(-1); }
[dir="rtl"] .bar__title { font-family: var(--font-display-ar); }
</style>
```

- [ ] **Step 5: `views/LoginView.vue`**

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/stores/session";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import { setLocale } from "@/app/i18n";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import AppButton from "@/components/Button.vue";

const { t, locale } = useI18n();
const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const busy = ref(false);
const session = useSessionStore();
const router = useRouter();

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    const resp = await authApi.login(email.value.trim(), password.value);
    await session.applyLogin(resp);
    router.replace({ name: resp.require_pin_setup ? "pin" : "dashboard" });
  } catch (e: any) {
    error.value = e instanceof ApiError && e.status === 401
      ? t("login.wrong")
      : (e?.message || t("login.wrong"));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="login">
    <TopAppBar :title="t('login.title')" />
    <form class="login__form" @submit.prevent="submit">
      <label>
        <span>{{ t("login.email") }}</span>
        <input v-model="email" type="email" autocomplete="username" required />
      </label>
      <label>
        <span>{{ t("login.password") }}</span>
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="login__error">{{ error }}</p>
      <AppButton block type="submit" :disabled="busy">{{ t("login.continue") }}</AppButton>
      <button class="login__lang" type="button"
        @click="setLocale(locale === 'ar' ? 'en' : 'ar')">
        {{ locale === "ar" ? "English" : "العربية" }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.login { min-height: 100vh; display: flex; flex-direction: column; }
.login__form {
  display: flex; flex-direction: column; gap: 16px;
  padding: 24px var(--page-gutter) 0;
}
.login__form label { display: flex; flex-direction: column; gap: 6px; }
.login__form label span {
  font-size: 13px; color: var(--ink-secondary);
  letter-spacing: 0.02em; text-transform: uppercase;
}
.login__form input {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md);
  padding: 14px 16px; font-size: 15px; color: var(--ink-primary);
}
.login__form input:focus {
  outline: 2px solid var(--accent-ring); outline-offset: 2px;
}
.login__error { color: var(--danger); margin: -4px 0 0; font-size: 13px; }
.login__lang { margin-top: 8px; color: var(--ink-secondary); font-size: 13px; }
</style>
```

- [ ] **Step 6: `views/PinView.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/stores/session";
import { authApi } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";

const { t } = useI18n();
const session = useSessionStore();
const router = useRouter();
const pin = ref("");
const error = ref<string | null>(null);
const busy = ref(false);
const mode = computed(() => (session.requirePinSetup ? "setup" : "verify"));
const MAX = 6;
const MIN = 4;

function press(n: string) {
  if (pin.value.length < MAX) pin.value += n;
  error.value = null;
}
function backspace() {
  pin.value = pin.value.slice(0, -1);
  error.value = null;
}
async function submit() {
  if (pin.value.length < MIN) return;
  busy.value = true;
  try {
    if (mode.value === "setup") {
      await authApi.setPin(pin.value);
      session.markPinVerified();
      router.replace({ name: "dashboard" });
    } else {
      if (!session.user) throw new Error("no user cached");
      const r = await authApi.verifyPin(session.user, pin.value);
      await session.applyLogin({ ...r, require_pin_setup: false });
      session.markPinVerified();
      router.replace({ name: "dashboard" });
    }
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 423) {
      error.value = t("pin.locked");
      await session.clear();
      router.replace({ name: "login" });
      return;
    }
    error.value = t("pin.wrong", { n: 5 });
    pin.value = "";
  } finally {
    busy.value = false;
  }
}
function forgot() {
  session.clear().then(() => router.replace({ name: "login" }));
}
const title = computed(() => t(mode.value === "setup" ? "pin.setup_title" : "pin.title"));
</script>

<template>
  <main class="pin">
    <TopAppBar :title="title" />
    <p v-if="mode === 'setup'" class="pin__hint">{{ t("pin.setup_hint") }}</p>
    <div class="pin__dots">
      <span v-for="i in MAX" :key="i" class="pin__dot"
            :class="{ 'is-filled': i <= pin.length }" />
    </div>
    <p v-if="error" class="pin__error">{{ error }}</p>

    <div class="keypad">
      <button v-for="n in ['1','2','3','4','5','6','7','8','9']" :key="n"
              class="keypad__key" @click="press(n)">{{ n }}</button>
      <button class="keypad__key" @click="forgot">{{ t("pin.forgot") }}</button>
      <button class="keypad__key" @click="press('0')">0</button>
      <button class="keypad__key" @click="backspace" aria-label="Backspace">⌫</button>
    </div>

    <div class="pin__submit" v-if="pin.length >= MIN">
      <button class="pin__submit-btn" :disabled="busy" @click="submit">
        {{ mode === 'setup' ? '✓' : '→' }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.pin { min-height: 100vh; display: flex; flex-direction: column; }
.pin__hint {
  text-align: center; color: var(--ink-secondary); font-size: 14px; margin: 4px var(--page-gutter) 0;
}
.pin__dots {
  display: flex; gap: 14px; justify-content: center; padding: 28px 0;
}
.pin__dot {
  width: 14px; height: 14px; border-radius: var(--r-full);
  background: var(--bg-sunk); box-shadow: inset 0 0 0 1px var(--hairline);
  transition: background var(--m-micro);
}
.pin__dot.is-filled { background: var(--accent); box-shadow: none; }
.pin__error { color: var(--danger); text-align: center; font-size: 13px; }
.keypad {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 18px; padding: 16px var(--page-gutter) 120px;
}
.keypad__key {
  height: 72px; border-radius: var(--r-full); background: var(--bg-surface);
  box-shadow: var(--e-1); font-family: var(--font-display);
  font-size: 28px; color: var(--ink-primary);
}
.keypad__key:active { background: var(--bg-sunk); transform: scale(.96); }
.pin__submit { position: fixed; bottom: 24px; right: 24px; }
.pin__submit-btn {
  width: 56px; height: 56px; border-radius: var(--r-full);
  background: var(--accent); color: var(--accent-ink); box-shadow: var(--e-2);
  font-size: 24px;
}
[dir="rtl"] .pin__submit { left: 24px; right: auto; }
</style>
```

- [ ] **Step 7: `views/DashboardView.vue` (stub)**

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useSessionStore } from "@/stores/session";
import { meApi, type Profile } from "@/api/me";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";

const { t } = useI18n();
const session = useSessionStore();
const profile = ref<Profile | null>(null);

function greetingKey(): "dashboard.greeting_morning" | "dashboard.greeting_afternoon" | "dashboard.greeting_evening" {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.greeting_morning";
  if (h < 17) return "dashboard.greeting_afternoon";
  return "dashboard.greeting_evening";
}

onMounted(async () => {
  try {
    profile.value = await meApi.profile();
  } catch (e) {
    // P1: swallow; P2 adds a proper error path
  }
});
</script>

<template>
  <main class="dashboard">
    <TopAppBar :title="t('app.name')" />
    <h2 class="dashboard__greeting">
      {{ t(greetingKey(), { name: profile?.full_name || session.user || '' }) }}
    </h2>
    <p class="dashboard__meta" v-if="profile?.designation || profile?.department">
      {{ [profile?.designation, profile?.department].filter(Boolean).join(" · ") }}
    </p>
    <p class="dashboard__stub">Phase 1 skeleton — full dashboard ships in Phase 2 + 4.</p>
  </main>
</template>

<style scoped>
.dashboard { padding-bottom: 80px; }
.dashboard__greeting {
  font-family: var(--font-display); font-weight: 400; font-size: 32px;
  margin: 8px var(--page-gutter) 4px; letter-spacing: -0.01em;
}
[dir="rtl"] .dashboard__greeting { font-family: var(--font-display-ar); font-weight: 500; }
.dashboard__meta { color: var(--ink-secondary); margin: 0 var(--page-gutter); }
.dashboard__stub { color: var(--ink-tertiary); margin: 24px var(--page-gutter); font-size: 13px; }
</style>
```

- [ ] **Step 8: Install deps & run dev server**

```bash
cd frontend && pnpm install && pnpm dev
```

Expected: Vite dev server at `http://localhost:5173/fatehhr/`. Navigating there redirects to `/login`. Logging in with a fatehhr_dev user redirects to `/pin` (setup mode), sets PIN, lands on dashboard showing greeting.

Note: Frappe serves at a different origin in dev. Configure a Vite proxy if calls fail:

In `vite.config.ts`, inside `server`:

```typescript
server: {
  port: 5173,
  host: true,
  proxy: {
    "/api": {
      target: `http://${process.env.CUSTOMER_ERP_DOMAIN || "fatehhr_dev:8000"}`,
      changeOrigin: true,
      secure: false,
    },
  },
},
```

- [ ] **Step 9: Verify the flow end-to-end against fatehhr_dev**

Manual test:
1. `pnpm dev` in `frontend/`.
2. Open `http://localhost:5173/fatehhr/`.
3. Log in with your admin (or a test Employee user) credentials.
4. Set a PIN.
5. Close tab, reopen: should prompt for PIN, accept, land on dashboard.
6. Check network: every `POST /api/method/fatehhr.api.auth.*` returns 200.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/main.ts frontend/src/app/App.vue frontend/src/components/ frontend/src/views/
git commit -m "feat(frontend): Login + PIN + Dashboard stub views"
```

---

### Task 16: Add `docs/LESSONS_LEARNED.md` pointer to `frappe-vue-pwa` skill

**Files:**
- Create: `docs/LESSONS_LEARNED.md`

- [ ] **Step 1: Write the file**

```markdown
# Lessons Learned

## Source of truth: `frappe-vue-pwa` skill

Every architectural rule for this codebase lives in the
`frappe-vue-pwa` skill:

- §3.3 `platform.js` shape
- §3.4 Static imports of `@capacitor/*`
- §3.5 `doc.get_password("pin_hash")` + stable `api_secret` reuse
- §3.6 `ensure_capacitor_cors()` via `after_migrate`
- §3.7 Router: `createWebHashHistory()` on native, `createWebHistory("/fatehhr/")` on web
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/LESSONS_LEARNED.md
git commit -m "docs: LESSONS_LEARNED pointer to frappe-vue-pwa skill"
```

---

### Task 17a: Offline PIN verification — cache PIN hash locally (spec §5.5)

**Files:**
- Modify: `frontend/src/stores/session.ts`
- Modify: `frontend/src/views/PinView.vue`

The server-side PIN hash uses a site-config salt the client cannot see. v1 solves offline launch by maintaining a **separate** client-side hash (different salt) computed at PIN set/verify time and stored encrypted in Capacitor Preferences on native / localStorage on web. Offline launch compares against this cached hash; online flows still round-trip to the server.

- [ ] **Step 1: Extend `session.ts` with PIN cache helpers**

Append after `markPinVerified()`:

```typescript
    async cachePinHash(pin: string) {
      const hash = await clientHashPin(pin, this.apiSecret ?? "default-salt");
      await secureSet("fatehhr.pin_hash_local", hash);
    },
    async verifyPinLocally(pin: string): Promise<boolean> {
      const stored = await secureGet("fatehhr.pin_hash_local");
      if (!stored) return false;
      const hash = await clientHashPin(pin, this.apiSecret ?? "default-salt");
      return hash === stored;
    },
```

Add at top of file:

```typescript
async function clientHashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder().encode(`${salt}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 2: Call `cachePinHash` after successful `set_pin` and after successful `verify_pin` in `PinView.vue`**

In `submit()`, after `authApi.setPin(pin.value)`:

```typescript
await session.cachePinHash(pin.value);
```

And after `authApi.verifyPin(...)`:

```typescript
await session.cachePinHash(pin.value);
```

- [ ] **Step 3: When offline, call `verifyPinLocally` instead**

Modify `submit()` in `PinView.vue` to branch:

```typescript
if (!navigator.onLine) {
  const ok = await session.verifyPinLocally(pin.value);
  if (!ok) { error.value = t("pin.wrong", { n: 5 }); pin.value = ""; return; }
  session.markPinVerified();
  router.replace({ name: "dashboard" });
  return;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/session.ts frontend/src/views/PinView.vue
git commit -m "feat(auth): offline PIN verification via cached client-side hash"
```

---

### Task 17b: Generate `manifest.json` at build time (spec §3)

**Files:**
- Modify: `frontend/plugins/vite-theme-plugin.ts`
- Modify: `frontend/index.html`

- [ ] **Step 1: Emit manifest in the plugin**

Add to the plugin's `generateBundle` hook (create if missing):

```typescript
    generateBundle() {
      const manifest = {
        name: brand,
        short_name: brand.length > 12 ? brand.slice(0, 12) : brand,
        start_url: "/fatehhr/",
        display: "standalone",
        background_color: "#FAF7F2",
        theme_color: tokens.accent,
        icons: [
          { src: "/fatehhr/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/fatehhr/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      };
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(manifest, null, 2),
      });
    },
```

- [ ] **Step 2: Link from `index.html`**

Inside `<head>`:

```html
<link rel="manifest" href="/fatehhr/manifest.json" />
<link rel="icon" type="image/png" sizes="192x192" href="/fatehhr/icons/icon-192.png" />
```

- [ ] **Step 3: Placeholder PNG icons**

Ship two neutral-accent placeholder PNGs at `frontend/public/icons/icon-192.png` and `icon-512.png`. Phase 5 will overwrite these per-customer via `generate-customer-assets.mjs` (extend that script to emit web-side icons too — Phase 5 Task 4 addendum).

- [ ] **Step 4: Commit**

```bash
git add frontend/plugins/vite-theme-plugin.ts frontend/index.html frontend/public/icons/
git commit -m "feat(theme): emit manifest.json with customer brand + accent"
```

---

### Task 17c: 401 silent retry in `api/client.ts` (spec §7)

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add one silent retry on 401 before clearing session**

Replace the 401 handling block in `apiCall` with:

```typescript
  if (resp.status === 401 && !(body as any)?.__retry) {
    // One silent retry: re-hydrate session from secure storage (token may
    // have been refreshed in another tab/screen), then retry once.
    await session.hydrate();
    return apiCall<T>(method, endpoint, { ...(body as any), __retry: true } as any);
  }
  if (!resp.ok) {
    const msg = data?.exception || data?.message || resp.statusText;
    if (resp.status === 401) session.clear();
    throw new ApiError(resp.status, data, msg);
  }
```

Strip `__retry` from the actual body before `JSON.stringify`:

```typescript
    body: method === "POST" && body ? JSON.stringify(stripRetry(body)) : undefined,
```

And:

```typescript
function stripRetry(b: unknown): unknown {
  if (!b || typeof b !== "object") return b;
  const { __retry: _, ...rest } = b as any;
  return rest;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(api): one silent 401 retry before signing out"
```

---

### Task 17d: Version-compat probe on launch (spec §7)

**Files:**
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Probe on boot; block UI if incompatible**

Add to `main.ts` after `app.mount`:

```typescript
import { utilApi } from "@/api/util";
import { NATIVE_VERSION } from "@/app/native-version";

void (async () => {
  try {
    const compat = await utilApi.versionCompat(NATIVE_VERSION);
    if (isOlder(NATIVE_VERSION, compat.min_client_version)) {
      document.body.innerHTML = `<div style="padding:40px;text-align:center;font-family:var(--font-display)">
        Please update the app. Minimum version ${compat.min_client_version}.
      </div>`;
    }
  } catch { /* first launch may be offline; skip */ }
})();

function isOlder(a: string, b: string): boolean {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
  }
  return false;
}
```

Note: `NATIVE_VERSION` comes from `frontend/src/app/native-version.ts`, created in Phase 5 Task 5 — Phase 1 ships with a local copy:

```typescript
// frontend/src/app/native-version.ts (Phase 1 version; Phase 5 takes over)
export const NATIVE_VERSION = "1.0.0";
export const NATIVE_VERSION_CODE = 1;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/main.ts frontend/src/app/native-version.ts
git commit -m "feat(boot): version-compat probe blocks app if build is too old"
```

---

### Task 18: End-of-phase verification

- [ ] **Step 1: All backend tests green**

```bash
bench --site fatehhr_dev run-tests --app fatehhr
```

Expected: auth (6) + cors (1) + fixtures (1) + secrets (2) + me (1) all PASS.

- [ ] **Step 2: All frontend tests green**

```bash
cd frontend && pnpm test
```

Expected: session (3) + theme (3) all PASS.

- [ ] **Step 3: Build passes**

```bash
cd frontend && pnpm build
```

Expected: `dist/` produced without errors.

- [ ] **Step 4: Gate: manual rollout verification for Phase 1**

Checklist:
- [ ] Email + password login lands on PIN setup.
- [ ] Setting a 4–6 digit PIN lands on the dashboard with greeting + name.
- [ ] Cold reload → prompts for PIN → lands on dashboard.
- [ ] Wrong PIN ×5 → locks → returned to Login.
- [ ] Language toggle flips to Arabic; `dir="rtl"` applied; Readex Pro font
      visible in greeting.
- [ ] Network tab: `api_secret` is identical across two separate PIN unlocks
      (skill §3.5 invariant — same value).
- [ ] Reloading the SPA after CORS: no CORS errors in console.

- [ ] **Step 5: Verify all new Phase 1 additions**
  - [ ] Offline PIN: airplane-mode the device → PIN entry works against cached hash.
  - [ ] `dist/manifest.json` exists and contains `theme_color` matching `CUSTOMER_PRIMARY_COLOR`.
  - [ ] 401 silent retry: stop the server mid-request — client silently retries once before logging out.
  - [ ] Version probe: set `MIN_CLIENT_VERSION = "2.0.0"` temporarily on server → client boots into the blocker screen.

- [ ] **Step 6: Tag Phase 1**

```bash
cd apps/fatehhr && git tag -a phase-1-foundation -m "Phase 1 complete"
git push --tags
cd /path/to/fatehhr/frontend && (cd .. && git tag -a phase-1-foundation -m "Phase 1 complete" && git push --tags)
```

---

## Phase 1 Definition of Done

All boxes in Task 18 ticked. Ready to start [Phase 2](./2026-04-18-fatehhr-phase2-offline-checkin.md).
