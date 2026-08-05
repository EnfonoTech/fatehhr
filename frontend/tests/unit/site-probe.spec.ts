import { describe, it, expect, afterEach, vi } from "vitest";
import { probeSite, SiteProbeError, type SiteProbeErrorCode } from "@/api/site-probe";

const ORIGIN = "https://hr.acme.com";
const SITE_INFO = `${ORIGIN}/api/method/fatehhr.api.auth.site_info`;
const PING = `${ORIGIN}/api/method/frappe.ping`;

/** Minimal Response stand-in — avoids depending on whichever fetch impl jsdom has. */
function reply(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function abortError() {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

/** Routes by URL so a test only states the cases it cares about. */
function mockFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const key = String(url);
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected fetch: ${key}`);
    return await handler();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function expectCode(p: Promise<unknown>, code: SiteProbeErrorCode) {
  await expect(p).rejects.toBeInstanceOf(SiteProbeError);
  await p.catch((e) => expect((e as SiteProbeError).code).toBe(code));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("probeSite", () => {
  it("accepts a site that answers site_info", async () => {
    mockFetch({
      [SITE_INFO]: () => reply({ message: { ok: true, app: "fatehhr", app_version: "0.1.0" } }),
    });

    await expect(probeSite(ORIGIN)).resolves.toEqual({ appVersion: "0.1.0" });
  });

  it("rejects a Frappe site running some other app", async () => {
    mockFetch({
      [SITE_INFO]: () => reply({ message: { ok: true, app: "vansale", app_version: "1.0.29" } }),
    });

    await expectCode(probeSite(ORIGIN), "not-fatehhr");
  });

  // Commandment 22: this is the case that shipped broken. A site whose fatehhr
  // build predates site_info answers 417, not 404 — treating only 404 as
  // "old build" rejects every not-yet-updated site.
  it("falls through to frappe.ping on 417 (missing whitelisted method)", async () => {
    const f = mockFetch({
      [SITE_INFO]: () => reply({ exc_type: "ValidationError" }, 417),
      [PING]: () => reply({ message: "pong" }),
    });

    await expect(probeSite(ORIGIN)).resolves.toEqual({ appVersion: null });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("falls through to frappe.ping on 404 too", async () => {
    mockFetch({
      [SITE_INFO]: () => reply({}, 404),
      [PING]: () => reply({ message: "pong" }),
    });

    await expect(probeSite(ORIGIN)).resolves.toEqual({ appVersion: null });
  });

  it("rejects a host that answers HTTP but is not Frappe at all", async () => {
    mockFetch({
      [SITE_INFO]: () => reply("<html>hello</html>", 200),
      [PING]: () => reply("<html>hello</html>", 200),
    });

    await expectCode(probeSite(ORIGIN), "not-fatehhr");
  });

  it("rejects when ping itself errors", async () => {
    mockFetch({
      [SITE_INFO]: () => reply({}, 500),
      [PING]: () => reply({}, 500),
    });

    await expectCode(probeSite(ORIGIN), "not-fatehhr");
  });

  // DNS failure, TLS failure, offline — and a CORS rejection, which is
  // indistinguishable from the rest. Hence the copy mentioning app access.
  it("reports unreachable when fetch rejects with TypeError", async () => {
    mockFetch({
      [SITE_INFO]: () => {
        throw new TypeError("Failed to fetch");
      },
    });

    await expectCode(probeSite(ORIGIN), "unreachable");
  });

  it("reports timeout when the request aborts", async () => {
    mockFetch({
      [SITE_INFO]: () => {
        throw abortError();
      },
    });

    await expectCode(probeSite(ORIGIN), "timeout");
  });

  it("reports timeout when the ping stage aborts", async () => {
    mockFetch({
      [SITE_INFO]: () => reply({}, 417),
      [PING]: () => {
        throw abortError();
      },
    });

    await expectCode(probeSite(ORIGIN), "timeout");
  });

  it("passes an abort signal so a firewalled host cannot hang the screen", async () => {
    const f = mockFetch({
      [SITE_INFO]: () => reply({ message: { app: "fatehhr", app_version: "0.1.0" } }),
    });

    await probeSite(ORIGIN);

    const init = f.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.credentials).toBe("omit");
  });
});
