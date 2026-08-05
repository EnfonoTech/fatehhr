# Fateh HR — User Guide

For employees using the Fateh HR app on an Android phone.

App version this guide covers: **1.0.39**
Check your version any time: **More → bottom of the screen**.

---

## 1. Install the app

1. Open this link on your phone:
   **https://hr-demo.enfonoerp.com/files/fatehhr-demo-1.0.39-debug.apk**
2. Tap the downloaded file.
3. Android will warn about installing outside the Play Store. Allow it for your
   browser, then tap **Install**.
4. Open **Fateh HR Demo**.

**Updating later?** Just install the newer file over the top. Your saved login and
anything waiting to sync are kept.

> If Android refuses with "app not installed", you have a different build of the app
> already on the phone. Uninstall the old one first, but **sync your pending items
> before you do** (More → Sync errors should be empty).

---

## 2. First launch

Depending on how your APK was prepared, you will see either:

- **Straight to the login screen** — your server is already set. Skip to step 3.
- **A "Server" screen** asking for an address — enter the address your HR team gave
  you, e.g. `hr.yourcompany.com`. You do not need to type `https://`.

The app checks the address before saving it. If it cannot reach it you will be told
which problem it is:

| Message | What to do |
|---|---|
| "Couldn't reach that address" | Check spelling. Check you have internet. If both look fine, ask IT whether the server allows app access. |
| "That address didn't respond" | Server is slow or blocked. Try again, then ask IT. |
| "It isn't a Fateh HR server" | The address works but is the wrong system. Check it with HR. |
| "Enter the full address" | You typed one word. It needs the dots, e.g. `hr.company.com`. |

You only do this once. The app remembers it until you uninstall.

---

## 3. Log in

1. Enter your **work email** and **password**.
2. Set a **PIN** — 4 to 6 digits. This is what you use to open the app from then on.

After that you stay logged in. You only enter the PIN, not your password.

**Wrong PIN 5 times** locks it and sends you back to the login screen. Use **Forgot
PIN?** there — it asks for your password and lets you set a new PIN.

### Fingerprint / face unlock

**More → Security → Unlock with fingerprint.** Turn it on and you can skip the PIN.
You need a PIN set up first.

---

## 4. Check in and out

**Home → Check In.**

- The app needs **location permission**. Allow it, or check-in cannot record where you
  were.
- A map shows where it thinks you are.
- If your company requires a **selfie**, the camera opens first.
- If a **project site** is required, pick it from the list.
- **Time** defaults to now. You can adjust it back up to 24 hours if you forgot to
  punch earlier.
- Optional **daily activity log** — a short note on what you worked on.

Tap **Check Out** at the end. Same screen.

**History:** Home → Check In → history, or the Attendance tab.

---

## 5. Attendance, leave, expenses

| What | Where |
|---|---|
| Monthly attendance calendar | **Attendance** tab |
| Apply for leave / see balance | **Leave** tab |
| Submit an expense claim (with receipt photo) | **Expense** tab |
| Payslips | **More → Payslips** |
| Company announcements | **More → Announcements** |
| Notifications | **More → Notifications** |
| Your profile, bank details | **More** |

Bank details are read-only in the app. Contact HR to change them.

---

## 6. Working without internet

The app is built to keep working offline.

- Check in, apply for leave, submit expenses — all work with no signal.
- A bar at the top shows **"N changes pending"**.
- When signal returns, they upload by themselves. The bar shows **Synced**.
- You do **not** need to keep the app open — on Android it syncs in the background.

### If something fails to sync

**More → Sync errors.** Each stuck item shows the reason.

- **Retry** — try it again.
- **Dismiss** — throw that one away.

The app never deletes your work silently. If a photo went missing it will tell you to
retake it rather than sending an empty record.

---

## 7. Changing the server

Only needed if HR moves you to a different Fateh HR system.

1. **More → Server → Change server.**
2. Tap it once — it changes to **"Tap again to confirm"**. Tap again.
3. Type the new address. The app checks it before saving.
4. You will be **signed out**. Log in again with your email and password.

**Sync first.** If you have anything pending, the app blocks the change and tells you
how many items are waiting. This is deliberate — those records belong to the old
system and cannot be moved to the new one.

---

## 8. Language

**More → Language → English / العربية.** Arabic switches the whole app to
right-to-left. Also available from the login and Server screens.

---

## 9. Common problems

| Problem | Fix |
|---|---|
| Check In does nothing / "Can't get GPS" | Grant location permission, go outdoors or near a window, tap again. |
| Map is blank | No internet. Check-in still records your coordinates. |
| "Photo missing — please retake" | The photo was lost before upload. Retake it and save again. |
| Stuck on the PIN screen | Enter your PIN. If forgotten, go back to login and use **Forgot PIN?**. |
| Screen looks wrong / a tab is missing | Close and reopen the app. It re-reads settings from the server on every open. |
| A tab disappeared | HR turned that feature off. It will come back when they turn it on. |
| Old data after an update | Reopen the app. Still wrong → tell IT your version number from **More**. |

### When you report a problem

Tell IT:

1. Your **version number** (More, at the bottom).
2. What you tapped and what happened.
3. Whether you had internet.
4. Whether **More → Sync errors** shows anything.

That is almost always enough to find it without needing your phone.
