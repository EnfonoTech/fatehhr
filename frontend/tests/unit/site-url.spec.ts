import { describe, it, expect, beforeEach, vi } from "vitest";
import { normalizeSiteUrl, SiteUrlError } from "@/app/platform";

const KEY = "fatehhr.siteUrl";

/**
 * Re-imports platform.ts from scratch so the module-scope cache is seeded again.
 * This is what a cold start does, and it is the only way to test commandment 21.
 */
async function freshPlatform() {
  vi.resetModules();
  return await import("@/app/platform");
}

function setNative(on: boolean) {
  if (on) {
    (window as unknown as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
  } else {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  }
}

beforeEach(() => {
  localStorage.clear();
  setNative(false);
});

describe("normalizeSiteUrl", () => {
  it("adds https:// to a bare host", () => {
    expect(normalizeSiteUrl("hr.acme.com")).toBe("https://hr.acme.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSiteUrl("  hr.acme.com  ")).toBe("https://hr.acme.com");
  });

  it("keeps an explicit http:// scheme", () => {
    expect(normalizeSiteUrl("http://hr.acme.com")).toBe("http://hr.acme.com");
  });

  it("drops a trailing slash", () => {
    expect(normalizeSiteUrl("https://hr.acme.com/")).toBe("https://hr.acme.com");
  });

  it("drops a pasted path and query — the client appends /api/method itself", () => {
    expect(normalizeSiteUrl("https://hr.acme.com/assets/fatehhr/spa/?x=1")).toBe("https://hr.acme.com");
  });

  it("preserves a non-default port", () => {
    expect(normalizeSiteUrl("hr.acme.com:8000")).toBe("https://hr.acme.com:8000");
  });

  it("lowercases the host", () => {
    expect(normalizeSiteUrl("HR.Acme.COM")).toBe("https://hr.acme.com");
  });

  it("allows bare localhost for dev", () => {
    expect(normalizeSiteUrl("localhost:8000")).toBe("https://localhost:8000");
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["hr", "incomplete"],
    ["staging", "incomplete"],
    ["https://", "invalid"],
  ])("rejects %j with code %s", (input, code) => {
    try {
      normalizeSiteUrl(input);
      throw new Error("expected normalizeSiteUrl to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(SiteUrlError);
      expect((e as SiteUrlError).code).toBe(code);
    }
  });
});

describe("cold start (commandment 21)", () => {
  it("a fresh module import sees the stored URL with no await", async () => {
    localStorage.setItem(KEY, "https://hr.acme.com");

    const platform = await freshPlatform();

    // The native bridge is deliberately absent: this is the pre-mount state, and
    // the whole bug was reading the site URL through a bridge-gated code path.
    expect((window as unknown as { Capacitor?: unknown }).Capacitor).toBeUndefined();
    // No loadSiteUrl(), no await between import and read.
    expect(platform.siteUrl()).toBe("https://hr.acme.com");
    expect(platform.hasRuntimeSiteUrl()).toBe(true);
  });

  it("a configured native app does not need setup on the first guard run", async () => {
    localStorage.setItem(KEY, "https://hr.acme.com");
    const platform = await freshPlatform();
    setNative(true);

    expect(platform.needsSiteSetup()).toBe(false);
    expect(platform.API_BASE()).toBe("https://hr.acme.com");
  });

  it("an unconfigured native app needs setup, and API_BASE refuses to guess", async () => {
    const platform = await freshPlatform();
    setNative(true);

    expect(platform.siteUrl()).toBeNull();
    expect(platform.needsSiteSetup()).toBe(true);
    expect(() => platform.API_BASE()).toThrow(/No server configured/);
  });

  it("web builds never need setup and stay same-origin", async () => {
    const platform = await freshPlatform();
    setNative(false);

    expect(platform.needsSiteSetup()).toBe(false);
    expect(platform.API_BASE()).toBe("");
  });
});

describe("setSiteUrl / clearSiteUrl", () => {
  it("normalises before storing, and writes localStorage synchronously enough for the next import", async () => {
    const platform = await freshPlatform();
    await platform.setSiteUrl("  HR.Acme.com/some/path  ");

    expect(localStorage.getItem(KEY)).toBe("https://hr.acme.com");

    // Simulate the next cold start.
    const reloaded = await freshPlatform();
    expect(reloaded.siteUrl()).toBe("https://hr.acme.com");
  });

  it("rejects an invalid address without storing anything", async () => {
    const platform = await freshPlatform();
    // Assert against the *freshly imported* class: resetModules() gives this
    // module its own SiteUrlError identity, so the top-level import would fail
    // an instanceof check against it for reasons that have nothing to do with
    // the behaviour under test.
    await expect(platform.setSiteUrl("nope")).rejects.toBeInstanceOf(platform.SiteUrlError);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("clear removes the value so the next cold start asks again", async () => {
    const platform = await freshPlatform();
    await platform.setSiteUrl("hr.acme.com");
    await platform.clearSiteUrl();

    expect(localStorage.getItem(KEY)).toBeNull();

    const reloaded = await freshPlatform();
    setNative(true);
    expect(reloaded.siteUrl()).toBeNull();
    expect(reloaded.needsSiteSetup()).toBe(true);
  });
});
