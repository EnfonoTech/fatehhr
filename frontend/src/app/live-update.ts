// Live update of the app's screens without a new APK (Cooperheat, 30 Oct: "option 2, private").
//
// The installed app always has its own screens, so it opens without a connection. When online it
// reads https://<erp>/assets/fatehhr/native/manifest.json; when the server has a newer screen
// bundle it downloads every file into the app's private storage. On the next start the app
// switches to it (Capacitor WebView.setServerBasePath) and keeps it only once the new bundle has
// started and called markBundleReady() (persistServerBasePath). A bundle that never gets there is
// not kept: the next start opens the previous screens again and that version is never retried.
// Installing a new APK clears the stored bundle (Capacitor does that itself).
//
// The page origin stays https://localhost, so the login, the PIN and the offline queue are kept.
import { Capacitor, WebView } from "@capacitor/core";
import { Directory, Filesystem, Encoding } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { CUSTOMER_ERP_DOMAIN } from "virtual:fatehhr-theme";

export const BUNDLE_VERSION: string = __BUNDLE_VERSION__;

const KEY_READY = "liveupdate.ready"; // {version, path}: downloaded, applied on the next start
const KEY_PENDING = "liveupdate.pending"; // version switched to, not yet confirmed
const KEY_FAILED = "liveupdate.failed"; // versions that did not start: never again
const ROOT = "live";

export interface Manifest {
  version: string;
  files: { path: string; size: number }[];
}

const native = () => Capacitor.isNativePlatform();
const base = () => `https://${CUSTOMER_ERP_DOMAIN}/assets/fatehhr/native`;

async function getJson<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key });
  try {
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}
const setJson = (key: string, v: unknown) => Preferences.set({ key, value: JSON.stringify(v) });

/** Is `candidate` a newer bundle than the one running? Versions are YYYYMMDDHHMM numbers. */
export function isNewer(candidate: string, current: string): boolean {
  const a = Number(candidate);
  const b = Number(current);
  return Number.isFinite(a) && Number.isFinite(b) && a > b;
}

/** A manifest the app will accept: a version, an index.html, only relative paths. */
export function validManifest(m: unknown): m is Manifest {
  const x = m as Manifest;
  return (
    !!x &&
    typeof x.version === "string" &&
    /^\d{8,14}$/.test(x.version) &&
    Array.isArray(x.files) &&
    x.files.some((f) => f.path === "index.html") &&
    x.files.every((f) => typeof f.path === "string" && !f.path.startsWith("/") && !f.path.includes(".."))
  );
}

/** Called first thing at start: switch to a downloaded bundle, or give up on one that failed. */
export async function applyDownloadedBundle(): Promise<boolean> {
  if (!native()) return false;
  try {
    const pending = (await Preferences.get({ key: KEY_PENDING })).value;
    if (pending && pending !== BUNDLE_VERSION) {
      // we switched to `pending` last time and it never confirmed: it does not work
      const failed = (await getJson<string[]>(KEY_FAILED)) || [];
      await setJson(KEY_FAILED, [...failed, pending].slice(-10));
      await Preferences.remove({ key: KEY_PENDING });
      await Preferences.remove({ key: KEY_READY });
      return false;
    }
    const ready = await getJson<{ version: string; path: string }>(KEY_READY);
    if (!ready || !isNewer(ready.version, BUNDLE_VERSION)) return false;
    await Preferences.set({ key: KEY_PENDING, value: ready.version });
    await WebView.setServerBasePath({ path: ready.path }); // reloads into the new screens
    return true;
  } catch {
    return false;
  }
}

/** The running bundle started fine: keep it for the next starts. */
export async function markBundleReady(): Promise<void> {
  if (!native()) return;
  try {
    const pending = (await Preferences.get({ key: KEY_PENDING })).value;
    if (pending && pending === BUNDLE_VERSION) {
      await WebView.persistServerBasePath();
      await Preferences.remove({ key: KEY_PENDING });
      await Preferences.remove({ key: KEY_READY });
    }
  } catch {
    /* keep running; the bundle is simply not kept */
  }
}

/** When online: fetch the manifest and download a newer bundle for the next start. */
export async function checkForUpdate(): Promise<string | null> {
  if (!native()) return null;
  try {
    const tmp = `${ROOT}/manifest.json`;
    await Filesystem.downloadFile({
      url: `${base()}/manifest.json?t=${Date.now()}`,
      path: tmp,
      directory: Directory.Data,
      recursive: true,
    });
    const raw = await Filesystem.readFile({ path: tmp, directory: Directory.Data, encoding: Encoding.UTF8 });
    const manifest = JSON.parse(String(raw.data));
    if (!validManifest(manifest) || !isNewer(manifest.version, BUNDLE_VERSION)) return null;
    const failed = (await getJson<string[]>(KEY_FAILED)) || [];
    if (failed.includes(manifest.version)) return null;
    const ready = await getJson<{ version: string }>(KEY_READY);
    if (ready && ready.version === manifest.version) return manifest.version;

    const dir = `${ROOT}/${manifest.version}`;
    for (const f of manifest.files) {
      await Filesystem.downloadFile({
        url: `${base()}/${manifest.version}/${f.path}`,
        path: `${dir}/${f.path}`,
        directory: Directory.Data,
        recursive: true,
      });
      const st = await Filesystem.stat({ path: `${dir}/${f.path}`, directory: Directory.Data });
      if (f.size && st.size !== f.size) throw new Error("size mismatch " + f.path);
    }
    const { uri } = await Filesystem.getUri({ path: dir, directory: Directory.Data });
    await setJson(KEY_READY, { version: manifest.version, path: uri.replace(/^file:\/\//, "") });
    return manifest.version;
  } catch {
    return null; // try again next time
  }
}
