'use strict';

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const dns = require('dns').promises;
const { spawn } = require('child_process');
const ipaddr = require('ipaddr.js');

const STALE_MS = 3 * 60 * 1000;
const COOLDOWN_MS = 45000;
const MAX_FRAME_BYTES = 320 * 1024;
const cache = new Map();
const pending = new Map();
let activeCaptures = 0;

function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function assertStorage(store) {
  if (store.storageStatus()?.persistent === false || store.fallbackReason) fail(503, 'База недоступна. Настройки и состояние камер не получены.');
}
function recordKey(kind, pointId) {
  return `surveillance_${kind}_${crypto.createHash('sha256').update(pointId).digest('hex')}.json`;
}
async function loadRecord(store, key) {
  assertStorage(store);
  if (typeof store.path === 'function' && typeof store.supabaseFetch !== 'function') {
    try { return JSON.parse(fs.readFileSync(store.path(key), 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      fail(503, 'Хранилище видеонаблюдения не удалось прочитать. Настройки не изменены.');
    }
  }
  const value = await store.loadJson(key, null); assertStorage(store); return value;
}
function fingerprint(config) {
  return crypto.createHash('sha256').update(JSON.stringify(config?.cameras || [])).digest('hex');
}
function publicAddress(address) {
  try { const ip = ipaddr.parse(address); return ip.kind() === 'ipv4' && ip.range() === 'unicast'; }
  catch { return false; }
}
function parseSource(source) {
  if (typeof source !== 'string' || source.length > 2048 || /[\s\x00-\x1f\x7f]/.test(source)) fail(400, 'RTSP-ссылка некорректна: пробелы и управляющие символы недопустимы.');
  let url;
  try { url = new URL(source); } catch { fail(400, 'Укажите полную ссылку rtsp://…'); }
  if (url.protocol !== 'rtsp:' || !url.hostname || url.hash || url.hostname.includes('%')) fail(400, 'Поддерживается ссылка rtsp://… без фрагмента #.');
  if (url.port && (!/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535)) fail(400, 'Некорректный порт RTSP.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if ((net.isIP(host) && !publicAddress(host)) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) fail(400, 'С Vercel доступен только публичный IPv4-адрес камеры. Локальный адрес недоступен.');
  return url;
}
async function resolveSource(source, lookup = dns.resolve4.bind(dns)) {
  const url = parseSource(source);
  let timer;
  let addresses;
  try {
    addresses = net.isIP(url.hostname) ? [url.hostname] : await Promise.race([
      lookup(url.hostname),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('dns_timeout')), 2500); }),
    ]);
  } catch { fail(422, 'Не удалось определить публичный адрес RTSP-сервера.'); }
  finally { clearTimeout(timer); }
  if (!addresses.length || addresses.some((ip) => !publicAddress(ip))) fail(422, 'Адрес RTSP-сервера не является публичным IPv4-адресом.');
  return { url, address: addresses[0], port: Number(url.port) || 554 };
}
function normalizeConfig(input, previous = {}) {
  if (!input || !Array.isArray(input.cameras) || input.cameras.length > 4) fail(400, 'Можно настроить от одной до четырех камер или удалить все подключения.');
  const seen = new Set();
  const cameras = input.cameras.map((camera, index) => {
    if (!camera || typeof camera !== 'object') fail(400, 'Некорректная камера.');
    const id = String(camera.id || `cam${index + 1}`);
    if (!/^cam[1-4]$/.test(id) || seen.has(id)) fail(400, 'Идентификаторы камер должны быть уникальны.');
    seen.add(id);
    const name = String(camera.name || `Камера ${index + 1}`).trim();
    if (!name || name.length > 80) fail(400, 'Название камеры: от 1 до 80 символов.');
    const old = (previous.cameras || []).find((item) => item.id === id);
    const rtspUrl = Object.hasOwn(camera, 'rtspUrl') ? String(camera.rtspUrl || '').trim() : old?.rtspUrl || '';
    if (!rtspUrl) fail(400, `Укажите RTSP-ссылку: ${name}.`);
    parseSource(rtspUrl);
    return { id, name, rtspUrl };
  });
  return { cameras };
}
function publicConfig(config) {
  return { cameras: (config?.cameras || []).map(({ id, name }) => ({ id, name, configured: true })), revision: config?.revision || '' };
}
function binaryPath() {
  try { const value = require('ffmpeg-static'); return value && fs.existsSync(value) ? value : null; }
  catch { return null; }
}

// FFmpeg sees only a local RTSP relay. The relay pins the approved public IP,
// rejects redirects, and rewrites server-supplied control URLs to its own socket.
// This prevents DNS rebinding and SDP/RTSP redirects into internal networks.
function rtspTransform(direction, localAuthority, remoteAuthority) {
  let buffered = Buffer.alloc(0);
  return (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    const output = [];
    while (buffered.length) {
      if (buffered[0] === 36) {
        if (buffered.length < 4) break;
        const size = 4 + buffered.readUInt16BE(2);
        if (buffered.length < size) break;
        output.push(buffered.subarray(0, size)); buffered = buffered.subarray(size); continue;
      }
      const end = buffered.indexOf('\r\n\r\n');
      if (end < 0) { if (buffered.length > 65536) throw new Error('invalid_rtsp'); break; }
      let header = buffered.subarray(0, end).toString('utf8');
      const lengths = [...header.matchAll(/^Content-Length:\s*(\d+)\s*$/gim)];
      if (lengths.length > 1) throw new Error('invalid_rtsp');
      const length = Number(lengths[0]?.[1] || 0);
      if (!Number.isSafeInteger(length) || length > 262144) throw new Error('invalid_rtsp');
      if (buffered.length < end + 4 + length) break;
      let body = buffered.subarray(end + 4, end + 4 + length);
      buffered = buffered.subarray(end + 4 + length);
      if (direction === 'response') {
        if (!/^RTSP\/1\.0\s+\d{3}\b/.test(header) || /^RTSP\/1\.0\s+3\d\d\b/.test(header)) throw new Error('rtsp_redirect');
        header = header.replace(/^(Content-Base|Content-Location|Location):[^\r\n]*/gim, (line, key) => {
          const value = line.slice(line.indexOf(':') + 1).trim();
          const parsed = new URL(value, `rtsp://${remoteAuthority}/`);
          return `${key}: rtsp://${localAuthority}${parsed.pathname}${parsed.search}`;
        });
        if (length) {
          if (!/^Content-Type:\s*application\/sdp\b/im.test(header)) throw new Error('unsupported_rtsp_body');
          let sdp = body.toString('utf8');
          sdp = sdp.replace(/^a=control:(.+)$/gm, (_, raw) => {
            const value = raw.trim();
            if (value === '*') return 'a=control:*';
            if (/^(?:[a-z]+:|\/\/)/i.test(value)) {
              const parsed = new URL(value, `rtsp://${remoteAuthority}/`);
              return `a=control:rtsp://${localAuthority}${parsed.pathname}${parsed.search}`;
            }
            return `a=control:${value}`;
          });
          body = Buffer.from(sdp);
        }
      } else {
        if (!/^[A-Z_]+\s+\S+\s+RTSP\/1\.0/.test(header)) throw new Error('invalid_rtsp');
        // Preserve the request URI: rewriting it would invalidate Digest authentication.
      }
      if (lengths.length) header = header.replace(/^Content-Length:.*$/im, `Content-Length: ${body.length}`);
      output.push(Buffer.from(`${header}\r\n\r\n`), body);
    }
    return output;
  };
}
async function openRelay(source) {
  const sockets = new Set();
  let connections = 0;
  const remoteAuthority = source.url.host;
  const server = net.createServer((client) => {
    if (++connections > 3) { client.destroy(); return; }
    sockets.add(client);
    const upstream = net.connect({ host: source.address, port: source.port });
    sockets.add(upstream);
    const localAuthority = `127.0.0.1:${server.address().port}`;
    const forward = rtspTransform('request', localAuthority, remoteAuthority);
    const backward = rtspTransform('response', localAuthority, remoteAuthority);
    const stop = () => { client.destroy(); upstream.destroy(); sockets.delete(client); sockets.delete(upstream); };
    for (const socket of [client, upstream]) {
      socket.setTimeout(7000); socket.on('timeout', stop); socket.on('error', stop); socket.on('end', stop);
    }
    const pipe = (from, to, transform) => {
      from.on('data', (chunk) => {
        try { for (const part of transform(chunk)) { if (!to.write(part)) from.pause(); } }
        catch { stop(); }
      });
      to.on('drain', () => from.resume());
    };
    pipe(client, upstream, forward); pipe(upstream, client, backward);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const local = new URL(source.url);
  local.hostname = '127.0.0.1'; local.port = String(server.address().port);
  return { url: local.toString(), close() { for (const socket of sockets) socket.destroy(); server.close(); } };
}
async function captureFrame(rtspUrl, { resolve = resolveSource } = {}) {
  const binary = binaryPath();
  if (!binary) fail(503, 'Сервис получения кадров недоступен: FFmpeg не установлен.');
  if (activeCaptures >= 4) fail(429, 'Сервис проверки занят. Повторите позже.');
  activeCaptures++;
  let relay;
  try {
    const source = await resolve(rtspUrl);
    relay = await openRelay(source);
    return await new Promise((resolve, reject) => {
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-max_alloc', '67108864', '-threads', '1',
        '-protocol_whitelist', 'rtsp,tcp', '-rtsp_transport', 'tcp', '-timeout', '6000000', '-allowed_media_types', 'video',
        '-probesize', '1000000', '-analyzeduration', '2000000', '-i', relay.url, '-frames:v', '1', '-an',
        '-vf', 'scale=960:540:force_original_aspect_ratio=decrease', '-threads', '1', '-q:v', '5', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'];
      const child = spawn(binary, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'],
        env: { PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '', TEMP: process.env.TEMP || '/tmp' } });
      const chunks = []; let size = 0, timedOut = false, oversized = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 9000);
      child.stdout.on('data', (chunk) => { size += chunk.length; if (size > MAX_FRAME_BYTES) { oversized = true; child.kill('SIGKILL'); } else chunks.push(chunk); });
      child.on('error', () => { clearTimeout(timer); const e = new Error('Сервис получения кадров недоступен.'); e.status = 503; reject(e); });
      child.on('close', (code) => {
        clearTimeout(timer);
        const frame = Buffer.concat(chunks);
        if (code !== 0 || oversized || frame.length < 4 || frame[0] !== 255 || frame[1] !== 216 || frame[frame.length - 1] !== 217) {
          reject(new Error(timedOut ? 'Камера не ответила вовремя. Проверьте сеть и RTSP-ссылку.' : 'Изображение не получено. Проверьте RTSP-ссылку, логин, пароль и доступность сервера.'));
        } else resolve(frame);
      });
    });
  } finally { relay?.close(); activeCaptures--; }
}

async function readRecords(store, points) {
  if (typeof store.supabaseFetch === 'function') {
    let response;
    try { response = await store.supabaseFetch('/rest/v1/app_kv?key=like.surveillance_*&select=key,value'); }
    catch { fail(503, 'Supabase недоступен. Состояние камер не получено.'); }
    if (!response.ok) fail(503, 'Supabase не вернул настройки видеонаблюдения.');
    return new Map((await response.json()).map((row) => [row.key, row.value]));
  }
  const records = new Map();
  for (const point of points) for (const kind of ['config', 'status']) {
    const key = recordKey(kind, point.id); records.set(key, await loadRecord(store, key));
  }
  assertStorage(store); return records;
}
function cameraStates(config, saved, now = Date.now()) {
  const valid = saved?.fingerprint === fingerprint(config);
  return (config?.cameras || []).map(({ id, name }) => {
    const last = valid ? saved.cameras?.find((camera) => camera.id === id) : null;
    const fresh = last?.checkedAt && now - Date.parse(last.checkedAt) <= STALE_MS;
    return { id, name, status: fresh ? last.status : 'unknown', checkedAt: last?.checkedAt || null,
      reason: fresh ? last.reason || '' : last ? 'Проверка устарела.' : 'Камера еще не проверена.', image: null };
  });
}
async function checkPoint(store, pointId, config, actor, capture = captureFrame) {
  const hash = fingerprint(config);
  const key = recordKey('status', pointId);
  const cacheKey = `${pointId}:${hash}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < COOLDOWN_MS) return cached.result;
  if (pending.has(cacheKey)) return pending.get(cacheKey);
  const task = (async () => {
    const previous = await loadRecord(store, key);
    if (previous?.fingerprint === hash && Date.now() - Date.parse(previous.checkedAt) < COOLDOWN_MS) {
      return { cameras: cameraStates(config, previous), checkedAt: previous.checkedAt, cached: true };
    }
    const cameras = [];
    for (const camera of config.cameras || []) {
      let result;
      try {
        const frame = await capture(camera.rtspUrl);
        result = { id: camera.id, name: camera.name, status: 'online', reason: '', image: `data:image/jpeg;base64,${frame.toString('base64')}` };
      } catch (error) {
        const status = error.status === 503 || error.status === 429 ? 'unknown' : 'offline';
        // Do not expose subprocess output or source URLs (which may contain credentials).
        result = { id: camera.id, name: camera.name, status, reason: error.status ? error.message : 'Изображение не получено. Проверьте RTSP-ссылку, учетные данные и сеть.', image: null };
      }
      result.checkedAt = new Date().toISOString(); cameras.push(result);
    }
    const checkedAt = new Date().toISOString();
    const current = await loadRecord(store, recordKey('config', pointId));
    if (fingerprint(current) !== hash) fail(409, 'Настройки камер изменились. Обновите список.');
    await store.saveJson(key, { fingerprint: hash, checkedAt, cameras: cameras.map(({ image, ...metadata }) => metadata) });
    assertStorage(store);
    const changed = cameras.filter((camera) => previous?.fingerprint !== hash || previous?.cameras?.find((item) => item.id === camera.id)?.status !== camera.status);
    if (changed.length) await store.audit('surveillance.state_changed', { pointId, cameras: changed.map(({ id, status }) => ({ id, status })) }, actor.id);
    const result = { cameras, checkedAt };
    cache.set(cacheKey, { time: Date.now(), result });
    while (cache.size > 12) cache.delete(cache.keys().next().value);
    return result;
  })();
  pending.set(cacheKey, task);
  try { return await task; } finally { pending.delete(cacheKey); }
}
async function handleRequest({ req, pathname, store, actor, readJsonBody, canManage, canView }) {
  const points = await store.loadJson('retail_points.json', []); assertStorage(store);
  const configMatch = pathname.match(/^\/api\/surveillance\/config\/([^/]+)$/);
  if (configMatch) {
    if (!canManage) fail(403, 'Настройки камер доступны владельцу и администраторам с доступом к торговым точкам.');
    const pointId = decodeURIComponent(configMatch[1]);
    if (!points.some((point) => point.id === pointId)) fail(404, 'Торговая точка не найдена.');
    const key = recordKey('config', pointId);
    const old = await loadRecord(store, key);
    if (req.method === 'GET') return { config: publicConfig(old) };
    if (req.method === 'PUT') {
      const input = await readJsonBody(req);
      if (!input || typeof input !== 'object') fail(400, 'Некорректные настройки камер.');
      if ((input.revision || '') !== (old?.revision || '')) fail(409, 'Настройки изменены другим пользователем. Обновите карточку.');
      const config = { ...normalizeConfig(input, old || {}), revision: crypto.randomUUID(), updatedAt: new Date().toISOString(), updatedBy: actor.id };
      await store.saveJson(key, config); assertStorage(store);
      await store.audit('surveillance.config_saved', { pointId, cameraIds: config.cameras.map((c) => c.id) }, actor.id);
      return { config: publicConfig(config) };
    }
    fail(405, 'Метод не поддерживается.');
  }
  if (!canView) fail(403, 'Нет доступа к видеонаблюдению.');
  if (req.method === 'GET' && pathname === '/api/surveillance') {
    const users = await store.listUsers(); assertStorage(store);
    const records = await readRecords(store, points);
    return { engineReady: Boolean(binaryPath()), refreshSeconds: 60, staleSeconds: STALE_MS / 1000,
      points: points.map((point) => {
        const config = records.get(recordKey('config', point.id));
        const admin = users.find((u) => u.role === 'admin' && !u.archivedAt && (u.allowedPoints || []).includes(point.id));
        return { id: point.id, name: point.name, provider: point.video?.operator || '', adminId: admin?.id || '', adminName: admin?.fullName || 'Не назначен',
          cameras: cameraStates(config, records.get(recordKey('status', point.id))) };
      }).sort((a, b) => a.name.localeCompare(b.name, 'ru')) };
  }
  const checkMatch = pathname.match(/^\/api\/surveillance\/check\/([^/]+)$/);
  if (req.method === 'POST' && checkMatch) {
    const pointId = decodeURIComponent(checkMatch[1]);
    if (!points.some((point) => point.id === pointId)) fail(404, 'Торговая точка не найдена.');
    const config = await loadRecord(store, recordKey('config', pointId));
    if (!config?.cameras?.length) return { cameras: [], checkedAt: null };
    return checkPoint(store, pointId, config, actor);
  }
  fail(404, 'Маршрут видеонаблюдения не найден.');
}

module.exports = { handleRequest, normalizeConfig, parseSource, resolveSource, publicAddress, publicConfig, cameraStates, fingerprint, recordKey, checkPoint, captureFrame, rtspTransform, binaryPath };
