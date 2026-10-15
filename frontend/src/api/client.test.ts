import { describe, expect, it } from "vitest";
import { ApiError, errorMessage, readableServerMessage, stripExceptionPrefix } from "./client";

describe("readable server errors", () => {
  it("strips the frappe exception prefix", () => {
    expect(
      stripExceptionPrefix(
        "frappe.exceptions.ValidationError: Application period cannot be outside leave allocation period",
      ),
    ).toBe("Application period cannot be outside leave allocation period");
    expect(stripExceptionPrefix("upload failed (500)")).toBe("upload failed (500)");
  });

  it("prefers _server_messages over exception", () => {
    const body = {
      exception: "frappe.exceptions.ValidationError: <b>Raw</b>",
      _server_messages: JSON.stringify([
        JSON.stringify({ message: "Client approval <b>evidence</b> is missing", title: "Message" }),
      ]),
    };
    expect(readableServerMessage(body)).toBe("Client approval evidence is missing");
  });

  it("falls back to the stripped exception", () => {
    expect(
      readableServerMessage({ exception: "hrms.hr.doctype.leave_application.leave_application.InsufficientLeaveBalanceError: Not enough" }),
    ).toBe("Not enough");
  });

  it("returns null for empty bodies", () => {
    expect(readableServerMessage(undefined)).toBeNull();
    expect(readableServerMessage({})).toBeNull();
  });

  it("errorMessage handles ApiError and plain errors", () => {
    expect(errorMessage(new ApiError(417, {}, "Nice message"))).toBe("Nice message");
    expect(errorMessage(new Error("frappe.exceptions.PermissionError: Nope"))).toBe("Nope");
    expect(errorMessage(null, "fallback")).toBe("fallback");
  });
});
