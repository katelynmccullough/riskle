chrome.storage.local.get('riskleState', ({ riskleState }) => {
  const status = document.querySelector('.stats strong:last-child');
  if (status) {
    status.textContent = riskleState?.activeGame?.status || 'Ready';
  }
});
