// ============================================================
// M2_LOG - theme registry (ported from M2_SCOUT's visual language)
// Applies a set of CSS custom properties to <html> and persists the
// choice in localStorage ('appTheme'). Self-initialises on load (before
// <body> paints) to avoid a flash of the wrong theme (FOUC).
//
// To add a theme: add an entry to THEMES with a full `vars` map (or spread
// an existing base and override). It appears in the Settings list with no
// other code change.
// ============================================================

'use strict';

(function () {
  // Light base (mirrors the original M2_SEEK / M2_SCOUT light look exactly).
  const DAYLIGHT = {
    '--bg': '#f4f4f4',
    '--panel': '#ffffff',
    '--border': '#cfcfcf',
    '--text': '#1c1c1c',
    '--muted': '#555555',
    '--hint': '#888888',
    '--text-soft': '#444444',
    '--tabbar-bg': '#e7e7e7',
    '--tab-bg': '#dcdcdc',
    '--tab-add-hover': '#cdcdcd',
    '--tab-active': '#227F9E',
    '--tab-active-text': '#ffffff',
    '--input-bg': '#ffffff',
    '--btn-bg': '#f0f0f0',
    '--btn-bg-hover': '#e6e6e6',
    '--btn-border': '#b9b9b9',
    '--btn-text': '#1c1c1c',
    '--accent': '#227F9E',
    '--green': '#479B49',
    '--blue': '#497F9F',
    '--purple': '#9E3D87',
    '--red': '#9F2A2C',
    '--row-hover': '#eef5fb',
    '--row-selected': '#cfe8ff',
    '--row-sel-outline': '#2a6fb0',
  };

  // Dark base (derived from M2_SCOUT "Low Key").
  const LOW_KEY = {
    '--bg': '#0a0e14',
    '--panel': '#121a28',
    '--border': '#1e2a3a',
    '--text': '#cfe3f2',
    '--muted': '#8aa0b6',
    '--hint': '#6b8199',
    '--text-soft': '#9fb3c8',
    '--tabbar-bg': '#0f1622',
    '--tab-bg': '#16202e',
    '--tab-add-hover': '#1e2a3a',
    '--tab-active': '#1c6e85',
    '--tab-active-text': '#eaf6ff',
    '--input-bg': '#0e1622',
    '--btn-bg': '#16202e',
    '--btn-bg-hover': '#1e2a3a',
    '--btn-border': '#2a3a4d',
    '--btn-text': '#cfe3f2',
    '--accent': '#36d6ff',
    '--green': '#3fa66a',
    '--blue': '#3a7fa6',
    '--purple': '#9a5fc0',
    '--red': '#c0494f',
    '--row-hover': '#15212f',
    '--row-selected': '#1d3b57',
    '--row-sel-outline': '#36d6ff',
  };

  // VS Code Dark+ (matches VS Code's default dark color scheme).
  const VSCODE_DARK = Object.assign({}, LOW_KEY, {
    '--bg': '#1e1e1e',
    '--panel': '#252526',
    '--border': '#3c3c3c',
    '--text': '#d4d4d4',
    '--muted': '#858585',
    '--hint': '#6e7681',
    '--text-soft': '#cccccc',
    '--tabbar-bg': '#252526',
    '--tab-bg': '#2d2d2d',
    '--tab-add-hover': '#37373d',
    '--tab-active': '#0e639c',
    '--tab-active-text': '#ffffff',
    '--input-bg': '#3c3c3c',
    '--btn-bg': '#0e639c',
    '--btn-bg-hover': '#1177bb',
    '--btn-border': '#0e639c',
    '--btn-text': '#ffffff',
    '--accent': '#007acc',
    '--green': '#4ec9b0',
    '--blue': '#569cd6',
    '--purple': '#c586c0',
    '--red': '#f14c4c',
    '--row-hover': '#2a2d2e',
    '--row-selected': '#094771',
    '--row-sel-outline': '#007acc',
  });

  // Army (military tactical black + olive drab + burnt orange accent).
  const ARMY = Object.assign({}, LOW_KEY, {
    '--bg': '#0f1108',
    '--panel': '#2a2f1f',
    '--border': '#404530',
    '--text': '#f5f4ed',
    '--muted': '#a8a892',
    '--hint': '#7d7c68',
    '--text-soft': '#dcdbc9',
    '--tabbar-bg': '#131609',
    '--tab-bg': '#232815',
    '--tab-add-hover': '#3a4024',
    '--tab-active': '#d97a0c',
    '--tab-active-text': '#0f1108',
    '--input-bg': '#131609',
    '--btn-bg': '#232815',
    '--btn-bg-hover': '#3a4024',
    '--btn-border': '#404530',
    '--btn-text': '#f5f4ed',
    '--accent': '#e8832a',
    '--green': '#6ba03a',
    '--blue': '#4a8da6',
    '--purple': '#9a5fc0',
    '--red': '#c86849',
    '--row-hover': '#1f251a',
    '--row-selected': '#3a4226',
    '--row-sel-outline': '#e8832a',
  });

  // Army (Dark) - steel/iron-grey base with military-green accents.
  const ARMY_DARK = Object.assign({}, LOW_KEY, {
    '--bg': '#1b1e21',
    '--panel': '#26292d',
    '--border': '#3a4047',
    '--text': '#dfe2e5',
    '--muted': '#9aa3ab',
    '--hint': '#79828b',
    '--text-soft': '#c4c9ce',
    '--tabbar-bg': '#16191c',
    '--tab-bg': '#23272b',
    '--tab-add-hover': '#2e3338',
    '--tab-active': '#7e8c3a',
    '--tab-active-text': '#10130a',
    '--input-bg': '#15181b',
    '--btn-bg': '#23272b',
    '--btn-bg-hover': '#2e3338',
    '--btn-border': '#3a4047',
    '--btn-text': '#dfe2e5',
    '--accent': '#8a9a3d',
    '--green': '#7e8c3a',
    '--blue': '#5a7fa0',
    '--purple': '#9a6fc0',
    '--red': '#cf4b3f',
    '--row-hover': '#262b22',
    '--row-selected': '#3a4626',
    '--row-sel-outline': '#8a9a3d',
  });

  const THEMES = {
    daylight: { name: 'Daylight (Light)', vars: DAYLIGHT },
    low_key: { name: 'Low Key (Dark)', vars: LOW_KEY },
    vscode_dark: { name: 'VS Code (Dark)', vars: VSCODE_DARK },
    army: { name: 'Army', vars: ARMY },
    army_dark: { name: 'Army (Dark)', vars: ARMY_DARK },
  };

  const DEFAULT_THEME = 'daylight';

  function list() {
    return Object.keys(THEMES).map((id) => ({ id, name: THEMES[id].name }));
  }

  function current() {
    try {
      const saved = localStorage.getItem('appTheme');
      if (saved && THEMES[saved]) return saved;
    } catch (_e) {
      /* localStorage unavailable */
    }
    return DEFAULT_THEME;
  }

  function apply(id) {
    const themeId = THEMES[id] ? id : DEFAULT_THEME;
    const vars = THEMES[themeId].vars;
    const root = document.documentElement;
    for (const k of Object.keys(vars)) root.style.setProperty(k, vars[k]);
    root.setAttribute('data-theme', themeId);
    try {
      localStorage.setItem('appTheme', themeId);
    } catch (_e) {
      /* ignore */
    }
    try {
      window.dispatchEvent(new CustomEvent('m2-theme-changed', { detail: { theme: themeId } }));
    } catch (_e) {
      /* ignore */
    }
  }

  function init() {
    apply(current());
  }

  // Apply immediately (this file is loaded in <head>) to avoid FOUC.
  init();

  window.M2Themes = { list, apply, current, init, THEMES };
})();
