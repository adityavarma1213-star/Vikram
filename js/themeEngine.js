/* VIKRAM Theme Engine — six themes, persistent Light/Dark/System mode. */
const THEME_KEY = 'vikram_user_theme';
const MODE_KEY = 'vikram_user_mode';
const THEMES = Object.freeze({ aurora: 'Aurora', galaxy: 'Galaxy', calm: 'Calm', academic: 'Academic', neoglass: 'NeoGlass', duology: 'Duology' });
const MODES = Object.freeze({ light: 'Light', dark: 'Dark', system: 'System' });

function validTheme(value) { return Object.prototype.hasOwnProperty.call(THEMES, value) ? value : 'aurora'; }
function validMode(value) { return Object.prototype.hasOwnProperty.call(MODES, value) ? value : 'system'; }

function applyTheme(themeName = 'aurora', mode = 'system') {
  const theme = validTheme(themeName);
  const selectedMode = validMode(mode);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.mode = selectedMode;
  root.style.colorScheme = selectedMode === 'light' ? 'light' : selectedMode === 'dark' ? 'dark' : 'light dark';
  document.querySelectorAll('[data-theme-name]').forEach(item => item.classList.toggle('active', item.dataset.themeName === theme));
  document.querySelectorAll('[data-vikram-mode]').forEach(item => item.classList.toggle('active', item.dataset.vikramMode === selectedMode));
  const checkbox = document.getElementById('modeCheckbox');
  if (checkbox) checkbox.checked = selectedMode === 'dark';
  const label = document.getElementById('modeLabel');
  if (label) label.textContent = selectedMode === 'dark' ? 'Dark' : selectedMode === 'light' ? 'Light' : 'System';
}

function persistAndApply(themeName, mode) {
  localStorage.setItem(THEME_KEY, validTheme(themeName));
  localStorage.setItem(MODE_KEY, validMode(mode));
  applyTheme(themeName, mode);
}

function wireThemeMenu() {
  const button = document.getElementById('themeMenuBtn');
  const menu = document.getElementById('themeMenu');
  if (!button || !menu || menu.dataset.wired === 'true') return;
  menu.dataset.wired = 'true';
  button.addEventListener('click', event => { event.stopPropagation(); menu.classList.toggle('open'); menu.hidden = !menu.classList.contains('open'); });
  menu.querySelectorAll('[data-theme-name]').forEach(item => item.addEventListener('click', () => {
    const theme = validTheme(item.dataset.themeName);
    const mode = validMode(localStorage.getItem(MODE_KEY));
    persistAndApply(theme, mode);
    menu.classList.remove('open'); menu.hidden = true;
  }));
  document.addEventListener('click', event => { if (!menu.contains(event.target) && event.target !== button) { menu.classList.remove('open'); menu.hidden = true; } });
}

function wireModeCheckbox() {
  const checkbox = document.getElementById('modeCheckbox');
  if (!checkbox || checkbox.dataset.wired === 'true') return;
  checkbox.dataset.wired = 'true';
  checkbox.addEventListener('change', () => {
    const theme = validTheme(localStorage.getItem(THEME_KEY));
    persistAndApply(theme, checkbox.checked ? 'dark' : 'light');
  });
}

function wireLegacyControls() {
  const host = document.querySelector('.header-container');
  if (!host || document.getElementById('themeMenuBtn') || document.querySelector('.vikram-theme-control')) return;
  const wrap = document.createElement('div');
  wrap.className = 'vikram-theme-control';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Choose VIKRAM theme');
  Object.entries(THEMES).forEach(([key, label]) => { const option = document.createElement('option'); option.value = key; option.textContent = label; select.appendChild(option); });
  select.value = validTheme(localStorage.getItem(THEME_KEY));
  select.addEventListener('change', () => persistAndApply(select.value, validMode(localStorage.getItem(MODE_KEY))));
  wrap.appendChild(select);
  const mode = document.createElement('span');
  mode.className = 'vikram-theme-mode';
  Object.entries(MODES).forEach(([key, label]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.vikramMode = key; b.textContent = label; b.addEventListener('click', () => persistAndApply(validTheme(localStorage.getItem(THEME_KEY)), key)); mode.appendChild(b); });
  wrap.appendChild(mode);
  host.appendChild(wrap);
}

function initThemeEngine() {
  const theme = validTheme(localStorage.getItem(THEME_KEY));
  const mode = validMode(localStorage.getItem(MODE_KEY));
  applyTheme(theme, mode);
  wireThemeMenu();
  wireModeCheckbox();
  wireLegacyControls();
  if (!window.__vikramThemeSystemListener) {
    window.__vikramThemeSystemListener = true;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (validMode(localStorage.getItem(MODE_KEY)) === 'system') applyTheme(validTheme(localStorage.getItem(THEME_KEY)), 'system');
    });
  }
}

window.applyTheme = applyTheme;
window.initThemeEngine = initThemeEngine;
window.addEventListener('DOMContentLoaded', initThemeEngine, { once: true });
initThemeEngine();
export { initThemeEngine, applyTheme };
