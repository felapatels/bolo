import { describe, test, expect } from "vitest";
import { speechCapabilityOf } from "@/lib/language-context";
import type { Language } from "@workspace/api-client-react";

// speechCapabilityOf is the single source of truth for defaulting: the field
// is optional (mobile back-compat), so absence must read as full "supported".
function lang(partial: Partial<Language>): Language {
  return {
    code: "xx",
    name: "Test",
    nativeName: "Test",
    script: "Latn",
    fontFamily: "Noto Sans",
    rtl: false,
    sortOrder: 0,
    ...partial,
  };
}

describe("speechCapabilityOf", () => {
  test("defaults to supported when the field is absent", () => {
    expect(speechCapabilityOf(lang({}))).toBe("supported");
  });

  test("defaults to supported when the language is undefined", () => {
    expect(speechCapabilityOf(undefined)).toBe("supported");
  });

  test("passes through explicit degraded / unsupported values", () => {
    expect(speechCapabilityOf(lang({ speechCapability: "degraded" }))).toBe("degraded");
    expect(speechCapabilityOf(lang({ speechCapability: "unsupported" }))).toBe("unsupported");
    expect(speechCapabilityOf(lang({ speechCapability: "supported" }))).toBe("supported");
  });
});
