// STATIC imports per frappe-vue-pwa §3.4. Do NOT dynamic-import @capacitor/*.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Geolocation } from "@capacitor/geolocation";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Network, type ConnectionStatus } from "@capacitor/network";

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

export async function hapticLight() { try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* ignore */ } }
export async function hapticMedium() { try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch { /* ignore */ } }
export async function hapticHeavy() { try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch { /* ignore */ } }
export async function hapticSuccess() { try { await Haptics.notification({ type: NotificationType.Success }); } catch { /* ignore */ } }
export async function hapticError() { try { await Haptics.notification({ type: NotificationType.Error }); } catch { /* ignore */ } }
