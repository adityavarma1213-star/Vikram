/* VIKRAM Theme Engine: exactly two user-selectable themes. */
(function () {
  'use strict';
  const KEY = 'vikram-theme';
  const THEMES = {
    aurora: { name: 'Aurora', icon: '☾', label: 'Balanced Dark' },
    misty: { name: 'Misty', icon: '☀', label: 'Balanced Light' }
  };

  function getTheme() {
    const saved = localStorage.getItem(KEY);
    return THEMES[saved] ? saved : 'aurora';
  }

  function applyTheme(theme) {
    if (!THEMES[theme]) theme = 'aurora';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === 'misty' ? 'light' : 'dark';
    localStorage.setItem(KEY, theme);
    document.querySelectorAll('.vikram-theme-control button').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.theme === theme ? 'true' : 'false');
    });
    const label = document.querySelector('.vikram-theme-current');
    if (label) label.textContent = THEMES[theme].name;
  }

  function buildControl() {
    if (document.querySelector('.vikram-theme-control')) return;
    const host = document.querySelector('.header-container');
    if (!host) return;

    const control = document.createElement('div');
    control.className = 'vikram-theme-control';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', 'Choose VIKRAM theme');
    Object.keys(THEMES).forEach(function (key) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.theme = key;
      button.setAttribute('aria-label', THEMES[key].name + ' theme — ' + THEMES[key].label);
      button.innerHTML = THEMES[key].icon + ' <span class="vikram-theme-label">' + THEMES[key].name + '</span>';
      button.addEventListener('click', function () { applyTheme(key); });
      control.appendChild(button);
    });

    const current = document.createElement('span');
    current.className = 'vikram-theme-current';
    current.hidden = true;
    control.appendChild(current);
    host.appendChild(control);
  }

  // Apply before the page paints where possible, then create the control.
  applyTheme(getTheme());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { buildControl(); applyTheme(getTheme()); });
  } else {
    buildControl();
  }
})();
