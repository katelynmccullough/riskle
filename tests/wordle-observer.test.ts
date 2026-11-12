import { describe, expect, it } from "vitest";
import {
  isWordle,
  readIdentity,
  readWordle,
} from "../apps/extension/src/wordle-observer";
const identity = { puzzleId: "wordle:1971", puzzleDate: "2026-11-11" };
function doc(states: string[], visible = true) {
  const tiles = states.map((state) => ({
    getAttribute: (name: string) => (name === "data-state" ? state : null),
    getClientRects: () => (visible ? [{}] : []),
  }));
  return {
    querySelector: () => ({ querySelectorAll: () => tiles }),
  } as unknown as Document;
}
describe("observer based on inspected visible NYT tile attributes", () => {
  it("recognizes only the official daily Wordle URL", () => {
    expect(isWordle("https://www.nytimes.com/games/wordle/index.html")).toBe(
      true,
    );
    for (const url of [
      "https://evil.example/games/wordle/index.html",
      "https://www.nytimes.com/games/wordle/archive",
      "http://www.nytimes.com/games/wordle/index.html",
    ])
      expect(isWordle(url)).toBe(false);
  });
  it("reads the visible date and puzzle number without deriving a date from the computer clock", () => {
    expect(readIdentity("November 11, 2026 No. 1971")).toEqual(identity);
    expect(readIdentity("November 11, 2026 No. 1972")).toBeNull();
    expect(readIdentity("No. 1971")).toBeNull();
  });
  it("ignores incomplete typing and partial reveal animation", () => {
    expect(
      readWordle(doc(["tbd", ...Array(29).fill("empty")]), identity),
    ).toMatchObject({ guessesUsed: 0, hasStarted: true });
    expect(
      readWordle(doc(["correct", ...Array(29).fill("empty")]), identity),
    ).toBeNull();
  });
  it("counts only fully evaluated rows and detects a visible win", () => {
    expect(
      readWordle(
        doc([...Array(5).fill("present"), ...Array(25).fill("empty")]),
        identity,
      ),
    ).toMatchObject({ guessesUsed: 1, status: "in_progress" });
    expect(
      readWordle(
        doc([
          ...Array(5).fill("absent"),
          ...Array(5).fill("correct"),
          ...Array(20).fill("empty"),
        ]),
        identity,
      ),
    ).toMatchObject({ guessesUsed: 2, status: "completed" });
  });
  it("detects a six-guess loss and fails closed on missing identity or changed/hidden boards", () => {
    expect(readWordle(doc(Array(30).fill("absent")), identity)).toMatchObject({
      guessesUsed: 6,
      status: "lost",
    });
    expect(readWordle(doc(Array(30).fill("empty")), null)).toBeNull();
    expect(readWordle(doc(Array(25).fill("empty")), identity)).toBeNull();
    expect(
      readWordle(doc(Array(30).fill("empty"), false), identity),
    ).toBeNull();
  });
  it("never returns letters or the solution", () => {
    const state = readWordle(doc(Array(30).fill("empty")), identity);
    expect(Object.keys(state!)).toEqual([
      "game",
      "hasStarted",
      "puzzleId",
      "puzzleDate",
      "guessesUsed",
      "status",
      "observedAt",
      "offsetMinutes",
      "source",
    ]);
  });
});
