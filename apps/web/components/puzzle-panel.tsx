"use client";
import { useState } from "react";
import { mockAnswer, scoreGuess } from "@riskle/game-engine";
import type { MockSession, PlayerProgress } from "@riskle/shared";
export function PuzzlePanel({
  session,
  progress,
  busy,
  onGuess,
}: {
  session: MockSession;
  progress: PlayerProgress;
  busy: boolean;
  onGuess: (word: string) => Promise<boolean>;
}) {
  const [guess, setGuess] = useState("");
  const [hint, setHint] = useState(false);
  const finished =
    progress.status === "completed" || progress.status === "lost";
  return (
    <section className="panel puzzle">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your daily puzzle</p>
          <h1>Five letters. Six chances.</h1>
        </div>
        <span className="pill">{progress.status.replace("_", " ")}</span>
      </div>
      <p className="muted">
        Original mock puzzle · {session.puzzleId} · guess {progress.guessesUsed}{" "}
        of 6. Any five letters accepted; no dictionary.
      </p>
      <div className="board" aria-label="Guess board">
        {Array.from({ length: 6 }, (_, row) => {
          const word = session.guesses[row] ?? "";
          const scores = word
            ? scoreGuess(word, mockAnswer(session.puzzleId))
            : [];
          return (
            <div
              className="board-row"
              key={row}
              aria-label={
                word
                  ? `${word}: ${scores.join(", ")}`
                  : `Empty guess ${row + 1}`
              }
            >
              {Array.from({ length: 5 }, (_, col) => (
                <span
                  aria-hidden="true"
                  className={`tile ${scores[col] ?? ""}`}
                  key={col}
                >
                  {word[col]}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {finished ? (
        <p className="result" role="status">
          {progress.status === "completed"
            ? `Solved in ${progress.guessesUsed}!`
            : `Six guesses used. Answer: ${mockAnswer(session.puzzleId)}.`}{" "}
          All remaining markets are closed and wagers settled.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onGuess(guess).then((ok) => {
              if (ok) setGuess("");
            });
          }}
          className="guess-form"
        >
          <label>
            Your next guess
            <input
              aria-label="Five-letter guess"
              value={guess}
              onChange={(e) => setGuess(e.target.value.toUpperCase())}
              maxLength={5}
              pattern="[a-zA-Z]{5}"
              autoComplete="off"
              required
            />
          </label>
          <button className="primary" disabled={busy || guess.length !== 5}>
            Submit guess
          </button>
        </form>
      )}
      <button className="text-button" onClick={() => setHint(!hint)}>
        {hint ? "Hide test answer" : "Reveal test answer"}
      </button>
      {hint && (
        <p>
          Test answer: <strong>{mockAnswer(session.puzzleId)}</strong>. Shared
          across local players; use it to test settlement.
        </p>
      )}
      <p className="muted small">
        Green = correct position. Yellow = present elsewhere. Gray = absent.
        Switch players to advance a friend’s puzzle.
      </p>
    </section>
  );
}
