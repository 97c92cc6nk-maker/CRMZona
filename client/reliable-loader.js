'use strict';

(() => {
  const manifest = JSON.parse(document.getElementById('clientManifest').textContent);
  const status = document.getElementById('startupMessage');
  const detail = document.getElementById('startupDetail');
  let failed = false;
  const deadline = Date.now() + 120000;
  window.crmResilientLoading = true;
  window.crmStartup = { fail(code) {
    failed = true;
    status.textContent = 'Не удалось открыть приложение.';
    detail.textContent = (code === 'UPDATE_BROWSER' ? 'Обновите браузер до актуальной версии.' : 'Повторите загрузку или откройте проверку соединения.') + ' Код: ' + code;
    console.warn('[CRM startup]', code);
  } };
  const onError = () => window.crmStartup.fail('APP_INIT');
  window.addEventListener('error', onError);
  const hash = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

  async function part(entry, number) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (failed) throw new Error('STOPPED');
      if (Date.now() >= deadline) throw new Error('LOAD_TIMEOUT');
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.min(12000, deadline - Date.now()));
      try {
        const url = '/client-parts/' + entry[0] + (attempt ? '?retry=' + attempt : '');
        const response = await fetch(url, { credentials: 'omit', cache: attempt ? 'reload' : 'default', signal: controller.signal });
        if (!response.ok) throw new Error('HTTP_' + response.status);
        const reader = response.body.getReader();
        const bytes = new Uint8Array(entry[1]);
        let offset = 0;
        // The verified byte count, not a delayed HTTP EOF, determines completion.
        while (offset < bytes.length) {
          const { value, done } = await reader.read();
          if (done || offset + value.length > bytes.length) throw new Error('INCOMPLETE');
          bytes.set(value, offset); offset += value.length;
        }
        controller.abort();
        if (await hash(bytes) !== entry[2]) throw new Error('CHECKSUM');
        return bytes;
      } catch (error) {
        console.warn('[CRM download]', number + 1, attempt + 1, timedOut ? 'TIMEOUT' : error.message);
        if (attempt === 2) throw new Error('PART_' + (number + 1));
        detail.textContent = 'Повторяем загрузку фрагмента ' + (number + 1) + '…';
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 300));
      } finally { clearTimeout(timer); controller.abort(); }
    }
  }

  async function load() {
    if (!window.DecompressionStream || !window.crypto?.subtle) throw new Error('UPDATE_BROWSER');
    const bytes = [];
    // One request at a time avoids a burst of streams on a fragile connection.
    for (let i = 0; i < manifest.parts.length; i++) {
      status.textContent = 'Загрузка приложения: ' + i + ' / ' + manifest.parts.length;
      bytes.push(await part(manifest.parts[i], i));
    }
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
    window.removeEventListener('error', onError);
  }
  return load().catch((error) => window.crmStartup.fail(error.message));
})();
