/**
 * Biometric unlock helper.
 *
 * Design:
 *   - PIN remains the source of truth — users always set one first.
 *   - After a successful PIN setup/unlock the app asks once: "enable biometric?"
 *   - Enrolling just sets a boolean flag in Preferences. No secret is stored;
 *     the biometric prompt is treated as sufficient proof of identity — on
 *     success we simply flip `isPinVerified` via the same `markPinVerified()`
 *     the PIN flow uses.
 *
 *   This is safe because:
 *   1. The API secret is already cached in SecureStorage / Preferences.
 *   2. The lock-screen biometric is gating access to the *device* — identical
 *      trust model to the OS lock screen.
 *   3. The enrolment flag is per-device — uninstalling the app clears it.
 *
 * Fallback: if biometry is unavailable or authentication fails, the user falls
 * back to the PIN pad as normal.
 */

import { BiometricAuth, BiometryType } from "@aparajita/capacitor-biometric-auth";
import { secureGet, secureSet, secureRemove, isNativePlatform } from "./frappe";

const KEY_ENROLLED = "fatehhr.biometric_enrolled";

export interface BiometricInfo {
  /** Native platform with biometric hardware available and user has enrolled at OS level */
  available: boolean;
  /** This app has previously enrolled biometric unlock */
  enrolled: boolean;
  /** Face ID, Touch ID, Fingerprint, etc — for UI copy */
  label: string;
}

function typeToLabel(t: BiometryType | undefined): string {
  switch (t) {
    case BiometryType.touchId:          return "Touch ID";
    case BiometryType.faceId:           return "Face ID";
    case BiometryType.fingerprintAuthentication: return "Fingerprint";
    case BiometryType.faceAuthentication:        return "Face Unlock";
    case BiometryType.irisAuthentication:        return "Iris Unlock";
    default:                            return "Biometric";
  }
}

export async function getBiometricInfo(): Promise<BiometricInfo> {
  if (!isNativePlatform()) {
    return { available: false, enrolled: false, label: "Biometric" };
  }
  try {
    const info = await BiometricAuth.checkBiometry();
    const enrolled = (await secureGet(KEY_ENROLLED)) === "1";
    return {
      available: Boolean(info.isAvailable),
      enrolled: enrolled && Boolean(info.isAvailable),
      label: typeToLabel(info.biometryType),
    };
  } catch {
    return { available: false, enrolled: false, label: "Biometric" };
  }
}

export async function enrollBiometric(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    await BiometricAuth.authenticate({
      reason: "Confirm to enable biometric unlock",
      cancelTitle: "Cancel",
      allowDeviceCredential: false,
      androidTitle: "Enable biometric unlock",
      androidSubtitle: "Use your fingerprint or face",
      androidConfirmationRequired: false,
    });
    await secureSet(KEY_ENROLLED, "1");
    return true;
  } catch {
    return false;
  }
}

export async function disableBiometric(): Promise<void> {
  await secureRemove(KEY_ENROLLED);
}

/**
 * Prompt for biometric auth. Returns true iff the user passed the prompt.
 * Caller is responsible for flipping the session's pin-verified state.
 */
export async function verifyBiometric(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    await BiometricAuth.authenticate({
      reason: "Unlock Fateh HR",
      cancelTitle: "Use PIN",
      allowDeviceCredential: false,
      androidTitle: "Unlock Fateh HR",
      androidSubtitle: "Use your fingerprint or face",
      androidConfirmationRequired: false,
    });
    return true;
  } catch {
    return false;
  }
}
