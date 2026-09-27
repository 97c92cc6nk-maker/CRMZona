'use strict';

(() => {
  let failed = false;
  let finished = false;
  const loaded = new Set();
  const byId = (id) => document.getElementById(id);
  const assets = () => [...document.querySelectorAll('[data-startup-asset]')];
  const assetPath = (element) => new URL(element.src || element.href, location.href).pathname;
  const stylesReady = () => assets().filter((element) => element.tagName === 'LINK').every((link) => {
    if (!link.sheet) return false;
    link.media = 'all';
    return true;
  });
  function fail(code, detail) {
    if (finished) return;
    failed = true;
    byId('startupMessage').textContent = 'Не удалось загрузить приложение.';
    byId('startupDetail').textContent = `${detail} Откройте проверку соединения или повторите загрузку. Код: ${code}.`;
    console.warn('[CRM startup]', code, detail);
    clearTimeout(timer);
  }
  function check() {
    if (failed || finished) return;
    // A cached stylesheet may finish before this small async script executes.
    const styled = stylesReady();
    if (!styled || document.documentElement.dataset.appReady !== 'true') return;
    finished = true;
    clearTimeout(timer);
    byId('appRoot').hidden = false;
    byId('appRoot').inert = false;
    byId('startupScreen').hidden = true;
  }
  const timer = setTimeout(() => {
    if (finished || failed) return;
    const pending = assets().filter((element) => element.tagName === 'LINK' ? !element.sheet : !loaded.has(element));
    byId('startupMessage').textContent = 'Загрузка занимает больше времени, чем обычно.';
    byId('startupDetail').textContent = `Ожидаем ответ сети${pending.length ? ': ' + pending.map(assetPath).join(', ') : ''}. Проверка соединения поможет найти причину.`;
    console.warn('[CRM startup] ASSET_TIMEOUT');
  }, 15000);
  document.addEventListener('load', (event) => {
    if (!event.target?.hasAttribute?.('data-startup-asset')) return;
    loaded.add(event.target);
    check();
  }, true);
  window.addEventListener('error', (event) => {
    if (event.target?.hasAttribute?.('data-startup-asset')) {
      fail('ASSET_FAILED', `Не получен файл ${assetPath(event.target)}.`);
    } else if (event.filename && new URL(event.filename, location.href).origin === location.origin) {
      fail('SCRIPT_FAILED', 'Ошибка запуска приложения.');
    }
  }, true);
  document.addEventListener('DOMContentLoaded', check);
  document.addEventListener('crm:ready', check);
  window.crmStartup = { fail };
  if (document.documentElement.dataset.appFailed === 'true') fail('APP_INIT', 'Ошибка запуска приложения.');
  else check();
})();
