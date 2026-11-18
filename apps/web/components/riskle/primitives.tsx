"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import type { FeedbackEvent } from "../../lib/confirmed-events";
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    play: (
      <>
        <path d="m9 5 10 7-10 7z" />
      </>
    ),
    friends: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5" />
      </>
    ),
    bets: (
      <>
        <path d="M5 3h14v18l-4-2-3 2-3-2-4 2zM8 8h8M8 12h5" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 5 5L20 7" />,
    coin: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M14.5 8H11a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9.5M12 6v12" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 3h8v6a4 4 0 0 1-8 0zM8 5H4v2a5 5 0 0 0 5 5m7-7h4v2a5 5 0 0 1-5 5M12 13v5m-5 3h10m-8-3h6" />
      </>
    ),
    history: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    wallet: (
      <>
        <path d="M3 6h17v15H3zM3 6V3h14v3m-1 6h5v5h-5z" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" fill="currentColor" />
        <circle cx="15" cy="17" r="3" fill="currentColor" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 8a3 3 0 1 1 4 3c-1 0-1 1-1 3m0 3v.1" />
      </>
    ),
    share: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M5 12v9h14v-9" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    pause: (
      <>
        <path d="M9 5v14M15 5v14" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 2 7 7 3-7 2-2 8-3-8-7-2 7-3z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.play}
    </svg>
  );
}
export function Avatar({
  name,
  url,
  size = "normal",
}: {
  name: string;
  url?: string | null;
  size?: "small" | "normal" | "large";
}) {
  return (
    <span className={`rk-avatar rk-avatar-${size}`} aria-label={name}>
      {url ? (
        <img src={url} alt="" referrerPolicy="no-referrer" />
      ) : (
        name.trim().slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
export function Wordmark() {
  return (
    <span className="rk-wordmark">
      <span className="rk-brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      riskle<span className="rk-wordmark-dot">.</span>
    </span>
  );
}
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`rk-pill rk-${tone}`}>{children}</span>;
}
export function EmptyState({
  icon = "play",
  title,
  children,
  action,
}: {
  icon?: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rk-empty">
      <span className="rk-empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="rk-section-title">
      <div>
        {eyebrow && <p className="rk-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function AnimatedCoinCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    let frame: number;
    const start = performance.now();
    const update = (time: number) => {
      const t = Math.min(1, (time - start) / 650);
      setDisplay(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <output
      className="rk-counter"
      data-value={value}
      aria-label="Available coins"
      aria-live="off"
    >
      <span aria-hidden="true">{display.toLocaleString()}</span>
      <span className="rk-sr-only">{`${value.toLocaleString()} available coins`}</span>
    </output>
  );
}
export function CoinBalance({
  balance,
  profit,
  exposure,
}: {
  balance: number;
  profit?: number;
  exposure: number;
}) {
  return (
    <section className="rk-balance" aria-label="Your coins">
      <div>
        <span className="rk-balance-caption">
          <Icon name="coin" size={17} />
          Your play money
        </span>
        <div className="rk-balance-number">
          <AnimatedCoinCounter value={balance} />
          <span>coins</span>
        </div>
        <p>
          {exposure > 0
            ? `${exposure} coins in play`
            : "Ready for your next good idea."}
        </p>
      </div>
      <div className="rk-daily-profit">
        <span>Today</span>
        {profit === undefined ? (
          <strong>—</strong>
        ) : (
          <strong className={profit < 0 ? "rk-negative" : "rk-positive"}>
            {profit >= 0 ? "+" : ""}
            {profit}
          </strong>
        )}
        <small>net coins</small>
      </div>
    </section>
  );
}
export function Sheet({
  title,
  children,
  onClose,
  description,
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  description?: string;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="rk-sheet"
      aria-labelledby="sheet-title"
      aria-describedby={description ? "sheet-description" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) closeRef.current();
      }}
      onClick={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (
          e.target === ref.current &&
          dismissible &&
          rect &&
          (e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom)
        )
          closeRef.current();
      }}
    >
      <div className="rk-sheet-handle" />
      <div className="rk-section-title">
        <h2 id="sheet-title">{title}</h2>
        <button
          className="rk-icon-button"
          disabled={!dismissible}
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {description && (
        <p id="sheet-description" className="rk-muted">
          {description}
        </p>
      )}
      {children}
    </dialog>
  );
}
export function EventToast({
  event,
  dismiss,
}: {
  event: FeedbackEvent;
  dismiss: () => void;
}) {
  return (
    <div className={`rk-toast rk-toast-${event.kind}`} role="status">
      <span className="rk-toast-icon">
        <Icon
          name={
            event.kind === "lost"
              ? "bets"
              : event.kind === "won"
                ? "spark"
                : event.kind === "refund"
                  ? "arrow"
                  : "check"
          }
        />
      </span>
      <div>
        <strong>{event.title}</strong>
        <p>{event.detail}</p>
      </div>
      <button
        className="rk-icon-button"
        aria-label="Dismiss notification"
        onClick={dismiss}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
export function Celebration({
  event,
  dismiss,
  onView,
}: {
  event: FeedbackEvent;
  dismiss: () => void;
  onView: () => void;
}) {
  const won = event.kind === "won";
  return (
    <aside
      className={`rk-outcome ${won ? "rk-outcome-win" : "rk-outcome-loss"}`}
      aria-label={won ? "Winning wager" : "Losing wager"}
      role="status"
    >
      {won && (
        <div className="rk-confetti" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </div>
      )}
      <button
        className="rk-icon-button rk-outcome-close"
        aria-label="Dismiss result"
        onClick={dismiss}
      >
        <Icon name="close" size={17} />
      </button>
      <span className="rk-outcome-icon">
        <Icon name={won ? "spark" : "bets"} size={24} />
      </span>
      <p className="rk-eyebrow">{won ? "A very good call" : "A plot twist"}</p>
      <h2>{event.title}</h2>
      {event.amount !== undefined && (
        <strong className="rk-outcome-amount">
          {event.amount >= 0 ? "+" : ""}
          {event.amount}
          <small> net coins on this bet</small>
        </strong>
      )}
      <p>{event.detail}</p>
      <button className="rk-link" onClick={onView}>
        See the result <Icon name="arrow" size={16} />
      </button>
    </aside>
  );
}
