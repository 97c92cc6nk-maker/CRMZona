'use strict';

const surveillanceUI = (() => {
  const byId = (id) => document.getElementById(id);
  const labels = { online: 'Доступно', offline: 'Нет изображения', unknown: 'Не проверено', unconfigured: 'Нет RTSP' };
  let points = [], selected = new Set(), initialized = false, loaded = false;
  let timer = null, version = 0, checking = false, checkingIds = new Set();
  let lastCycle = 0;
  let configVersion = 0, configPoint = '', configRevision = '', configReady = false;
  const notice = (message, type = 'error') => showNotice(byId('surveillanceNotice'), message, type);
  const date = (value) => value ? new Date(value).toLocaleString('ru-RU') : 'Не проверено';
  const node = (tag, text, className) => { const element = document.createElement(tag); if (text != null) element.textContent = text; if (className) element.className = className; return element; };
  const isActive = () => byId('surveillanceView').classList.contains('is-active') && !document.hidden && state.permissions.canViewSurveillance;
  function status(camera) {
    return camera.checkedAt && Date.now() - Date.parse(camera.checkedAt) > 180000 ? 'unknown' : camera.status;
  }
  function pointStatus(point) {
    if (!point.cameras.length) return 'unconfigured';
    if (point.cameras.some((camera) => status(camera) === 'offline')) return 'offline';
    if (point.cameras.some((camera) => status(camera) !== 'online')) return 'unknown';
    return 'online';
  }
  function scopedPoints() {
    const adminId = byId('surveillanceAdmin').value;
    return points.filter((point) => selected.has(point.id) && (!adminId || (adminId === '_none' ? !point.adminId : point.adminId === adminId)));
  }
  function visiblePoints() {
    const value = byId('surveillanceStatus').value;
    return scopedPoints().filter((point) => !value || pointStatus(point) === value)
      .sort((a, b) => ({ offline: 0, unknown: 1, online: 2, unconfigured: 3 }[pointStatus(a)] - { offline: 0, unknown: 1, online: 2, unconfigured: 3 }[pointStatus(b)] || a.name.localeCompare(b.name, 'ru')));
  }
  function init() {
    if (initialized) return; initialized = true;
    byId('refreshSurveillance').addEventListener('click', () => load());
    byId('surveillanceAdmin').addEventListener('change', () => { renderPicker(); render(); });
    byId('surveillanceStatus').addEventListener('change', render);
    byId('surveillancePointSearch').addEventListener('input', renderPicker);
    byId('surveillanceSelectAll').addEventListener('click', () => { for (const p of pickerPoints()) selected.add(p.id); renderPicker(); render(); });
    byId('surveillanceSelectNone').addEventListener('click', () => { for (const p of pickerPoints()) selected.delete(p.id); renderPicker(); render(); });
    byId('surveillanceAuto').addEventListener('change', schedule);
    document.addEventListener('visibilitychange', () => {
      clearTimeout(timer);
      if (!document.hidden && isActive()) { render(); schedule(); }
    });
    byId('saveRetailPointCameras').addEventListener('click', saveConfig);
    byId('surveillanceImageDialog').addEventListener('close', () => byId('surveillanceLargeImage').removeAttribute('src'));
  }
  function pickerPoints() {
    const adminId = byId('surveillanceAdmin').value, query = byId('surveillancePointSearch').value.trim().toLocaleLowerCase('ru');
    return points.filter((p) => (!adminId || (adminId === '_none' ? !p.adminId : p.adminId === adminId)) && p.name.toLocaleLowerCase('ru').includes(query));
  }
  function renderPicker() {
    byId('surveillancePoints').replaceChildren();
    for (const point of pickerPoints()) {
      const label = node('label', null, 'check-row'), input = node('input'); input.type = 'checkbox'; input.value = point.id; input.checked = selected.has(point.id);
      input.addEventListener('change', () => { if (input.checked) selected.add(point.id); else selected.delete(point.id); render(); });
      label.append(input, node('span', point.name)); byId('surveillancePoints').append(label);
    }
    if (!pickerPoints().length) byId('surveillancePoints').append(node('p', 'Точки не найдены.'));
  }
  async function load() {
    init(); if (!state.permissions.canViewSurveillance) return;
    pause(); const current = version; notice('');
    try {
      const data = await api('/api/surveillance');
      if (version !== current) return;
      points = data.points;
      if (!loaded) selected = new Set(points.map((p) => p.id));
      else selected = new Set([...selected].filter((id) => points.some((p) => p.id === id)));
      loaded = true;
      const adminSelect = byId('surveillanceAdmin'), previous = adminSelect.value;
      adminSelect.replaceChildren(new Option('Все администраторы', ''), new Option('Не назначен', '_none'));
      const admins = new Map(points.filter((p) => p.adminId).map((p) => [p.adminId, p.adminName]));
      for (const [id, name] of [...admins].sort((a, b) => a[1].localeCompare(b[1], 'ru'))) adminSelect.add(new Option(name, id));
      adminSelect.value = [...adminSelect.options].some((o) => o.value === previous) ? previous : '';
      renderPicker(); render();
      if (!data.engineReady) { notice('Сервис получения кадров недоступен. Камеры нельзя проверить.'); schedule(); }
      else await check();
    } catch (error) {
      if (version !== current) return;
      points = []; loaded = false; render(); notice(`Видеонаблюдение не загружено. ${error.message}`);
    }
  }
  function badge(value, text = labels[value]) { return node('span', text, `camera-status camera-status-${value}`); }
  function render() {
    const scoped = scopedPoints(), visible = visiblePoints();
    byId('surveillancePointSummary').textContent = `Торговые точки: ${scoped.length} из ${points.length}`;
    const summary = byId('surveillanceSummary'); summary.replaceChildren();
    for (const [value, title] of [['offline', 'Требуют внимания'], ['online', 'Доступны'], ['unknown', 'Не проверены'], ['unconfigured', 'Нет RTSP']]) {
      const item = node('div', null, `surveillance-metric surveillance-metric-${value}`);
      item.append(node('strong', String(scoped.filter((p) => pointStatus(p) === value).length)), node('span', title)); summary.append(item);
    }
    const body = byId('surveillanceBody'); body.replaceChildren();
    const grid = byId('surveillanceCameraGrid'); grid.replaceChildren();
    for (const point of visible) {
      const value = pointStatus(point), row = node('tr'); row.dataset.status = value;
      const name = node('td'), link = node('button', point.name, 'link-button'); link.type = 'button';
      link.addEventListener('click', () => { grid.querySelector(`[data-point-id="${CSS.escape(point.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      if (point.cameras.length) name.append(link); else name.textContent = point.name;
      row.append(name, node('td', point.adminName), node('td', point.provider || 'Не указан'), node('td', `${point.cameras.filter((c) => status(c) === 'online').length} / ${point.cameras.length}`));
      const statusCell = node('td'); statusCell.append(badge(value, checkingIds.has(point.id) ? 'Проверяется…' : labels[value]));
      const times = point.cameras.map((c) => c.checkedAt).filter(Boolean).sort();
      row.append(statusCell, node('td', date(times[0]))); body.append(row);
      for (const camera of point.cameras) {
        const card = node('article', null, 'surveillance-camera'); card.dataset.pointId = point.id;
        const head = node('header'); head.append(node('h3', `${point.name} · ${camera.name}`), badge(status(camera)));
        const picture = node('button', null, 'surveillance-frame'); picture.type = 'button'; picture.disabled = !camera.image;
        picture.setAttribute('aria-label', `Открыть кадр: ${point.name}, ${camera.name}`); picture.title = 'Открыть изображение';
        if (camera.image) {
          const img = node('img'); img.src = camera.image; img.alt = `${point.name}, ${camera.name}`; picture.append(img);
          if (status(camera) !== 'online') picture.append(node('span', 'Последний полученный кадр', 'surveillance-old-frame'));
          picture.addEventListener('click', () => {
            byId('surveillanceLargeImage').src = camera.image; byId('surveillanceImageTitle').textContent = `${point.name} · ${camera.name}`;
            byId('surveillanceImageTime').textContent = `Кадр: ${date(camera.imageAt || camera.checkedAt)}`; byId('surveillanceImageDialog').showModal();
          });
        } else picture.append(node('span', camera.status === 'online' ? 'Кадр будет получен при следующей проверке' : camera.reason || 'Изображение еще не получено'));
        const footer = node('footer'); footer.append(node('span', `Проверка: ${date(camera.checkedAt)}`));
        if (camera.image) footer.append(node('span', `Кадр: ${date(camera.imageAt || camera.checkedAt)}`));
        if (status(camera) === 'offline') footer.append(node('span', camera.reason, 'camera-failure-reason'));
        card.append(head, picture, footer); grid.append(card);
      }
    }
    if (!visible.length) { const row = node('tr'), cell = node('td', 'Нет торговых точек по выбранным условиям.'); cell.colSpan = 6; row.append(cell); body.append(row); }
    byId('refreshSurveillance').disabled = checking;
    byId('surveillanceMonitoringState').textContent = checking ? 'Получение кадров…' :
      byId('surveillanceAuto').checked ? 'Проверка RTSP раз в минуту, пока раздел открыт. Состояние облачного архива не проверяется.' : 'Автообновление выключено. Состояние облачного архива не проверяется.';
  }
  async function check() {
    if (checking || !isActive()) return;
    const queue = scopedPoints().filter((point) => point.cameras.length);
    if (!queue.length) { schedule(); return; }
    const current = version; checking = true; notice(''); render();
    const worker = async () => {
      while (queue.length && version === current && isActive()) {
        const point = queue.shift(); checkingIds.add(point.id); render();
        try {
          const result = await api(`/api/surveillance/check/${encodeURIComponent(point.id)}`, { method: 'POST' });
          if (version !== current) return;
          point.cameras = result.cameras.map((camera) => {
            const old = point.cameras.find((c) => c.id === camera.id);
            return { ...camera, image: camera.image || old?.image || null, imageAt: camera.image ? camera.checkedAt : old?.imageAt || null };
          });
        } catch (error) {
          if (version !== current) return;
          point.cameras = point.cameras.map((camera) => ({ ...camera, status: 'unknown', reason: error.message }));
          notice(`Проверка не завершена. ${error.message}`);
        } finally { if (version === current) { checkingIds.delete(point.id); render(); } }
      }
    };
    await Promise.all([worker(), worker()]);
    if (version === current) { checking = false; lastCycle = Date.now(); render(); schedule(); }
  }
  function schedule() {
    clearTimeout(timer); if (loaded) render();
    if (isActive()) timer = setTimeout(() => {
      render();
      if (byId('surveillanceAuto').checked && Date.now() - lastCycle >= 60000) check();
      else schedule();
    }, 15000);
  }
  function pause() { ++version; clearTimeout(timer); checking = false; checkingIds.clear(); }
  function reset() { pause(); ++configVersion; configReady = false; configPoint = ''; points = []; selected.clear(); loaded = false; byId('surveillanceCameraGrid')?.replaceChildren(); byId('retailPointCameraInputs')?.replaceChildren(); }
  async function loadConfig(pointId, editable) {
    init(); const current = ++configVersion; configPoint = pointId; configReady = false;
    byId('retailPointCameraSettings').hidden = !editable;
    byId('retailPointCameraInputs').replaceChildren();
    byId('saveRetailPointCameras').disabled = true;
    showNotice(byId('retailPointCameraNotice'), '');
    if (!editable) return;
    try {
      const data = await api(`/api/surveillance/config/${encodeURIComponent(pointId)}`);
      if (current !== configVersion) return;
      configRevision = data.config.revision;
      for (let i = 1; i <= 4; i++) {
        const id = `cam${i}`, saved = data.config.cameras.find((c) => c.id === id);
        const row = node('div', null, 'camera-config-row'); row.dataset.cameraId = id;
        const enabledLabel = node('label', null, 'check-row'), enabled = node('input'); enabled.type = 'checkbox'; enabled.checked = Boolean(saved); enabled.dataset.cameraEnabled = '';
        enabledLabel.append(enabled, node('span', `Камера ${i}`));
        const nameLabel = node('label', 'Название'), name = node('input'); name.type = 'text'; name.maxLength = 80; name.value = saved?.name || `Камера ${i}`; name.dataset.cameraName = ''; nameLabel.append(name);
        const urlLabel = node('label', 'RTSP-ссылка'), url = node('input'); url.type = 'password'; url.autocomplete = 'new-password'; url.maxLength = 2048; url.spellcheck = false;
        url.placeholder = saved ? 'Сохранена. Новая ссылка заменит прежнюю' : 'rtsp://логин:пароль@сервер:554/поток'; url.dataset.cameraSource = ''; url.dataset.configured = String(Boolean(saved)); urlLabel.append(url);
        const sync = () => { name.disabled = url.disabled = !enabled.checked; }; enabled.addEventListener('change', sync); sync();
        row.append(enabledLabel, nameLabel, urlLabel); byId('retailPointCameraInputs').append(row);
      }
      configReady = true; byId('saveRetailPointCameras').disabled = false;
    } catch (error) { if (current === configVersion) showNotice(byId('retailPointCameraNotice'), `Настройки камер не загружены. ${error.message}`, 'error'); }
  }
  async function saveConfig() {
    if (!configReady) return;
    const pointId = configPoint, current = configVersion;
    const cameras = [...byId('retailPointCameraInputs').children].filter((row) => row.querySelector('[data-camera-enabled]').checked).map((row) => {
      const url = row.querySelector('[data-camera-source]');
      return { id: row.dataset.cameraId, name: row.querySelector('[data-camera-name]').value,
        ...(url.value.trim() || url.dataset.configured !== 'true' ? { rtspUrl: url.value.trim() } : {}) };
    });
    await runWithButton(byId('saveRetailPointCameras'), async () => {
      await api(`/api/surveillance/config/${encodeURIComponent(pointId)}`, { method: 'PUT', body: { cameras, revision: configRevision } });
      if (current !== configVersion) return;
      await loadConfig(pointId, true);
      showNotice(byId('retailPointCameraNotice'), 'Настройки камер сохранены.', 'success');
    }, byId('retailPointCameraNotice'));
  }
  return { load, pause, reset, loadConfig };
})();
