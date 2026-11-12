import { describe, expect, it } from "vitest";
import {
  validateConfig,
  permissionOrigin,
} from "../apps/web/lib/platform-client";
describe("client project/permission boundary", () => {
  it("uses only public keys and rejects privileged keys", () => {
    expect(
      validateConfig({
        url: "https://example.supabase.co",
        key: "sb_publishable_test",
      }).url,
    ).toBe("https://example.supabase.co");
    for (const key of ["sb_secret_test", "service_role", "eyJlegacy"])
      expect(() =>
        validateConfig({ url: "https://example.supabase.co", key }),
      ).toThrow(/publishable/);
  });
  it("refuses arbitrary hosts and insecure nonlocal endpoints", () => {
    for (const url of [
      "https://evil.example",
      "http://example.supabase.co",
      "https://example.supabase.co:444",
      "http://localhost:3000",
    ])
      expect(() =>
        validateConfig({ url, key: "sb_publishable_test" }),
      ).toThrow();
  });
  it("requests a single backend host and normalizes local Chrome permission patterns", () => {
    expect(
      permissionOrigin({
        url: "https://example.supabase.co",
        key: "sb_publishable_test",
      }),
    ).toBe("https://example.supabase.co/*");
    expect(
      permissionOrigin({
        url: "http://localhost:54321",
        key: "sb_publishable_test",
      }),
    ).toBe("http://localhost/*");
  });
});
