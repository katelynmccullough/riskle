// Chrome match patterns cannot restrict ports. Publish only the demo on port 3000.
if (
  ["http://localhost:3000", "http://127.0.0.1:3000"].includes(
    location.origin,
  ) &&
  ["/", "/demo"].includes(location.pathname)
) {
  let previous = "";
  const publish = () => {
    const raw = document
      .getElementById("riskle-extension-state")
      ?.getAttribute("data-state");
    if (!raw || raw === previous) return;
    try {
      const payload = JSON.parse(raw);
      chrome.runtime.sendMessage({ type: "MOCK_STATE_UPDATE", payload }, () => {
        void chrome.runtime.lastError;
      });
      previous = raw;
    } catch {
      /* A partial or malformed DOM update is ignored. */
    }
  };
  publish();
  new MutationObserver(publish).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-state"],
  });
}
