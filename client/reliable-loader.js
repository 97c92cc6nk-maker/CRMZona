'use strict';

(() => {
  const manifest = JSON.parse(document.getElementById('clientManifest').textContent);
  const status = document.getElementById('startupMessage');
  const detail = document.getElementById('startupDetail');
  let failed = false;
  let completed = 0, next = 0, lastFailure = '';
  const active = new Set();
  let cacheAvailable = true;
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem('crm.client') || '{}'); } catch { cacheAvailable = false; }
  if (!saved || saved.hash !== manifest.hash || !saved.parts || typeof saved.parts !== 'object') saved = { hash: manifest.hash, parts: {} };
  window.crmResilientLoading = true;
  window.crmStartup = { fail(code) {
    failed = true;
    for (const controller of active) controller.abort();
    status.textContent = 'Не удалось открыть приложение.';
    detail.textContent = (code === 'UPDATE_BROWSER' ? 'Обновите браузер.' : 'Получено ' + completed + '/' + manifest.parts.length + '. ' + lastFailure + (cacheAvailable ? ' Повторная загрузка продолжится с сохранённых частей.' : ' Кэш браузера недоступен. Повторите загрузку.')) + ' Код: ' + code;
    try { sessionStorage.setItem('crm.loadFailure', new Date().toISOString() + ': ' + detail.textContent); } catch {}
    console.warn('[CRM startup]', code);
  } };
  const onError = () => window.crmStartup.fail('APP_INIT');
  window.addEventListener('error', onError);
  const hash = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

  async function part(entry, number) {
    try {
      const cached = saved.parts[entry[0]];
      if (typeof cached === 'string' && cached.length <= 8192) {
        const bytes = Uint8Array.from(atob(cached), (char) => char.charCodeAt(0));
        if (bytes.length === entry[1] && await hash(bytes) === entry[2]) return bytes;
      }
    } catch {}
    for (let attempt = 0; attempt < 3; attempt++) {
      if (failed) throw new Error('STOPPED');
      const controller = new AbortController();
      active.add(controller);
      let timedOut = false, offset = 0, http = '';
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
      try {
        const url = '/client-parts/' + entry[0] + (attempt ? '?retry=' + attempt : '');
        const response = await fetch(url, { credentials: 'omit', cache: attempt ? 'reload' : 'default', signal: controller.signal });
        http = 'HTTP ' + response.status + ', ';
        if (!response.ok) throw new Error('HTTP_' + response.status);
        const reader = response.body.getReader();
        const bytes = new Uint8Array(entry[1]);
        // The verified byte count, not a delayed HTTP EOF, determines completion.
        while (offset < bytes.length) {
          const { value, done } = await reader.read();
          if (done || offset + value.length > bytes.length) throw new Error('INCOMPLETE');
          bytes.set(value, offset); offset += value.length;
        }
        controller.abort();
        if (await hash(bytes) !== entry[2]) throw new Error('CHECKSUM');
        saved.parts[entry[0]] = btoa(String.fromCharCode(...bytes));
        try { sessionStorage.setItem('crm.client', JSON.stringify(saved)); cacheAvailable = true; } catch { cacheAvailable = false; }
        return bytes;
      } catch (error) {
        if (failed) throw new Error('STOPPED');
        lastFailure = 'Фрагмент ' + (number + 1) + ': ' + http + offset + '/' + entry[1] + ' байт, ' + (timedOut ? 'TIMEOUT' : error.message) + '.';
        console.warn('[CRM download]', lastFailure, 'attempt', attempt + 1);
        if (attempt === 2) throw new Error('PART_' + (number + 1));
        detail.textContent = 'Повторяем загрузку фрагмента ' + (number + 1) + '…';
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 300));
      } finally { clearTimeout(timer); controller.abort(); active.delete(controller); }
    }
  }

  async function load() {
    if (!window.DecompressionStream || !window.crypto?.subtle) throw new Error('UPDATE_BROWSER');
    const bytes = [];
    async function worker() {
      while (!failed && next < manifest.parts.length) {
        const i = next++;
        bytes[i] = await part(manifest.parts[i], i);
        if (failed) return;
        completed++;
        status.textContent = 'Загрузка приложения: ' + completed + ' / ' + manifest.parts.length;
      }
    }
    // Two bounded workers; slow but successful progress must not be discarded.
    await Promise.all([worker(), worker()]);
    const packed = await new Blob(bytes).arrayBuffer();
    if (await hash(packed) !== manifest.hash) throw new Error('BUNDLE_CHECKSUM');
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    if (new TextEncoder().encode(text).length !== manifest.size) throw new Error('BUNDLE_SIZE');
    const bundle = JSON.parse(text);
    const parsed = new DOMParser().parseFromString(bundle.html, 'text/html');
    const root = parsed.getElementById('appRoot');
    if (!root || root.querySelector('script')) throw new Error('MARKUP');
    document.getElementById('appRoot').replaceWith(document.adoptNode(root));
    for (const css of bundle.styles) {
      const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    }
    // Exact script hashes are permitted by CSP; no eval, blob scripts or unsafe-inline.
    for (const code of bundle.scripts) {
      const script = document.createElement('script'); script.textContent = code; document.body.append(script);
      if (failed) throw new Error('APP_INIT');
    }
    document.dispatchEvent(new Event('crm:loaded'));
    if (failed || document.documentElement.dataset.appReady !== 'true') throw new Error('APP_INIT');
    root.hidden = false; root.inert = false;
    document.getElementById('startupScreen').hidden = true;
    try { sessionStorage.removeItem('crm.loadFailure'); } catch {}
    window.removeEventListener('error', onError);
  }
  return load().catch((error) => window.crmStartup.fail(error.message));
})();
