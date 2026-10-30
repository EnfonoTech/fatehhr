import { describe, expect, it } from "vitest";
import { isNewer, validManifest } from "./live-update";

describe("live update", () => {
  it("compares bundle versions as numbers", () => {
    expect(isNewer("2610301015", "2610281900")).toBe(true);
    expect(isNewer("2610281900", "2610281900")).toBe(false);
    expect(isNewer("2610271900", "2610281900")).toBe(false);
    expect(isNewer("abc", "2610281900")).toBe(false);
  });

  it("accepts only a manifest with index.html and relative paths", () => {
    const ok = { version: "2610301015", files: [{ path: "index.html", size: 10 }, { path: "assets/a.js", size: 5 }] };
    expect(validManifest(ok)).toBe(true);
    expect(validManifest({ ...ok, files: [{ path: "assets/a.js", size: 5 }] })).toBe(false);
    expect(validManifest({ ...ok, files: [...ok.files, { path: "../x", size: 1 }] })).toBe(false);
    expect(validManifest({ ...ok, files: [...ok.files, { path: "/etc/x", size: 1 }] })).toBe(false);
    expect(validManifest({ ...ok, version: "1.0" })).toBe(false);
    expect(validManifest(null)).toBe(false);
  });
});
