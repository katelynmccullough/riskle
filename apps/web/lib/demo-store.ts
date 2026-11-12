import {
  createDemo,
  restoreEngine,
  type RiskleGameEngine,
} from "@riskle/game-engine";
export const SAVE_KEY = "riskle.demo.v1";
export const DATABASE = "riskle-demo";
export const STORE = "state";
export const CHANNEL = "riskle-demo-updates";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other Riskle tabs and retry opening the demo."));
  });
}
function restoreOrCreate(snapshot: unknown): RiskleGameEngine {
  if (snapshot !== undefined) return restoreEngine(snapshot);
  // Migrate an earlier localStorage save once, without discarding its history.
  const legacy = localStorage.getItem(SAVE_KEY);
  return legacy ? restoreEngine(JSON.parse(legacy) as unknown) : createDemo();
}
export async function loadDemo(): Promise<RiskleGameEngine> {
  const db = await openDatabase();
  try {
    const snapshot: unknown = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(SAVE_KEY);
      request.onsuccess = () => resolve(request.result as unknown);
      request.onerror = () => reject(request.error);
    });
    return restoreOrCreate(snapshot);
  } finally {
    db.close();
  }
}
/** IndexedDB serializes the read, rule execution and write in one cross-tab transaction. */
export async function transact<T>(
  operation: (engine: RiskleGameEngine) => T,
): Promise<{ engine: RiskleGameEngine; result: T }> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    let failure: unknown;
    let committed: { engine: RiskleGameEngine; result: T };
    let migrated = false;
    const request = transaction.objectStore(STORE).get(SAVE_KEY);
    request.onsuccess = () => {
      try {
        const snapshot: unknown = request.result;
        migrated = snapshot === undefined;
        const engine = restoreOrCreate(snapshot);
        const result = operation(engine);
        engine.revision++;
        transaction.objectStore(STORE).put(engine.snapshot(), SAVE_KEY);
        committed = { engine, result };
      } catch (e) {
        failure = e;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => {
      db.close();
      // The IndexedDB commit is authoritative; notifications/preferences are best effort.
      if (migrated) {
        try {
          localStorage.removeItem(SAVE_KEY);
        } catch {
          /* Legacy backup is retained. */
        }
      }
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel(CHANNEL);
          channel.postMessage(committed.engine.revision);
          channel.close();
        }
      } catch {
        /* Focusing a tab also reloads its current state. */
      }
      resolve(committed);
    };
    transaction.onabort = () => {
      db.close();
      reject(
        failure ?? transaction.error ?? new Error("Demo save was aborted"),
      );
    };
  });
}
