// STATIC imports per frappe-vue-pwa §3.4. Do NOT dynamic-import @capacitor/*.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Geolocation } from "@capacitor/geolocation";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Network, type ConnectionStatus } from "@capacitor/network";
import { Filesystem, Directory } from "@capacitor/filesystem";

export function isNativePlatform(): boolean {
  return (Capacitor as unknown as { isNativePlatform?: () => boolean }).isNativePlatform?.() ?? false;
}

/**
 * Subscribe to connection-state changes. On native, this fires even when the
 * webview is backgrounded — so queued check-ins / leave / expense drain as
 * soon as network returns, without the user opening the app. (Fixes the
 * "PWA won't sync without opening" limitation of pure-browser builds.)
 *
 * Returns an unsubscribe function.
 */
export async function onNetworkChange(
  handler: (status: ConnectionStatus) => void,
): Promise<() => void> {
  const listener = await Network.addListener("networkStatusChange", handler);
  return () => {
    void listener.remove();
  };
}

export async function getNetworkStatus(): Promise<ConnectionStatus> {
  return await Network.getStatus();
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.set({ key, value });
    return;
  }
  localStorage.setItem(key, value);
}

export async function secureGet(key: string): Promise<string | null> {
  if (isNativePlatform()) {
    const r = await Preferences.get({ key });
    return r.value ?? null;
  }
  return localStorage.getItem(key);
}

export async function secureRemove(key: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.remove({ key });
    return;
  }
  localStorage.removeItem(key);
}

type Coords = { latitude: number; longitude: number };

/** Reject after `ms`. The Android plugin (@capacitor/geolocation 6.x) ignores
 *  `timeout` for getCurrentPosition, so we enforce our own bound. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("location timeout")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function tryPosition(opts: {
  enableHighAccuracy: boolean;
  maximumAge: number;
  timeout: number;
}): Promise<Coords | null> {
  try {
    const pos = await withTimeout(Geolocation.getCurrentPosition(opts), opts.timeout + 2000);
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Current position, or null. Two attempts:
 *  1. High accuracy (GPS), accepting a fix up to 30 s old. On Android the
 *     plugin returns the OS last-known fix instantly when it is younger than
 *     `maximumAge`; with the old default (0) it always forced a fresh GPS fix,
 *     which indoors often comes back null ("location unavailable").
 *  2. Fallback: low accuracy (network / Wi-Fi / cell, "balanced power"),
 *     accepting a fix up to 5 min old. Works indoors and when the user granted
 *     only "approximate" location.
 */
export async function getCurrentCoords(): Promise<Coords | null> {
  return (
    (await tryPosition({ enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 })) ??
    (await tryPosition({ enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 }))
  );
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

/**
 * Save a Blob to the device. Works on:
 *   - Native (Capacitor): uses @capacitor/filesystem → Documents dir, returns
 *     the on-device path.
 *   - Web browsers: falls back to the anchor-download trick.
 *
 * The APK WebView silently ignores `<a download>` clicks which is why the
 * "download PDF" button did nothing on the 1.0.12 build.
 */
export async function saveBlobToDevice(blob: Blob, filename: string): Promise<{ uri?: string; downloaded: boolean }> {
  // Slashes/spaces in Frappe doc names break filesystem writes and share sheets.
  const safeName = filename.replace(/[^A-Za-z0-9._-]+/g, "_");

  if (isNativePlatform()) {
    const base64 = await blobToBase64(blob);
    const res = await Filesystem.writeFile({
      path: safeName,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    return { uri: res.uri, downloaded: true };
  }

  // Web: anchor-click trick
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { downloaded: true };
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = String(reader.result ?? "");
      // Strip the "data:*/*;base64," prefix — Filesystem.writeFile wants raw.
      resolve(s.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function hapticLight() { try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* ignore */ } }
export async function hapticMedium() { try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch { /* ignore */ } }
export async function hapticHeavy() { try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch { /* ignore */ } }
export async function hapticSuccess() { try { await Haptics.notification({ type: NotificationType.Success }); } catch { /* ignore */ } }
export async function hapticError() { try { await Haptics.notification({ type: NotificationType.Error }); } catch { /* ignore */ } }
