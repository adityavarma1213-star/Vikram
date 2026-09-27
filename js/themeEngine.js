/* VIKRAM Theme Engine — Aurora only, Light/Dark toggle. */
const THEME_KEY = 'vikram_user_theme';
const MODE_KEY = 'vikram_user_mode';
const MODES = Object.freeze({ light: 'Light', dark: 'Dark' });

function validTheme() { return 'aurora'; }
function validMode(value) { return Object.prototype.hasOwnProperty.call(MODES, value) ? value : 'light'; }

function applyTheme(themeName = 'aurora', mode = 'light') {
  const theme = validTheme();
  const selectedMode = validMode(mode);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.mode = selectedMode;
  root.style.colorScheme = selectedMode === 'dark' ? 'dark' : 'light';
  const checkbox = document.getElementById('modeCheckbox');
  if (checkbox) checkbox.checked = selectedMode === 'dark';
  const label = document.getElementById('modeLabel');
  if (label) label.textContent = selectedMode === 'dark' ? 'Dark' : 'Light';
  const btnLabel = document.getElementById('modeLabelBtn');
  if (btnLabel) btnLabel.textContent = selectedMode === 'dark' ? 'Dark' : 'Light';
}

function persistAndApply(themeName, mode) {
  localStorage.setItem(THEME_KEY, validTheme());
  localStorage.setItem(MODE_KEY, validMode(mode));
  applyTheme(validTheme(), mode);
}

function wireThemeMenu() {
  const button = document.getElementById('themeMenuBtn');
  const menu = document.getElementById('themeMenu');
  if (!button || !menu || menu.dataset.wired === 'true') return;
  menu.dataset.wired = 'true';
  button.addEventListener('click', event => { event.stopPropagation(); menu.classList.toggle('open'); menu.hidden = !menu.classList.contains('open'); });
  document.addEventListener('click', event => { if (!menu.contains(event.target) && event.target !== button) { menu.classList.remove('open'); menu.hidden = true; } });
}

function wireModeCheckbox() {
  const checkbox = document.getElementById('modeCheckbox');
  if (!checkbox || checkbox.dataset.wired === 'true') return;
  checkbox.dataset.wired = 'true';
  checkbox.addEventListener('change', () => {
    persistAndApply('aurora', checkbox.checked ? 'dark' : 'light');
  });
}

function wireLegacyControls() {
  const host = document.querySelector('.header-container');
  if (!host || document.getElementById('themeMenuBtn') || document.querySelector('.vikram-theme-control')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'vikram-theme-control theme-menu-btn';
  btn.setAttribute('aria-label', 'Toggle light or dark mode');
  const setLabel = () => { btn.textContent = (validMode(localStorage.getItem(MODE_KEY)) === 'dark' ? '🌙 Dark' : '☀ Light') + ' ▾'; };
  setLabel();
  btn.addEventListener('click', () => {
    const next = validMode(localStorage.getItem(MODE_KEY)) === 'dark' ? 'light' : 'dark';
    persistAndApply('aurora', next);
    setLabel();
  });
  host.appendChild(btn);
}

function initThemeEngine() {
  const mode = validMode(localStorage.getItem(MODE_KEY));
  applyTheme('aurora', mode);
  wireThemeMenu();
  wireModeCheckbox();
  wireLegacyControls();
}

window.applyTheme = applyTheme;
window.initThemeEngine = initThemeEngine;
window.addEventListener('DOMContentLoaded', initThemeEngine, { once: true });
initThemeEngine();
export { initThemeEngine, applyTheme };
