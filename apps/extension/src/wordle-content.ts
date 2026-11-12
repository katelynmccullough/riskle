import { observeWordle, type PuzzleIdentity } from "./wordle-observer";
const today = new Date();
const puzzleDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
void chrome.runtime
  .sendMessage({ type: "WORDLE_IDENTITY", puzzleDate })
  .then((reply: { identity?: PuzzleIdentity }) => {
    observeWordle(
      document,
      location.href,
      (payload) => {
        void chrome.runtime
          .sendMessage({ type: "WORDLE_PROGRESS", payload })
          .catch(() => undefined);
      },
      (reason) => {
        void chrome.runtime
          .sendMessage({ type: "WORDLE_UNSUPPORTED", reason })
          .catch(() => undefined);
      },
      reply?.identity ?? null,
    );
  })
  .catch(() => undefined);
