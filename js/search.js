document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('stockName');
  const button = document.getElementById('btnAnalyze');
  const box = document.getElementById('searchSuggestions');

  if (!input || !button || !window.VIKRAM_DATA_ENGINE) return;

  const show = rows => {
    if (!box) return;
    box.innerHTML = rows.map(r => `
      <button type="button" class="suggestion-item" data-ticker="${String(r.ticker).replace(/[^A-Z0-9&.-]/gi, '')}">
        <strong>${r.name}</strong>
        <span>${r.ticker}${r.close != null ? ` · ₹${Number(r.close).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : ''}</span>
      </button>`).join('');
    box.classList.toggle('hidden', !rows.length);
    box.querySelectorAll('[data-ticker]').forEach(item => item.onclick = () => {
      input.value = item.dataset.ticker;
      box.classList.add('hidden');
      run();
    });
  };

  const run = () => {
    const q = input.value.trim().toUpperCase();
    if (q) window.dispatchEvent(new CustomEvent('vikram:analyze', { detail: { ticker: q } }));
  };

  try {
    await window.VIKRAM_DATA_ENGINE.loadSnapshot();
  } catch {
    return;
  }

  button.onclick = run;
  input.onkeydown = e => { if (e.key === 'Enter') run(); };
  input.oninput = () => {
    const q = input.value.trim();
    if (box) box.classList.toggle('hidden', !q);
    if (q) show(window.VIKRAM_DATA_ENGINE.searchSuggestions(q));
  };

  document.querySelectorAll('.sample-ticker-chip[data-ticker]').forEach(chip => chip.onclick = e => {
    e.preventDefault();
    input.value = chip.dataset.ticker;
    run();
  });
});
