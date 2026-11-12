const detectWordleState = () => {
  const heading = document.querySelector('h1, h2, .title');
  const text = heading ? heading.textContent || '' : '';
  const guessCount = document.querySelectorAll('.row').length || 0;
  const status = text.toLowerCase().includes('play') ? 'in_progress' : 'not_started';

  return {
    game: 'wordle',
    status,
    guessesUsed: guessCount,
    maxGuesses: 6,
    source: 'browser',
    isLive: Boolean(guessCount || text),
  };
};

const publish = () => {
  const state = detectWordleState();
  chrome.runtime.sendMessage({ type: 'GAME_STATE_UPDATE', payload: state });
};

publish();
setInterval(publish, 15000);
