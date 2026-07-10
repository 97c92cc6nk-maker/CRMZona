'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const os = require('os');
const tls = require('tls');
const { URL } = require('url');

const ROOT_DIR = path.resolve(__dirname, '..');

loadEnvFile(path.join(ROOT_DIR, '.env'));

if (!process.env.DATA_DIR && process.env.VERCEL) {
  process.env.DATA_DIR = path.join(os.tmpdir(), 'crmzona-data');
}

const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DEFAULT_DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, 'data');
const PORT = process.env.PORT || 8080;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const BODY_LIMIT_BYTES = 800 * 1024;

const ROLE_LABELS = {
  owner: 'Владелец',
  admin: 'Администраторы',
  employee: 'Сотрудники',
};

const POINTS = [
  { id: 'moscow_6231', name: 'МОСКВА_6231' },
  { id: 'krasnogorsk_466', name: 'КРАСНОГОРСК_466' },
];

const REPAIR_STATUSES = [
  { value: 'new', label: 'Новая' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Выполнена' },
  { value: 'canceled', label: 'Отменена' },
];

const REPAIR_PRIORITIES = [
  { value: 'normal', label: 'Обычная' },
  { value: 'high', label: 'Срочная' },
  { value: 'critical', label: 'Критичная' },
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

class Store {
  constructor(dataDir = DEFAULT_DATA_DIR) {
    this.dataDir = dataDir;
    this.primaryDataDir = dataDir;
    this.fallbackDataDir = process.env.FALLBACK_DATA_DIR
      ? path.resolve(process.env.FALLBACK_DATA_DIR)
      : path.join(os.tmpdir(), 'smart-schedule-data');
    this.memory = new Map();
    this.storageWarning = null;
    this.ensureLayout();
  }

  ensureLayout() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.mkdirSync(path.join(this.dataDir, 'outbox'), { recursive: true });
      this.assertWritableDataDir();
    } catch (error) {
      this.activateFallbackStorage(error);
    }

    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'outbox'), { recursive: true });
    this.ensureJson('users.json', []);
    this.ensureJson('sessions.json', {});
    this.ensureJson('schedules.json', {});
    this.ensureJson('repairs.json', []);
  }

  assertWritableDataDir() {
    const probe = path.join(this.dataDir, `.write-test-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
  }

  ensureJson(fileName, fallback) {
    const filePath = this.path(fileName);
    if (!fs.existsSync(filePath)) {
      this.saveJson(fileName, fallback);
    }
  }

  path(fileName) {
    return path.join(this.dataDir, fileName);
  }

  loadJson(fileName, fallback) {
    if (this.memory.has(fileName)) {
      return cloneJson(this.memory.get(fileName));
    }

    try {
      const raw = fs.readFileSync(this.path(fileName), 'utf8');
      return raw.trim() ? JSON.parse(raw) : fallback;
    } catch (error) {
      this.audit('storage.read_failed', { fileName, error: error.message });
      return fallback;
    }
  }

  saveJson(fileName, data) {
    const target = this.path(fileName);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    const serialized = JSON.stringify(data, null, 2);

    try {
      fs.writeFileSync(tmp, serialized, 'utf8');
      fs.renameSync(tmp, target);
    } catch (error) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        // Best effort cleanup only.
      }

      try {
        fs.writeFileSync(target, serialized, 'utf8');
        this.audit('storage.direct_write_fallback', { fileName, error: error.message });
      } catch (fallbackError) {
        try {
          this.activateFallbackStorage(fallbackError);
          this.saveJson(fileName, data);
        } catch (fallbackStorageError) {
          this.memory.set(fileName, cloneJson(data));
          this.storageWarning = {
            persistent: false,
            fallback: 'memory',
            message: 'Файловое хранилище недоступно. Данные временно сохранены в памяти сервера до его перезапуска.',
            fileName,
            error: fallbackStorageError.message,
          };
          this.audit('storage.memory_write_fallback', {
            fileName,
            atomicError: error.message,
            directError: fallbackError.message,
            fallbackStorageError: fallbackStorageError.message,
          });
        }
      }
    }
  }

  activateFallbackStorage(error) {
    if (this.dataDir === this.fallbackDataDir) return;

    const previousDataDir = this.dataDir;
    fs.mkdirSync(this.fallbackDataDir, { recursive: true });
    fs.mkdirSync(path.join(this.fallbackDataDir, 'outbox'), { recursive: true });

    for (const [fileName, fallback] of [
      ['users.json', []],
      ['sessions.json', {}],
      ['schedules.json', {}],
      ['repairs.json', []],
    ]) {
      const source = path.join(previousDataDir, fileName);
      const target = path.join(this.fallbackDataDir, fileName);
      if (fs.existsSync(target)) continue;

      let data = fallback;
      try {
        if (fs.existsSync(source)) {
          const raw = fs.readFileSync(source, 'utf8');
          data = raw.trim() ? JSON.parse(raw) : fallback;
        }
      } catch {
        data = fallback;
      }
      fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
    }

    this.dataDir = this.fallbackDataDir;
    this.storageWarning = {
      persistent: true,
      fallback: 'disk',
      message: `Основное хранилище недоступно. Используется резервное дисковое хранилище: ${this.fallbackDataDir}.`,
      primaryDataDir: this.primaryDataDir,
      dataDir: this.dataDir,
      error: error.message,
    };
    this.audit('storage.disk_fallback_enabled', this.storageWarning);
  }

  audit(action, details = {}, actorId = null) {
    const event = {
      at: new Date().toISOString(),
      action,
      actorId,
      details: scrubForLog(details),
    };
    try {
      fs.appendFileSync(this.path('audit.log'), `${JSON.stringify(event)}\n`, 'utf8');
    } catch {
      // Avoid breaking the request path if logging itself is unavailable.
    }
  }

  listUsers() {
    return this.loadJson('users.json', []);
  }

  saveUsers(users) {
    this.saveJson('users.json', users);
  }

  getUserById(id) {
    return this.listUsers().find((user) => user.id === id) || null;
  }

  getUserByEmail(email) {
    const normalized = normalizeEmail(email);
    return this.listUsers().find((user) => user.email === normalized) || null;
  }

  createUser({
    fullName,
    phone,
    email,
    password,
    role: requestedRole = null,
    position = '',
    hireDate = '',
    officialEmployment = false,
  }) {
    const users = this.listUsers();
    const normalizedEmail = normalizeEmail(email);

    if (users.some((user) => user.email === normalizedEmail)) {
      throw new ApiError(409, 'Пользователь с таким email уже зарегистрирован.');
    }

    const role = users.length === 0 ? 'owner' : normalizeAccountRole(requestedRole || 'employee');
    const passwordRecord = hashPassword(password);
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      fullName,
      phone,
      email: normalizedEmail,
      position: normalizeText(position),
      hireDate: normalizeDateInput(hireDate),
      officialEmployment: Boolean(officialEmployment),
      role,
      password: passwordRecord,
      createdAt: now,
      updatedAt: now,
    };

    users.push(user);
    this.saveUsers(users);
    this.audit('user.registered', { userId: user.id, email: normalizedEmail, role });
    return sanitizeUser(user);
  }

  updateUser(actor, userId, patch) {
    const users = this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) {
      throw new ApiError(404, 'Пользователь не найден.');
    }
    if (target.role === 'owner' && target.id !== actor.id) {
      throw new ApiError(403, 'Карточку владельца нельзя менять из справочника сотрудников.');
    }

    const employee = validateEmployeeRecord({
      fullName: patch.fullName ?? target.fullName,
      phone: patch.phone ?? target.phone,
      email: patch.email ?? target.email,
      position: patch.position ?? target.position,
      hireDate: patch.hireDate ?? target.hireDate,
      officialEmployment: patch.officialEmployment ?? target.officialEmployment,
      role: patch.role ?? target.role,
    }, { allowOwner: target.role === 'owner' });
    const normalizedEmail = normalizeEmail(employee.email);
    const duplicate = users.find((user) => user.id !== userId && user.email === normalizedEmail);
    if (duplicate) {
      throw new ApiError(409, 'Пользователь с таким email уже зарегистрирован.');
    }
    if (target.role === 'owner' && employee.role !== 'owner') {
      const ownerCount = users.filter((user) => user.role === 'owner').length;
      if (ownerCount <= 1) {
        throw new ApiError(400, 'Нельзя убрать последнего владельца.');
      }
    }

    Object.assign(target, {
      fullName: employee.fullName,
      phone: employee.phone,
      email: normalizedEmail,
      position: employee.position,
      hireDate: employee.hireDate,
      officialEmployment: employee.officialEmployment,
      role: employee.role,
      updatedAt: new Date().toISOString(),
    });
    this.saveUsers(users);
    this.audit('user.updated', { userId }, actor.id);
    return sanitizeUser(target);
  }

  deleteUser(actor, userId) {
    const users = this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) {
      throw new ApiError(404, 'Пользователь не найден.');
    }
    if (target.id === actor.id) {
      throw new ApiError(400, 'Нельзя удалить свою учетную запись.');
    }
    if (target.role === 'owner') {
      throw new ApiError(400, 'Владельца нельзя удалить из справочника сотрудников.');
    }

    this.saveUsers(users.filter((user) => user.id !== userId));
    this.deleteUserSessions(userId);
    this.removeUserFromSchedules(userId);
    this.audit('user.deleted', { userId, email: target.email }, actor.id);
    return sanitizeUser(target);
  }

  deleteUserSessions(userId) {
    const sessions = this.loadJson('sessions.json', {});
    let changed = false;
    for (const [sid, session] of Object.entries(sessions)) {
      if (session.userId === userId) {
        delete sessions[sid];
        changed = true;
      }
    }
    if (changed) {
      this.saveJson('sessions.json', sessions);
    }
  }

  removeUserFromSchedules(userId) {
    const schedules = this.loadJson('schedules.json', {});
    let changed = false;
    for (const schedule of Object.values(schedules)) {
      if (!Array.isArray(schedule.rows)) continue;
      const nextRows = schedule.rows.filter((row) => row.employeeId !== userId);
      if (nextRows.length !== schedule.rows.length) {
        schedule.rows = nextRows;
        schedule.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) {
      this.saveJson('schedules.json', schedules);
    }
  }

  updateUserRole(actor, userId, role) {
    if (!ROLE_LABELS[role]) {
      throw new ApiError(400, 'Неизвестный тип доступа.');
    }

    const users = this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) {
      throw new ApiError(404, 'Пользователь не найден.');
    }

    const ownerCount = users.filter((user) => user.role === 'owner').length;
    if (target.role === 'owner' && role !== 'owner' && ownerCount <= 1) {
      throw new ApiError(400, 'Нельзя убрать последнего владельца.');
    }

    target.role = role;
    target.updatedAt = new Date().toISOString();
    this.saveUsers(users);
    this.audit('user.role_changed', { userId, role }, actor.id);
    return sanitizeUser(target);
  }

  updatePassword(userId, newPassword) {
    const users = this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) {
      throw new ApiError(404, 'Пользователь не найден.');
    }
    target.password = hashPassword(newPassword);
    target.updatedAt = new Date().toISOString();
    this.saveUsers(users);
    this.audit('user.password_changed', { userId }, userId);
  }

  createSession(userId) {
    const sessions = this.loadJson('sessions.json', {});
    const sid = crypto.randomBytes(32).toString('base64url');
    sessions[sid] = {
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };
    this.saveJson('sessions.json', sessions);
    return sid;
  }

  getSession(sid) {
    if (!sid) return null;
    const sessions = this.loadJson('sessions.json', {});
    const session = sessions[sid];
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      delete sessions[sid];
      this.saveJson('sessions.json', sessions);
      return null;
    }
    return session;
  }

  deleteSession(sid) {
    const sessions = this.loadJson('sessions.json', {});
    if (sessions[sid]) {
      delete sessions[sid];
      this.saveJson('sessions.json', sessions);
    }
  }

  getSchedule(pointId, month, actor) {
    validatePointAndMonth(pointId, month);
    const schedules = this.loadJson('schedules.json', {});
    const key = scheduleKey(pointId, month);
    const saved = schedules[key] || { pointId, month, rows: [], updatedAt: null, updatedBy: null };
    const users = this.listUsers();
    const employeeOptions = scheduleEmployeeOptions(actor, users);
    const rows = hydrateScheduleRows(saved.rows || [], users, getDaysInMonth(month));

    for (const employee of employeeOptions) {
      const exists = rows.some((row) => row.employeeId === employee.id);
      if (!exists) {
        rows.push({
          id: crypto.randomUUID(),
          employeeId: employee.id,
          employeeName: employee.fullName,
          days: {},
        });
      }
    }

    const visibleRows = canManageAllSchedule(actor)
      ? rows
      : rows.filter((row) => row.employeeId === actor.id);

    return {
      ...saved,
      pointId,
      month,
      pointName: pointName(pointId),
      daysInMonth: getDaysInMonth(month),
      rows: visibleRows,
      employeeOptions,
    };
  }

  saveSchedule(actor, pointId, month, rows) {
    validatePointAndMonth(pointId, month);
    const users = this.listUsers();
    const employeeOptions = scheduleEmployeeOptions(actor, users);
    const normalizedRows = validateScheduleRows(month, rows, employeeOptions);
    const schedules = this.loadJson('schedules.json', {});
    const key = scheduleKey(pointId, month);
    const saved = schedules[key] || { pointId, month, rows: [], updatedAt: null, updatedBy: null };
    const existingRows = hydrateScheduleRows(saved.rows || [], users, getDaysInMonth(month));
    const scheduleRows = canManageAllSchedule(actor)
      ? normalizedRows
      : [
          ...existingRows.filter((row) => row.employeeId !== actor.id),
          ...normalizedRows.filter((row) => row.employeeId === actor.id),
        ];
    const schedule = {
      pointId,
      month,
      rows: scheduleRows,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    };

    schedules[key] = schedule;
    this.saveJson('schedules.json', schedules);
    this.audit('schedule.saved', { pointId, month, rows: normalizedRows.length }, actor.id);
    return this.getSchedule(pointId, month, actor);
  }

  listRepairs(actor) {
    const users = this.listUsers();
    const repairs = this.loadJson('repairs.json', []);
    const visible = canManageRepairs(actor)
      ? repairs
      : repairs.filter((repair) => repair.createdBy === actor.id);

    return visible
      .map((repair) => hydrateRepair(repair, users))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  createRepair(actor, input) {
    const repair = validateRepairRequest(input);
    const repairs = this.loadJson('repairs.json', []);
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      pointId: repair.pointId,
      title: repair.title,
      description: repair.description,
      priority: repair.priority,
      status: 'new',
      createdBy: actor.id,
      createdByName: actor.fullName,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };
    repairs.push(record);
    this.saveJson('repairs.json', repairs);
    this.audit('repair.created', { repairId: record.id, pointId: record.pointId, priority: record.priority }, actor.id);
    return hydrateRepair(record, this.listUsers());
  }

  updateRepair(actor, repairId, input) {
    const patch = validateRepairPatch(input);
    const repairs = this.loadJson('repairs.json', []);
    const target = repairs.find((repair) => repair.id === repairId);
    if (!target) {
      throw new ApiError(404, 'Заявка на ремонт не найдена.');
    }

    Object.assign(target, {
      status: patch.status,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    });
    this.saveJson('repairs.json', repairs);
    this.audit('repair.updated', { repairId: target.id, status: target.status }, actor.id);
    return hydrateRepair(target, this.listUsers());
  }

  readAudit(limit = 40) {
    const logPath = this.path('audit.log');
    if (!fs.existsSync(logPath)) return [];
    const raw = fs.readFileSync(logPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { at: null, action: 'audit.parse_failed', details: { line } };
        }
      })
      .reverse();
  }

  storageStatus() {
    return this.storageWarning || {
      persistent: true,
      fallback: null,
      message: null,
    };
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function maybeAwait(value) {
  return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

function createRequestHandler(store = new Store()) {
  return async (req, res) => {
    setCommonHeaders(res);
    const requestUrl = new URL(req.url, 'http://localhost');

    try {
      if (req.method === 'GET' && requestUrl.pathname === '/health') {
        sendJson(res, 200, { ok: true, storage: await maybeAwait(store.storageStatus()) });
        return;
      }
      if (requestUrl.pathname.startsWith('/api/')) {
        await handleApi(req, res, requestUrl, store);
        return;
      }
      serveStatic(requestUrl, res);
    } catch (error) {
      handleError(res, store, error);
    }
  };
}

async function handleApi(req, res, requestUrl, store) {
  const pathname = requestUrl.pathname;

  if (req.method === 'POST' && pathname === '/api/register') {
    ensureRate(req, 'register', 6, 10 * 60 * 1000);
    const body = await readJsonBody(req);
    const registration = validateRegistration(body);
    const password = generatePassword();
    const user = await store.createUser({ ...registration, password });
    const delivery = await sendPasswordEmail(store, {
      to: user.email,
      fullName: user.fullName,
      password,
      role: user.role,
    });
    await store.audit('email.password_delivery', { userId: user.id, to: user.email, delivery });
    sendJson(res, 201, {
      message: delivery.status === 'sent'
        ? 'Регистрация завершена. Пароль отправлен на email.'
        : 'Регистрация завершена. SMTP недоступен или не настроен, письмо сохранено в локальный outbox.',
      user,
      emailDelivery: publicDelivery(delivery),
      storage: await maybeAwait(store.storageStatus()),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    ensureRate(req, 'login', 12, 10 * 60 * 1000);
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const user = await store.getUserByEmail(email);

    if (!user || !verifyPassword(password, user.password)) {
      await store.audit('auth.login_failed', { email });
      throw new ApiError(401, 'Неверный email или пароль.');
    }

    const sid = await store.createSession(user.id);
    await store.audit('auth.login_success', { userId: user.id }, user.id);
    sendJson(res, 200, { user: sanitizeUser(user) }, {
      'Set-Cookie': sessionCookie(sid),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/forgot-password') {
    ensureRate(req, 'forgot-password', 5, 10 * 60 * 1000);
    const body = await readJsonBody(req);
    const email = validatePasswordResetEmail(body);
    const user = await store.getUserByEmail(email);
    const genericMessage = 'Если email зарегистрирован, новый пароль отправлен на почту.';

    await store.audit('auth.password_reset_requested', { email });

    if (!user) {
      await store.audit('auth.password_reset_unknown_email', { email });
      sendJson(res, 200, {
        ok: true,
        message: genericMessage,
        emailDelivery: null,
        storage: await maybeAwait(store.storageStatus()),
      });
      return;
    }

    const password = generatePassword();
    await store.updatePassword(user.id, password);
    await store.deleteUserSessions(user.id);
    const delivery = await sendPasswordEmail(store, {
      to: user.email,
      fullName: user.fullName,
      password,
      role: user.role,
      purpose: 'reset',
    });
    await store.audit('email.password_reset_delivery', { userId: user.id, to: user.email, delivery }, user.id);
    sendJson(res, 200, {
      ok: true,
      message: delivery.status === 'sent'
        ? 'Новый пароль отправлен на email.'
        : 'SMTP недоступен или не настроен, письмо с новым паролем сохранено в локальный outbox.',
      emailDelivery: publicDelivery(delivery),
      storage: await maybeAwait(store.storageStatus()),
    });
    return;
  }

  const auth = await requireAuth(req, store);

  if (req.method === 'POST' && pathname === '/api/logout') {
    await store.deleteSession(auth.sessionId);
    await store.audit('auth.logout', { userId: auth.user.id }, auth.user.id);
    sendJson(res, 200, { ok: true }, {
      'Set-Cookie': clearSessionCookie(),
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    sendJson(res, 200, {
      user: sanitizeUser(auth.user),
      permissions: permissionsFor(auth.user),
      roles: roleOptions(),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/change-password') {
    const body = await readJsonBody(req);
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');

    if (!verifyPassword(currentPassword, auth.user.password)) {
      throw new ApiError(400, 'Текущий пароль указан неверно.');
    }
    validateNewPassword(newPassword);
    await store.updatePassword(auth.user.id, newPassword);
    sendJson(res, 200, { ok: true, message: 'Пароль обновлен.' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/points') {
    sendJson(res, 200, { points: POINTS });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/users') {
    requireRole(auth.user, ['owner', 'admin']);
    const users = (await store.listUsers()).map(sanitizeUser);
    sendJson(res, 200, { users, roles: employeeRoleOptions() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/users') {
    requireRole(auth.user, ['owner']);
    const body = await readJsonBody(req);
    const employee = validateEmployeeRecord(body);
    const password = generatePassword();
    const user = await store.createUser({ ...employee, password });
    const delivery = await sendPasswordEmail(store, {
      to: user.email,
      fullName: user.fullName,
      password,
      role: user.role,
    });
    await store.audit('employee.created', { userId: user.id, email: user.email, delivery }, auth.user.id);
    sendJson(res, 201, {
      user,
      emailDelivery: publicDelivery(delivery),
      storage: await maybeAwait(store.storageStatus()),
      message: delivery.status === 'sent'
        ? 'Сотрудник добавлен. Пароль отправлен на email.'
        : 'Сотрудник добавлен. SMTP недоступен или не настроен, письмо сохранено в локальный outbox.',
    });
    return;
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === 'PATCH' && userMatch) {
    requireRole(auth.user, ['owner']);
    const body = await readJsonBody(req);
    const updated = await store.updateUser(auth.user, userMatch[1], body);
    sendJson(res, 200, { user: updated, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  if (req.method === 'DELETE' && userMatch) {
    requireRole(auth.user, ['owner']);
    const deleted = await store.deleteUser(auth.user, userMatch[1]);
    sendJson(res, 200, { user: deleted, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const roleMatch = pathname.match(/^\/api\/users\/([^/]+)\/role$/);
  if (req.method === 'PATCH' && roleMatch) {
    requireRole(auth.user, ['owner']);
    const body = await readJsonBody(req);
    const updated = await store.updateUserRole(auth.user, roleMatch[1], body.role);
    sendJson(res, 200, { user: updated });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/audit') {
    requireRole(auth.user, ['owner', 'admin']);
    const limit = Math.min(100, Math.max(1, Number(requestUrl.searchParams.get('limit') || 40)));
    sendJson(res, 200, { events: await store.readAudit(limit) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/repairs') {
    sendJson(res, 200, {
      repairs: await store.listRepairs(auth.user),
      canManage: canManageRepairs(auth.user),
      statuses: REPAIR_STATUSES,
      priorities: REPAIR_PRIORITIES,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/repairs') {
    const body = await readJsonBody(req);
    const repair = await store.createRepair(auth.user, body);
    sendJson(res, 201, { repair, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const repairMatch = pathname.match(/^\/api\/repairs\/([^/]+)$/);
  if (req.method === 'PATCH' && repairMatch) {
    requireRole(auth.user, ['owner', 'admin']);
    const body = await readJsonBody(req);
    const repair = await store.updateRepair(auth.user, repairMatch[1], body);
    sendJson(res, 200, { repair, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/schedule') {
    const pointId = requestUrl.searchParams.get('pointId');
    const month = requestUrl.searchParams.get('month');
    const schedule = await store.getSchedule(pointId, month, auth.user);
    sendJson(res, 200, {
      schedule,
      canEdit: canEditSchedule(auth.user),
      canManageAll: canManageAllSchedule(auth.user),
      employeeOptions: schedule.employeeOptions,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/schedule') {
    const body = await readJsonBody(req);
    const schedule = await store.saveSchedule(auth.user, body.pointId, body.month, body.rows);
    sendJson(res, 200, { schedule, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  throw new ApiError(404, 'Маршрут не найден.');
}

function serveStatic(requestUrl, res) {
  const requested = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    throw new ApiError(400, 'Некорректный адрес файла.');
  }

  const filePath = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    throw new ApiError(403, 'Доступ запрещен.');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new ApiError(404, 'Файл не найден.');
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

function setCommonHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '));
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function handleError(res, store, error) {
  const status = error instanceof ApiError ? error.status : 500;
  if (status >= 500) {
    store.audit('http.error', { message: error.message, stack: error.stack });
  }
  sendJson(res, status, {
    error: error.message || 'Внутренняя ошибка сервера.',
    details: error.details,
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > BODY_LIMIT_BYTES) {
        reject(new ApiError(413, 'Слишком большой запрос.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ApiError(400, 'Некорректный JSON.'));
      }
    });
    req.on('error', reject);
  });
}

async function requireAuth(req, store) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionId = cookies.session;
  const session = await store.getSession(sessionId);
  const user = session ? await store.getUserById(session.userId) : null;

  if (!session || !user) {
    throw new ApiError(401, 'Требуется вход.');
  }
  return { sessionId, session, user };
}

function requireRole(user, roles) {
  if (!roles.includes(user.role)) {
    throw new ApiError(403, 'Недостаточно прав.');
  }
}

function permissionsFor(user) {
  return {
    canEditSchedule: canEditSchedule(user),
    canManageAllSchedule: canManageAllSchedule(user),
    canManageRepairs: canManageRepairs(user),
    canManageRoles: user.role === 'owner',
    canViewUsers: ['owner', 'admin'].includes(user.role),
    canViewAudit: ['owner', 'admin'].includes(user.role),
  };
}

function canEditSchedule(user) {
  return ['owner', 'admin', 'employee'].includes(user.role);
}

function canManageAllSchedule(user) {
  return ['owner', 'admin'].includes(user.role);
}

function canManageRepairs(user) {
  return ['owner', 'admin'].includes(user.role);
}

function sessionCookie(sid) {
  return [
    `session=${encodeURIComponent(sid)}`,
    'Path=/',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ');
}

function clearSessionCookie() {
  return 'session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax';
}

function parseCookies(header) {
  const cookies = {};
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) continue;
    cookies[rawKey] = decodeURIComponent(rawValue.join('=') || '');
  }
  return cookies;
}

function validateRegistration(input) {
  const errors = [];
  const fullName = normalizeText(input.fullName);
  const phone = normalizeText(input.phone);
  const email = normalizeEmail(input.email);

  if (!fullName) {
    errors.push('ФИО обязательно.');
  } else if (fullName.length < 5 || fullName.split(/\s+/).length < 2) {
    errors.push('Укажите ФИО минимум из двух слов.');
  } else if (fullName.length > 120) {
    errors.push('ФИО слишком длинное.');
  }

  const digits = phone.replace(/\D/g, '');
  if (!phone) {
    errors.push('Номер телефона обязателен.');
  } else if (digits.length < 7 || digits.length > 18 || !/^[+\d\s().-]+$/.test(phone)) {
    errors.push('Укажите корректный номер телефона.');
  }

  if (!email) {
    errors.push('Email обязателен.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 180) {
    errors.push('Укажите корректный email.');
  }

  if (errors.length) {
    throw new ApiError(400, 'Проверьте заполнение полей.', errors);
  }

  return { fullName, phone, email };
}

function validateEmployeeRecord(input, options = {}) {
  const base = validateRegistration(input);
  const position = normalizeText(input.position);
  const hireDate = normalizeDateInput(input.hireDate);
  const officialEmployment = parseBoolean(input.officialEmployment);
  const role = options.allowOwner && input.role === 'owner'
    ? 'owner'
    : normalizeAccountRole(input.role || 'employee');

  if (position.length > 120) {
    throw new ApiError(400, 'Должность слишком длинная.');
  }

  return {
    ...base,
    position,
    hireDate,
    officialEmployment,
    role,
  };
}

function normalizeAccountRole(role) {
  if (role === 'employee' || role === 'admin') return role;
  throw new ApiError(400, 'Тип учетной записи должен быть "Сотрудники" или "Администраторы".');
}

function normalizeDateInput(value) {
  const date = normalizeText(value);
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, 'Дата начала работы должна быть в формате ГГГГ-ММ-ДД.');
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ApiError(400, 'Укажите корректную дату начала работы.');
  }
  return date;
}

function parseBoolean(value) {
  return value === true || value === 'true' || value === 'yes' || value === '1';
}

function validateNewPassword(password) {
  if (password.length < 10) {
    throw new ApiError(400, 'Новый пароль должен быть не короче 10 символов.');
  }
  if (!/[a-zа-я]/i.test(password) || !/\d/.test(password)) {
    throw new ApiError(400, 'Новый пароль должен содержать буквы и цифры.');
  }
}

function validatePasswordResetEmail(input) {
  const email = normalizeEmail(input.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 180) {
    throw new ApiError(400, 'Укажите корректный email для восстановления пароля.');
  }
  return email;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 150000;
  const digest = 'sha256';
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, digest).toString('hex');
  return { algorithm: 'pbkdf2', digest, iterations, salt, hash };
}

function verifyPassword(password, record) {
  if (!record || record.algorithm !== 'pbkdf2') return false;
  const actual = crypto.pbkdf2Sync(password, record.salt, record.iterations, 32, record.digest);
  const expected = Buffer.from(record.hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function generatePassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%';
  let password = '';
  for (let index = 0; index < length; index += 1) {
    password += alphabet[crypto.randomInt(alphabet.length)];
  }
  return password;
}

async function sendPasswordEmail(store, { to, fullName, password, role, purpose = 'created' }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost';
  const subject = purpose === 'reset'
    ? 'Новый пароль для сайта графиков работ'
    : 'Пароль для сайта графиков работ';
  const text = [
    `Здравствуйте, ${fullName}.`,
    '',
    purpose === 'reset'
      ? 'Для вашего аккаунта на сайте графиков работ сгенерирован новый пароль.'
      : 'Ваш аккаунт на сайте графиков работ создан.',
    `Email: ${to}`,
    `Пароль: ${password}`,
    `Тип доступа: ${ROLE_LABELS[role]}`,
    '',
    'После входа откройте личный кабинет и замените пароль.',
  ].join('\n');
  const message = makeEmailMessage({ from, to, subject, text });
  const config = smtpConfig();

  if (!config) {
    return writeOutbox(store, message, to, 'SMTP не настроен.');
  }

  try {
    await sendSmtpMessage(config, { from, to, message });
    return { status: 'sent', sourceUnavailable: false };
  } catch (error) {
    return writeOutbox(store, message, to, `SMTP недоступен: ${error.message}`);
  }
}

function smtpConfig() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT) return null;
  const port = Number(process.env.SMTP_PORT);
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    startTls: process.env.SMTP_STARTTLS !== 'false',
  };
}

function makeEmailMessage({ from, to, subject, text }) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const body = text.replace(/\r?\n/g, '\r\n');
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n');
}

function writeOutbox(store, message, to, reason) {
  const safeName = to.replace(/[^a-z0-9@._-]+/gi, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${stamp}-${safeName}.eml`;
  if (!store.dataDir) {
    const fallbackDir = path.join(os.tmpdir(), 'smart-schedule-outbox');
    const fallbackPath = path.join(fallbackDir, fileName);
    fs.mkdirSync(fallbackDir, { recursive: true });
    fs.writeFileSync(fallbackPath, message, 'utf8');
    return {
      status: 'outbox',
      sourceUnavailable: true,
      reason: `${reason} Постоянный локальный outbox недоступен в serverless-окружении.`,
      outboxPath: displayPath(fallbackPath),
    };
  }
  const primaryPath = path.join(store.dataDir, 'outbox', fileName);

  try {
    fs.mkdirSync(path.dirname(primaryPath), { recursive: true });
    fs.writeFileSync(primaryPath, message, 'utf8');
    return {
      status: 'outbox',
      sourceUnavailable: true,
      reason,
      outboxPath: displayPath(primaryPath),
    };
  } catch (error) {
    const fallbackDir = path.join(os.tmpdir(), 'smart-schedule-outbox');
    const fallbackPath = path.join(fallbackDir, fileName);
    fs.mkdirSync(fallbackDir, { recursive: true });
    fs.writeFileSync(fallbackPath, message, 'utf8');
    return {
      status: 'outbox',
      sourceUnavailable: true,
      reason: `${reason} Рабочий outbox недоступен: ${error.message}`,
      outboxPath: displayPath(fallbackPath),
    };
  }
}

function displayPath(filePath) {
  const relative = path.relative(ROOT_DIR, filePath);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative;
  }
  return filePath;
}

function sendSmtpMessage(config, { from, to, message }) {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('таймаут подключения к SMTP'));
    }, 15000);

    socket.once(config.secure ? 'secureConnect' : 'connect', async () => {
      try {
        await expectSmtp(socket, [220]);
        let ehlo = await smtpCommand(socket, 'EHLO localhost', [250]);

        if (!config.secure && config.startTls && /STARTTLS/i.test(ehlo.text)) {
          await smtpCommand(socket, 'STARTTLS', [220]);
          const secureSocket = tls.connect({ socket, servername: config.host });
          await waitForSecureConnect(secureSocket);
          ehlo = await smtpCommand(secureSocket, 'EHLO localhost', [250]);
          await sendAuthenticatedMail(secureSocket, config, from, to, message);
        } else {
          await sendAuthenticatedMail(socket, config, from, to, message);
        }

        clearTimeout(timeout);
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function sendAuthenticatedMail(socket, config, from, to, message) {
  if (config.user || config.pass) {
    await smtpCommand(socket, 'AUTH LOGIN', [334]);
    await smtpCommand(socket, Buffer.from(config.user).toString('base64'), [334]);
    await smtpCommand(socket, Buffer.from(config.pass).toString('base64'), [235]);
  }
  await smtpCommand(socket, `MAIL FROM:<${extractEmail(from)}>`, [250]);
  await smtpCommand(socket, `RCPT TO:<${extractEmail(to)}>`, [250, 251]);
  await smtpCommand(socket, 'DATA', [354]);
  const wait = expectSmtp(socket, [250]);
  socket.write(`${dotStuff(message)}\r\n.\r\n`);
  await wait;
  await smtpCommand(socket, 'QUIT', [221, 250]).catch(() => {});
  socket.end();
}

function waitForSecureConnect(socket) {
  return new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });
}

function smtpCommand(socket, command, expectedCodes) {
  const wait = expectSmtp(socket, expectedCodes);
  socket.write(`${command}\r\n`);
  return wait;
}

function expectSmtp(socket, expectedCodes) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('таймаут ответа SMTP'));
    }, 15000);
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const finalLine = lines.find((line) => /^\d{3} /.test(line));
      if (!finalLine) return;
      const code = Number(finalLine.slice(0, 3));
      cleanup();
      if (expectedCodes.includes(code)) {
        resolve({ code, text: buffer });
      } else {
        reject(new Error(`SMTP вернул ${code}: ${finalLine.slice(4)}`));
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
    };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

function dotStuff(message) {
  return message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function extractEmail(value) {
  const match = String(value).match(/<([^>]+)>/);
  return match ? match[1] : String(value).trim();
}

function publicDelivery(delivery) {
  return {
    status: delivery.status,
    sourceUnavailable: delivery.sourceUnavailable,
    reason: delivery.reason,
    outboxPath: delivery.outboxPath,
  };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    position: user.position || '',
    hireDate: user.hireDate || '',
    officialEmployment: Boolean(user.officialEmployment),
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function scrubForLog(details) {
  if (!details || typeof details !== 'object') return details;
  return JSON.parse(JSON.stringify(details, (key, value) => {
    if (/password|pass|token|session/i.test(key)) return '[redacted]';
    return value;
  }));
}

function roleOptions() {
  return Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
}

function employeeRoleOptions() {
  return ['employee', 'admin'].map((value) => ({ value, label: ROLE_LABELS[value] }));
}

function validatePointAndMonth(pointId, month) {
  if (!POINTS.some((point) => point.id === pointId)) {
    throw new ApiError(400, 'Неизвестная торговая точка.');
  }
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) {
    throw new ApiError(400, 'Укажите месяц в формате ГГГГ-ММ.');
  }
  getDaysInMonth(month);
}

function validatePoint(pointId) {
  if (!POINTS.some((point) => point.id === pointId)) {
    throw new ApiError(400, 'Неизвестная торговая точка.');
  }
  return pointId;
}

function pointName(pointId) {
  const point = POINTS.find((item) => item.id === pointId);
  return point ? point.name : pointId;
}

function repairStatusLabel(status) {
  return REPAIR_STATUSES.find((item) => item.value === status)?.label || status;
}

function repairPriorityLabel(priority) {
  return REPAIR_PRIORITIES.find((item) => item.value === priority)?.label || priority;
}

function validateRepairRequest(input) {
  const pointId = validatePoint(input.pointId);
  const title = normalizeText(input.title);
  const description = normalizeText(input.description);
  const priority = normalizeRepairPriority(input.priority || 'normal');

  if (!title) {
    throw new ApiError(400, 'Укажите тему заявки.');
  }
  if (title.length > 120) {
    throw new ApiError(400, 'Тема заявки слишком длинная.');
  }
  if (!description) {
    throw new ApiError(400, 'Опишите, что нужно отремонтировать.');
  }
  if (description.length > 1000) {
    throw new ApiError(400, 'Описание заявки слишком длинное.');
  }

  return { pointId, title, description, priority };
}

function validateRepairPatch(input) {
  return {
    status: normalizeRepairStatus(input.status),
  };
}

function normalizeRepairStatus(status) {
  const value = normalizeText(status);
  if (!REPAIR_STATUSES.some((item) => item.value === value)) {
    throw new ApiError(400, 'Неизвестный статус заявки.');
  }
  return value;
}

function normalizeRepairPriority(priority) {
  const value = normalizeText(priority);
  if (!REPAIR_PRIORITIES.some((item) => item.value === value)) {
    throw new ApiError(400, 'Неизвестная срочность заявки.');
  }
  return value;
}

function hydrateRepair(repair, users) {
  const requester = users.find((user) => user.id === repair.createdBy);
  const updatedBy = users.find((user) => user.id === repair.updatedBy);
  return {
    id: repair.id,
    pointId: repair.pointId,
    pointName: pointName(repair.pointId),
    title: repair.title,
    description: repair.description,
    priority: repair.priority,
    priorityLabel: repairPriorityLabel(repair.priority),
    status: repair.status,
    statusLabel: repairStatusLabel(repair.status),
    createdBy: repair.createdBy,
    createdByName: requester ? requester.fullName : repair.createdByName || '',
    createdAt: repair.createdAt,
    updatedAt: repair.updatedAt,
    updatedBy: repair.updatedBy,
    updatedByName: updatedBy ? updatedBy.fullName : '',
  };
}

function scheduleKey(pointId, month) {
  return `${pointId}:${month}`;
}

function getDaysInMonth(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  if (monthIndex < 1 || monthIndex > 12) {
    throw new ApiError(400, 'Некорректный месяц.');
  }
  return new Date(year, monthIndex, 0).getDate();
}

function scheduleEmployeeOptions(actor, users) {
  const availableUsers = canManageAllSchedule(actor)
    ? users
    : users.filter((user) => user.id === actor.id);

  return availableUsers.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
  }));
}

function hydrateScheduleRows(rows, users, daysInMonth) {
  return rows.map((row) => {
    const linkedUser = row.employeeId
      ? users.find((user) => user.id === row.employeeId)
      : users.find((user) => sameEmployeeName(user.fullName, row.employeeName));

    return {
      id: row.id || crypto.randomUUID(),
      employeeId: linkedUser ? linkedUser.id : row.employeeId || null,
      employeeName: linkedUser ? linkedUser.fullName : normalizeText(row.employeeName),
      advanceCard: normalizeOptionalNumber(row.advanceCard, 'Аванс на карту'),
      salaryCard: normalizeOptionalNumber(row.salaryCard, 'ЗП на карту'),
      bonusExtra: normalizeOptionalNumber(row.bonusExtra, 'Премия'),
      claims: normalizeOptionalNumber(row.claims, 'Претензии'),
      days: normalizeScheduleDays(row.days || {}, daysInMonth),
    };
  }).filter((row) => row.employeeName);
}

function sameEmployeeName(left, right) {
  return normalizeText(left).toLowerCase() === normalizeText(right).toLowerCase();
}

function validateScheduleRows(month, rows, employeeOptions = null) {
  if (!Array.isArray(rows)) {
    throw new ApiError(400, 'Строки графика должны быть массивом.');
  }
  if (rows.length > 200) {
    throw new ApiError(400, 'Слишком много строк в графике.');
  }

  const daysInMonth = getDaysInMonth(month);
  const employeesById = new Map((employeeOptions || []).map((employee) => [employee.id, employee]));
  const seenEmployees = new Set();

  return rows.map((row) => {
    const employeeId = normalizeText(row.employeeId);
    const employee = employeeId ? employeesById.get(employeeId) : null;

    if (employeeOptions && !employee) {
      throw new ApiError(403, 'Выберите сотрудника из доступного справочника.');
    }

    const employeeName = employee ? employee.fullName : normalizeText(row.employeeName);
    if (!employeeName) {
      throw new ApiError(400, 'Сотрудник в графике обязателен.');
    }
    if (employeeName.length > 120) {
      throw new ApiError(400, 'Имя сотрудника в графике слишком длинное.');
    }
    const uniqueKey = employee ? employee.id : employeeName.toLowerCase();
    if (seenEmployees.has(uniqueKey)) {
      throw new ApiError(400, 'В графике есть повторяющийся сотрудник.');
    }
    seenEmployees.add(uniqueKey);

    const days = normalizeScheduleDays(row.days || {}, daysInMonth);
    const advanceCard = normalizeOptionalNumber(row.advanceCard, 'Аванс на карту');
    const salaryCard = normalizeOptionalNumber(row.salaryCard, 'ЗП на карту');
    const bonusExtra = normalizeOptionalNumber(row.bonusExtra, 'Премия');
    const claims = normalizeOptionalNumber(row.claims, 'Претензии');

    return {
      id: row.id || crypto.randomUUID(),
      employeeId: employee ? employee.id : employeeId || null,
      employeeName,
      advanceCard,
      salaryCard,
      bonusExtra,
      claims,
      days,
    };
  });
}

function normalizeScheduleDays(rawDays, daysInMonth) {
  const days = {};
  for (const [day, rawValue] of Object.entries(rawDays || {})) {
    const dayNumber = Number(day);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > daysInMonth) {
      throw new ApiError(400, 'В графике есть дата за пределами выбранного месяца.');
    }
    const value = normalizeDayMetrics(rawValue);
    if (value) days[String(dayNumber)] = value;
  }
  return days;
}

function normalizeDayMetrics(rawValue) {
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    const rateRub = normalizeOptionalNumber(rawValue.rateRub, 'Ставка, руб');
    const issuedCount = normalizeOptionalInteger(rawValue.issuedCount, 'Выдано, шт');
    if (rateRub === '' && issuedCount === '') return null;
    return { rateRub, issuedCount };
  }

  // Legacy schedule cells used to be a free-form shift value. Keep old data readable
  // but do not try to reinterpret a shift as rate or parcel count.
  return null;
}

function normalizeOptionalNumber(value, label) {
  const text = normalizeText(value);
  if (!text) return '';
  const number = Number(text.replace(',', '.'));
  if (!Number.isFinite(number) || number < 0 || number > 10000000) {
    throw new ApiError(400, `${label} должна быть неотрицательным числом.`);
  }
  return String(number);
}

function normalizeOptionalInteger(value, label) {
  const text = normalizeText(value);
  if (!text) return '';
  if (!/^\d+$/.test(text)) {
    throw new ApiError(400, `${label} должно быть целым неотрицательным числом.`);
  }
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number > 10000000) {
    throw new ApiError(400, `${label} слишком большое.`);
  }
  return String(number);
}

const buckets = new Map();

function ensureRate(req, scope, limit, windowMs) {
  const ip = req.socket.remoteAddress || 'local';
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key) || [];
  const fresh = bucket.filter((stamp) => now - stamp < windowMs);
  fresh.push(now);
  buckets.set(key, fresh);
  if (fresh.length > limit) {
    throw new ApiError(429, 'Слишком много попыток. Повторите позже.');
  }
}

function startServer() {
  const store = new Store();
  const server = http.createServer(createRequestHandler(store));
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    store.audit('server.started', { url, dataDir: store.dataDir });
    console.log(`Сайт графиков работ запущен: ${url}`);
    console.log(`Данные и логи: ${store.dataDir}`);
  });
  return server;
}

if (require.main === module || (process.env.VERCEL && !process.env.VERCEL_API_ADAPTER)) {
  startServer();
}

module.exports = {
  ApiError,
  Store,
  POINTS,
  ROLE_LABELS,
  createRequestHandler,
  generatePassword,
  hashPassword,
  normalizeEmail,
  sanitizeUser,
  sendPasswordEmail,
  startServer,
  validateRegistration,
  validateScheduleRows,
  verifyPassword,
};
