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
const RETAIL_POINT_SEED_FILE = path.join(ROOT_DIR, 'scripts', 'retail-points-seed-2026.json');
const PORT = process.env.PORT || 8080;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const CAPTCHA_TTL_MS = 10 * 60 * 1000;

const ROLE_LABELS = {
  owner: 'Владелец',
  admin: 'Администратор',
  installer: 'Монтажник',
  partner: 'Партнер',
  employee: 'Сотрудник',
};

const ACCESS_SECTIONS = [
  { id: 'employees', label: 'Сотрудники' },
  { id: 'points', label: 'Торговые точки' },
  { id: 'companies', label: 'Компании' },
  { id: 'schedule', label: 'Графики работ' },
  { id: 'reports', label: 'Отчеты' },
  { id: 'repairs', label: 'Заявки на ремонт' },
  { id: 'expenses', label: 'Хозрасходы' },
  { id: 'claims', label: 'Претензии' },
];

const POINTS = [
  { id: 'moscow_6231', name: 'МОСКВА_6231' },
  { id: 'krasnogorsk_466', name: 'КРАСНОГОРСК_466' },
];

const DEFAULT_RETAIL_POINTS = POINTS.map((point) => ({
  id: point.id,
  name: point.name,
  address: '',
  landlord: '',
  legalEntity: '',
  rentCost: '',
  ownerName: '',
  phone: '',
  email: '',
  comment: '',
  curatorAdminId: '',
  internet: {
    provider: '',
    payment: '',
    contractNumber: '',
    contractHolder: '',
    tariff: '',
    login: '',
    password: '',
  },
  video: {
    operator: '',
    camerasCount: '',
    contractNumber: '',
    contractHolder: '',
    tariff: '',
    login: '',
    password: '',
  },
  documents: [],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
}));

const DEFAULT_COMPANIES = [];

const POINT_PAYMENT_METHODS = [
  { value: 'account', label: 'в лк' },
  { value: 'mobile', label: 'мобильный' },
  { value: 'link', label: 'по ссылке' },
  { value: 'invoice', label: 'по счету' },
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

const EXPENSE_PAYMENT_METHODS = [
  { value: 'corp_card', label: 'корп.карта' },
  { value: 'cash', label: 'наличные' },
  { value: 'card', label: 'карта' },
];

const EMPLOYEE_DOCUMENT_TYPES = [
  { value: 'passport_first', label: 'Паспорт 1-ая' },
  { value: 'passport_registration', label: 'Паспорт Прописка' },
  { value: 'inn', label: 'ИНН' },
  { value: 'snils', label: 'СНИЛС' },
  { value: 'card_details', label: 'Реквизиты карты' },
  { value: 'employment_contract', label: 'Трудовой договор' },
  { value: 'other', label: 'Прочие документы' },
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.webp': 'image/webp',
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
      fs.mkdirSync(path.join(this.dataDir, 'receipts'), { recursive: true });
      this.assertWritableDataDir();
    } catch (error) {
      this.activateFallbackStorage(error);
    }

    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'outbox'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'receipts'), { recursive: true });
    this.ensureJson('users.json', []);
    this.ensureJson('sessions.json', {});
    this.ensureJson('schedules.json', {});
    this.ensureJson('repairs.json', []);
    this.ensureJson('expenses.json', []);
    this.ensureJson('claims.json', []);
    this.ensureJson('reports.json', {});
    this.ensureJson('retail_points.json', DEFAULT_RETAIL_POINTS);
    this.ensureJson('companies.json', DEFAULT_COMPANIES);
    syncRuntimePoints(this.loadJson('retail_points.json', DEFAULT_RETAIL_POINTS));
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
    fs.mkdirSync(path.join(this.fallbackDataDir, 'receipts'), { recursive: true });

    for (const [fileName, fallback] of [
      ['users.json', []],
      ['sessions.json', {}],
      ['schedules.json', {}],
      ['repairs.json', []],
      ['expenses.json', []],
      ['claims.json', []],
      ['reports.json', {}],
      ['retail_points.json', DEFAULT_RETAIL_POINTS],
      ['companies.json', DEFAULT_COMPANIES],
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

  getUserByPhone(phone) {
    const normalized = safeNormalizeRussianPhone(phone);
    if (!normalized) return null;
    return this.listUsers().find((user) => safeNormalizeRussianPhone(user.phone) === normalized) || null;
  }

  createUser({
    fullName,
    lastName = '',
    firstName = '',
    middleName = '',
    phone,
    email,
    password,
    role: requestedRole = null,
    allowedSections = [],
    allowedPoints = [],
    position = '',
    officialSalary = '',
    unofficialSalary = '',
    hireDate = '',
    officialEmployment = false,
    premiumEnabled = false,
    premiumAmount = '',
    premiumStartDate = '',
    premiumHistory = null,
    allowInitialOwner = true,
  }) {
    const users = this.listUsers();
    const nameParts = normalizeNameParts({ fullName, lastName, firstName, middleName });
    const normalizedPhone = normalizeRussianPhone(phone);
    const normalizedEmail = normalizeEmail(email);

    if (users.some((user) => user.email === normalizedEmail)) {
      throw new ApiError(409, 'Пользователь с таким email уже зарегистрирован.');
    }
    if (users.some((user) => safeNormalizeRussianPhone(user.phone) === normalizedPhone)) {
      throw new ApiError(409, 'Пользователь с таким телефоном уже зарегистрирован.');
    }

    const role = allowInitialOwner && users.length === 0
      ? 'owner'
      : normalizeAccountRole(requestedRole || 'employee');
    const premium = normalizePremiumFields({ premiumEnabled, premiumAmount, premiumStartDate });
    const normalizedPremiumHistory = Array.isArray(premiumHistory)
      ? normalizePremiumHistory(premiumHistory, { strict: true })
      : premiumHistoryFromFields(premium);
    const currentPremium = Array.isArray(premiumHistory)
      ? premiumFieldsFromHistory(normalizedPremiumHistory)
      : premium;
    const passwordRecord = hashPassword(password);
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      fullName: nameParts.fullName,
      lastName: nameParts.lastName,
      firstName: nameParts.firstName,
      middleName: nameParts.middleName,
      phone: normalizedPhone,
      email: normalizedEmail,
      position: normalizeText(position),
      officialSalary: normalizeOptionalNumber(officialSalary, 'Оф. оклад'),
      unofficialSalary: normalizeOptionalNumber(unofficialSalary, 'Неоф. оклад'),
      hireDate: normalizeDateInput(hireDate),
      officialEmployment: Boolean(officialEmployment),
      premiumEnabled: currentPremium.premiumEnabled,
      premiumAmount: currentPremium.premiumAmount,
      premiumStartDate: currentPremium.premiumStartDate,
      premiumHistory: normalizedPremiumHistory,
      employeeDocuments: [],
      role,
      allowedSections: role === 'owner' ? allSectionIds() : normalizeAllowedSections(allowedSections),
      allowedPoints: normalizeAllowedPointsForRole(role, allowedPoints),
      password: passwordRecord,
      createdAt: now,
      updatedAt: now,
    };

    assertUniqueAdminPointAssignments(users, user);
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

    const patchHasPremiumHistory = Object.prototype.hasOwnProperty.call(patch, 'premiumHistory');
    const patchHasSeparateName = ['lastName', 'firstName', 'middleName'].some((field) => (
      Object.prototype.hasOwnProperty.call(patch, field)
    ));
    const employee = validateEmployeeRecord({
      fullName: patchHasSeparateName && !Object.prototype.hasOwnProperty.call(patch, 'fullName')
        ? ''
        : patch.fullName ?? target.fullName,
      lastName: patchHasSeparateName ? patch.lastName ?? target.lastName : '',
      firstName: patchHasSeparateName ? patch.firstName ?? target.firstName : '',
      middleName: patchHasSeparateName ? patch.middleName ?? target.middleName : '',
      phone: patch.phone ?? target.phone,
      email: patch.email ?? target.email,
      position: patch.position ?? target.position,
      officialSalary: patch.officialSalary ?? target.officialSalary ?? '',
      unofficialSalary: patch.unofficialSalary ?? target.unofficialSalary ?? '',
      hireDate: patch.hireDate ?? target.hireDate,
      officialEmployment: patch.officialEmployment ?? target.officialEmployment,
      premiumEnabled: patch.premiumEnabled ?? target.premiumEnabled ?? false,
      premiumAmount: patch.premiumAmount ?? target.premiumAmount ?? '',
      premiumStartDate: patch.premiumStartDate ?? target.premiumStartDate ?? '',
      role: patch.role ?? target.role,
      allowedSections: patch.allowedSections ?? target.allowedSections ?? [],
      allowedPoints: patch.allowedPoints ?? target.allowedPoints ?? [],
      ...(patchHasPremiumHistory ? { premiumHistory: patch.premiumHistory } : {}),
    }, { allowOwner: target.role === 'owner' });
    const normalizedEmail = normalizeEmail(employee.email);
    const duplicate = users.find((user) => user.id !== userId && user.email === normalizedEmail);
    if (duplicate) {
      throw new ApiError(409, 'Пользователь с таким email уже зарегистрирован.');
    }
    const duplicatePhone = users.find((user) => (
      user.id !== userId && safeNormalizeRussianPhone(user.phone) === employee.phone
    ));
    if (duplicatePhone) {
      throw new ApiError(409, 'Пользователь с таким телефоном уже зарегистрирован.');
    }
    if (target.role === 'owner' && employee.role !== 'owner') {
      const ownerCount = users.filter((user) => user.role === 'owner').length;
      if (ownerCount <= 1) {
        throw new ApiError(400, 'Нельзя убрать последнего владельца.');
      }
    }
    assertCanGrantAccess(actor, employee);
    assertUniqueAdminPointAssignments(users, {
      ...target,
      role: employee.role,
      allowedPoints: employee.allowedPoints,
    });

    Object.assign(target, {
      fullName: employee.fullName,
      lastName: employee.lastName,
      firstName: employee.firstName,
      middleName: employee.middleName,
      phone: employee.phone,
      email: normalizedEmail,
      position: employee.position,
      officialSalary: employee.officialSalary,
      unofficialSalary: employee.unofficialSalary,
      hireDate: employee.hireDate,
      officialEmployment: employee.officialEmployment,
      premiumEnabled: employee.premiumEnabled,
      premiumAmount: employee.premiumAmount,
      premiumStartDate: employee.premiumStartDate,
      premiumHistory: employee.premiumHistoryMode === 'replace'
        ? employee.premiumHistory
        : mergePremiumHistory(target.premiumHistory, employee),
      role: employee.role,
      allowedSections: employee.allowedSections,
      allowedPoints: employee.allowedPoints,
      updatedAt: new Date().toISOString(),
    });
    this.saveUsers(users);
    this.audit('user.updated', { userId }, actor.id);
    return sanitizeUser(target);
  }

  async addEmployeeDocument(actor, userId, input) {
    if (!canManageUsers(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const users = this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) {
      throw new ApiError(404, 'Пользователь не найден.');
    }
    if (target.role === 'owner') {
      throw new ApiError(403, 'Документы владельца нельзя менять из справочника сотрудников.');
    }

    const documentType = normalizeEmployeeDocumentType(input.documentType);
    const upload = normalizeEmployeeDocumentUpload(input.file);
    upload.archiveName = employeeDocumentArchiveName(upload, target, documentType);
    const googleDrive = await archiveEmployeeDocumentToGoogleDrive(upload, target, documentType);
    if (googleDrive.status !== 'uploaded') {
      throw new ApiError(503, googleDrive.reason || 'Google Drive недоступен.');
    }

    const document = {
      id: upload.id,
      type: documentType.value,
      typeLabel: documentType.label,
      fileName: upload.archiveName,
      originalFileName: upload.fileName,
      mimeType: upload.mimeType,
      size: upload.size,
      googleDrive,
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      createdByName: actor.fullName,
    };
    target.employeeDocuments = [...normalizeEmployeeDocuments(target.employeeDocuments), document];
    target.updatedAt = new Date().toISOString();
    this.saveUsers(users);
    this.audit('employee_document.created', {
      userId: target.id,
      documentId: document.id,
      type: document.type,
      googleDriveFileId: googleDrive.fileId || '',
    }, actor.id);
    return {
      user: sanitizeUser(target),
      document: sanitizeEmployeeDocument(document),
    };
  }

  async deleteEmployeeDocument(actor, userId, documentId) {
    if (!canManageUsers(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const users = this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) {
      throw new ApiError(404, 'Пользователь не найден.');
    }
    const documents = normalizeEmployeeDocuments(target.employeeDocuments);
    const document = documents.find((item) => item.id === documentId);
    if (!document) {
      throw new ApiError(404, 'Документ не найден.');
    }

    const googleDriveCleanup = await deleteArchivedEmployeeDocumentFromGoogleDrive(document.googleDrive);
    if (['failed', 'unavailable'].includes(googleDriveCleanup.status)) {
      throw new ApiError(503, googleDriveCleanup.reason || 'Google Drive не удалил документ.');
    }

    target.employeeDocuments = documents.filter((item) => item.id !== documentId);
    target.updatedAt = new Date().toISOString();
    this.saveUsers(users);
    this.audit('employee_document.deleted', {
      userId: target.id,
      documentId: document.id,
      type: document.type,
      googleDriveFileId: document.googleDrive?.fileId || '',
      googleDriveCleanupStatus: googleDriveCleanup.status,
    }, actor.id);
    return {
      user: sanitizeUser(target),
      document: sanitizeEmployeeDocument(document),
      googleDriveCleanup,
    };
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
    if (role !== 'owner') {
      normalizeAccountRole(role);
    }
    if (role === 'owner' && actor.role !== 'owner') {
      throw new ApiError(403, 'Только владелец может назначить владельца.');
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
    target.allowedSections = role === 'owner' ? allSectionIds() : normalizeAllowedSections(target.allowedSections || []);
    target.allowedPoints = normalizeAllowedPointsForRole(role, target.allowedPoints || []);
    assertUniqueAdminPointAssignments(users, target);
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
    requireSectionAccess(actor, 'schedule');
    requirePointAccess(actor, pointId);
    const schedules = this.loadJson('schedules.json', {});
    const key = scheduleKey(pointId, month);
    const users = this.listUsers();
    const claims = normalizeClaims(this.loadJson('claims.json', []));
    applyMonthlyPremiumDistribution(schedules, users, month);
    applyMonthlyClaimDistribution(schedules, users, claims, month);
    const saved = schedules[key] || { pointId, month, rows: [], updatedAt: null, updatedBy: null };
    const employeeOptions = scheduleEmployeeOptions(actor, users, month, schedules, pointId);
    let rows = hydrateScheduleRows(saved.rows || [], users, getDaysInMonth(month), month);

    for (const employee of employeeOptions) {
      const exists = rows.some((row) => row.employeeId === employee.id);
      if (!exists) {
        rows.push({
          id: crypto.randomUUID(),
          employeeId: employee.id,
          employeeName: employee.fullName,
          bonusExtra: employee.premium.active || employee.premium.assignedPointId ? employee.premium.amount : '',
          premiumActive: employee.premium.active,
          premiumStartDate: employee.premium.startDate,
          premiumAssignedPointId: employee.premium.assignedPointId || '',
          claims: '',
          claimAssignedPointId: '',
          days: {},
        });
      }
    }

    rows = applyPremiumToScheduleRows(rows, users, { ...schedules, [key]: { ...saved, rows } }, month, pointId);
    rows = applyClaimsToScheduleRows(rows, users, { ...schedules, [key]: { ...saved, rows } }, claims, month, pointId);

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
    requireSectionAccess(actor, 'schedule');
    requirePointAccess(actor, pointId);
    const users = this.listUsers();
    const employeeOptions = scheduleEmployeeOptions(actor, users, month);
    const normalizedRows = validateScheduleRows(month, rows, employeeOptions);
    const schedules = this.loadJson('schedules.json', {});
    const claims = normalizeClaims(this.loadJson('claims.json', []));
    const key = scheduleKey(pointId, month);
    const saved = schedules[key] || { pointId, month, rows: [], updatedAt: null, updatedBy: null };
    const existingRows = hydrateScheduleRows(saved.rows || [], users, getDaysInMonth(month), month);
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
    applyMonthlyPremiumDistribution(schedules, users, month);
    applyMonthlyClaimDistribution(schedules, users, claims, month);
    this.saveJson('schedules.json', schedules);
    this.audit('schedule.saved', { pointId, month, rows: normalizedRows.length }, actor.id);
    return this.getSchedule(pointId, month, actor);
  }

  listRepairs(actor) {
    requireSectionAccess(actor, 'repairs');
    const users = this.listUsers();
    const repairs = this.loadJson('repairs.json', []);
    const allowedPointIds = new Set(visiblePointsFor(actor).map((point) => point.id));
    const visible = canManageRepairs(actor)
      ? repairs.filter((repair) => allowedPointIds.has(repair.pointId))
      : repairs.filter((repair) => repair.createdBy === actor.id && allowedPointIds.has(repair.pointId));

    return visible
      .map((repair) => hydrateRepair(repair, users))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  createRepair(actor, input) {
    requireSectionAccess(actor, 'repairs');
    const repair = validateRepairRequest(input);
    requirePointAccess(actor, repair.pointId);
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
    requireSectionAccess(actor, 'repairs');
    requirePointAccess(actor, target.pointId);

    Object.assign(target, {
      status: patch.status,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    });
    this.saveJson('repairs.json', repairs);
    this.audit('repair.updated', { repairId: target.id, status: target.status }, actor.id);
    return hydrateRepair(target, this.listUsers());
  }

  listExpenses(actor) {
    requireSectionAccess(actor, 'expenses');
    const users = this.listUsers();
    const expenses = this.loadJson('expenses.json', []);
    const allowedPointIds = new Set(visiblePointsFor(actor).map((point) => point.id));
    const visible = canManageExpenses(actor)
      ? expenses.filter((expense) => allowedPointIds.has(expense.pointId))
      : expenses.filter((expense) => expense.createdBy === actor.id && allowedPointIds.has(expense.pointId));

    return visible
      .map((expense) => hydrateExpense(expense, users))
      .sort((left, right) => expenseSortTime(right) - expenseSortTime(left));
  }

  async createExpense(actor, input) {
    requireSectionAccess(actor, 'expenses');
    if (!canManageExpenses(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const expense = validateExpenseRequest(input);
    requirePointAccess(actor, expense.pointId);
    const upload = normalizeReceiptUpload(input.receipt);
    const now = new Date().toISOString();
    const receiptContext = {
      pointId: expense.pointId,
      expenseDate: expense.expenseDate,
      createdByName: actor.fullName,
      createdAt: now,
    };
    upload.archiveName = archiveReceiptName(upload, receiptContext);
    const receipt = await this.saveReceiptFile(upload);
    const expenses = this.loadJson('expenses.json', []);
    const record = {
      id: crypto.randomUUID(),
      pointId: expense.pointId,
      expenseDate: expense.expenseDate,
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      receipt,
      googleDrive: await archiveReceiptToGoogleDrive(upload, {
        pointId: expense.pointId,
        expenseDate: expense.expenseDate,
        createdByName: actor.fullName,
        amount: expense.amount,
        createdAt: now,
      }),
      createdBy: actor.id,
      createdByName: actor.fullName,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };

    expenses.push(record);
    this.saveJson('expenses.json', expenses);
    this.audit('expense.created', {
      expenseId: record.id,
      pointId: record.pointId,
      amount: record.amount,
      paymentMethod: record.paymentMethod,
      receiptId: receipt.id,
      googleDriveStatus: record.googleDrive.status,
    }, actor.id);
    return hydrateExpense(record, this.listUsers());
  }

  async deleteExpense(actor, expenseId) {
    requireSectionAccess(actor, 'expenses');
    if (!canManageExpenses(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const expenses = this.loadJson('expenses.json', []);
    const index = expenses.findIndex((expense) => expense.id === expenseId);
    if (index === -1) {
      throw new ApiError(404, 'Хозрасход не найден.');
    }
    const [deleted] = expenses.splice(index, 1);
    requirePointAccess(actor, deleted.pointId);
    this.saveJson('expenses.json', expenses);
    const googleDriveCleanup = await deleteArchivedReceiptFromGoogleDrive(deleted.googleDrive);
    this.deleteReceiptFile(deleted.receipt);
    this.audit('expense.deleted', {
      expenseId: deleted.id,
      pointId: deleted.pointId,
      amount: deleted.amount,
      receiptId: deleted.receipt?.id || '',
      googleDriveFileId: deleted.googleDrive?.fileId || '',
      googleDriveCleanupStatus: googleDriveCleanup.status,
      googleDriveCleanupReason: googleDriveCleanup.reason || '',
    }, actor.id);
    const hydrated = hydrateExpense(deleted, this.listUsers());
    hydrated.googleDriveCleanup = googleDriveCleanup;
    return hydrated;
  }

  getExpenseByReceiptId(actor, receiptId) {
    return this.listExpenses(actor).find((expense) => expense.receipt?.id === receiptId) || null;
  }

  listClaims(actor) {
    requireSectionAccess(actor, 'claims');
    const users = this.listUsers();
    const claims = normalizeClaims(this.loadJson('claims.json', []));
    const allowedPointIds = new Set(visiblePointsFor(actor).map((point) => point.id));
    const visible = canManageClaims(actor)
      ? claims.filter((claim) => allowedPointIds.has(claim.pointId))
      : claims.filter((claim) => (
          allowedPointIds.has(claim.pointId)
          && (claim.guiltyEmployeeId === actor.id || claim.createdBy === actor.id)
        ));

    return visible
      .map((claim) => hydrateClaim(claim, users))
      .sort((left, right) => claimSortTime(right) - claimSortTime(left));
  }

  createClaim(actor, input) {
    requireSectionAccess(actor, 'claims');
    if (!canManageClaims(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const users = this.listUsers();
    const claim = validateClaimRequest(input, users);
    requirePointAccess(actor, claim.pointId);
    const claims = normalizeClaims(this.loadJson('claims.json', []));
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      ...claim,
      createdBy: actor.id,
      createdByName: actor.fullName,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };

    claims.push(record);
    this.saveJson('claims.json', claims);
    this.audit('claim.created', {
      claimId: record.id,
      pointId: record.pointId,
      date: record.date,
      amount: record.amount,
      guiltyEmployeeId: record.guiltyEmployeeId,
    }, actor.id);
    return hydrateClaim(record, users);
  }

  deleteClaim(actor, claimId) {
    requireSectionAccess(actor, 'claims');
    if (!canManageClaims(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const claims = normalizeClaims(this.loadJson('claims.json', []));
    const index = claims.findIndex((claim) => claim.id === claimId);
    if (index === -1) {
      throw new ApiError(404, 'Претензия не найдена.');
    }
    const [deleted] = claims.splice(index, 1);
    requirePointAccess(actor, deleted.pointId);
    this.saveJson('claims.json', claims);
    this.audit('claim.deleted', {
      claimId: deleted.id,
      pointId: deleted.pointId,
      date: deleted.date,
      amount: deleted.amount,
      guiltyEmployeeId: deleted.guiltyEmployeeId,
    }, actor.id);
    return hydrateClaim(deleted, this.listUsers());
  }

  async saveReceiptFile(upload) {
    const storageFileName = upload.archiveName || `${upload.id}.${upload.extension}`;
    const receiptsDir = path.join(this.dataDir, 'receipts');
    fs.mkdirSync(receiptsDir, { recursive: true });
    const target = path.join(receiptsDir, storageFileName);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, upload.buffer);
    fs.renameSync(tmp, target);
    return {
      id: upload.id,
      fileName: storageFileName,
      storageFileName,
      mimeType: upload.mimeType,
      size: upload.size,
      storage: 'file',
      url: `/api/receipts/${upload.id}`,
    };
  }

  async readReceiptFile(receipt) {
    const storageFileName = normalizeText(receipt?.storageFileName);
    if (!storageFileName || storageFileName.includes('..') || storageFileName.includes('/') || storageFileName.includes('\\')) {
      throw new ApiError(404, 'Чек не найден.');
    }
    const filePath = path.join(this.dataDir, 'receipts', storageFileName);
    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Файл чека недоступен.');
    }
    return {
      buffer: fs.readFileSync(filePath),
      mimeType: receipt.mimeType || 'application/octet-stream',
      fileName: receipt.fileName || storageFileName,
    };
  }

  deleteReceiptFile(receipt) {
    const storageFileName = normalizeText(receipt?.storageFileName);
    if (!storageFileName || storageFileName.includes('..') || storageFileName.includes('/') || storageFileName.includes('\\')) {
      return;
    }
    try {
      fs.unlinkSync(path.join(this.dataDir, 'receipts', storageFileName));
    } catch {
      // Receipt cleanup is best effort; deleting the expense record is the source of truth.
    }
  }

  listRetailPoints(actor) {
    requireSectionAccess(actor, 'points');
    const users = this.listUsers();
    const seeded = mergeRetailPointSeeds(this.loadJson('retail_points.json', []));
    if (seeded.changed) {
      this.saveRetailPoints(seeded.points);
    }
    const points = seeded.points;
    syncRuntimePoints(points);
    return points
      .map((point) => hydrateRetailPoint(point, users))
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  }

  saveRetailPoints(points) {
    const normalized = normalizeRetailPoints(points, { includeDefaults: false });
    syncRuntimePoints(normalizeRetailPoints(normalized));
    this.saveJson('retail_points.json', normalized);
  }

  createRetailPoint(actor, input) {
    if (!canManageRetailPoints(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const users = this.listUsers();
    const points = normalizeRetailPoints(this.loadJson('retail_points.json', []));
    const point = validateRetailPointRecord(input, users);
    const duplicate = points.find((item) => item.name.toLowerCase() === point.name.toLowerCase());
    if (duplicate) {
      throw new ApiError(409, 'Торговая точка с таким названием уже есть.');
    }
    const now = new Date().toISOString();
    const record = {
      id: `retail_${crypto.randomUUID()}`,
      ...point,
      documents: [],
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };
    points.push(record);
    this.saveRetailPoints(points);
    this.audit('retail_point.created', { pointId: record.id, name: record.name }, actor.id);
    return hydrateRetailPoint(record, users);
  }

  updateRetailPoint(actor, pointId, patch) {
    if (!canManageRetailPoints(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const users = this.listUsers();
    const points = normalizeRetailPoints(this.loadJson('retail_points.json', []));
    const target = points.find((point) => point.id === pointId);
    if (!target) {
      throw new ApiError(404, 'Торговая точка не найдена.');
    }
    const next = validateRetailPointRecord({ ...target, ...patch }, users);
    const duplicate = points.find((point) => point.id !== pointId && point.name.toLowerCase() === next.name.toLowerCase());
    if (duplicate) {
      throw new ApiError(409, 'Торговая точка с таким названием уже есть.');
    }
    Object.assign(target, next, {
      documents: normalizeRetailPointDocuments(target.documents),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    });
    this.saveRetailPoints(points);
    this.audit('retail_point.updated', { pointId: target.id, name: target.name }, actor.id);
    return hydrateRetailPoint(target, users);
  }

  async addRetailPointDocument(actor, pointId, input) {
    if (!canManageRetailPoints(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const points = normalizeRetailPoints(this.loadJson('retail_points.json', []));
    const users = this.listUsers();
    const target = points.find((point) => point.id === pointId);
    if (!target) {
      throw new ApiError(404, 'Торговая точка не найдена.');
    }
    const upload = normalizeRetailPointDocumentUpload(input.file);
    upload.archiveName = retailPointDocumentArchiveName(upload);
    const googleDrive = await archiveRetailPointDocumentToGoogleDrive(upload, target);
    if (googleDrive.status !== 'uploaded') {
      throw new ApiError(503, googleDrive.reason || 'Google Drive недоступен.');
    }
    const document = {
      id: upload.id,
      fileName: upload.archiveName,
      originalFileName: upload.fileName,
      mimeType: upload.mimeType,
      size: upload.size,
      googleDrive,
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      createdByName: actor.fullName,
    };
    target.documents = [...normalizeRetailPointDocuments(target.documents), document];
    target.updatedAt = new Date().toISOString();
    target.updatedBy = actor.id;
    this.saveRetailPoints(points);
    this.audit('retail_point_document.created', {
      pointId: target.id,
      documentId: document.id,
      googleDriveFileId: googleDrive.fileId || '',
    }, actor.id);
    return {
      point: hydrateRetailPoint(target, users),
      document: sanitizeRetailPointDocument(document),
    };
  }

  async deleteRetailPointDocument(actor, pointId, documentId) {
    if (!canManageRetailPoints(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const points = normalizeRetailPoints(this.loadJson('retail_points.json', []));
    const users = this.listUsers();
    const target = points.find((point) => point.id === pointId);
    if (!target) {
      throw new ApiError(404, 'Торговая точка не найдена.');
    }
    const documents = normalizeRetailPointDocuments(target.documents);
    const document = documents.find((item) => item.id === documentId);
    if (!document) {
      throw new ApiError(404, 'Документ не найден.');
    }
    const googleDriveCleanup = await deleteArchivedRetailPointDocumentFromGoogleDrive(document.googleDrive);
    if (['failed', 'unavailable'].includes(googleDriveCleanup.status)) {
      throw new ApiError(503, googleDriveCleanup.reason || 'Google Drive не удалил документ.');
    }
    target.documents = documents.filter((item) => item.id !== documentId);
    target.updatedAt = new Date().toISOString();
    target.updatedBy = actor.id;
    this.saveRetailPoints(points);
    this.audit('retail_point_document.deleted', {
      pointId: target.id,
      documentId: document.id,
      googleDriveFileId: document.googleDrive?.fileId || '',
      googleDriveCleanupStatus: googleDriveCleanup.status,
    }, actor.id);
    return {
      point: hydrateRetailPoint(target, users),
      document: sanitizeRetailPointDocument(document),
      googleDriveCleanup,
    };
  }

  listCompanies(actor) {
    requireSectionAccess(actor, 'companies');
    const companies = normalizeCompanies(this.loadJson('companies.json', []));
    return visibleCompaniesForActor(actor, companies)
      .map(hydrateCompany)
      .sort((left, right) => (left.shortName || left.name).localeCompare(right.shortName || right.name, 'ru'));
  }

  saveCompanies(companies) {
    this.saveJson('companies.json', normalizeCompanies(companies, { includeDefaults: false }));
  }

  createCompany(actor, input) {
    if (!canManageCompanies(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const companies = normalizeCompanies(this.loadJson('companies.json', []));
    const company = validateCompanyRecord(input);
    assertCanAssignCompanyPoints(actor, company.pointIds);
    const duplicate = companies.find((item) => companyDuplicateMatches(item, company));
    if (duplicate) {
      throw new ApiError(409, 'Компания с такими реквизитами уже есть.');
    }
    const now = new Date().toISOString();
    const record = {
      id: `company_${crypto.randomUUID()}`,
      ...company,
      documents: [],
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };
    companies.push(record);
    this.saveCompanies(companies);
    this.audit('company.created', { companyId: record.id, shortName: record.shortName }, actor.id);
    return hydrateCompany(record);
  }

  updateCompany(actor, companyId, patch) {
    if (!canManageCompanies(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const companies = normalizeCompanies(this.loadJson('companies.json', []));
    const target = companies.find((company) => company.id === companyId);
    if (!target) {
      throw new ApiError(404, 'Компания не найдена.');
    }
    assertCanViewCompany(actor, target);
    const next = validateCompanyRecord({ ...target, ...patch });
    assertCanAssignCompanyPoints(actor, next.pointIds);
    const duplicate = companies.find((company) => company.id !== companyId && companyDuplicateMatches(company, next));
    if (duplicate) {
      throw new ApiError(409, 'Компания с такими реквизитами уже есть.');
    }
    Object.assign(target, next, {
      documents: normalizeCompanyDocuments(target.documents),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    });
    this.saveCompanies(companies);
    this.audit('company.updated', { companyId: target.id, shortName: target.shortName }, actor.id);
    return hydrateCompany(target);
  }

  async addCompanyDocument(actor, companyId, input) {
    if (!canManageCompanies(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const companies = normalizeCompanies(this.loadJson('companies.json', []));
    const target = companies.find((company) => company.id === companyId);
    if (!target) {
      throw new ApiError(404, 'Компания не найдена.');
    }
    assertCanViewCompany(actor, target);
    const upload = normalizeCompanyDocumentUpload(input.file);
    upload.archiveName = companyDocumentArchiveName(upload);
    const googleDrive = await archiveCompanyDocumentToGoogleDrive(upload, target);
    if (googleDrive.status !== 'uploaded') {
      throw new ApiError(503, googleDrive.reason || 'Google Drive недоступен.');
    }
    const document = {
      id: upload.id,
      fileName: upload.archiveName,
      originalFileName: upload.fileName,
      mimeType: upload.mimeType,
      size: upload.size,
      googleDrive,
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      createdByName: actor.fullName,
    };
    target.documents = [...normalizeCompanyDocuments(target.documents), document];
    target.updatedAt = new Date().toISOString();
    target.updatedBy = actor.id;
    this.saveCompanies(companies);
    this.audit('company_document.created', {
      companyId: target.id,
      documentId: document.id,
      googleDriveFileId: googleDrive.fileId || '',
    }, actor.id);
    return {
      company: hydrateCompany(target),
      document: sanitizeCompanyDocument(document),
    };
  }

  async deleteCompanyDocument(actor, companyId, documentId) {
    if (!canManageCompanies(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const companies = normalizeCompanies(this.loadJson('companies.json', []));
    const target = companies.find((company) => company.id === companyId);
    if (!target) {
      throw new ApiError(404, 'Компания не найдена.');
    }
    assertCanViewCompany(actor, target);
    const documents = normalizeCompanyDocuments(target.documents);
    const document = documents.find((item) => item.id === documentId);
    if (!document) {
      throw new ApiError(404, 'Документ не найден.');
    }
    const googleDriveCleanup = await deleteArchivedCompanyDocumentFromGoogleDrive(document.googleDrive);
    if (['failed', 'unavailable'].includes(googleDriveCleanup.status)) {
      throw new ApiError(503, googleDriveCleanup.reason || 'Google Drive не удалил документ.');
    }
    target.documents = documents.filter((item) => item.id !== documentId);
    target.updatedAt = new Date().toISOString();
    target.updatedBy = actor.id;
    this.saveCompanies(companies);
    this.audit('company_document.deleted', {
      companyId: target.id,
      documentId: document.id,
      googleDriveFileId: document.googleDrive?.fileId || '',
      googleDriveCleanupStatus: googleDriveCleanup.status,
    }, actor.id);
    return {
      company: hydrateCompany(target),
      document: sanitizeCompanyDocument(document),
      googleDriveCleanup,
    };
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

class SupabaseStore {
  constructor() {
    this.url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
    this.dataDir = null;
    this.storageWarning = {
      persistent: true,
      fallback: 'supabase',
      message: 'Используется Supabase/Postgres хранилище.',
      dataDir: 'supabase:app_kv',
      url: this.url,
    };

    if (!this.url || !this.key) {
      throw new Error('Для Supabase нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.');
    }
  }

  async loadJson(fileName, fallback) {
    const response = await this.supabaseFetch(
      `/rest/v1/app_kv?key=eq.${encodeURIComponent(fileName)}&select=value`,
    );
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return cloneJson(fallback);
    }
    return rows[0].value === null || rows[0].value === undefined
      ? cloneJson(fallback)
      : cloneJson(rows[0].value);
  }

  async saveJson(fileName, data) {
    await this.supabaseFetch('/rest/v1/app_kv?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        key: fileName,
        value: data,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  async supabaseFetch(pathname, options = {}) {
    let response;
    try {
      response = await fetch(`${this.url}${pathname}`, {
        method: options.method || 'GET',
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.key}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        body: options.body,
      });
    } catch (error) {
      throw new ApiError(500, `Supabase недоступен: ${error.message}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ApiError(500, `Supabase недоступен или не настроен: ${text || response.statusText}`);
    }
    return response;
  }

  async audit(action, details = {}, actorId = null) {
    try {
      const events = await this.loadJson('audit.json', []);
      events.push({
        at: new Date().toISOString(),
        action,
        actorId,
        details: scrubForLog(details),
      });
      await this.saveJson('audit.json', events.slice(-1000));
    } catch {
      // Logging must not break the request path.
    }
  }

  async listUsers() {
    return this.loadJson('users.json', []);
  }

  async saveUsers(users) {
    await this.saveJson('users.json', users);
  }

  async getUserById(id) {
    const users = await this.listUsers();
    return users.find((user) => user.id === id) || null;
  }

  async getUserByEmail(email) {
    const users = await this.listUsers();
    const normalized = normalizeEmail(email);
    return users.find((user) => user.email === normalized) || null;
  }

  async getUserByPhone(phone) {
    const users = await this.listUsers();
    const normalized = safeNormalizeRussianPhone(phone);
    if (!normalized) return null;
    return users.find((user) => safeNormalizeRussianPhone(user.phone) === normalized) || null;
  }

  async createUser({
    fullName,
    lastName = '',
    firstName = '',
    middleName = '',
    phone,
    email,
    password,
    role: requestedRole = null,
    allowedSections = [],
    allowedPoints = [],
    position = '',
    officialSalary = '',
    unofficialSalary = '',
    hireDate = '',
    officialEmployment = false,
    premiumEnabled = false,
    premiumAmount = '',
    premiumStartDate = '',
    premiumHistory = null,
    allowInitialOwner = true,
  }) {
    const users = await this.listUsers();
    const nameParts = normalizeNameParts({ fullName, lastName, firstName, middleName });
    const normalizedPhone = normalizeRussianPhone(phone);
    const normalizedEmail = normalizeEmail(email);

    if (users.some((user) => user.email === normalizedEmail)) {
      throw new ApiError(409, 'Пользователь с таким email уже зарегистрирован.');
    }
    if (users.some((user) => safeNormalizeRussianPhone(user.phone) === normalizedPhone)) {
      throw new ApiError(409, 'Пользователь с таким телефоном уже зарегистрирован.');
    }

    const role = allowInitialOwner && users.length === 0
      ? 'owner'
      : normalizeAccountRole(requestedRole || 'employee');
    const premium = normalizePremiumFields({ premiumEnabled, premiumAmount, premiumStartDate });
    const normalizedPremiumHistory = Array.isArray(premiumHistory)
      ? normalizePremiumHistory(premiumHistory, { strict: true })
      : premiumHistoryFromFields(premium);
    const currentPremium = Array.isArray(premiumHistory)
      ? premiumFieldsFromHistory(normalizedPremiumHistory)
      : premium;
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      fullName: nameParts.fullName,
      lastName: nameParts.lastName,
      firstName: nameParts.firstName,
      middleName: nameParts.middleName,
      phone: normalizedPhone,
      email: normalizedEmail,
      position: normalizeText(position),
      officialSalary: normalizeOptionalNumber(officialSalary, 'Оф. оклад'),
      unofficialSalary: normalizeOptionalNumber(unofficialSalary, 'Неоф. оклад'),
      hireDate: normalizeDateInput(hireDate),
      officialEmployment: Boolean(officialEmployment),
      premiumEnabled: currentPremium.premiumEnabled,
      premiumAmount: currentPremium.premiumAmount,
      premiumStartDate: currentPremium.premiumStartDate,
      premiumHistory: normalizedPremiumHistory,
      employeeDocuments: [],
      role,
      allowedSections: role === 'owner' ? allSectionIds() : normalizeAllowedSections(allowedSections),
      allowedPoints: normalizeAllowedPointsForRole(role, allowedPoints),
      password: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    };

    assertUniqueAdminPointAssignments(users, user);
    users.push(user);
    await this.saveUsers(users);
    await this.audit('user.registered', { userId: user.id, email: normalizedEmail, role });
    return sanitizeUser(user);
  }

  async updateUser(actor, userId, patch) {
    const users = await this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) throw new ApiError(404, 'Пользователь не найден.');
    if (target.role === 'owner' && target.id !== actor.id) {
      throw new ApiError(403, 'Карточку владельца нельзя менять из справочника сотрудников.');
    }

    const patchHasPremiumHistory = Object.prototype.hasOwnProperty.call(patch, 'premiumHistory');
    const patchHasSeparateName = ['lastName', 'firstName', 'middleName'].some((field) => (
      Object.prototype.hasOwnProperty.call(patch, field)
    ));
    const employee = validateEmployeeRecord({
      fullName: patchHasSeparateName && !Object.prototype.hasOwnProperty.call(patch, 'fullName')
        ? ''
        : patch.fullName ?? target.fullName,
      lastName: patchHasSeparateName ? patch.lastName ?? target.lastName : '',
      firstName: patchHasSeparateName ? patch.firstName ?? target.firstName : '',
      middleName: patchHasSeparateName ? patch.middleName ?? target.middleName : '',
      phone: patch.phone ?? target.phone,
      email: patch.email ?? target.email,
      position: patch.position ?? target.position,
      officialSalary: patch.officialSalary ?? target.officialSalary ?? '',
      unofficialSalary: patch.unofficialSalary ?? target.unofficialSalary ?? '',
      hireDate: patch.hireDate ?? target.hireDate,
      officialEmployment: patch.officialEmployment ?? target.officialEmployment,
      premiumEnabled: patch.premiumEnabled ?? target.premiumEnabled ?? false,
      premiumAmount: patch.premiumAmount ?? target.premiumAmount ?? '',
      premiumStartDate: patch.premiumStartDate ?? target.premiumStartDate ?? '',
      role: patch.role ?? target.role,
      allowedSections: patch.allowedSections ?? target.allowedSections ?? [],
      allowedPoints: patch.allowedPoints ?? target.allowedPoints ?? [],
      ...(patchHasPremiumHistory ? { premiumHistory: patch.premiumHistory } : {}),
    }, { allowOwner: target.role === 'owner' });
    const normalizedEmail = normalizeEmail(employee.email);
    const duplicate = users.find((user) => user.id !== userId && user.email === normalizedEmail);
    if (duplicate) throw new ApiError(409, 'Пользователь с таким email уже зарегистрирован.');
    const duplicatePhone = users.find((user) => (
      user.id !== userId && safeNormalizeRussianPhone(user.phone) === employee.phone
    ));
    if (duplicatePhone) throw new ApiError(409, 'Пользователь с таким телефоном уже зарегистрирован.');

    if (target.role === 'owner' && employee.role !== 'owner') {
      const ownerCount = users.filter((user) => user.role === 'owner').length;
      if (ownerCount <= 1) throw new ApiError(400, 'Нельзя убрать последнего владельца.');
    }
    assertCanGrantAccess(actor, employee);
    assertUniqueAdminPointAssignments(users, {
      ...target,
      role: employee.role,
      allowedPoints: employee.allowedPoints,
    });

    Object.assign(target, {
      fullName: employee.fullName,
      lastName: employee.lastName,
      firstName: employee.firstName,
      middleName: employee.middleName,
      phone: employee.phone,
      email: normalizedEmail,
      position: employee.position,
      officialSalary: employee.officialSalary,
      unofficialSalary: employee.unofficialSalary,
      hireDate: employee.hireDate,
      officialEmployment: employee.officialEmployment,
      premiumEnabled: employee.premiumEnabled,
      premiumAmount: employee.premiumAmount,
      premiumStartDate: employee.premiumStartDate,
      premiumHistory: employee.premiumHistoryMode === 'replace'
        ? employee.premiumHistory
        : mergePremiumHistory(target.premiumHistory, employee),
      role: employee.role,
      allowedSections: employee.allowedSections,
      allowedPoints: employee.allowedPoints,
      updatedAt: new Date().toISOString(),
    });
    await this.saveUsers(users);
    await this.audit('user.updated', { userId }, actor.id);
    return sanitizeUser(target);
  }

  async addEmployeeDocument(actor, userId, input) {
    if (!canManageUsers(actor)) throw new ApiError(403, 'Недостаточно прав.');
    const users = await this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) throw new ApiError(404, 'Пользователь не найден.');
    if (target.role === 'owner') {
      throw new ApiError(403, 'Документы владельца нельзя менять из справочника сотрудников.');
    }

    const documentType = normalizeEmployeeDocumentType(input.documentType);
    const upload = normalizeEmployeeDocumentUpload(input.file);
    upload.archiveName = employeeDocumentArchiveName(upload, target, documentType);
    const googleDrive = await archiveEmployeeDocumentToGoogleDrive(upload, target, documentType);
    if (googleDrive.status !== 'uploaded') {
      throw new ApiError(503, googleDrive.reason || 'Google Drive недоступен.');
    }

    const document = {
      id: upload.id,
      type: documentType.value,
      typeLabel: documentType.label,
      fileName: upload.archiveName,
      originalFileName: upload.fileName,
      mimeType: upload.mimeType,
      size: upload.size,
      googleDrive,
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      createdByName: actor.fullName,
    };
    target.employeeDocuments = [...normalizeEmployeeDocuments(target.employeeDocuments), document];
    target.updatedAt = new Date().toISOString();
    await this.saveUsers(users);
    await this.audit('employee_document.created', {
      userId: target.id,
      documentId: document.id,
      type: document.type,
      googleDriveFileId: googleDrive.fileId || '',
    }, actor.id);
    return {
      user: sanitizeUser(target),
      document: sanitizeEmployeeDocument(document),
    };
  }

  async deleteEmployeeDocument(actor, userId, documentId) {
    if (!canManageUsers(actor)) throw new ApiError(403, 'Недостаточно прав.');
    const users = await this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) throw new ApiError(404, 'Пользователь не найден.');
    const documents = normalizeEmployeeDocuments(target.employeeDocuments);
    const document = documents.find((item) => item.id === documentId);
    if (!document) throw new ApiError(404, 'Документ не найден.');

    const googleDriveCleanup = await deleteArchivedEmployeeDocumentFromGoogleDrive(document.googleDrive);
    if (['failed', 'unavailable'].includes(googleDriveCleanup.status)) {
      throw new ApiError(503, googleDriveCleanup.reason || 'Google Drive не удалил документ.');
    }

    target.employeeDocuments = documents.filter((item) => item.id !== documentId);
    target.updatedAt = new Date().toISOString();
    await this.saveUsers(users);
    await this.audit('employee_document.deleted', {
      userId: target.id,
      documentId: document.id,
      type: document.type,
      googleDriveFileId: document.googleDrive?.fileId || '',
      googleDriveCleanupStatus: googleDriveCleanup.status,
    }, actor.id);
    return {
      user: sanitizeUser(target),
      document: sanitizeEmployeeDocument(document),
      googleDriveCleanup,
    };
  }

  async deleteUser(actor, userId) {
    const users = await this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) throw new ApiError(404, 'Пользователь не найден.');
    if (target.id === actor.id) throw new ApiError(400, 'Нельзя удалить свою учетную запись.');
    if (target.role === 'owner') throw new ApiError(400, 'Владельца нельзя удалить из справочника сотрудников.');

    await this.saveUsers(users.filter((user) => user.id !== userId));
    await this.deleteUserSessions(userId);
    await this.removeUserFromSchedules(userId);
    await this.audit('user.deleted', { userId, email: target.email }, actor.id);
    return sanitizeUser(target);
  }

  async deleteUserSessions(userId) {
    const sessions = await this.loadJson('sessions.json', {});
    let changed = false;
    for (const [sid, session] of Object.entries(sessions)) {
      if (session.userId === userId) {
        delete sessions[sid];
        changed = true;
      }
    }
    if (changed) await this.saveJson('sessions.json', sessions);
  }

  async removeUserFromSchedules(userId) {
    const schedules = await this.loadJson('schedules.json', {});
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
    if (changed) await this.saveJson('schedules.json', schedules);
  }

  async updateUserRole(actor, userId, role) {
    if (!ROLE_LABELS[role]) throw new ApiError(400, 'Неизвестный тип доступа.');
    if (role !== 'owner') normalizeAccountRole(role);
    if (role === 'owner' && actor.role !== 'owner') {
      throw new ApiError(403, 'Только владелец может назначить владельца.');
    }
    const users = await this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) throw new ApiError(404, 'Пользователь не найден.');

    const ownerCount = users.filter((user) => user.role === 'owner').length;
    if (target.role === 'owner' && role !== 'owner' && ownerCount <= 1) {
      throw new ApiError(400, 'Нельзя убрать последнего владельца.');
    }

    target.role = role;
    target.allowedSections = role === 'owner' ? allSectionIds() : normalizeAllowedSections(target.allowedSections || []);
    target.allowedPoints = normalizeAllowedPointsForRole(role, target.allowedPoints || []);
    assertUniqueAdminPointAssignments(users, target);
    target.updatedAt = new Date().toISOString();
    await this.saveUsers(users);
    await this.audit('user.role_changed', { userId, role }, actor.id);
    return sanitizeUser(target);
  }

  async updatePassword(userId, newPassword) {
    const users = await this.listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) throw new ApiError(404, 'Пользователь не найден.');
    target.password = hashPassword(newPassword);
    target.updatedAt = new Date().toISOString();
    await this.saveUsers(users);
    await this.audit('user.password_changed', { userId }, userId);
  }

  async createSession(userId) {
    const sessions = await this.loadJson('sessions.json', {});
    const sid = crypto.randomBytes(32).toString('base64url');
    sessions[sid] = {
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };
    await this.saveJson('sessions.json', sessions);
    return sid;
  }

  async getSession(sid) {
    if (!sid) return null;
    const sessions = await this.loadJson('sessions.json', {});
    const session = sessions[sid];
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      delete sessions[sid];
      await this.saveJson('sessions.json', sessions);
      return null;
    }
    return session;
  }

  async deleteSession(sid) {
    const sessions = await this.loadJson('sessions.json', {});
    if (sessions[sid]) {
      delete sessions[sid];
      await this.saveJson('sessions.json', sessions);
    }
  }

  async getSchedule(pointId, month, actor) {
    validatePointAndMonth(pointId, month);
    requireSectionAccess(actor, 'schedule');
    requirePointAccess(actor, pointId);
    const schedules = await this.loadJson('schedules.json', {});
    const key = scheduleKey(pointId, month);
    const users = await this.listUsers();
    const claims = normalizeClaims(await this.loadJson('claims.json', []));
    applyMonthlyPremiumDistribution(schedules, users, month);
    applyMonthlyClaimDistribution(schedules, users, claims, month);
    const saved = schedules[key] || { pointId, month, rows: [], updatedAt: null, updatedBy: null };
    const employeeOptions = scheduleEmployeeOptions(actor, users, month, schedules, pointId);
    let rows = hydrateScheduleRows(saved.rows || [], users, getDaysInMonth(month), month);

    for (const employee of employeeOptions) {
      const exists = rows.some((row) => row.employeeId === employee.id);
      if (!exists) {
        rows.push({
          id: crypto.randomUUID(),
          employeeId: employee.id,
          employeeName: employee.fullName,
          bonusExtra: employee.premium.active || employee.premium.assignedPointId ? employee.premium.amount : '',
          premiumActive: employee.premium.active,
          premiumStartDate: employee.premium.startDate,
          premiumAssignedPointId: employee.premium.assignedPointId || '',
          claims: '',
          claimAssignedPointId: '',
          days: {},
        });
      }
    }

    rows = applyPremiumToScheduleRows(rows, users, { ...schedules, [key]: { ...saved, rows } }, month, pointId);
    rows = applyClaimsToScheduleRows(rows, users, { ...schedules, [key]: { ...saved, rows } }, claims, month, pointId);

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

  async saveSchedule(actor, pointId, month, rows) {
    validatePointAndMonth(pointId, month);
    requireSectionAccess(actor, 'schedule');
    requirePointAccess(actor, pointId);
    const users = await this.listUsers();
    const employeeOptions = scheduleEmployeeOptions(actor, users, month);
    const normalizedRows = validateScheduleRows(month, rows, employeeOptions);
    const schedules = await this.loadJson('schedules.json', {});
    const claims = normalizeClaims(await this.loadJson('claims.json', []));
    const key = scheduleKey(pointId, month);
    const saved = schedules[key] || { pointId, month, rows: [], updatedAt: null, updatedBy: null };
    const existingRows = hydrateScheduleRows(saved.rows || [], users, getDaysInMonth(month), month);
    const scheduleRows = canManageAllSchedule(actor)
      ? normalizedRows
      : [
          ...existingRows.filter((row) => row.employeeId !== actor.id),
          ...normalizedRows.filter((row) => row.employeeId === actor.id),
        ];

    schedules[key] = {
      pointId,
      month,
      rows: scheduleRows,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    };
    applyMonthlyPremiumDistribution(schedules, users, month);
    applyMonthlyClaimDistribution(schedules, users, claims, month);
    await this.saveJson('schedules.json', schedules);
    await this.audit('schedule.saved', { pointId, month, rows: normalizedRows.length }, actor.id);
    return this.getSchedule(pointId, month, actor);
  }

  async listRepairs(actor) {
    requireSectionAccess(actor, 'repairs');
    const users = await this.listUsers();
    const repairs = await this.loadJson('repairs.json', []);
    const allowedPointIds = new Set(visiblePointsFor(actor).map((point) => point.id));
    const visible = canManageRepairs(actor)
      ? repairs.filter((repair) => allowedPointIds.has(repair.pointId))
      : repairs.filter((repair) => repair.createdBy === actor.id && allowedPointIds.has(repair.pointId));

    return visible
      .map((repair) => hydrateRepair(repair, users))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  async createRepair(actor, input) {
    requireSectionAccess(actor, 'repairs');
    const repair = validateRepairRequest(input);
    requirePointAccess(actor, repair.pointId);
    const repairs = await this.loadJson('repairs.json', []);
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
    await this.saveJson('repairs.json', repairs);
    await this.audit('repair.created', { repairId: record.id, pointId: record.pointId, priority: record.priority }, actor.id);
    return hydrateRepair(record, await this.listUsers());
  }

  async updateRepair(actor, repairId, input) {
    const patch = validateRepairPatch(input);
    const repairs = await this.loadJson('repairs.json', []);
    const target = repairs.find((repair) => repair.id === repairId);
    if (!target) throw new ApiError(404, 'Заявка на ремонт не найдена.');
    requireSectionAccess(actor, 'repairs');
    requirePointAccess(actor, target.pointId);

    Object.assign(target, {
      status: patch.status,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    });
    await this.saveJson('repairs.json', repairs);
    await this.audit('repair.updated', { repairId: target.id, status: target.status }, actor.id);
    return hydrateRepair(target, await this.listUsers());
  }

  async listExpenses(actor) {
    requireSectionAccess(actor, 'expenses');
    const users = await this.listUsers();
    const expenses = await this.loadJson('expenses.json', []);
    const allowedPointIds = new Set(visiblePointsFor(actor).map((point) => point.id));
    const visible = canManageExpenses(actor)
      ? expenses.filter((expense) => allowedPointIds.has(expense.pointId))
      : expenses.filter((expense) => expense.createdBy === actor.id && allowedPointIds.has(expense.pointId));

    return visible
      .map((expense) => hydrateExpense(expense, users))
      .sort((left, right) => expenseSortTime(right) - expenseSortTime(left));
  }

  async createExpense(actor, input) {
    requireSectionAccess(actor, 'expenses');
    if (!canManageExpenses(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const expense = validateExpenseRequest(input);
    requirePointAccess(actor, expense.pointId);
    const upload = normalizeReceiptUpload(input.receipt);
    const now = new Date().toISOString();
    const receiptContext = {
      pointId: expense.pointId,
      expenseDate: expense.expenseDate,
      createdByName: actor.fullName,
      createdAt: now,
    };
    upload.archiveName = archiveReceiptName(upload, receiptContext);
    const receipt = await this.saveReceiptFile(upload);
    const expenses = await this.loadJson('expenses.json', []);
    const record = {
      id: crypto.randomUUID(),
      pointId: expense.pointId,
      expenseDate: expense.expenseDate,
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      receipt,
      googleDrive: await archiveReceiptToGoogleDrive(upload, {
        pointId: expense.pointId,
        expenseDate: expense.expenseDate,
        createdByName: actor.fullName,
        amount: expense.amount,
        createdAt: now,
      }),
      createdBy: actor.id,
      createdByName: actor.fullName,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };

    expenses.push(record);
    await this.saveJson('expenses.json', expenses);
    await this.audit('expense.created', {
      expenseId: record.id,
      pointId: record.pointId,
      amount: record.amount,
      paymentMethod: record.paymentMethod,
      receiptId: receipt.id,
      googleDriveStatus: record.googleDrive.status,
    }, actor.id);
    return hydrateExpense(record, await this.listUsers());
  }

  async deleteExpense(actor, expenseId) {
    requireSectionAccess(actor, 'expenses');
    if (!canManageExpenses(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const expenses = await this.loadJson('expenses.json', []);
    const index = expenses.findIndex((expense) => expense.id === expenseId);
    if (index === -1) {
      throw new ApiError(404, 'Хозрасход не найден.');
    }
    const [deleted] = expenses.splice(index, 1);
    requirePointAccess(actor, deleted.pointId);
    await this.saveJson('expenses.json', expenses);
    const googleDriveCleanup = await deleteArchivedReceiptFromGoogleDrive(deleted.googleDrive);
    await this.deleteReceiptFile(deleted.receipt);
    await this.audit('expense.deleted', {
      expenseId: deleted.id,
      pointId: deleted.pointId,
      amount: deleted.amount,
      receiptId: deleted.receipt?.id || '',
      googleDriveFileId: deleted.googleDrive?.fileId || '',
      googleDriveCleanupStatus: googleDriveCleanup.status,
      googleDriveCleanupReason: googleDriveCleanup.reason || '',
    }, actor.id);
    const hydrated = hydrateExpense(deleted, await this.listUsers());
    hydrated.googleDriveCleanup = googleDriveCleanup;
    return hydrated;
  }

  async getExpenseByReceiptId(actor, receiptId) {
    const expenses = await this.listExpenses(actor);
    return expenses.find((expense) => expense.receipt?.id === receiptId) || null;
  }

  async listClaims(actor) {
    requireSectionAccess(actor, 'claims');
    const users = await this.listUsers();
    const claims = normalizeClaims(await this.loadJson('claims.json', []));
    const allowedPointIds = new Set(visiblePointsFor(actor).map((point) => point.id));
    const visible = canManageClaims(actor)
      ? claims.filter((claim) => allowedPointIds.has(claim.pointId))
      : claims.filter((claim) => (
          allowedPointIds.has(claim.pointId)
          && (claim.guiltyEmployeeId === actor.id || claim.createdBy === actor.id)
        ));

    return visible
      .map((claim) => hydrateClaim(claim, users))
      .sort((left, right) => claimSortTime(right) - claimSortTime(left));
  }

  async createClaim(actor, input) {
    requireSectionAccess(actor, 'claims');
    if (!canManageClaims(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const users = await this.listUsers();
    const claim = validateClaimRequest(input, users);
    requirePointAccess(actor, claim.pointId);
    const claims = normalizeClaims(await this.loadJson('claims.json', []));
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      ...claim,
      createdBy: actor.id,
      createdByName: actor.fullName,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };

    claims.push(record);
    await this.saveJson('claims.json', claims);
    await this.audit('claim.created', {
      claimId: record.id,
      pointId: record.pointId,
      date: record.date,
      amount: record.amount,
      guiltyEmployeeId: record.guiltyEmployeeId,
    }, actor.id);
    return hydrateClaim(record, users);
  }

  async deleteClaim(actor, claimId) {
    requireSectionAccess(actor, 'claims');
    if (!canManageClaims(actor)) {
      throw new ApiError(403, 'Недостаточно прав.');
    }
    const claims = normalizeClaims(await this.loadJson('claims.json', []));
    const index = claims.findIndex((claim) => claim.id === claimId);
    if (index === -1) {
      throw new ApiError(404, 'Претензия не найдена.');
    }
    const [deleted] = claims.splice(index, 1);
    requirePointAccess(actor, deleted.pointId);
    await this.saveJson('claims.json', claims);
    await this.audit('claim.deleted', {
      claimId: deleted.id,
      pointId: deleted.pointId,
      date: deleted.date,
      amount: deleted.amount,
      guiltyEmployeeId: deleted.guiltyEmployeeId,
    }, actor.id);
    return hydrateClaim(deleted, await this.listUsers());
  }

  async saveReceiptFile(upload) {
    const storageFileName = upload.archiveName || `${upload.id}.${upload.extension}`;
    await this.saveJson(`receipt:${upload.id}.json`, {
      id: upload.id,
      fileName: storageFileName,
      storageFileName,
      mimeType: upload.mimeType,
      size: upload.size,
      base64: upload.buffer.toString('base64'),
      createdAt: new Date().toISOString(),
    });
    return {
      id: upload.id,
      fileName: storageFileName,
      storageFileName,
      mimeType: upload.mimeType,
      size: upload.size,
      storage: 'supabase-app-kv',
      url: `/api/receipts/${upload.id}`,
    };
  }

  async readReceiptFile(receipt) {
    const id = normalizeText(receipt?.id);
    if (!id) throw new ApiError(404, 'Чек не найден.');
    const stored = await this.loadJson(`receipt:${id}.json`, null);
    if (!stored?.base64) {
      throw new ApiError(404, 'Файл чека недоступен.');
    }
    return {
      buffer: Buffer.from(stored.base64, 'base64'),
      mimeType: stored.mimeType || receipt.mimeType || 'application/octet-stream',
      fileName: stored.fileName || receipt.fileName || `${id}.jpg`,
    };
  }

  async deleteReceiptFile(receipt) {
    const id = normalizeText(receipt?.id);
    if (!id) return;
    try {
      await this.supabaseFetch(`/rest/v1/app_kv?key=eq.${encodeURIComponent(`receipt:${id}.json`)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    } catch {
      // Receipt cleanup is best effort; deleting the expense record is the source of truth.
    }
  }

  async listRetailPoints(actor) {
    requireSectionAccess(actor, 'points');
    const users = await this.listUsers();
    const seeded = mergeRetailPointSeeds(await this.loadJson('retail_points.json', []));
    if (seeded.changed) {
      await this.saveRetailPoints(seeded.points);
    }
    const points = seeded.points;
    syncRuntimePoints(points);
    return points
      .map((point) => hydrateRetailPoint(point, users))
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  }

  async saveRetailPoints(points) {
    const normalized = normalizeRetailPoints(points, { includeDefaults: false });
    syncRuntimePoints(normalizeRetailPoints(normalized));
    await this.saveJson('retail_points.json', normalized);
  }

  async createRetailPoint(actor, input) {
    if (!canManageRetailPoints(actor)) throw new ApiError(403, 'Недостаточно прав.');
    const users = await this.listUsers();
    const points = normalizeRetailPoints(await this.loadJson('retail_points.json', []));
    const point = validateRetailPointRecord(input, users);
    const duplicate = points.find((item) => item.name.toLowerCase() === point.name.toLowerCase());
    if (duplicate) throw new ApiError(409, 'Торговая точка с таким названием уже есть.');
    const now = new Date().toISOString();
    const record = {
      id: `retail_${crypto.randomUUID()}`,
      ...point,
      documents: [],
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };
    points.push(record);
    await this.saveRetailPoints(points);
    await this.audit('retail_point.created', { pointId: record.id, name: record.name }, actor.id);
    return hydrateRetailPoint(record, users);
  }

  async updateRetailPoint(actor, pointId, patch) {
    if (!canManageRetailPoints(actor)) throw new ApiError(403, 'Недостаточно прав.');
    const users = await this.listUsers();
    const points = normalizeRetailPoints(await this.loadJson('retail_points.json', []));
    const target = points.find((point) => point.id === pointId);
    if (!target) throw new ApiError(404, 'Торговая точка не найдена.');
    const next = validateRetailPointRecord({ ...target, ...patch }, users);
    const duplicate = points.find((point) => point.id !== pointId && point.name.toLowerCase() === next.name.toLowerCase());
    if (duplicate) throw new ApiError(409, 'Торговая точка с таким названием уже есть.');
    Object.assign(target, next, {
      documents: normalizeRetailPointDocuments(target.documents),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    });
    await this.saveRetailPoints(points);
    await this.audit('retail_point.updated', { pointId: target.id, name: target.name }, actor.id);
    return hydrateRetailPoint(target, users);
  }

  async addRetailPointDocument(actor, pointId, input) {
    if (!canManageRetailPoints(actor)) throw new ApiError(403, 'Недостаточно прав.');
    const users = await this.listUsers();
    const points = normalizeRetailPoints(await this.loadJson('retail_points.json', []));
    const target = points.find((point) => point.id === pointId);
    if (!target) throw new ApiError(404, 'Торговая точка не найдена.');
    const upload = normalizeRetailPointDocumentUpload(input.file);
    upload.archiveName = retailPointDocumentArchiveName(upload);
    const googleDrive = await archiveRetailPointDocumentToGoogleDrive(upload, target);
    if (googleDrive.status !== 'uploaded') {
      throw new ApiError(503, googleDrive.reason || 'Google Drive недоступен.');
    }
    const document = {
      id: upload.id,
      fileName: upload.archiveName,
      originalFileName: upload.fileName,
      mimeType: upload.mimeType,
      size: upload.size,
      googleDrive,
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      createdByName: actor.fullName,
    };
    target.documents = [...normalizeRetailPointDocuments(target.documents), document];
    target.updatedAt = new Date().toISOString();
    target.updatedBy = actor.id;
    await this.saveRetailPoints(points);
    await this.audit('retail_point_document.created', {
      pointId: target.id,
      documentId: document.id,
      googleDriveFileId: googleDrive.fileId || '',
    }, actor.id);
    return {
      point: hydrateRetailPoint(target, users),
      document: sanitizeRetailPointDocument(document),
    };
  }

  async deleteRetailPointDocument(actor, pointId, documentId) {
    if (!canManageRetailPoints(actor)) throw new ApiError(403, 'Недостаточно прав.');
    const users = await this.listUsers();
    const points = normalizeRetailPoints(await this.loadJson('retail_points.json', []));
    const target = points.find((point) => point.id === pointId);
    if (!target) throw new ApiError(404, 'Торговая точка не найдена.');
    const documents = normalizeRetailPointDocuments(target.documents);
    const document = documents.find((item) => item.id === documentId);
    if (!document) throw new ApiError(404, 'Документ не найден.');
    const googleDriveCleanup = await deleteArchivedRetailPointDocumentFromGoogleDrive(document.googleDrive);
    if (['failed', 'unavailable'].includes(googleDriveCleanup.status)) {
      throw new ApiError(503, googleDriveCleanup.reason || 'Google Drive не удалил документ.');
    }
    target.documents = documents.filter((item) => item.id !== documentId);
    target.updatedAt = new Date().toISOString();
    target.updatedBy = actor.id;
    await this.saveRetailPoints(points);
    await this.audit('retail_point_document.deleted', {
      pointId: target.id,
      documentId: document.id,
      googleDriveFileId: document.googleDrive?.fileId || '',
      googleDriveCleanupStatus: googleDriveCleanup.status,
    }, actor.id);
    return {
      point: hydrateRetailPoint(target, users),
      document: sanitizeRetailPointDocument(document),
      googleDriveCleanup,
    };
  }

  async listCompanies(actor) {
    requireSectionAccess(actor, 'companies');
    const companies = normalizeCompanies(await this.loadJson('companies.json', []));
    return visibleCompaniesForActor(actor, companies)
      .map(hydrateCompany)
      .sort((left, right) => (left.shortName || left.name).localeCompare(right.shortName || right.name, 'ru'));
  }

  async saveCompanies(companies) {
    await this.saveJson('companies.json', normalizeCompanies(companies, { includeDefaults: false }));
  }

  async createCompany(actor, input) {
    if (!canManageCompanies(actor)) throw new ApiError(403, 'Недостаточно прав.');
    const companies = normalizeCompanies(await this.loadJson('companies.json', []));
    const company = validateCompanyRecord(input);
    assertCanAssignCompanyPoints(actor, company.pointIds);
    const duplicate = companies.find((item) => companyDuplicateMatches(item, company));
    if (duplicate) throw new ApiError(409, 'Компания с такими реквизитами уже есть.');
    const now = new Date().toISOString();
    const record = {
      id: `company_${crypto.randomUUID()}`,
      ...company,
      documents: [],
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };
    companies.push(record);
    await this.saveCompanies(companies);
    await this.audit('company.created', { companyId: record.id, shortName: record.shortName }, actor.id);
    return hydrateCompany(record);
  }

  async updateCompany(actor, companyId, patch) {
    if (!canManageCompanies(actor)) throw new ApiError(403, 'Недостаточно прав.');
    const companies = normalizeCompanies(await this.loadJson('companies.json', []));
    const target = companies.find((company) => company.id === companyId);
    if (!target) throw new ApiError(404, 'Компания не найдена.');
    assertCanViewCompany(actor, target);
    const next = validateCompanyRecord({ ...target, ...patch });
    assertCanAssignCompanyPoints(actor, next.pointIds);
    const duplicate = companies.find((company) => company.id !== companyId && companyDuplicateMatches(company, next));
    if (duplicate) throw new ApiError(409, 'Компания с такими реквизитами уже есть.');
    Object.assign(target, next, {
      documents: normalizeCompanyDocuments(target.documents),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.id,
    });
    await this.saveCompanies(companies);
    await this.audit('company.updated', { companyId: target.id, shortName: target.shortName }, actor.id);
    return hydrateCompany(target);
  }

  async addCompanyDocument(actor, companyId, input) {
    if (!canManageCompanies(actor)) throw new ApiError(403, 'Недостаточно прав.');
    const companies = normalizeCompanies(await this.loadJson('companies.json', []));
    const target = companies.find((company) => company.id === companyId);
    if (!target) throw new ApiError(404, 'Компания не найдена.');
    assertCanViewCompany(actor, target);
    const upload = normalizeCompanyDocumentUpload(input.file);
    upload.archiveName = companyDocumentArchiveName(upload);
    const googleDrive = await archiveCompanyDocumentToGoogleDrive(upload, target);
    if (googleDrive.status !== 'uploaded') {
      throw new ApiError(503, googleDrive.reason || 'Google Drive недоступен.');
    }
    const document = {
      id: upload.id,
      fileName: upload.archiveName,
      originalFileName: upload.fileName,
      mimeType: upload.mimeType,
      size: upload.size,
      googleDrive,
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      createdByName: actor.fullName,
    };
    target.documents = [...normalizeCompanyDocuments(target.documents), document];
    target.updatedAt = new Date().toISOString();
    target.updatedBy = actor.id;
    await this.saveCompanies(companies);
    await this.audit('company_document.created', {
      companyId: target.id,
      documentId: document.id,
      googleDriveFileId: googleDrive.fileId || '',
    }, actor.id);
    return {
      company: hydrateCompany(target),
      document: sanitizeCompanyDocument(document),
    };
  }

  async deleteCompanyDocument(actor, companyId, documentId) {
    if (!canManageCompanies(actor)) throw new ApiError(403, 'Недостаточно прав.');
    const companies = normalizeCompanies(await this.loadJson('companies.json', []));
    const target = companies.find((company) => company.id === companyId);
    if (!target) throw new ApiError(404, 'Компания не найдена.');
    assertCanViewCompany(actor, target);
    const documents = normalizeCompanyDocuments(target.documents);
    const document = documents.find((item) => item.id === documentId);
    if (!document) throw new ApiError(404, 'Документ не найден.');
    const googleDriveCleanup = await deleteArchivedCompanyDocumentFromGoogleDrive(document.googleDrive);
    if (['failed', 'unavailable'].includes(googleDriveCleanup.status)) {
      throw new ApiError(503, googleDriveCleanup.reason || 'Google Drive не удалил документ.');
    }
    target.documents = documents.filter((item) => item.id !== documentId);
    target.updatedAt = new Date().toISOString();
    target.updatedBy = actor.id;
    await this.saveCompanies(companies);
    await this.audit('company_document.deleted', {
      companyId: target.id,
      documentId: document.id,
      googleDriveFileId: document.googleDrive?.fileId || '',
      googleDriveCleanupStatus: googleDriveCleanup.status,
    }, actor.id);
    return {
      company: hydrateCompany(target),
      document: sanitizeCompanyDocument(document),
      googleDriveCleanup,
    };
  }

  async readAudit(limit = 40) {
    const events = await this.loadJson('audit.json', []);
    return events.slice(-limit).reverse();
  }

  storageStatus() {
    return this.storageWarning;
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

function createStore() {
  if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) {
    return new SupabaseStore();
  }
  return new Store();
}

function createRequestHandler(store = createStore()) {
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

  if (req.method === 'GET' && pathname === '/api/db-health') {
    ensureRate(req, 'db-health', 30, 10 * 60 * 1000);
    const checkedAt = new Date().toISOString();
    const probe = { checkedAt, source: 'api/db-health' };

    await store.saveJson('healthcheck.json', probe);

    const [
      users,
      sessions,
      schedules,
      repairs,
      expenses,
      claims,
      companies,
      reports,
      audit,
      savedProbe,
      storage,
    ] = await Promise.all([
      store.loadJson('users.json', []),
      store.loadJson('sessions.json', {}),
      store.loadJson('schedules.json', {}),
      store.loadJson('repairs.json', []),
      store.loadJson('expenses.json', []),
      store.loadJson('claims.json', []),
      store.loadJson('companies.json', []),
      store.loadJson('reports.json', {}),
      store.loadJson('audit.json', []),
      store.loadJson('healthcheck.json', null),
      maybeAwait(store.storageStatus()),
    ]);

    const scheduleList = schedules && typeof schedules === 'object'
      ? Object.values(schedules)
      : [];
    const scheduleRows = scheduleList.reduce((sum, schedule) => {
      return sum + (Array.isArray(schedule.rows) ? schedule.rows.length : 0);
    }, 0);

    sendJson(res, 200, {
      ok: true,
      database: {
        read: true,
        write: Boolean(savedProbe && savedProbe.checkedAt === checkedAt),
        checkedAt,
        storage,
        counts: {
          users: Array.isArray(users) ? users.length : 0,
          sessions: sessions && typeof sessions === 'object' ? Object.keys(sessions).length : 0,
          schedules: scheduleList.length,
          scheduleRows,
          repairs: Array.isArray(repairs) ? repairs.length : 0,
          expenses: Array.isArray(expenses) ? expenses.length : 0,
          claims: Array.isArray(claims) ? claims.length : 0,
          companies: Array.isArray(companies) ? normalizeCompanies(companies).length : 0,
          reports: reports && typeof reports === 'object' ? Object.keys(reports).length : 0,
          auditEvents: Array.isArray(audit) ? audit.length : 0,
        },
      },
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/drive-health') {
    ensureRate(req, 'drive-health', 3, 10 * 60 * 1000);
    const result = await runGoogleDriveHealthCheck();
    await store.audit('drive.healthcheck', {
      ok: result.ok,
      status: result.upload?.status || 'unknown',
      cleanupStatus: result.cleanup?.status || '',
      reason: result.upload?.reason || result.error || '',
      config: result.config,
    });
    sendJson(res, result.ok ? 200 : 503, result);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/captcha') {
    ensureRate(req, 'captcha', 30, 10 * 60 * 1000);
    sendJson(res, 200, { captcha: createCaptchaChallenge() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/register') {
    ensureRate(req, 'register', 6, 10 * 60 * 1000);
    const body = await readJsonBody(req);
    verifyCaptcha(body.captchaToken, body.captchaAnswer);
    const registration = validateRegistration(body, { requireSeparateName: true });
    const password = generatePassword();
    const user = await store.createUser({
      ...registration,
      password,
      role: 'employee',
      allowedSections: [],
      allowedPoints: [],
      allowInitialOwner: false,
    });
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
    const login = normalizeText(body.login || body.email);
    const password = String(body.password || '');
    const user = login.includes('@')
      ? await store.getUserByEmail(login)
      : await store.getUserByPhone(login);

    if (!user || !verifyPassword(password, user.password)) {
      await store.audit('auth.login_failed', { login });
      throw new ApiError(401, 'Неверный email/телефон или пароль.');
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
  await syncRuntimePointsFromStore(store);

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
      sections: ACCESS_SECTIONS,
      points: visiblePointsFor(auth.user),
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
    sendJson(res, 200, { points: visiblePointsFor(auth.user) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/retail-points') {
    requireSectionAccess(auth.user, 'points');
    const users = await store.listUsers();
    sendJson(res, 200, {
      points: await store.listRetailPoints(auth.user),
      canManage: canManageRetailPoints(auth.user),
      paymentMethods: POINT_PAYMENT_METHODS,
      adminOptions: retailPointAdminOptions(users),
      companyOptions: retailPointCompanyOptions(await store.loadJson('companies.json', []), auth.user),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/retail-points') {
    if (!canManageRetailPoints(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const point = await store.createRetailPoint(auth.user, body);
    sendJson(res, 201, { point, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const retailPointMatch = pathname.match(/^\/api\/retail-points\/([^/]+)$/);
  if (req.method === 'PATCH' && retailPointMatch) {
    if (!canManageRetailPoints(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const point = await store.updateRetailPoint(auth.user, retailPointMatch[1], body);
    sendJson(res, 200, { point, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const retailPointDocumentCreateMatch = pathname.match(/^\/api\/retail-points\/([^/]+)\/documents$/);
  if (req.method === 'POST' && retailPointDocumentCreateMatch) {
    if (!canManageRetailPoints(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const result = await store.addRetailPointDocument(auth.user, retailPointDocumentCreateMatch[1], body);
    sendJson(res, 201, { ...result, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const retailPointDocumentDeleteMatch = pathname.match(/^\/api\/retail-points\/([^/]+)\/documents\/([^/]+)$/);
  if (req.method === 'DELETE' && retailPointDocumentDeleteMatch) {
    if (!canManageRetailPoints(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const result = await store.deleteRetailPointDocument(auth.user, retailPointDocumentDeleteMatch[1], retailPointDocumentDeleteMatch[2]);
    sendJson(res, 200, { ...result, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/companies') {
    requireSectionAccess(auth.user, 'companies');
    sendJson(res, 200, {
      companies: await store.listCompanies(auth.user),
      canManage: canManageCompanies(auth.user),
      points: visiblePointsFor(auth.user),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/companies') {
    if (!canManageCompanies(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const company = await store.createCompany(auth.user, body);
    sendJson(res, 201, { company, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const companyMatch = pathname.match(/^\/api\/companies\/([^/]+)$/);
  if (req.method === 'PATCH' && companyMatch) {
    if (!canManageCompanies(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const company = await store.updateCompany(auth.user, companyMatch[1], body);
    sendJson(res, 200, { company, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const companyDocumentCreateMatch = pathname.match(/^\/api\/companies\/([^/]+)\/documents$/);
  if (req.method === 'POST' && companyDocumentCreateMatch) {
    if (!canManageCompanies(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const result = await store.addCompanyDocument(auth.user, companyDocumentCreateMatch[1], body);
    sendJson(res, 201, { ...result, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const companyDocumentDeleteMatch = pathname.match(/^\/api\/companies\/([^/]+)\/documents\/([^/]+)$/);
  if (req.method === 'DELETE' && companyDocumentDeleteMatch) {
    if (!canManageCompanies(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const result = await store.deleteCompanyDocument(auth.user, companyDocumentDeleteMatch[1], companyDocumentDeleteMatch[2]);
    sendJson(res, 200, { ...result, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/reports') {
    requireSectionAccess(auth.user, 'reports');
    sendJson(res, 200, {
      reports: reportDirectory(),
      canManage: canManageReports(auth.user),
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/reports/admin-payroll') {
    requireSectionAccess(auth.user, 'reports');
    const month = normalizeReportMonth(requestUrl.searchParams.get('month'));
    const users = (await store.listUsers()).map(sanitizeUser);
    const reports = normalizeReports(await store.loadJson('reports.json', {}));
    sendJson(res, 200, {
      report: buildAdminPayrollReport(users, reports, month),
      canManage: canManageReports(auth.user),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/reports/admin-payroll') {
    if (!canManageReports(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const month = normalizeReportMonth(body.month);
    const users = (await store.listUsers()).map(sanitizeUser);
    const reports = normalizeReports(await store.loadJson('reports.json', {}));
    reports.adminPayroll[month] = {
      updatedAt: new Date().toISOString(),
      rows: normalizeAdminPayrollManualRows(body.rows || []),
    };
    await store.saveJson('reports.json', reports);
    await store.audit('reports.admin_payroll_saved', { month }, auth.user.id);
    sendJson(res, 200, {
      report: buildAdminPayrollReport(users, reports, month),
      storage: await maybeAwait(store.storageStatus()),
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/users') {
    requireSectionAccess(auth.user, 'employees');
    const users = (await store.listUsers()).map(sanitizeUser);
    sendJson(res, 200, {
      users,
      roles: employeeRoleOptions(),
      documentTypes: EMPLOYEE_DOCUMENT_TYPES,
      sections: ACCESS_SECTIONS,
      points: visiblePointsFor(auth.user),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/users') {
    if (!canManageUsers(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const employee = validateEmployeeRecord(body);
    assertCanGrantAccess(auth.user, employee);
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
    if (!canManageUsers(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const updated = await store.updateUser(auth.user, userMatch[1], body);
    sendJson(res, 200, { user: updated, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  if (req.method === 'DELETE' && userMatch) {
    if (!canManageUsers(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const deleted = await store.deleteUser(auth.user, userMatch[1]);
    sendJson(res, 200, { user: deleted, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const userDocumentCreateMatch = pathname.match(/^\/api\/users\/([^/]+)\/documents$/);
  if (req.method === 'POST' && userDocumentCreateMatch) {
    if (!canManageUsers(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const result = await store.addEmployeeDocument(auth.user, userDocumentCreateMatch[1], body);
    sendJson(res, 201, { ...result, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const userDocumentDeleteMatch = pathname.match(/^\/api\/users\/([^/]+)\/documents\/([^/]+)$/);
  if (req.method === 'DELETE' && userDocumentDeleteMatch) {
    if (!canManageUsers(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const result = await store.deleteEmployeeDocument(auth.user, userDocumentDeleteMatch[1], userDocumentDeleteMatch[2]);
    sendJson(res, 200, { ...result, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const roleMatch = pathname.match(/^\/api\/users\/([^/]+)\/role$/);
  if (req.method === 'PATCH' && roleMatch) {
    if (!canManageUsers(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const updated = await store.updateUserRole(auth.user, roleMatch[1], body.role);
    sendJson(res, 200, { user: updated });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/audit') {
    requireRole(auth.user, ['owner']);
    const limit = Math.min(100, Math.max(1, Number(requestUrl.searchParams.get('limit') || 40)));
    sendJson(res, 200, { events: await store.readAudit(limit) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/repairs') {
    requireSectionAccess(auth.user, 'repairs');
    sendJson(res, 200, {
      repairs: await store.listRepairs(auth.user),
      canManage: canManageRepairs(auth.user),
      statuses: REPAIR_STATUSES,
      priorities: REPAIR_PRIORITIES,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/repairs') {
    requireSectionAccess(auth.user, 'repairs');
    const body = await readJsonBody(req);
    const repair = await store.createRepair(auth.user, body);
    sendJson(res, 201, { repair, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const repairMatch = pathname.match(/^\/api\/repairs\/([^/]+)$/);
  if (req.method === 'PATCH' && repairMatch) {
    if (!canManageRepairs(auth.user)) throw new ApiError(403, 'Недостаточно прав.');
    const body = await readJsonBody(req);
    const repair = await store.updateRepair(auth.user, repairMatch[1], body);
    sendJson(res, 200, { repair, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/expenses') {
    requireSectionAccess(auth.user, 'expenses');
    sendJson(res, 200, {
      expenses: await store.listExpenses(auth.user),
      canManage: canManageExpenses(auth.user),
      paymentMethods: EXPENSE_PAYMENT_METHODS,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/expenses') {
    requireSectionAccess(auth.user, 'expenses');
    const body = await readJsonBody(req);
    const expense = await store.createExpense(auth.user, body);
    sendJson(res, 201, { expense, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const expenseMatch = pathname.match(/^\/api\/expenses\/([^/]+)$/);
  if (req.method === 'DELETE' && expenseMatch) {
    requireSectionAccess(auth.user, 'expenses');
    const deleted = await store.deleteExpense(auth.user, expenseMatch[1]);
    sendJson(res, 200, { expense: deleted, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const receiptMatch = pathname.match(/^\/api\/receipts\/([^/]+)$/);
  if (req.method === 'GET' && receiptMatch) {
    requireSectionAccess(auth.user, 'expenses');
    const receiptId = receiptMatch[1];
    const expense = await store.getExpenseByReceiptId(auth.user, receiptId);
    if (!expense) throw new ApiError(404, 'Чек не найден.');
    requirePointAccess(auth.user, expense.pointId);
    const file = await store.readReceiptFile(expense.receipt);
    sendBinary(res, 200, file.buffer, {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/claims') {
    requireSectionAccess(auth.user, 'claims');
    const users = await store.listUsers();
    sendJson(res, 200, {
      claims: await store.listClaims(auth.user),
      canManage: canManageClaims(auth.user),
      employeeOptions: claimEmployeeOptions(auth.user, users),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/claims') {
    requireSectionAccess(auth.user, 'claims');
    const body = await readJsonBody(req);
    const claim = await store.createClaim(auth.user, body);
    sendJson(res, 201, { claim, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  const claimMatch = pathname.match(/^\/api\/claims\/([^/]+)$/);
  if (req.method === 'DELETE' && claimMatch) {
    requireSectionAccess(auth.user, 'claims');
    const claim = await store.deleteClaim(auth.user, claimMatch[1]);
    sendJson(res, 200, { claim, storage: await maybeAwait(store.storageStatus()) });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/schedule') {
    requireSectionAccess(auth.user, 'schedule');
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
    requireSectionAccess(auth.user, 'schedule');
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

function sendBinary(res, status, buffer, extraHeaders = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(buffer);
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
  const sections = visibleSectionIds(user);
  const points = visiblePointsFor(user);
  return {
    canEditSchedule: canEditSchedule(user),
    canManageAllSchedule: canManageAllSchedule(user),
    canManageRepairs: canManageRepairs(user),
    canManageExpenses: canManageExpenses(user),
    canManageClaims: canManageClaims(user),
    canManageRetailPoints: canManageRetailPoints(user),
    canManageCompanies: canManageCompanies(user),
    canManageReports: canManageReports(user),
    canViewSchedule: hasSectionAccess(user, 'schedule'),
    canViewReports: hasSectionAccess(user, 'reports'),
    canViewRepairs: hasSectionAccess(user, 'repairs'),
    canViewExpenses: hasSectionAccess(user, 'expenses'),
    canViewClaims: hasSectionAccess(user, 'claims'),
    canViewRetailPoints: hasSectionAccess(user, 'points'),
    canViewCompanies: hasSectionAccess(user, 'companies'),
    canManageRoles: canManageUsers(user),
    canViewUsers: hasSectionAccess(user, 'employees'),
    canViewAudit: user.role === 'owner',
    allowedSections: sections,
    allowedPoints: points.map((point) => point.id),
  };
}

function canEditSchedule(user) {
  return hasSectionAccess(user, 'schedule') && visiblePointsFor(user).length > 0;
}

function canManageAllSchedule(user) {
  return user.role === 'owner' || (user.role === 'admin' && canEditSchedule(user));
}

function canManageRepairs(user) {
  return user.role === 'owner' || (user.role === 'admin' && hasSectionAccess(user, 'repairs'));
}

function canManageExpenses(user) {
  return user.role === 'owner' || (user.role === 'admin' && hasSectionAccess(user, 'expenses'));
}

function canManageClaims(user) {
  return user.role === 'owner' || (user.role === 'admin' && hasSectionAccess(user, 'claims'));
}

function canManageRetailPoints(user) {
  return user.role === 'owner' || (user.role === 'admin' && hasSectionAccess(user, 'points'));
}

function canManageCompanies(user) {
  return user.role === 'owner' || (user.role === 'admin' && hasSectionAccess(user, 'companies'));
}

function canManageReports(user) {
  return user.role === 'owner' || (user.role === 'admin' && hasSectionAccess(user, 'reports'));
}

function canManageUsers(user) {
  return user.role === 'owner' || (user.role === 'admin' && hasSectionAccess(user, 'employees'));
}

function visibleSectionIds(user) {
  if (user.role === 'owner') return allSectionIds();
  return normalizeAllowedSections(user.allowedSections || []);
}

function visiblePointsFor(user) {
  if (user.role === 'owner') return POINTS;
  const allowed = new Set(normalizeAllowedPoints(user.allowedPoints || []));
  return POINTS.filter((point) => allowed.has(point.id));
}

function hasSectionAccess(user, sectionId) {
  if (user.role === 'owner') return true;
  return visibleSectionIds(user).includes(sectionId);
}

function hasPointAccess(user, pointId) {
  if (user.role === 'owner') return true;
  return visiblePointsFor(user).some((point) => point.id === pointId);
}

function requireSectionAccess(user, sectionId) {
  if (!hasSectionAccess(user, sectionId)) {
    throw new ApiError(403, 'Нет доступа к этому разделу.');
  }
}

function requirePointAccess(user, pointId) {
  if (!hasPointAccess(user, pointId)) {
    throw new ApiError(403, 'Нет доступа к этой торговой точке.');
  }
}

function assertCanGrantAccess(actor, employee) {
  if (actor.role === 'owner') return;
  const actorSections = new Set(visibleSectionIds(actor));
  const actorPoints = new Set(visiblePointsFor(actor).map((point) => point.id));
  const extraSections = employee.allowedSections.filter((section) => !actorSections.has(section));
  const extraPoints = employee.allowedPoints.filter((pointId) => !actorPoints.has(pointId));

  if (extraSections.length || extraPoints.length) {
    throw new ApiError(403, 'Нельзя выдать доступ шире собственного.');
  }
}

function assertCanAssignCompanyPoints(actor, pointIds) {
  if (actor.role === 'owner') return;
  const actorPoints = new Set(visiblePointsFor(actor).map((point) => point.id));
  const extraPoints = normalizeAllowedPoints(pointIds || []).filter((pointId) => !actorPoints.has(pointId));
  if (extraPoints.length) {
    throw new ApiError(403, 'Нельзя привязать компанию к торговой точке без собственного доступа.');
  }
}

function visibleCompaniesForActor(actor, companies) {
  if (actor.role === 'owner') return companies;
  const allowedPointIds = new Set(visiblePointsFor(actor).map((point) => point.id));
  return companies.filter((company) => {
    const pointIds = normalizeAllowedPoints(company.pointIds || []);
    return !pointIds.length || pointIds.some((pointId) => allowedPointIds.has(pointId));
  });
}

function assertCanViewCompany(actor, company) {
  if (visibleCompaniesForActor(actor, [company]).length) return;
  throw new ApiError(403, 'Нет доступа к этой компании.');
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

function validateRegistration(input, options = {}) {
  const errors = [];
  const hasSeparateName = options.requireSeparateName
    || (!normalizeText(input.fullName) && ['lastName', 'firstName', 'middleName'].some((field) => normalizeText(input[field])));
  let nameParts = { fullName: normalizeText(input.fullName), lastName: '', firstName: '', middleName: '' };
  let phone = '';
  const email = normalizeEmail(input.email);

  try {
    nameParts = normalizeNameParts(input, { requireSeparate: hasSeparateName });
  } catch (error) {
    errors.push(...(Array.isArray(error.details) ? error.details : [error.message]));
  }

  try {
    phone = normalizeRussianPhone(input.phone);
  } catch {
    errors.push('Укажите телефон в формате +7 (xxx) xxx-xx-xx.');
  }

  if (!email) {
    errors.push('Email обязателен.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 180) {
    errors.push('Укажите корректный email.');
  }

  if (errors.length) {
    throw new ApiError(400, 'Проверьте заполнение полей.', errors);
  }

  return { ...nameParts, phone, email };
}

function validateEmployeeRecord(input, options = {}) {
  const base = validateRegistration(input);
  const position = normalizeText(input.position);
  const officialSalary = normalizeOptionalNumber(input.officialSalary, 'Оф. оклад');
  const unofficialSalary = normalizeOptionalNumber(input.unofficialSalary, 'Неоф. оклад');
  const hireDate = normalizeDateInput(input.hireDate);
  const officialEmployment = parseBoolean(input.officialEmployment);
  const hasPremiumHistory = Object.prototype.hasOwnProperty.call(input, 'premiumHistory');
  const premiumHistory = hasPremiumHistory
    ? normalizePremiumHistory(input.premiumHistory, { strict: true })
    : null;
  const premium = hasPremiumHistory
    ? premiumFieldsFromHistory(premiumHistory)
    : normalizePremiumFields(input);
  const role = options.allowOwner && input.role === 'owner'
    ? 'owner'
    : normalizeAccountRole(input.role || 'employee');
  const allowedSections = role === 'owner'
    ? allSectionIds()
    : normalizeAllowedSections(input.allowedSections || []);
  const allowedPoints = normalizeAllowedPointsForRole(role, input.allowedPoints || []);

  if (position.length > 120) {
    throw new ApiError(400, 'Должность слишком длинная.');
  }

  return {
    ...base,
    position,
    officialSalary,
    unofficialSalary,
    hireDate,
    officialEmployment,
    premiumEnabled: premium.premiumEnabled,
    premiumAmount: premium.premiumAmount,
    premiumStartDate: premium.premiumStartDate,
    premiumHistory: hasPremiumHistory ? premiumHistory : premiumHistoryFromFields(premium),
    premiumHistoryMode: hasPremiumHistory ? 'replace' : 'merge',
    role,
    allowedSections,
    allowedPoints,
  };
}

function normalizeNameParts(input, options = {}) {
  const lastName = normalizeText(input.lastName);
  const firstName = normalizeText(input.firstName);
  const middleName = normalizeText(input.middleName);
  const fullName = normalizeText(input.fullName);
  const errors = [];

  if (options.requireSeparate) {
    if (!lastName) errors.push('Фамилия обязательна.');
    if (!firstName) errors.push('Имя обязательно.');
    if (!middleName) errors.push('Отчество обязательно.');
    for (const [label, value] of [
      ['Фамилия', lastName],
      ['Имя', firstName],
      ['Отчество', middleName],
    ]) {
      if (value.length > 60) errors.push(`${label} слишком длинное.`);
    }
    const combinedName = [lastName, firstName, middleName].filter(Boolean).join(' ');
    if (combinedName.length > 120) errors.push('ФИО слишком длинное.');
    if (errors.length) throw new ApiError(400, 'Проверьте заполнение ФИО.', errors);
    return {
      fullName: combinedName,
      lastName,
      firstName,
      middleName,
    };
  }

  if (!fullName) {
    errors.push('ФИО обязательно.');
  } else if (fullName.length < 5 || fullName.split(/\s+/).length < 2) {
    errors.push('Укажите ФИО минимум из двух слов.');
  } else if (fullName.length > 120) {
    errors.push('ФИО слишком длинное.');
  }
  if (errors.length) throw new ApiError(400, 'Проверьте заполнение ФИО.', errors);
  const parts = fullName.split(/\s+/);
  return {
    fullName,
    lastName: lastName || parts[0] || '',
    firstName: firstName || parts[1] || '',
    middleName: middleName || parts.slice(2).join(' '),
  };
}

function normalizeRussianPhone(value) {
  const raw = normalizeText(value);
  if (!raw) throw new ApiError(400, 'Номер телефона обязателен.');
  const digits = raw.replace(/\D/g, '');
  let national = digits;
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    national = digits.slice(1);
  }
  if (national.length !== 10) {
    throw new ApiError(400, 'Укажите телефон в формате +7 (xxx) xxx-xx-xx.');
  }
  return `+7 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8)}`;
}

function safeNormalizeRussianPhone(value) {
  try {
    return normalizeRussianPhone(value);
  } catch {
    return '';
  }
}

function normalizeAccountRole(role) {
  if (['employee', 'admin', 'installer', 'partner'].includes(role)) return role;
  throw new ApiError(400, 'Неизвестный тип учетной записи.');
}

function normalizePremiumFields(input) {
  const premiumEnabled = parseBoolean(input.premiumEnabled);
  const premiumStartDate = normalizeDateInput(input.premiumStartDate);
  const premiumAmount = premiumEnabled
    ? normalizeOptionalNumber(input.premiumAmount, 'Премия')
    : '';

  if (premiumEnabled && !premiumAmount) {
    throw new ApiError(400, 'Укажите размер премии.');
  }
  if (premiumEnabled && !premiumStartDate) {
    throw new ApiError(400, 'Укажите дату начала действия премии.');
  }

  return { premiumEnabled, premiumAmount, premiumStartDate };
}

function premiumHistoryFromFields(premium) {
  if (!premium.premiumStartDate) return [];
  return [{
    active: Boolean(premium.premiumEnabled && premium.premiumAmount),
    amount: premium.premiumEnabled ? premium.premiumAmount : '',
    startDate: premium.premiumStartDate,
  }];
}

function normalizePremiumHistory(history, options = {}) {
  if (!Array.isArray(history)) return [];
  const strict = Boolean(options.strict);
  const byDate = new Map();
  for (const item of history) {
    const startDate = normalizeDateInput(item?.startDate);
    if (!startDate) {
      if (strict && (parseBoolean(item?.active) || normalizeText(item?.amount))) {
        throw new ApiError(400, 'Укажите дату начала премии.');
      }
      continue;
    }
    const active = parseBoolean(item.active);
    const amount = active ? normalizeOptionalNumber(item.amount, 'Премия') : '';
    if (active && !amount) {
      if (strict) throw new ApiError(400, 'Укажите размер премии.');
      continue;
    }
    byDate.set(startDate, { active, amount, startDate });
  }
  return Array.from(byDate.values()).sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function premiumFieldsFromHistory(history) {
  const latest = normalizePremiumHistory(history).at(-1);
  if (!latest) {
    return { premiumEnabled: false, premiumAmount: '', premiumStartDate: '' };
  }
  return {
    premiumEnabled: Boolean(latest.active && latest.amount),
    premiumAmount: latest.active ? latest.amount : '',
    premiumStartDate: latest.startDate,
  };
}

function premiumHistoryForUser(user) {
  const history = normalizePremiumHistory(user?.premiumHistory);
  if (!history.length && user?.premiumStartDate) {
    history.push(...premiumHistoryFromFields({
      premiumEnabled: parseBoolean(user.premiumEnabled),
      premiumAmount: user.premiumAmount || '',
      premiumStartDate: user.premiumStartDate || '',
    }));
  }
  return history.sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function mergePremiumHistory(history, premium) {
  const normalized = normalizePremiumHistory(history);
  if (!premium.premiumStartDate) return normalized;

  const next = {
    active: Boolean(premium.premiumEnabled && premium.premiumAmount),
    amount: premium.premiumEnabled ? premium.premiumAmount : '',
    startDate: premium.premiumStartDate,
  };
  const byDate = new Map(normalized.map((item) => [item.startDate, item]));
  byDate.set(next.startDate, next);
  return Array.from(byDate.values()).sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function premiumForMonth(user, month) {
  if (!user) return inactivePremium();
  const history = premiumHistoryForUser(user);

  const monthEnd = new Date(`${month}-${String(getDaysInMonth(month)).padStart(2, '0')}T23:59:59Z`);
  const effective = history
    .filter((item) => new Date(`${item.startDate}T00:00:00Z`).getTime() <= monthEnd.getTime())
    .pop();

  if (!effective || !effective.active || !effective.amount) return inactivePremium();
  return {
    active: true,
    amount: effective.amount,
    startDate: effective.startDate,
  };
}

function inactivePremium() {
  return { active: false, amount: '', startDate: '' };
}

function reportDirectory() {
  return [
    { id: 'admin-payroll', title: 'Расчет ЗП админов' },
    { id: 'employee-payroll', title: 'Расчет ЗП сотрудников' },
  ];
}

function normalizeReportMonth(value) {
  const month = normalizeText(value);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new ApiError(400, 'Укажите месяц отчета в формате ГГГГ-ММ.');
  }
  getDaysInMonth(month);
  return month;
}

function normalizeReports(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const adminPayroll = source.adminPayroll && typeof source.adminPayroll === 'object' && !Array.isArray(source.adminPayroll)
    ? source.adminPayroll
    : {};
  const normalizedAdminPayroll = {};

  for (const [month, report] of Object.entries(adminPayroll)) {
    try {
      const normalizedMonth = normalizeReportMonth(month);
      normalizedAdminPayroll[normalizedMonth] = {
        updatedAt: normalizeText(report?.updatedAt),
        rows: normalizeAdminPayrollSavedRows(report?.rows || {}),
      };
    } catch {
      // Ignore malformed historical report buckets instead of blocking all reports.
    }
  }

  return {
    adminPayroll: normalizedAdminPayroll,
  };
}

function normalizeAdminPayrollSavedRows(rows) {
  const normalized = {};

  if (Array.isArray(rows)) {
    for (const row of rows) {
      const employeeId = normalizeText(row?.employeeId);
      if (!employeeId) continue;
      normalized[employeeId] = normalizeAdminPayrollManualRow({ ...row, employeeId });
    }
    return normalized;
  }

  if (rows && typeof rows === 'object') {
    for (const [employeeId, row] of Object.entries(rows)) {
      const id = normalizeText(row?.employeeId || employeeId);
      if (!id) continue;
      normalized[id] = normalizeAdminPayrollManualRow({ ...row, employeeId: id });
    }
  }

  return normalized;
}

function normalizeAdminPayrollManualRows(rows) {
  if (!Array.isArray(rows)) {
    throw new ApiError(400, 'Строки отчета должны быть массивом.');
  }

  const normalized = {};
  for (const row of rows) {
    const employeeId = normalizeText(row?.employeeId);
    if (!employeeId) continue;
    normalized[employeeId] = normalizeAdminPayrollManualRow(row);
  }
  return normalized;
}

function normalizeAdminPayrollManualRow(row) {
  return {
    employeeId: normalizeText(row?.employeeId),
    advanceCard: normalizeOptionalNumber(row?.advanceCard, 'Аванс на карту'),
    salaryCard: normalizeOptionalNumber(row?.salaryCard, 'ЗП на карту'),
    advanceExtra: normalizeOptionalNumber(row?.advanceExtra, 'Аванс экстра'),
    fines: normalizeOptionalNumber(row?.fines, 'Штрафы'),
    comment: normalizeLimitedText(row?.comment, 500, 'Комментарий'),
  };
}

function buildAdminPayrollReport(users, reports, month) {
  const normalizedReports = normalizeReports(reports);
  const saved = normalizedReports.adminPayroll[month] || { rows: {}, updatedAt: '' };
  const manualRows = normalizeAdminPayrollSavedRows(saved.rows || {});
  const rows = users
    .filter((user) => user.role === 'admin')
    .sort((left, right) => String(left.fullName || '').localeCompare(String(right.fullName || ''), 'ru'))
    .map((user) => {
      const manual = manualRows[user.id] || {};
      const pointsCount = normalizeAllowedPoints(user.allowedPoints || []).length;
      const bonusPoints = pointsCount * 3000;
      const unofficialSalary = reportMoneyNumber(user.unofficialSalary);
      const premium = premiumForMonth(user, month);
      const premiumAmount = premium.active ? reportMoneyNumber(premium.amount) : 0;
      const advanceCard = reportMoneyNumber(manual.advanceCard);
      const salaryCard = reportMoneyNumber(manual.salaryCard);
      const advanceExtra = reportMoneyNumber(manual.advanceExtra);
      const fines = reportMoneyNumber(manual.fines);
      const payable = unofficialSalary + premiumAmount + bonusPoints
        - advanceCard - salaryCard - fines - advanceExtra;

      return {
        employeeId: user.id,
        fullName: user.fullName || '',
        pointsCount,
        bonusPoints: reportMoneyString(bonusPoints),
        unofficialSalary: reportMoneyString(unofficialSalary),
        premium: reportMoneyString(premiumAmount),
        advanceCard: manual.advanceCard || '',
        salaryCard: manual.salaryCard || '',
        advanceExtra: manual.advanceExtra || '',
        fines: manual.fines || '',
        payable: reportMoneyString(payable),
        comment: manual.comment || '',
      };
    });

  return {
    id: 'admin-payroll',
    title: 'Расчет ЗП админов',
    month,
    rows,
    updatedAt: saved.updatedAt || '',
  };
}

function reportMoneyNumber(value) {
  return toNumber(value);
}

function reportMoneyString(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return String(Math.round((number + Number.EPSILON) * 100) / 100);
}

function normalizeAllowedSections(value) {
  const valid = new Set(allSectionIds());
  return arrayFromInput(value).filter((item, index, array) => {
    return valid.has(item) && array.indexOf(item) === index;
  });
}

function normalizeAllowedPoints(value) {
  const valid = new Set(allPointIds());
  return arrayFromInput(value).filter((item, index, array) => {
    return valid.has(item) && array.indexOf(item) === index;
  });
}

function normalizeAllowedPointsForRole(role, value) {
  if (role === 'owner') return allPointIds();
  return normalizeAllowedPoints(value || []);
}

function assertUniqueAdminPointAssignments(users, candidate) {
  if (!candidate || candidate.role !== 'admin') return;
  const candidatePoints = normalizeAllowedPoints(candidate.allowedPoints || []);
  if (!candidatePoints.length) return;
  const candidateId = normalizeText(candidate.id);

  for (const user of Array.isArray(users) ? users : []) {
    if (!user || user.role !== 'admin' || normalizeText(user.id) === candidateId) continue;
    const duplicatePoint = normalizeAllowedPoints(user.allowedPoints || [])
      .find((pointId) => candidatePoints.includes(pointId));
    if (duplicatePoint) {
      throw new ApiError(409, `Торговая точка ${pointName(duplicatePoint)} уже закреплена за администратором ${user.fullName}.`);
    }
  }
}

function arrayFromInput(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [normalizeText(value)].filter(Boolean);
}

function allSectionIds() {
  return ACCESS_SECTIONS.map((section) => section.id);
}

function allPointIds() {
  return POINTS.map((point) => point.id);
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

function createCaptchaChallenge() {
  const left = crypto.randomInt(2, 10);
  const right = crypto.randomInt(2, 10);
  const operation = crypto.randomInt(2) === 0 ? '+' : '-';
  const operands = operation === '-' && right > left
    ? { left: right, right: left }
    : { left, right };
  const issuedAt = Date.now();
  const payload = {
    v: 1,
    ...operands,
    operation,
    issuedAt,
    expiresAt: issuedAt + CAPTCHA_TTL_MS,
    nonce: crypto.randomBytes(12).toString('base64url'),
  };
  return {
    token: signCaptchaPayload(payload),
    question: `${payload.left} ${payload.operation} ${payload.right} = ?`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

function verifyCaptcha(token, answer) {
  const payload = parseCaptchaToken(token);
  if (!payload || Date.now() > Number(payload.expiresAt || 0)) {
    throw new ApiError(400, 'Captcha устарела. Обновите проверку и попробуйте снова.');
  }
  const expected = payload.operation === '-'
    ? Number(payload.left) - Number(payload.right)
    : Number(payload.left) + Number(payload.right);
  const normalizedAnswer = Number(String(answer || '').trim().replace(',', '.'));
  if (!Number.isFinite(normalizedAnswer) || normalizedAnswer !== expected) {
    throw new ApiError(400, 'Captcha решена неверно.');
  }
  return true;
}

function signCaptchaPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', captchaSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

function parseCaptchaToken(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  const expectedSignature = crypto
    .createHmac('sha256', captchaSecret())
    .update(body)
    .digest('base64url');
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function captchaSecret() {
  return process.env.CAPTCHA_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || 'crmzona-development-captcha-secret';
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
    lastName: user.lastName || '',
    firstName: user.firstName || '',
    middleName: user.middleName || '',
    phone: user.phone,
    email: user.email,
    position: user.position || '',
    officialSalary: user.officialSalary || '',
    unofficialSalary: user.unofficialSalary || '',
    hireDate: user.hireDate || '',
    officialEmployment: Boolean(user.officialEmployment),
    premiumEnabled: parseBoolean(user.premiumEnabled),
    premiumAmount: user.premiumAmount || '',
    premiumStartDate: user.premiumStartDate || '',
    premiumHistory: premiumHistoryForUser(user),
    employeeDocuments: normalizeEmployeeDocuments(user.employeeDocuments).map(sanitizeEmployeeDocument),
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || user.role,
    allowedSections: user.role === 'owner' ? allSectionIds() : normalizeAllowedSections(user.allowedSections || []),
    allowedPoints: normalizeAllowedPointsForRole(user.role, user.allowedPoints || []),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function normalizeEmployeeDocuments(documents) {
  if (!Array.isArray(documents)) return [];
  return documents
    .filter((document) => document && normalizeText(document.id))
    .map((document) => {
      const type = normalizeText(document.type);
      const typeMeta = EMPLOYEE_DOCUMENT_TYPES.find((item) => item.value === type);
      return {
        id: normalizeText(document.id),
        type: typeMeta?.value || type || 'other',
        typeLabel: typeMeta?.label || normalizeText(document.typeLabel) || 'Прочие документы',
        fileName: safeFileName(document.fileName || document.originalFileName || 'document.pdf'),
        originalFileName: safeFileName(document.originalFileName || document.fileName || 'document.pdf'),
        mimeType: normalizeText(document.mimeType) || 'application/octet-stream',
        size: Number(document.size) || 0,
        googleDrive: document.googleDrive || null,
        createdAt: document.createdAt || '',
        createdBy: normalizeText(document.createdBy),
        createdByName: normalizeText(document.createdByName),
      };
    });
}

function sanitizeEmployeeDocument(document) {
  const normalized = normalizeEmployeeDocuments([document])[0] || {};
  return {
    id: normalized.id,
    type: normalized.type,
    typeLabel: normalized.typeLabel,
    fileName: normalized.fileName,
    originalFileName: normalized.originalFileName,
    mimeType: normalized.mimeType,
    size: normalized.size,
    googleDrive: normalized.googleDrive || {
      status: 'unknown',
      fileId: '',
      webViewLink: '',
      reason: 'Статус Google Drive неизвестен.',
    },
    createdAt: normalized.createdAt,
    createdByName: normalized.createdByName,
  };
}

function normalizeRetailPoints(points, options = {}) {
  const includeDefaults = options.includeDefaults !== false;
  const byId = new Map();
  if (includeDefaults) {
    for (const point of DEFAULT_RETAIL_POINTS) {
      byId.set(point.id, normalizeRetailPoint(point));
    }
  }
  if (Array.isArray(points)) {
    for (const point of points) {
      const normalized = normalizeRetailPoint(point);
      if (normalized.id) byId.set(normalized.id, normalized);
    }
  }
  return [...byId.values()];
}

let retailPointSeedCache = null;

function loadRetailPointSeeds() {
  if (retailPointSeedCache) return retailPointSeedCache;
  try {
    const records = JSON.parse(fs.readFileSync(RETAIL_POINT_SEED_FILE, 'utf8'));
    retailPointSeedCache = Array.isArray(records)
      ? records.map(normalizeRetailPointSeed).filter(Boolean)
      : [];
  } catch {
    retailPointSeedCache = [];
  }
  return retailPointSeedCache;
}

function normalizeRetailPointSeed(record) {
  const name = normalizeText(record?.name);
  if (!name) return null;
  return normalizeRetailPoint({
    ...record,
    id: normalizeText(record?.id) || retailPointSeedId(name),
  });
}

function retailPointSeedId(name) {
  return `retail_seed_${crypto.createHash('sha1').update(name).digest('hex').slice(0, 12)}`;
}

function mergeRetailPointSeeds(points) {
  const normalized = normalizeRetailPoints(points);
  const byId = new Map(normalized.map((point) => [point.id, point]));
  const byName = new Map(normalized.map((point) => [retailPointSeedKey(point.name), point]));
  let changed = false;

  for (const seed of loadRetailPointSeeds()) {
    if (!seed.name) continue;
    const existing = byId.get(seed.id) || byName.get(retailPointSeedKey(seed.name));
    if (existing) {
      if (fillRetailPointFromSeed(existing, seed)) {
        changed = true;
      }
      continue;
    }

    const point = normalizeRetailPoint({
      ...seed,
      documents: [],
      createdAt: seed.createdAt || new Date(0).toISOString(),
      updatedAt: seed.updatedAt || new Date(0).toISOString(),
    });
    normalized.push(point);
    byId.set(point.id, point);
    byName.set(retailPointSeedKey(point.name), point);
    changed = true;
  }

  return { points: normalized, changed };
}

function fillRetailPointFromSeed(target, seed) {
  let changed = false;
  for (const key of ['address', 'landlord', 'legalEntity', 'rentCost', 'ownerName', 'phone', 'email', 'comment']) {
    if (fillBlankRetailPointField(target, key, seed[key])) changed = true;
  }
  for (const key of ['provider', 'payment', 'contractNumber', 'contractHolder', 'tariff', 'login', 'password']) {
    if (fillBlankRetailPointField(target.internet, key, seed.internet?.[key])) changed = true;
    if (fillBlankRetailPointField(target.video, key, seed.video?.[key])) changed = true;
  }
  if (changed) {
    target.updatedAt = target.updatedAt || new Date(0).toISOString();
  }
  return changed;
}

function fillBlankRetailPointField(target, key, value) {
  if (!target) return false;
  const current = normalizeText(target[key]);
  const next = normalizeText(value);
  if (current || !next) return false;
  target[key] = next;
  return true;
}

function retailPointSeedKey(value) {
  return normalizeText(value).toLowerCase();
}

async function syncRuntimePointsFromStore(store) {
  try {
    const points = mergeRetailPointSeeds(await maybeAwait(store.loadJson('retail_points.json', DEFAULT_RETAIL_POINTS))).points;
    syncRuntimePoints(points);
  } catch {
    syncRuntimePoints(DEFAULT_RETAIL_POINTS);
  }
}

function syncRuntimePoints(points) {
  const normalized = normalizeRetailPoints(points);
  POINTS.splice(0, POINTS.length, ...normalized.map((point) => ({
    id: point.id,
    name: point.name,
  })));
}

function normalizeRetailPoint(point) {
  const normalized = {
    id: normalizeText(point?.id),
    name: normalizeText(point?.name),
    address: normalizeText(point?.address),
    landlord: normalizeText(point?.landlord),
    legalEntity: normalizeText(point?.legalEntity),
    rentCost: normalizeText(point?.rentCost),
    ownerName: normalizeText(point?.ownerName),
    phone: normalizeText(point?.phone),
    email: normalizeEmail(point?.email),
    comment: normalizeText(point?.comment),
    curatorAdminId: normalizeText(point?.curatorAdminId),
    internet: normalizeRetailPointInternet(point?.internet || point || {}),
    video: normalizeRetailPointVideo(point?.video || point || {}),
    documents: normalizeRetailPointDocuments(point?.documents),
    createdAt: point?.createdAt || '',
    updatedAt: point?.updatedAt || '',
    updatedBy: normalizeText(point?.updatedBy),
  };
  return normalized;
}

function sanitizeRetailPoint(point) {
  const normalized = normalizeRetailPoint(point);
  return {
    ...normalized,
    curatorAdminName: normalizeText(point?.curatorAdminName),
    documents: normalized.documents.map(sanitizeRetailPointDocument),
  };
}

function hydrateRetailPoint(point, users) {
  const sanitized = sanitizeRetailPoint(point);
  const admin = retailPointAdminUsers(users).find((user) => (
    normalizeAllowedPoints(user.allowedPoints || []).includes(sanitized.id)
  ));
  return {
    ...sanitized,
    curatorAdminId: admin ? admin.id : '',
    curatorAdminName: admin ? admin.fullName : '',
  };
}

function normalizeRetailPointDocuments(documents) {
  if (!Array.isArray(documents)) return [];
  return documents
    .filter((document) => document && normalizeText(document.id))
    .map((document) => ({
      id: normalizeText(document.id),
      fileName: safeFileName(document.fileName || document.originalFileName || 'document.pdf'),
      originalFileName: safeFileName(document.originalFileName || document.fileName || 'document.pdf'),
      mimeType: normalizeText(document.mimeType) || 'application/octet-stream',
      size: Number(document.size) || 0,
      googleDrive: document.googleDrive || null,
      createdAt: document.createdAt || '',
      createdBy: normalizeText(document.createdBy),
      createdByName: normalizeText(document.createdByName),
    }));
}

function sanitizeRetailPointDocument(document) {
  const normalized = normalizeRetailPointDocuments([document])[0] || {};
  return {
    id: normalized.id,
    fileName: normalized.fileName,
    originalFileName: normalized.originalFileName,
    mimeType: normalized.mimeType,
    size: normalized.size,
    googleDrive: normalized.googleDrive || {
      status: 'unknown',
      fileId: '',
      webViewLink: '',
      reason: 'Статус Google Drive неизвестен.',
    },
    createdAt: normalized.createdAt,
    createdByName: normalized.createdByName,
  };
}

function normalizeCompanies(companies, options = {}) {
  const includeDefaults = options.includeDefaults !== false;
  const byId = new Map();
  if (includeDefaults) {
    for (const company of DEFAULT_COMPANIES) {
      byId.set(company.id, normalizeCompany(company));
    }
  }
  if (Array.isArray(companies)) {
    for (const company of companies) {
      const normalized = normalizeCompany(company);
      if (normalized.id) byId.set(normalized.id, normalized);
    }
  }
  return [...byId.values()];
}

function normalizeCompany(company) {
  return {
    id: normalizeText(company?.id),
    name: normalizeText(company?.name),
    shortName: normalizeText(company?.shortName),
    legalAddress: normalizeText(company?.legalAddress),
    actualAddress: normalizeText(company?.actualAddress),
    postalAddress: normalizeText(company?.postalAddress),
    inn: normalizeText(company?.inn),
    ogrnip: normalizeText(company?.ogrnip || company?.ogrn),
    okpo: normalizeText(company?.okpo),
    okato: normalizeText(company?.okato),
    oktmo: normalizeText(company?.oktmo),
    okved: normalizeText(company?.okved),
    director: normalizeText(company?.director || company?.ownerName),
    phone: normalizeText(company?.phone),
    email: normalizeEmail(company?.email),
    bankName: normalizeText(company?.bankName),
    bankBik: normalizeText(company?.bankBik || company?.bik),
    bankAccount: normalizeText(company?.bankAccount || company?.account),
    bankCorrespondentAccount: normalizeText(company?.bankCorrespondentAccount || company?.correspondentAccount),
    bankInn: normalizeText(company?.bankInn),
    bankKpp: normalizeText(company?.bankKpp),
    pointIds: normalizeAllowedPoints(company?.pointIds || company?.points || []),
    documents: normalizeCompanyDocuments(company?.documents),
    createdAt: company?.createdAt || '',
    updatedAt: company?.updatedAt || '',
    updatedBy: normalizeText(company?.updatedBy),
  };
}

function hydrateCompany(company) {
  const normalized = normalizeCompany(company);
  return {
    ...normalized,
    pointNames: normalized.pointIds.map(pointName).filter(Boolean),
    documents: normalized.documents.map(sanitizeCompanyDocument),
  };
}

function normalizeCompanyDocuments(documents) {
  if (!Array.isArray(documents)) return [];
  return documents
    .filter((document) => document && normalizeText(document.id))
    .map((document) => ({
      id: normalizeText(document.id),
      fileName: safeFileName(document.fileName || document.originalFileName || 'document.pdf'),
      originalFileName: safeFileName(document.originalFileName || document.fileName || 'document.pdf'),
      mimeType: normalizeText(document.mimeType) || 'application/octet-stream',
      size: Number(document.size) || 0,
      googleDrive: document.googleDrive || null,
      createdAt: document.createdAt || '',
      createdBy: normalizeText(document.createdBy),
      createdByName: normalizeText(document.createdByName),
    }));
}

function sanitizeCompanyDocument(document) {
  const normalized = normalizeCompanyDocuments([document])[0] || {};
  return {
    id: normalized.id,
    fileName: normalized.fileName,
    originalFileName: normalized.originalFileName,
    mimeType: normalized.mimeType,
    size: normalized.size,
    googleDrive: normalized.googleDrive || {
      status: 'unknown',
      fileId: '',
      webViewLink: '',
      reason: 'Статус Google Drive неизвестен.',
    },
    createdAt: normalized.createdAt,
    createdByName: normalized.createdByName,
  };
}

function normalizeClaims(claims) {
  if (!Array.isArray(claims)) return [];
  const normalized = [];
  for (const claim of claims) {
    try {
      const item = normalizeClaimRecord(claim);
      if (item.id) normalized.push(item);
    } catch {
      // Ignore malformed legacy rows instead of blocking the whole directory.
    }
  }
  return normalized;
}

function normalizeClaimRecord(claim) {
  return {
    id: normalizeText(claim?.id),
    date: normalizeDateInput(claim?.date || claim?.claimDate),
    amount: normalizeOptionalNumber(claim?.amount, 'Сумма претензии'),
    pointId: POINTS.some((point) => point.id === claim?.pointId) ? claim.pointId : '',
    claimNumber: normalizeLimitedText(claim?.claimNumber, 120, 'Номер претензии'),
    company: normalizeLimitedText(claim?.company, 160, 'Компания'),
    guiltyEmployeeId: normalizeText(claim?.guiltyEmployeeId),
    guiltyEmployeeName: normalizeLimitedText(claim?.guiltyEmployeeName, 120, 'Виновный сотрудник'),
    comment: normalizeLimitedText(claim?.comment, 1000, 'Комментарий'),
    createdBy: normalizeText(claim?.createdBy),
    createdByName: normalizeLimitedText(claim?.createdByName, 120, 'Автор'),
    createdAt: claim?.createdAt || '',
    updatedAt: claim?.updatedAt || '',
    updatedBy: normalizeText(claim?.updatedBy),
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
  return ['employee', 'admin', 'installer', 'partner'].map((value) => ({ value, label: ROLE_LABELS[value] }));
}

function retailPointAdminUsers(users) {
  return (Array.isArray(users) ? users : [])
    .filter((user) => user.role === 'admin')
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'ru'));
}

function retailPointAdminOptions(users) {
  return retailPointAdminUsers(users).map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
  }));
}

function retailPointCompanyOptions(companies, actor = null) {
  const source = actor
    ? visibleCompaniesForActor(actor, normalizeCompanies(companies))
    : normalizeCompanies(companies);
  const byValue = new Map();

  for (const company of source) {
    const value = normalizeText(company.shortName || company.name);
    if (!value) continue;
    const key = value.toLowerCase();
    if (!byValue.has(key)) {
      byValue.set(key, {
        value,
        label: value,
        companyId: company.id,
        shortName: company.shortName || '',
        name: company.name || '',
      });
    }
  }

  return [...byValue.values()].sort((left, right) => left.label.localeCompare(right.label, 'ru'));
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

function validateRetailPointRecord(input, users = []) {
  const name = normalizeText(input.name);
  if (!name) {
    throw new ApiError(400, 'Укажите название торговой точки.');
  }
  if (name.length > 120) {
    throw new ApiError(400, 'Название торговой точки слишком длинное.');
  }
  const email = normalizeEmail(input.email);
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 180)) {
    throw new ApiError(400, 'Укажите корректный email торговой точки.');
  }
  const phone = normalizeText(input.phone);
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 18 || !/^[+\d\s().-]+$/.test(phone)) {
      throw new ApiError(400, 'Укажите корректный телефон торговой точки.');
    }
  }
  const curatorAdminId = '';

  return {
    name,
    address: normalizeLimitedText(input.address, 240, 'Адрес помещения'),
    landlord: normalizeLimitedText(input.landlord, 160, 'Арендодатель'),
    legalEntity: normalizeLimitedText(input.legalEntity, 160, 'Юр.лицо'),
    rentCost: normalizeOptionalNumber(input.rentCost, 'Стоимость аренды'),
    ownerName: normalizeLimitedText(input.ownerName, 160, 'Имя собственника'),
    phone,
    email,
    comment: normalizeLimitedText(input.comment, 1000, 'Комментарий'),
    curatorAdminId,
    internet: normalizeRetailPointInternet(input.internet || input),
    video: normalizeRetailPointVideo(input.video || input),
  };
}

function normalizeRetailPointInternet(input) {
  return {
    provider: normalizeLimitedText(input.provider, 160, 'Провайдер'),
    payment: normalizePointPayment(input.payment),
    contractNumber: normalizeLimitedText(input.contractNumber, 120, 'Номер договора/л/с'),
    contractHolder: normalizeLimitedText(input.contractHolder, 160, 'На ком договор'),
    tariff: normalizeLimitedText(input.tariff, 160, 'Тариф'),
    login: normalizeLimitedText(input.login, 160, 'Логин'),
    password: normalizeLimitedText(input.password, 160, 'Пароль'),
  };
}

function normalizeRetailPointVideo(input) {
  return {
    operator: normalizeLimitedText(input.operator, 160, 'Оператор видеонаблюдения'),
    camerasCount: normalizeOptionalInteger(input.camerasCount, 'Кол-во камер'),
    contractNumber: normalizeLimitedText(input.contractNumber, 120, 'Номер договора'),
    contractHolder: normalizeLimitedText(input.contractHolder, 160, 'На ком договор'),
    tariff: normalizeLimitedText(input.tariff, 160, 'Тариф'),
    login: normalizeLimitedText(input.login, 160, 'Логин'),
    password: normalizeLimitedText(input.password, 160, 'Пароль'),
  };
}

function normalizePointPayment(value) {
  const payment = normalizeText(value);
  if (!payment) return '';
  if (!POINT_PAYMENT_METHODS.some((item) => item.value === payment)) {
    throw new ApiError(400, 'Выберите способ оплаты интернета.');
  }
  return payment;
}

function normalizeLimitedText(value, maxLength, label) {
  const text = normalizeText(value);
  if (text.length > maxLength) {
    throw new ApiError(400, `${label} слишком длинное.`);
  }
  return text;
}

function validateCompanyRecord(input) {
  const name = normalizeLimitedText(input.name, 240, 'Полное наименование');
  const shortName = normalizeLimitedText(input.shortName, 120, 'Краткое наименование');
  if (!name) {
    throw new ApiError(400, 'Укажите полное наименование компании.');
  }
  if (!shortName) {
    throw new ApiError(400, 'Укажите краткое наименование компании.');
  }

  const email = normalizeEmail(input.email);
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 180)) {
    throw new ApiError(400, 'Укажите корректный email компании.');
  }

  const phone = normalizeText(input.phone);
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 18 || !/^[+\d\s().-]+$/.test(phone)) {
      throw new ApiError(400, 'Укажите корректный телефон компании.');
    }
  }

  return {
    name,
    shortName,
    legalAddress: normalizeLimitedText(input.legalAddress, 300, 'Юридический адрес'),
    actualAddress: normalizeLimitedText(input.actualAddress, 300, 'Фактический адрес'),
    postalAddress: normalizeLimitedText(input.postalAddress, 300, 'Почтовый адрес'),
    inn: normalizeLimitedText(input.inn, 32, 'ИНН'),
    ogrnip: normalizeLimitedText(input.ogrnip || input.ogrn, 32, 'ОГРНИП/ОГРН'),
    okpo: normalizeLimitedText(input.okpo, 32, 'ОКПО'),
    okato: normalizeLimitedText(input.okato, 32, 'ОКАТО'),
    oktmo: normalizeLimitedText(input.oktmo, 32, 'ОКТМО'),
    okved: normalizeLimitedText(input.okved, 64, 'ОКВЭД'),
    director: normalizeLimitedText(input.director, 160, 'Руководитель'),
    phone,
    email,
    bankName: normalizeLimitedText(input.bankName, 180, 'Банк'),
    bankBik: normalizeLimitedText(input.bankBik || input.bik, 32, 'БИК'),
    bankAccount: normalizeLimitedText(input.bankAccount || input.account, 40, 'Расчетный счет'),
    bankCorrespondentAccount: normalizeLimitedText(input.bankCorrespondentAccount || input.correspondentAccount, 40, 'Корреспондентский счет'),
    bankInn: normalizeLimitedText(input.bankInn, 32, 'ИНН банка'),
    bankKpp: normalizeLimitedText(input.bankKpp, 32, 'КПП банка'),
    pointIds: normalizeAllowedPoints(input.pointIds || []),
  };
}

function companyDuplicateMatches(existing, company) {
  const left = normalizeCompany(existing);
  const right = normalizeCompany(company);
  return Boolean(
    (left.shortName && right.shortName && left.shortName.toLowerCase() === right.shortName.toLowerCase())
    || (left.name && right.name && left.name.toLowerCase() === right.name.toLowerCase())
    || (left.inn && right.inn && left.inn === right.inn)
  );
}

function validateClaimRequest(input, users) {
  const date = normalizeDateInput(input.date || input.claimDate);
  if (!date) {
    throw new ApiError(400, 'Укажите дату претензии.');
  }
  const amount = normalizeOptionalNumber(input.amount, 'Сумма претензии');
  if (!amount || Number(amount) <= 0) {
    throw new ApiError(400, 'Укажите сумму претензии больше 0.');
  }
  const pointId = validatePoint(input.pointId);
  const claimNumber = normalizeLimitedText(input.claimNumber, 120, 'Номер претензии');
  if (!claimNumber) {
    throw new ApiError(400, 'Укажите номер претензии.');
  }
  const company = normalizeLimitedText(input.company, 160, 'Компания');
  if (!company) {
    throw new ApiError(400, 'Укажите компанию.');
  }
  const guiltyEmployeeId = normalizeText(input.guiltyEmployeeId);
  const employee = users.find((user) => user.id === guiltyEmployeeId);
  if (!employee) {
    throw new ApiError(400, 'Выберите виновного сотрудника из справочника.');
  }

  return {
    date,
    amount,
    pointId,
    claimNumber,
    company,
    guiltyEmployeeId,
    guiltyEmployeeName: employee.fullName,
    comment: normalizeLimitedText(input.comment, 1000, 'Комментарий'),
  };
}

function validateExpenseRequest(input) {
  const pointId = validatePoint(input.pointId);
  const expenseDate = normalizeExpenseDate(input.expenseDate);
  const amount = normalizeOptionalNumber(input.amount, 'Сумма расхода');
  const paymentMethod = normalizeExpensePaymentMethod(input.paymentMethod);

  if (!amount || Number(amount) <= 0) {
    throw new ApiError(400, 'Укажите сумму расхода больше 0.');
  }
  if (!input.receipt) {
    throw new ApiError(400, 'Приложите фотографию чека.');
  }

  return { pointId, expenseDate, amount, paymentMethod };
}

function normalizeExpenseDate(value) {
  if (!normalizeText(value)) {
    throw new ApiError(400, 'Укажите дату расхода.');
  }
  return normalizeDateInput(value);
}

function normalizeExpensePaymentMethod(value) {
  const method = normalizeText(value);
  if (!EXPENSE_PAYMENT_METHODS.some((item) => item.value === method)) {
    throw new ApiError(400, 'Выберите способ оплаты.');
  }
  return method;
}

function expensePaymentMethodLabel(value) {
  return EXPENSE_PAYMENT_METHODS.find((item) => item.value === value)?.label || value;
}

function normalizeEmployeeDocumentType(value) {
  const documentType = normalizeText(value);
  const option = EMPLOYEE_DOCUMENT_TYPES.find((item) => item.value === documentType);
  if (!option) {
    throw new ApiError(400, 'Выберите тип документа сотрудника.');
  }
  return option;
}

function normalizeEmployeeDocumentUpload(input) {
  const dataUrl = normalizeText(input?.dataUrl);
  const fileName = safeFileName(input?.fileName || input?.name || 'document.pdf');
  const match = dataUrl.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new ApiError(400, 'Документ должен быть файлом JPEG или PDF.');
  }

  const mimeType = match[1].toLowerCase();
  const extension = employeeDocumentExtension(mimeType);
  if (!extension) {
    throw new ApiError(400, 'Поддерживаются документы в формате JPEG или PDF.');
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) {
    throw new ApiError(400, 'Файл документа пустой.');
  }
  if (buffer.length > MAX_RECEIPT_BYTES) {
    throw new ApiError(400, 'Файл документа слишком большой. Максимум 5 МБ.');
  }

  return {
    id: crypto.randomUUID(),
    fileName,
    mimeType,
    extension,
    size: buffer.length,
    buffer,
  };
}

function employeeDocumentExtension(mimeType) {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'application/pdf') return 'pdf';
  return '';
}

function normalizeRetailPointDocumentUpload(input) {
  const dataUrl = normalizeText(input?.dataUrl);
  const fileName = safeFileName(input?.fileName || input?.name || 'document.pdf');
  const match = dataUrl.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new ApiError(400, 'Документ торговой точки должен быть изображением или PDF.');
  }

  const mimeType = match[1].toLowerCase();
  const extension = retailPointDocumentExtension(mimeType);
  if (!extension) {
    throw new ApiError(400, 'Поддерживаются документы в формате JPG, PNG, WebP или PDF.');
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) {
    throw new ApiError(400, 'Файл документа пустой.');
  }
  if (buffer.length > MAX_RECEIPT_BYTES) {
    throw new ApiError(400, 'Файл документа слишком большой. Максимум 5 МБ.');
  }

  return {
    id: crypto.randomUUID(),
    fileName,
    mimeType,
    extension,
    size: buffer.length,
    buffer,
  };
}

function normalizeCompanyDocumentUpload(input) {
  const dataUrl = normalizeText(input?.dataUrl);
  const fileName = safeFileName(input?.fileName || input?.name || 'document.pdf');
  const match = dataUrl.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new ApiError(400, 'Документ компании должен быть изображением или PDF.');
  }

  const mimeType = match[1].toLowerCase();
  const extension = retailPointDocumentExtension(mimeType);
  if (!extension) {
    throw new ApiError(400, 'Поддерживаются документы в формате JPG, PNG, WebP или PDF.');
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) {
    throw new ApiError(400, 'Файл документа пустой.');
  }
  if (buffer.length > MAX_RECEIPT_BYTES) {
    throw new ApiError(400, 'Файл документа слишком большой. Максимум 5 МБ.');
  }

  return {
    id: crypto.randomUUID(),
    fileName,
    mimeType,
    extension,
    size: buffer.length,
    buffer,
  };
}

function retailPointDocumentExtension(mimeType) {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'application/pdf') return 'pdf';
  return '';
}

function normalizeReceiptUpload(input) {
  const dataUrl = normalizeText(input?.dataUrl);
  const fileName = safeFileName(input?.fileName || input?.name || 'receipt.jpg');
  const match = dataUrl.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new ApiError(400, 'Фотография чека должна быть изображением.');
  }

  const mimeType = match[1].toLowerCase();
  const extension = receiptExtension(mimeType);
  if (!extension) {
    throw new ApiError(400, 'Поддерживаются чеки в формате JPG, PNG, WebP или PDF.');
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) {
    throw new ApiError(400, 'Файл чека пустой.');
  }
  if (buffer.length > MAX_RECEIPT_BYTES) {
    throw new ApiError(400, 'Файл чека слишком большой. Максимум 5 МБ после сжатия.');
  }

  return {
    id: crypto.randomUUID(),
    fileName,
    mimeType,
    extension,
    size: buffer.length,
    buffer,
  };
}

function receiptExtension(mimeType) {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'application/pdf') return 'pdf';
  return '';
}

function safeFileName(value) {
  const name = path.basename(String(value || 'receipt.jpg')).replace(/[^\wа-яА-ЯёЁ ._-]+/g, '_').trim();
  return name.slice(0, 120) || 'receipt.jpg';
}

async function archiveReceiptToGoogleDrive(upload, expense) {
  try {
    const accessToken = await getGoogleDriveAccessToken();
    if (!accessToken) {
      return {
        status: 'unavailable',
        sourceUnavailable: true,
        reason: 'Google Drive не настроен. Укажите GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON или GOOGLE_DRIVE_ACCESS_TOKEN.',
      };
    }

    const uploaded = await uploadReceiptToGoogleDrive(accessToken, upload, expense);
    return {
      status: 'uploaded',
      sourceUnavailable: false,
      fileId: uploaded.id || '',
      webViewLink: uploaded.webViewLink || '',
      reason: '',
    };
  } catch (error) {
    return {
      status: 'failed',
      sourceUnavailable: true,
      reason: error.message || 'Google Drive недоступен.',
    };
  }
}

async function archiveEmployeeDocumentToGoogleDrive(upload, employee, documentType) {
  try {
    const accessToken = await getGoogleDriveAccessToken();
    if (!accessToken) {
      return {
        status: 'unavailable',
        sourceUnavailable: true,
        reason: 'Google Drive не настроен.',
      };
    }

    const uploaded = await uploadEmployeeDocumentToGoogleDrive(accessToken, upload, employee, documentType);
    return {
      status: 'uploaded',
      sourceUnavailable: false,
      fileId: uploaded.id || '',
      webViewLink: uploaded.webViewLink || '',
      reason: '',
    };
  } catch (error) {
    return {
      status: 'failed',
      sourceUnavailable: true,
      reason: error.message || 'Google Drive недоступен.',
    };
  }
}

async function archiveRetailPointDocumentToGoogleDrive(upload, retailPoint) {
  try {
    const accessToken = await getGoogleDriveAccessToken();
    if (!accessToken) {
      return {
        status: 'unavailable',
        sourceUnavailable: true,
        reason: 'Google Drive не настроен.',
      };
    }

    const uploaded = await uploadRetailPointDocumentToGoogleDrive(accessToken, upload, retailPoint);
    return {
      status: 'uploaded',
      sourceUnavailable: false,
      fileId: uploaded.id || '',
      webViewLink: uploaded.webViewLink || '',
      reason: '',
    };
  } catch (error) {
    return {
      status: 'failed',
      sourceUnavailable: true,
      reason: error.message || 'Google Drive недоступен.',
    };
  }
}

async function archiveCompanyDocumentToGoogleDrive(upload, company) {
  try {
    const accessToken = await getGoogleDriveAccessToken();
    if (!accessToken) {
      return {
        status: 'unavailable',
        sourceUnavailable: true,
        reason: 'Google Drive не настроен.',
      };
    }

    const uploaded = await uploadCompanyDocumentToGoogleDrive(accessToken, upload, company);
    return {
      status: 'uploaded',
      sourceUnavailable: false,
      fileId: uploaded.id || '',
      webViewLink: uploaded.webViewLink || '',
      reason: '',
    };
  } catch (error) {
    return {
      status: 'failed',
      sourceUnavailable: true,
      reason: error.message || 'Google Drive недоступен.',
    };
  }
}

async function deleteArchivedReceiptFromGoogleDrive(googleDrive) {
  return deleteArchivedFileFromGoogleDrive(googleDrive, 'Чек не был загружен в Google Drive.');
}

async function deleteArchivedEmployeeDocumentFromGoogleDrive(googleDrive) {
  return deleteArchivedFileFromGoogleDrive(googleDrive, 'Документ не был загружен в Google Drive.');
}

async function deleteArchivedRetailPointDocumentFromGoogleDrive(googleDrive) {
  return deleteArchivedFileFromGoogleDrive(googleDrive, 'Документ торговой точки не был загружен в Google Drive.');
}

async function deleteArchivedCompanyDocumentFromGoogleDrive(googleDrive) {
  return deleteArchivedFileFromGoogleDrive(googleDrive, 'Документ компании не был загружен в Google Drive.');
}

async function deleteArchivedFileFromGoogleDrive(googleDrive, skippedReason) {
  const fileId = normalizeText(googleDrive?.fileId);
  if (googleDrive?.status !== 'uploaded' || !fileId) {
    return {
      status: 'skipped',
      reason: skippedReason,
    };
  }

  try {
    const accessToken = await getGoogleDriveAccessToken();
    if (!accessToken) {
      return {
        status: 'unavailable',
        reason: 'Google Drive не настроен.',
      };
    }
    await deleteGoogleDriveFile(accessToken, fileId);
    return {
      status: 'deleted',
      fileId,
      reason: '',
    };
  } catch (error) {
    return {
      status: 'failed',
      fileId,
      reason: error.message || 'Google Drive не удалил файл.',
    };
  }
}

async function runGoogleDriveHealthCheck() {
  const checkedAt = new Date().toISOString();
  const pdf = Buffer.from('%PDF-1.4\n% CRMZona Google Drive healthcheck\n%%EOF\n', 'utf8');
  const upload = normalizeReceiptUpload({
    fileName: 'drive-health.pdf',
    mimeType: 'application/pdf',
    size: pdf.length,
    dataUrl: `data:application/pdf;base64,${pdf.toString('base64')}`,
  });
  const expense = {
    pointId: POINTS[0].id,
    expenseDate: checkedAt.slice(0, 10),
    createdByName: 'CRMZona Health',
    createdAt: checkedAt,
  };
  upload.archiveName = archiveReceiptName(upload, expense);

  const uploadResult = await archiveReceiptToGoogleDrive(upload, expense);
  const result = {
    ok: uploadResult.status === 'uploaded',
    checkedAt,
    config: googleDrivePublicConfig(),
    upload: uploadResult,
    cleanup: null,
  };

  if (uploadResult.status !== 'uploaded' || !uploadResult.fileId) {
    return result;
  }

  try {
    const accessToken = await getGoogleDriveAccessToken();
    await deleteGoogleDriveFile(accessToken, uploadResult.fileId);
    result.cleanup = { status: 'deleted' };
  } catch (error) {
    result.cleanup = {
      status: 'failed',
      reason: error.message || 'Google Drive не удалил тестовый файл.',
    };
  }

  return result;
}

function googleDrivePublicConfig() {
  return {
    hasServiceAccountJson: Boolean(normalizeText(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON)),
    hasServiceAccountBase64: Boolean(normalizeText(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64 || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64)),
    hasAccessToken: Boolean(normalizeText(process.env.GOOGLE_DRIVE_ACCESS_TOKEN)),
    hasOAuthRefresh: googleOAuthConfigured(),
    hasParentFolderId: Boolean(normalizeText(process.env.GOOGLE_DRIVE_FOLDER_ID)),
    hasExpensesFolderId: Boolean(normalizeText(process.env.GOOGLE_DRIVE_EXPENSES_FOLDER_ID)),
    hasCompanyDocumentsFolderId: Boolean(normalizeText(process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_ID)),
    folderName: normalizeText(process.env.GOOGLE_DRIVE_EXPENSES_FOLDER_NAME) || 'Хозрасходы',
  };
}

async function getGoogleDriveAccessToken() {
  const directToken = normalizeText(process.env.GOOGLE_DRIVE_ACCESS_TOKEN);
  if (directToken) return directToken;

  if (googleOAuthConfigured()) {
    return googleOAuthAccessToken();
  }

  const account = googleServiceAccount();
  if (!account) return '';

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = base64UrlJson({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${claims}`;
  const privateKey = String(account.private_key || '').replace(/\\n/g, '\n');
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google OAuth недоступен: ${payload.error_description || payload.error || response.status}`);
  }
  return payload.access_token;
}

function googleOAuthConfigured() {
  return Boolean(
    normalizeText(process.env.GOOGLE_DRIVE_CLIENT_ID)
    && normalizeText(process.env.GOOGLE_DRIVE_CLIENT_SECRET)
    && normalizeText(process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
  );
}

async function googleOAuthAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: normalizeText(process.env.GOOGLE_DRIVE_CLIENT_ID),
      client_secret: normalizeText(process.env.GOOGLE_DRIVE_CLIENT_SECRET),
      refresh_token: normalizeText(process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google OAuth refresh недоступен: ${payload.error_description || payload.error || response.status}`);
  }
  return payload.access_token;
}

async function deleteGoogleDriveFile(accessToken, fileId) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`Google Drive не удалил файл: ${payload.error?.message || response.status}`);
  }
}

function googleServiceAccount() {
  const json = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  const base64 = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64 || process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 || '';
  if (base64) {
    const normalizedBase64 = normalizeServiceAccountBase64(base64);
    try {
      const account = JSON.parse(Buffer.from(normalizedBase64, 'base64').toString('utf8'));
      if (!account.client_email || !account.private_key) {
        throw new Error('missing fields');
      }
      return account;
    } catch {
      if (!json) {
        throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64 заполнен некорректно.');
      }
    }
  }
  const raw = json || (base64 ? Buffer.from(normalizeServiceAccountBase64(base64), 'base64').toString('utf8') : '');
  if (!raw) return null;
  try {
    const account = JSON.parse(raw);
    if (!account.client_email || !account.private_key) {
      throw new Error('missing fields');
    }
    return account;
  } catch {
    throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON заполнен некорректно.');
  }
}

function normalizeServiceAccountBase64(value) {
  let normalized = String(value || '').replace(/^\uFEFF/, '').trim();
  const assignmentMatch = normalized.match(/^(?:export\s+)?[A-Z0-9_]+\s*=\s*(.+)$/s);
  if (assignmentMatch) {
    normalized = assignmentMatch[1].trim();
  }
  normalized = normalized.replace(/^['"]|['"]$/g, '');
  return normalized.replace(/\s+/g, '');
}

function normalizeDriveFolderId(value) {
  let normalized = normalizeText(value).replace(/^\uFEFF/, '').trim();
  const assignmentMatch = normalized.match(/^(?:export\s+)?[A-Z0-9_]+\s*=\s*(.+)$/s);
  if (assignmentMatch) {
    normalized = assignmentMatch[1].trim();
  }
  normalized = normalized.replace(/^['"]|['"]$/g, '').trim();
  const folderMatch = normalized.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (folderMatch) {
    return folderMatch[1];
  }
  const idParamMatch = normalized.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (idParamMatch) {
    return idParamMatch[1];
  }
  return normalized;
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function uploadReceiptToGoogleDrive(accessToken, upload, expense) {
  const boundary = `crmzona-${crypto.randomBytes(8).toString('hex')}`;
  const folderId = await googleDriveExpensesFolderId(accessToken);
  const metadata = {
    name: upload.archiveName || archiveReceiptName(upload, expense),
    mimeType: upload.mimeType,
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
      + `--${boundary}\r\nContent-Type: ${upload.mimeType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: Buffer.concat([head, upload.buffer, tail]),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Drive не принял чек: ${payload.error?.message || response.status}`);
  }
  return payload;
}

async function uploadEmployeeDocumentToGoogleDrive(accessToken, upload, employee, documentType) {
  const boundary = `crmzona-${crypto.randomBytes(8).toString('hex')}`;
  const folderId = await googleDriveEmployeeFolderId(accessToken, employee);
  const metadata = {
    name: upload.archiveName || employeeDocumentArchiveName(upload, employee, documentType),
    mimeType: upload.mimeType,
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
      + `--${boundary}\r\nContent-Type: ${upload.mimeType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: Buffer.concat([head, upload.buffer, tail]),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Drive не принял документ: ${payload.error?.message || response.status}`);
  }
  return payload;
}

async function uploadRetailPointDocumentToGoogleDrive(accessToken, upload, retailPoint) {
  const boundary = `crmzona-${crypto.randomBytes(8).toString('hex')}`;
  const folderId = await googleDriveRetailPointFolderId(accessToken, retailPoint);
  const metadata = {
    name: upload.archiveName || retailPointDocumentArchiveName(upload),
    mimeType: upload.mimeType,
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
      + `--${boundary}\r\nContent-Type: ${upload.mimeType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: Buffer.concat([head, upload.buffer, tail]),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Drive не принял документ торговой точки: ${payload.error?.message || response.status}`);
  }
  return payload;
}

async function uploadCompanyDocumentToGoogleDrive(accessToken, upload, company) {
  const boundary = `crmzona-${crypto.randomBytes(8).toString('hex')}`;
  const folderId = await googleDriveCompanyFolderId(accessToken, company);
  const metadata = {
    name: upload.archiveName || companyDocumentArchiveName(upload),
    mimeType: upload.mimeType,
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
      + `--${boundary}\r\nContent-Type: ${upload.mimeType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: Buffer.concat([head, upload.buffer, tail]),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Drive не принял документ компании: ${payload.error?.message || response.status}`);
  }
  return payload;
}

async function googleDriveExpensesFolderId(accessToken) {
  const explicitFolderId = normalizeDriveFolderId(process.env.GOOGLE_DRIVE_EXPENSES_FOLDER_ID);
  if (explicitFolderId) return explicitFolderId;

  const parentFolderId = normalizeDriveFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);
  const directToken = normalizeText(process.env.GOOGLE_DRIVE_ACCESS_TOKEN);
  const usingServiceAccount = !directToken && !googleOAuthConfigured() && Boolean(googleServiceAccount());
  if (usingServiceAccount && !parentFolderId) {
    throw new Error(
      'Для архива чеков через сервисный аккаунт укажите GOOGLE_DRIVE_FOLDER_ID или GOOGLE_DRIVE_EXPENSES_FOLDER_ID '
      + 'папки на Shared Drive. Обычная папка сервисного аккаунта не подходит: у сервисных аккаунтов нет квоты Google Drive.',
    );
  }

  const folderName = normalizeText(process.env.GOOGLE_DRIVE_EXPENSES_FOLDER_NAME) || 'Хозрасходы';
  return ensureGoogleDriveFolder(accessToken, folderName, parentFolderId);
}

async function googleDriveEmployeeDocumentsFolderId(accessToken) {
  const explicitFolderId = normalizeDriveFolderId(process.env.GOOGLE_DRIVE_EMPLOYEE_DOCUMENTS_FOLDER_ID);
  if (explicitFolderId) return explicitFolderId;

  const parentFolderId = normalizeDriveFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);
  const directToken = normalizeText(process.env.GOOGLE_DRIVE_ACCESS_TOKEN);
  const usingServiceAccount = !directToken && !googleOAuthConfigured() && Boolean(googleServiceAccount());
  if (usingServiceAccount && !parentFolderId) {
    throw new Error(
      'Для архива документов сотрудников через сервисный аккаунт укажите GOOGLE_DRIVE_FOLDER_ID '
      + 'или GOOGLE_DRIVE_EMPLOYEE_DOCUMENTS_FOLDER_ID папки на Shared Drive.',
    );
  }

  const folderName = normalizeText(process.env.GOOGLE_DRIVE_EMPLOYEE_DOCUMENTS_FOLDER_NAME) || 'Документы сотрудников';
  return ensureGoogleDriveFolder(accessToken, folderName, parentFolderId);
}

async function googleDriveEmployeeFolderId(accessToken, employee) {
  const rootFolderId = await googleDriveEmployeeDocumentsFolderId(accessToken);
  const folderName = safeDriveFolderName(employee.fullName || employee.email || employee.id);
  return ensureGoogleDriveFolder(accessToken, folderName, rootFolderId);
}

async function googleDriveRetailPointDocumentsFolderId(accessToken) {
  const explicitFolderId = normalizeDriveFolderId(process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_ID);
  if (explicitFolderId) return explicitFolderId;

  const parentFolderId = normalizeDriveFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);
  const directToken = normalizeText(process.env.GOOGLE_DRIVE_ACCESS_TOKEN);
  const usingServiceAccount = !directToken && !googleOAuthConfigured() && Boolean(googleServiceAccount());
  if (usingServiceAccount && !parentFolderId) {
    throw new Error(
      'Для архива документов торговых точек через сервисный аккаунт укажите GOOGLE_DRIVE_FOLDER_ID '
      + 'или GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_ID папки на Shared Drive.',
    );
  }

  const folderName = normalizeText(process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_NAME) || 'Документы по Торговым точкам';
  return ensureGoogleDriveFolder(accessToken, folderName, parentFolderId);
}

async function googleDriveRetailPointFolderId(accessToken, retailPoint) {
  const rootFolderId = await googleDriveRetailPointDocumentsFolderId(accessToken);
  const folderName = safeDriveFolderName(retailPoint.name || retailPoint.id);
  return ensureGoogleDriveFolder(accessToken, folderName, rootFolderId);
}

async function googleDriveCompanyDocumentsFolderId(accessToken) {
  const explicitFolderId = normalizeDriveFolderId(process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_ID);
  if (explicitFolderId) return explicitFolderId;

  const parentFolderId = normalizeDriveFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);
  const directToken = normalizeText(process.env.GOOGLE_DRIVE_ACCESS_TOKEN);
  const usingServiceAccount = !directToken && !googleOAuthConfigured() && Boolean(googleServiceAccount());
  if (usingServiceAccount && !parentFolderId) {
    throw new Error(
      'Для архива документов компаний через сервисный аккаунт укажите GOOGLE_DRIVE_FOLDER_ID '
      + 'или GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_ID папки на Shared Drive.',
    );
  }

  const folderName = normalizeText(process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_NAME) || 'Документы по компаниям';
  return ensureGoogleDriveFolder(accessToken, folderName, parentFolderId);
}

async function googleDriveCompanyFolderId(accessToken, company) {
  const rootFolderId = await googleDriveCompanyDocumentsFolderId(accessToken);
  const folderName = safeDriveFolderName(company.shortName || company.name || company.id);
  return ensureGoogleDriveFolder(accessToken, folderName, rootFolderId);
}

async function ensureGoogleDriveFolder(accessToken, name, parentFolderId = '') {
  const queryParts = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${escapeDriveQueryValue(name)}'`,
    'trashed=false',
  ];
  if (parentFolderId) {
    queryParts.push(`'${escapeDriveQueryValue(parentFolderId)}' in parents`);
  }

  const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
  listUrl.searchParams.set('q', queryParts.join(' and '));
  listUrl.searchParams.set('fields', 'files(id,name)');
  listUrl.searchParams.set('pageSize', '1');
  listUrl.searchParams.set('includeItemsFromAllDrives', 'true');
  listUrl.searchParams.set('supportsAllDrives', 'true');

  const existingResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const existingPayload = await existingResponse.json().catch(() => ({}));
  if (!existingResponse.ok) {
    throw new Error(`Google Drive не смог найти папку ${name}: ${existingPayload.error?.message || existingResponse.status}`);
  }
  if (existingPayload.files?.[0]?.id) {
    return existingPayload.files[0].id;
  }

  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentFolderId ? { parents: [parentFolderId] } : {}),
    }),
  });
  const createPayload = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !createPayload.id) {
    throw new Error(`Google Drive не смог создать папку ${name}: ${createPayload.error?.message || createResponse.status}`);
  }
  return createPayload.id;
}

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function archiveReceiptName(upload, expense) {
  const date = expense.expenseDate || String(expense.createdAt || new Date().toISOString()).slice(0, 10);
  const user = normalizeArchiveNamePart(expense.createdByName || 'Пользователь');
  const point = normalizeArchiveNamePart(pointName(expense.pointId));
  const unique = upload.id.split('-')[0] || upload.id.slice(0, 8);
  return safeFileName(`${date}-${user}-${point}-${unique}.${upload.extension}`);
}

function normalizeArchiveNamePart(value) {
  return normalizeText(value).replace(/[^\wа-яА-ЯёЁ-]+/g, '_') || 'Без_названия';
}

function employeeDocumentArchiveName(upload, employee, documentType) {
  const date = new Date().toISOString().slice(0, 10);
  const type = normalizeArchiveNamePart(documentType.label || documentType.value);
  const unique = upload.id.split('-')[0] || upload.id.slice(0, 8);
  return safeFileName(`${date}-${type}-${unique}.${upload.extension}`);
}

function retailPointDocumentArchiveName(upload) {
  const date = new Date().toISOString().slice(0, 10);
  const base = normalizeArchiveNamePart(path.parse(upload.fileName || 'document').name);
  const unique = upload.id.split('-')[0] || upload.id.slice(0, 8);
  return safeFileName(`${date}-${base}-${unique}.${upload.extension}`);
}

function companyDocumentArchiveName(upload) {
  const date = new Date().toISOString().slice(0, 10);
  const base = normalizeArchiveNamePart(path.parse(upload.fileName || 'document').name);
  const unique = upload.id.split('-')[0] || upload.id.slice(0, 8);
  return safeFileName(`${date}-${base}-${unique}.${upload.extension}`);
}

function safeDriveFolderName(value) {
  return normalizeText(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Без_ФИО';
}

function expenseSortTime(expense) {
  const date = expense.expenseDate
    ? `${expense.expenseDate}T23:59:59Z`
    : expense.createdAt;
  const time = new Date(date).getTime();
  return Number.isFinite(time) ? time : 0;
}

function claimSortTime(claim) {
  const date = claim.date
    ? `${claim.date}T23:59:59Z`
    : claim.createdAt;
  const time = new Date(date).getTime();
  return Number.isFinite(time) ? time : 0;
}

function hydrateExpense(expense, users) {
  const createdBy = users.find((user) => user.id === expense.createdBy);
  return {
    id: expense.id,
    pointId: expense.pointId,
    pointName: pointName(expense.pointId),
    expenseDate: expense.expenseDate || '',
    amount: expense.amount,
    paymentMethod: expense.paymentMethod,
    paymentMethodLabel: expensePaymentMethodLabel(expense.paymentMethod),
    receipt: expense.receipt || null,
    receiptUrl: expense.receipt?.url || (expense.receipt?.id ? `/api/receipts/${expense.receipt.id}` : ''),
    googleDrive: expense.googleDrive || {
      status: 'unavailable',
      sourceUnavailable: true,
      reason: 'Статус Google Drive неизвестен.',
    },
    createdBy: expense.createdBy,
    createdByName: createdBy ? createdBy.fullName : expense.createdByName || '',
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    updatedBy: expense.updatedBy,
  };
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

function hydrateClaim(claim, users) {
  const guiltyEmployee = users.find((user) => user.id === claim.guiltyEmployeeId);
  const createdBy = users.find((user) => user.id === claim.createdBy);
  return {
    id: claim.id,
    date: claim.date,
    amount: claim.amount,
    pointId: claim.pointId,
    pointName: pointName(claim.pointId),
    claimNumber: claim.claimNumber,
    company: claim.company,
    guiltyEmployeeId: claim.guiltyEmployeeId,
    guiltyEmployeeName: guiltyEmployee ? guiltyEmployee.fullName : claim.guiltyEmployeeName || '',
    comment: claim.comment,
    createdBy: claim.createdBy,
    createdByName: createdBy ? createdBy.fullName : claim.createdByName || '',
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
    updatedBy: claim.updatedBy,
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

function premiumForPoint(user, month, schedules, pointId) {
  const premium = month ? premiumForMonth(user, month) : inactivePremium();
  if (!premium.active || !schedules || !pointId) {
    return { ...premium, assignedPointId: '' };
  }

  const assignedPointId = premiumTargetPointId(schedules, month, user);
  const appliesToPoint = assignedPointId === pointId;
  return {
    active: appliesToPoint,
    amount: appliesToPoint ? premium.amount : '0',
    startDate: premium.startDate,
    assignedPointId,
  };
}

function applyMonthlyPremiumDistribution(schedules, users, month) {
  for (const point of POINTS) {
    const key = scheduleKey(point.id, month);
    const schedule = schedules[key];
    if (!schedule || !Array.isArray(schedule.rows)) continue;
    schedule.rows = applyPremiumToScheduleRows(schedule.rows, users, schedules, month, point.id);
  }
}

function applyPremiumToScheduleRows(rows, users, schedules, month, pointId) {
  return rows.map((row) => {
    const linkedUser = scheduleUserForRow(row, users);
    if (!linkedUser) return row;

    const premium = premiumForMonth(linkedUser, month);
    if (!premium.active) {
      return {
        ...row,
        bonusExtra: '',
        premiumActive: false,
        premiumStartDate: premium.startDate,
        premiumAssignedPointId: '',
      };
    }

    const assignedPointId = premiumTargetPointId(schedules, month, linkedUser);
    const appliesToPoint = assignedPointId === pointId;
    return {
      ...row,
      bonusExtra: appliesToPoint ? premium.amount : '0',
      premiumActive: appliesToPoint,
      premiumStartDate: premium.startDate,
      premiumAssignedPointId: assignedPointId,
    };
  });
}

function applyMonthlyClaimDistribution(schedules, users, claims, month) {
  for (const point of POINTS) {
    const key = scheduleKey(point.id, month);
    const schedule = schedules[key];
    if (!schedule || !Array.isArray(schedule.rows)) continue;
    schedule.rows = applyClaimsToScheduleRows(schedule.rows, users, schedules, claims, month, point.id);
  }
}

function applyClaimsToScheduleRows(rows, users, schedules, claims, month, pointId) {
  const distribution = claimDistributionForMonth(schedules, users, claims, month);
  return rows.map((row) => {
    const linkedUser = scheduleUserForRow(row, users);
    if (!linkedUser) {
      return {
        ...row,
        claims: '',
        claimAssignedPointId: '',
      };
    }

    const claimInfo = distribution.get(linkedUser.id);
    if (!claimInfo || !claimInfo.amount) {
      return {
        ...row,
        claims: '',
        claimAssignedPointId: '',
      };
    }

    const appliesToPoint = claimInfo.assignedPointId === pointId;
    return {
      ...row,
      claims: appliesToPoint ? claimInfo.amount : '0',
      claimAssignedPointId: claimInfo.assignedPointId,
    };
  });
}

function claimDistributionForMonth(schedules, users, claims, month) {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const grouped = new Map();
  for (const claim of normalizeClaims(claims)) {
    if (claim.date.slice(0, 7) !== month || !usersById.has(claim.guiltyEmployeeId)) continue;
    const current = grouped.get(claim.guiltyEmployeeId) || {
      total: 0,
      fallbackPointId: claim.pointId,
    };
    current.total += toNumber(claim.amount);
    if (!current.fallbackPointId) current.fallbackPointId = claim.pointId;
    grouped.set(claim.guiltyEmployeeId, current);
  }

  const result = new Map();
  for (const [employeeId, item] of grouped.entries()) {
    const assignedPointId = claimTargetPointId(schedules, month, employeeId, item.fallbackPointId);
    result.set(employeeId, {
      amount: numberToScheduleValue(item.total),
      assignedPointId,
    });
  }
  return result;
}

function claimTargetPointId(schedules, month, employeeId, fallbackPointId) {
  const fallback = POINTS.some((point) => point.id === fallbackPointId)
    ? fallbackPointId
    : POINTS[0].id;
  let winnerPointId = fallback;
  let winnerCount = -1;

  for (const point of POINTS) {
    const schedule = schedules[scheduleKey(point.id, month)];
    const row = Array.isArray(schedule?.rows)
      ? schedule.rows.find((item) => normalizeText(item.employeeId) === employeeId)
      : null;
    const count = countWorkedDays(row);
    if (count > winnerCount || (count === winnerCount && point.id === fallback)) {
      winnerPointId = point.id;
      winnerCount = count;
    }
  }

  return winnerCount > 0 ? winnerPointId : fallback;
}

function toNumber(value) {
  const number = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function numberToScheduleValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  return String(Math.round((number + Number.EPSILON) * 100) / 100);
}

function premiumTargetPointId(schedules, month, user) {
  const fallbackPointId = defaultPremiumPointIdForUser(user);
  let winnerPointId = fallbackPointId;
  let winnerCount = -1;

  for (const point of POINTS) {
    const schedule = schedules[scheduleKey(point.id, month)];
    const row = Array.isArray(schedule?.rows)
      ? schedule.rows.find((item) => scheduleUserForRow(item, [user])?.id === user.id)
      : null;
    const count = countWorkedDays(row);
    if (count > winnerCount) {
      winnerPointId = point.id;
      winnerCount = count;
    }
  }

  return winnerCount > 0 ? winnerPointId : fallbackPointId;
}

function defaultPremiumPointIdForUser(user) {
  const allowed = user?.role === 'owner'
    ? allPointIds()
    : normalizeAllowedPoints(user?.allowedPoints || []);
  return POINTS.find((point) => allowed.includes(point.id))?.id || POINTS[0].id;
}

function countWorkedDays(row) {
  if (!row?.days || typeof row.days !== 'object') return 0;
  return Object.values(row.days).filter((value) => {
    if (!value || typeof value !== 'object') return false;
    return Boolean(normalizeText(value.rateRub) || normalizeText(value.issuedCount));
  }).length;
}

function scheduleUserForRow(row, users) {
  if (!row) return null;
  return row.employeeId
    ? users.find((user) => user.id === row.employeeId) || null
    : users.find((user) => sameEmployeeName(user.fullName, row.employeeName)) || null;
}

function scheduleEmployeeOptions(actor, users, month = null, schedules = null, pointId = null) {
  const availableUsers = canManageAllSchedule(actor)
    ? users
    : users.filter((user) => user.id === actor.id);

  return availableUsers.map((user) => {
    const premium = month ? premiumForPoint(user, month, schedules, pointId) : inactivePremium();
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      premium,
    };
  });
}

function claimEmployeeOptions(actor, users) {
  const availableUsers = canManageClaims(actor)
    ? users
    : users.filter((user) => user.id === actor.id);
  return availableUsers
    .map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
    }))
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'ru'));
}

function hydrateScheduleRows(rows, users, daysInMonth, month = null) {
  return rows.map((row) => {
    const linkedUser = row.employeeId
      ? users.find((user) => user.id === row.employeeId)
      : users.find((user) => sameEmployeeName(user.fullName, row.employeeName));
    const premium = month && linkedUser ? premiumForMonth(linkedUser, month) : inactivePremium();
    const savedBonus = normalizeOptionalNumber(row.bonusExtra, 'Премия');
    const bonusExtra = premium.active ? premium.amount : '';

    return {
      id: row.id || crypto.randomUUID(),
      employeeId: linkedUser ? linkedUser.id : row.employeeId || null,
      employeeName: linkedUser ? linkedUser.fullName : normalizeText(row.employeeName),
      advanceCard: normalizeOptionalNumber(row.advanceCard, 'Аванс на карту'),
      salaryCard: normalizeOptionalNumber(row.salaryCard, 'ЗП на карту'),
      bonusExtra: linkedUser ? bonusExtra : savedBonus,
      premiumActive: linkedUser ? premium.active : Boolean(savedBonus),
      premiumStartDate: linkedUser ? premium.startDate : normalizeDateInput(row.premiumStartDate),
      claims: normalizeOptionalNumber(row.claims, 'Претензии'),
      claimAssignedPointId: normalizeText(row.claimAssignedPointId),
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
    const premium = employee?.premium || inactivePremium();
    const bonusExtra = employee
      ? (premium.active ? premium.amount : '')
      : normalizeOptionalNumber(row.bonusExtra, 'Премия');

    return {
      id: row.id || crypto.randomUUID(),
      employeeId: employee ? employee.id : employeeId || null,
      employeeName,
      advanceCard,
      salaryCard,
      bonusExtra,
      premiumActive: employee ? premium.active : Boolean(bonusExtra),
      premiumStartDate: employee ? premium.startDate : normalizeDateInput(row.premiumStartDate),
      claims: '',
      claimAssignedPointId: '',
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
  const store = createStore();
  const server = http.createServer(createRequestHandler(store));
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    store.audit('server.started', { url, dataDir: store.dataDir || 'supabase' });
    console.log(`Сайт графиков работ запущен: ${url}`);
    console.log(`Данные и логи: ${store.dataDir || 'supabase'}`);
  });
  return server;
}

if (require.main === module || (process.env.VERCEL && !process.env.VERCEL_API_ADAPTER)) {
  startServer();
}

module.exports = {
  ApiError,
  Store,
  SupabaseStore,
  POINTS,
  ROLE_LABELS,
  buildAdminPayrollReport,
  createCaptchaChallenge,
  createRequestHandler,
  createStore,
  generatePassword,
  hashPassword,
  normalizeRussianPhone,
  retailPointCompanyOptions,
  normalizeEmail,
  sanitizeUser,
  sendPasswordEmail,
  startServer,
  validateRegistration,
  validateScheduleRows,
  verifyCaptcha,
  verifyPassword,
};
