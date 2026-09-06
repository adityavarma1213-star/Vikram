document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('stockName');
  const button = document.getElementById('btnAnalyze');
  const box = document.getElementById('searchSuggestions');
  if (!input || !button || !window.VIKRAM_DATA_ENGINE) return;

  const showSuggestions = rows => {
    if (!box) return;
    box.innerHTML = rows.map(row => `<button type="button" class="suggestion-item" data-ticker="${String(row.ticker).replace(/[^A-Z0-9&.-]/gi, '')}"><strong>${row.name}</strong><span>${row.ticker}${row.close !== null && row.close !== undefined ? ` · ₹${Number(row.close).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : ''}</span></button>`).join('');
    box.classList.toggle('hidden', rows.length === 0);
    input.setAttribute('aria-expanded', rows.length ? 'true' : 'false');
    box.querySelectorAll('[data-ticker]').forEach(item => item.addEventListener('click', () => {
      input.value = item.dataset.ticker;
      box.classList.add('hidden');
      input.setAttribute('aria-expanded', 'false');
      run();
    }));
  };

  const run = () => {
    const q = input.value.trim().toUpperCase();
    if (!q) return;
    window.dispatchEvent(new CustomEvent('vikram:analyze', { detail: { ticker: q } }));
  };

  try { await window.VIKRAM_DATA_ENGINE.loadSnapshot(); } catch (_) { return; }
  button.addEventListener('click', run);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { box?.classList.add('hidden'); run(); } });
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { box?.classList.add('hidden'); if (box) box.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); return; }
    showSuggestions(window.VIKRAM_DATA_ENGINE.searchSuggestions(q));
  });
  document.querySelectorAll('.sample-ticker-chip[data-ticker]').forEach(chip => chip.addEventListener('click', event => {
    event.preventDefault();
    input.value = chip.dataset.ticker;
    box?.classList.add('hidden');
    run();
  }));
});