const state = {
  activeGame: null,
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ riskleState: state });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GAME_STATE_UPDATE') {
    state.activeGame = message.payload;
    chrome.storage.local.set({ riskleState: state });
    sendResponse({ ok: true });
  }
  return true;
});
