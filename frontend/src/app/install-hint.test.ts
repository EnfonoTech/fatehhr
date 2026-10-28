import { describe, expect, it } from "vitest";
import { installHint, isIos, type InstallEnv } from "./install-hint";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const IPHONE_INSTAGRAM = IPHONE + " Instagram 300.0";

function env(over: Partial<InstallEnv>): InstallEnv {
  return { userAgent: IPHONE, maxTouchPoints: 5, standalone: false, native: false, dismissed: false, ...over };
}

describe("isIos", () => {
  it("detects iPhone", () => expect(isIos(IPHONE, 5)).toBe(true));
  it("detects iPadOS posing as a Mac", () => expect(isIos(IPAD_DESKTOP_UA, 5)).toBe(true));
  it("leaves a real Mac alone", () => expect(isIos(IPAD_DESKTOP_UA, 0)).toBe(false));
  it("leaves Android alone", () => expect(isIos(ANDROID, 5)).toBe(false));
});

describe("installHint", () => {
  it("asks iPhone Safari to add to home screen", () => expect(installHint(env({}))).toBe("add-to-home"));
  it("asks in-app browsers to open Safari", () => expect(installHint(env({ userAgent: IPHONE_INSTAGRAM }))).toBe("open-in-safari"));
  it("hides once installed", () => expect(installHint(env({ standalone: true }))).toBe("none"));
  it("hides after dismissal", () => expect(installHint(env({ dismissed: true }))).toBe("none"));
  it("hides in the native APK", () => expect(installHint(env({ native: true }))).toBe("none"));
  it("hides on Android", () => expect(installHint(env({ userAgent: ANDROID }))).toBe("none"));
});
