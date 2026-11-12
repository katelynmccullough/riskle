import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
describe("local extension boundary", () => {
  it("has only storage permission and local content scripts", () => {
    const manifest = JSON.parse(
      readFileSync("apps/extension/manifest.json", "utf8"),
    );
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts[0].matches).toEqual([
      "http://localhost/*",
      "http://127.0.0.1/*",
    ]);
  });
  it("accepts a minimal local snapshot and rejects foreign, inconsistent and malformed messages", async () => {
    let listener: (m: unknown, s: unknown, cb: unknown) => boolean = () =>
      false;
    const set = vi.fn().mockResolvedValue(undefined);
    runInNewContext(readFileSync("apps/extension/background.js", "utf8"), {
      URL,
      chrome: {
        runtime: {
          onMessage: {
            addListener: (fn: typeof listener) => {
              listener = fn;
            },
          },
        },
        storage: { local: { set } },
      },
    });
    const payload = {
      game: "riskle-mock",
      source: "mock",
      player: "Mara",
      puzzleId: "2026-11-11",
      status: "in_progress",
      guessesUsed: 1,
      maxGuesses: 6,
      bankroll: 900,
      exposure: 100,
      secret: "not stored",
    };
    const response = vi.fn();
    const valid = { type: "MOCK_STATE_UPDATE", payload };
    expect(listener(valid, { url: "http://localhost:3000/" }, response)).toBe(
      true,
    );
    await Promise.resolve();
    expect(response).toHaveBeenCalledWith({ ok: true });
    expect(set.mock.calls[0][0].activeGame.secret).toBeUndefined();
    for (const url of [
      "https://example.com",
      "http://localhost:3001/",
      "http://localhost:3000/other",
      "invalid",
    ])
      expect(listener(valid, { url }, response)).toBe(false);
    expect(
      listener(
        { ...valid, payload: { ...payload, bankroll: NaN } },
        { url: "http://localhost:3000/" },
        response,
      ),
    ).toBe(false);
    expect(
      listener(
        { ...valid, payload: { ...payload, status: "lost" } },
        { url: "http://localhost:3000/" },
        response,
      ),
    ).toBe(false);
    expect(listener(null, { url: "http://localhost:3000/" }, response)).toBe(
      false,
    );
    expect(set).toHaveBeenCalledTimes(1);
  });
});
