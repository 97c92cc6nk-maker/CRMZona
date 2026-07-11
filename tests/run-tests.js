'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ApiError,
  Store,
  sendPasswordEmail,
  validateRegistration,
  validateScheduleRows,
  verifyPassword,
} = require('../lib/app');

function createTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-schedule-'));
  return new Store(dir);
}

test('registration validates all required fields', () => {
  assert.throws(
    () => validateRegistration({ fullName: '', phone: '', email: '' }),
    (error) => error instanceof ApiError && error.status === 400 && error.details.length === 3,
  );

  const value = validateRegistration({
    fullName: 'Иван Петров',
    phone: '+7 (999) 111-22-33',
    email: 'IVAN@example.com',
  });

  assert.deepEqual(value, {
    fullName: 'Иван Петров',
    phone: '+7 (999) 111-22-33',
    email: 'ivan@example.com',
  });
});

test('first user becomes owner and next users become employees', () => {
  const store = createTempStore();
  const owner = store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000001',
      email: 'owner@example.com',
    }),
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    ...validateRegistration({
      fullName: 'Петр Сотрудник',
      phone: '+79990000002',
      email: 'employee@example.com',
    }),
    password: 'EmployeePass123',
  });

  assert.equal(owner.role, 'owner');
  assert.equal(employee.role, 'employee');
});

test('self-registered user can be created as employee without access rights', () => {
  const store = createTempStore();
  const user = store.createUser({
    ...validateRegistration({
      fullName: 'Новый Пользователь',
      phone: '+79990000009',
      email: 'fresh@example.com',
    }),
    password: 'FreshPass123',
    role: 'employee',
    allowInitialOwner: false,
  });

  assert.equal(user.role, 'employee');
  assert.deepEqual(user.allowedSections, []);
  assert.deepEqual(user.allowedPoints, []);
});

test('new account types are available', () => {
  const store = createTempStore();
  store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000031',
      email: 'owner-roles@example.com',
    }),
    password: 'OwnerPass123',
  });

  const installer = store.createUser({
    fullName: 'Иван Монтажник',
    phone: '+79990000032',
    email: 'installer@example.com',
    password: 'InstallerPass123',
    role: 'installer',
  });
  const partner = store.createUser({
    fullName: 'Петр Партнер',
    phone: '+79990000033',
    email: 'partner@example.com',
    password: 'PartnerPass123',
    role: 'partner',
  });

  assert.equal(installer.roleLabel, 'Монтажник');
  assert.equal(partner.roleLabel, 'Партнер');
});

test('email is unique and password is stored as a hash', () => {
  const store = createTempStore();
  store.createUser({
    ...validateRegistration({
      fullName: 'Мария Тест',
      phone: '+79990000003',
      email: 'test@example.com',
    }),
    password: 'PlainPassword123',
  });

  assert.throws(
    () => store.createUser({
      ...validateRegistration({
        fullName: 'Мария Дубль',
        phone: '+79990000004',
        email: 'TEST@example.com',
      }),
      password: 'AnotherPassword123',
    }),
    (error) => error instanceof ApiError && error.status === 409,
  );

  const rawUser = store.listUsers()[0];
  assert.notEqual(rawUser.password.hash, 'PlainPassword123');
  assert.equal(verifyPassword('PlainPassword123', rawUser.password), true);
  assert.equal(verifyPassword('WrongPassword123', rawUser.password), false);
});

test('password email falls back to local outbox when SMTP is unavailable', async () => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;

  const store = createTempStore();
  const delivery = await sendPasswordEmail(store, {
    to: 'person@example.com',
    fullName: 'Ольга Почта',
    password: 'MailPass123',
    role: 'employee',
  });

  assert.equal(delivery.status, 'outbox');
  assert.equal(delivery.sourceUnavailable, true);
  assert.match(delivery.reason, /SMTP/);

  const outboxFile = path.isAbsolute(delivery.outboxPath)
    ? delivery.outboxPath
    : path.join(path.dirname(__dirname), delivery.outboxPath);
  assert.equal(fs.existsSync(outboxFile), true);
  assert.match(fs.readFileSync(outboxFile, 'utf8'), /MailPass123/);
});

test('schedule rows use employees from the directory and respect month boundaries', () => {
  const employeeOptions = [{ id: 'u1', fullName: 'Иван Петров' }];
  const rows = validateScheduleRows('2026-02', [{
    employeeId: 'u1',
    advanceCard: '1000,50',
    salaryCard: '2500',
    bonusExtra: '300',
    claims: '100',
    days: {
      1: { rateRub: '12.5', issuedCount: '7' },
      28: { rateRub: '10', issuedCount: '' },
    },
  }], employeeOptions);

  assert.equal(rows[0].employeeId, 'u1');
  assert.equal(rows[0].employeeName, 'Иван Петров');
  assert.equal(rows[0].advanceCard, '1000.5');
  assert.equal(rows[0].salaryCard, '2500');
  assert.equal(rows[0].bonusExtra, '');
  assert.equal(rows[0].claims, '100');
  assert.deepEqual(rows[0].days, {
    1: { rateRub: '12.5', issuedCount: '7' },
    28: { rateRub: '10', issuedCount: '' },
  });

  assert.throws(
    () => validateScheduleRows('2026-02', [{
      employeeId: 'u1',
      days: { 30: { rateRub: '10', issuedCount: '1' } },
    }], employeeOptions),
    (error) => error instanceof ApiError && error.status === 400,
  );

  assert.throws(
    () => validateScheduleRows('2026-02', [{
      employeeId: 'u2',
      days: { 1: { rateRub: '10', issuedCount: '1' } },
    }], employeeOptions),
    (error) => error instanceof ApiError && error.status === 403,
  );

  assert.throws(
    () => validateScheduleRows('2026-02', [{
      employeeId: 'u1',
      advanceCard: '-1',
      days: { 1: { rateRub: '10', issuedCount: '1' } },
    }], employeeOptions),
    (error) => error instanceof ApiError && error.status === 400,
  );
});

test('employee can save only own schedule row without overwriting others', () => {
  const store = createTempStore();
  const owner = store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000011',
      email: 'owner-schedule@example.com',
    }),
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    ...validateRegistration({
      fullName: 'Иван Сотрудник',
      phone: '+79990000012',
      email: 'employee-schedule@example.com',
    }),
    password: 'EmployeePass123',
    allowedSections: ['schedule'],
    allowedPoints: ['moscow_6231'],
  });

  store.saveSchedule(owner, 'moscow_6231', '2026-06', [{
    employeeId: owner.id,
    advanceCard: '100',
    salaryCard: '200',
    bonusExtra: '10',
    claims: '5',
    days: { 1: { rateRub: '15', issuedCount: '3' } },
  }, {
    employeeId: employee.id,
    advanceCard: '50',
    salaryCard: '75',
    bonusExtra: '15',
    claims: '7',
    days: { 1: { rateRub: '10', issuedCount: '2' } },
  }]);

  assert.throws(
    () => store.saveSchedule(employee, 'moscow_6231', '2026-06', [{
      employeeId: owner.id,
      days: { 2: { rateRub: '20', issuedCount: '5' } },
    }]),
    (error) => error instanceof ApiError && error.status === 403,
  );

  store.saveSchedule(employee, 'moscow_6231', '2026-06', [{
    employeeId: employee.id,
    advanceCard: '60',
    salaryCard: '90',
    bonusExtra: '20',
    claims: '8',
    days: { 2: { rateRub: '11', issuedCount: '4' } },
  }]);

  const ownerView = store.getSchedule('moscow_6231', '2026-06', owner);
  const ownerRow = ownerView.rows.find((row) => row.employeeId === owner.id);
  const employeeRow = ownerView.rows.find((row) => row.employeeId === employee.id);

  assert.equal(ownerRow.days['1'].rateRub, '15');
  assert.equal(employeeRow.days['2'].issuedCount, '4');
  assert.equal(employeeRow.advanceCard, '60');
  assert.equal(employeeRow.salaryCard, '90');
  assert.equal(employeeRow.bonusExtra, '');
  assert.equal(employeeRow.claims, '8');
});

test('employee premium applies by month and preserves historical values', () => {
  const store = createTempStore();
  const owner = store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000041',
      email: 'owner-premium@example.com',
    }),
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Иван Премия',
    phone: '+79990000042',
    email: 'premium@example.com',
    password: 'PremiumPass123',
    role: 'employee',
    allowedSections: ['schedule'],
    allowedPoints: ['moscow_6231'],
    premiumEnabled: true,
    premiumAmount: '5000',
    premiumStartDate: '2026-06-01',
  });

  const june = store.getSchedule('moscow_6231', '2026-06', owner);
  const juneRow = june.rows.find((row) => row.employeeId === employee.id);
  assert.equal(juneRow.bonusExtra, '5000');
  assert.equal(juneRow.premiumActive, true);

  store.updateUser(owner, employee.id, {
    fullName: employee.fullName,
    phone: employee.phone,
    email: employee.email,
    position: employee.position,
    hireDate: employee.hireDate,
    officialEmployment: employee.officialEmployment,
    role: employee.role,
    allowedSections: employee.allowedSections,
    allowedPoints: employee.allowedPoints,
    premiumHistory: [
      { active: true, amount: '5000', startDate: '2026-06-01' },
      { active: true, amount: '7000', startDate: '2026-07-01' },
    ],
  });

  const juneAfterChange = store.getSchedule('moscow_6231', '2026-06', owner);
  const july = store.getSchedule('moscow_6231', '2026-07', owner);
  assert.equal(juneAfterChange.rows.find((row) => row.employeeId === employee.id).bonusExtra, '5000');
  assert.equal(july.rows.find((row) => row.employeeId === employee.id).bonusExtra, '7000');

  const updatedEmployee = store.getUserById(employee.id);
  store.updateUser(owner, employee.id, {
    fullName: updatedEmployee.fullName,
    phone: updatedEmployee.phone,
    email: updatedEmployee.email,
    position: updatedEmployee.position,
    hireDate: updatedEmployee.hireDate,
    officialEmployment: updatedEmployee.officialEmployment,
    role: updatedEmployee.role,
    allowedSections: updatedEmployee.allowedSections,
    allowedPoints: updatedEmployee.allowedPoints,
    premiumHistory: [
      { active: true, amount: '5000', startDate: '2026-06-01' },
      { active: true, amount: '7000', startDate: '2026-07-01' },
      { active: false, amount: '', startDate: '2026-08-01' },
    ],
  });

  const august = store.getSchedule('moscow_6231', '2026-08', owner);
  const augustRow = august.rows.find((row) => row.employeeId === employee.id);
  assert.equal(augustRow.bonusExtra, '');
  assert.equal(augustRow.premiumActive, false);
});

test('employee premium is assigned to the point with the most worked days', () => {
  const store = createTempStore();
  const owner = store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000043',
      email: 'owner-premium-points@example.com',
    }),
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Иван Точки',
    phone: '+79990000044',
    email: 'premium-points@example.com',
    password: 'PremiumPass123',
    role: 'employee',
    allowedSections: ['schedule'],
    allowedPoints: ['moscow_6231', 'krasnogorsk_466'],
    premiumEnabled: true,
    premiumAmount: '5000',
    premiumStartDate: '2026-06-01',
  });

  store.saveSchedule(owner, 'moscow_6231', '2026-06', [{
    employeeId: employee.id,
    days: {
      1: { rateRub: '1000', issuedCount: '1' },
      2: { rateRub: '1000', issuedCount: '1' },
    },
  }]);
  store.saveSchedule(owner, 'krasnogorsk_466', '2026-06', [{
    employeeId: employee.id,
    days: {
      1: { rateRub: '1000', issuedCount: '1' },
    },
  }]);

  let moscow = store.getSchedule('moscow_6231', '2026-06', owner);
  let krasnogorsk = store.getSchedule('krasnogorsk_466', '2026-06', owner);
  assert.equal(moscow.rows.find((row) => row.employeeId === employee.id).bonusExtra, '5000');
  assert.equal(krasnogorsk.rows.find((row) => row.employeeId === employee.id).bonusExtra, '0');

  store.saveSchedule(owner, 'krasnogorsk_466', '2026-06', [{
    employeeId: employee.id,
    days: {
      1: { rateRub: '1000', issuedCount: '1' },
      2: { rateRub: '1000', issuedCount: '1' },
      3: { rateRub: '1000', issuedCount: '1' },
    },
  }]);

  moscow = store.getSchedule('moscow_6231', '2026-06', owner);
  krasnogorsk = store.getSchedule('krasnogorsk_466', '2026-06', owner);
  assert.equal(moscow.rows.find((row) => row.employeeId === employee.id).bonusExtra, '0');
  assert.equal(krasnogorsk.rows.find((row) => row.employeeId === employee.id).bonusExtra, '5000');
});

test('admin can create housekeeping expense with receipt and drive fallback', async () => {
  const store = createTempStore();
  store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000045',
      email: 'owner-expenses@example.com',
    }),
    password: 'OwnerPass123',
  });
  const admin = store.createUser({
    fullName: 'Иван Администратор',
    phone: '+79990000046',
    email: 'admin-expenses@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedSections: ['expenses'],
    allowedPoints: ['moscow_6231'],
  });
  const employee = store.createUser({
    fullName: 'Петр Сотрудник',
    phone: '+79990000047',
    email: 'employee-expenses@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['expenses'],
    allowedPoints: ['moscow_6231'],
  });

  const driveEnvKeys = [
    'GOOGLE_DRIVE_ACCESS_TOKEN',
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64',
    'GOOGLE_DRIVE_CLIENT_ID',
    'GOOGLE_DRIVE_CLIENT_SECRET',
    'GOOGLE_DRIVE_REFRESH_TOKEN',
  ];
  const previousDriveEnv = Object.fromEntries(driveEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of driveEnvKeys) {
    delete process.env[key];
  }

  try {
    const receipt = {
      fileName: 'check.pdf',
      dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-test').toString('base64')}`,
    };

    const expense = await store.createExpense(admin, {
      pointId: 'moscow_6231',
      expenseDate: '2026-07-09',
      amount: '123,45',
      paymentMethod: 'cash',
      receipt,
    });

    assert.equal(expense.expenseDate, '2026-07-09');
    assert.equal(expense.amount, '123.45');
    assert.equal(expense.paymentMethodLabel, 'наличные');
    assert.equal(expense.googleDrive.status, 'unavailable');
    assert.equal(expense.googleDrive.sourceUnavailable, true);
    assert.match(expense.receiptUrl, /^\/api\/receipts\//);
    assert.match(expense.receipt.fileName, /^2026-07-09-Иван_Администратор-МОСКВА_6231-[a-f0-9]+\.pdf$/);

    const file = await store.readReceiptFile(expense.receipt);
    assert.equal(file.mimeType, 'application/pdf');
    assert.equal(file.buffer.toString('utf8'), '%PDF-test');

    const list = store.listExpenses(admin);
    assert.equal(list.length, 1);
    assert.equal(store.getExpenseByReceiptId(admin, expense.receipt.id).id, expense.id);

    await assert.rejects(
      () => store.createExpense(employee, {
        pointId: 'moscow_6231',
        expenseDate: '2026-07-09',
        amount: '100',
        paymentMethod: 'cash',
        receipt,
      }),
      (error) => error instanceof ApiError && error.status === 403,
    );

    const deleted = store.deleteExpense(admin, expense.id);
    assert.equal(deleted.id, expense.id);
    assert.equal(store.listExpenses(admin).length, 0);
    assert.equal(store.getExpenseByReceiptId(admin, expense.receipt.id), null);
    await assert.rejects(
      () => store.readReceiptFile(expense.receipt),
      (error) => error instanceof ApiError && error.status === 404,
    );
  } finally {
    for (const key of driveEnvKeys) {
      if (previousDriveEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousDriveEnv[key];
      }
    }
  }
});

test('owner can maintain employee directory records', () => {
  const store = createTempStore();
  const owner = store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000021',
      email: 'owner-directory@example.com',
    }),
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Петр Админ',
    phone: '+79990000022',
    email: 'admin-directory@example.com',
    password: 'AdminPass123',
    role: 'admin',
    position: 'Управляющий',
    hireDate: '2026-01-15',
    officialEmployment: true,
  });

  assert.equal(employee.role, 'admin');
  assert.equal(employee.position, 'Управляющий');
  assert.equal(employee.hireDate, '2026-01-15');
  assert.equal(employee.officialEmployment, true);

  const updated = store.updateUser(owner, employee.id, {
    fullName: 'Петр Администратор',
    phone: '+79990000023',
    email: 'admin-updated@example.com',
    position: 'Администратор',
    hireDate: '2026-02-01',
    officialEmployment: false,
    role: 'employee',
  });

  assert.equal(updated.role, 'employee');
  assert.equal(updated.position, 'Администратор');
  assert.equal(updated.officialEmployment, false);

  store.saveSchedule(owner, 'moscow_6231', '2026-06', [{
    employeeId: employee.id,
    days: { 1: { rateRub: '10', issuedCount: '1' } },
  }]);
  store.deleteUser(owner, employee.id);
  const schedule = store.getSchedule('moscow_6231', '2026-06', owner);
  assert.equal(schedule.rows.some((row) => row.employeeId === employee.id), false);
});

test('store uses persistent disk fallback when primary data directory is not writable', () => {
  const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-schedule-primary-'));
  const fallbackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-schedule-fallback-'));
  const previousFallback = process.env.FALLBACK_DATA_DIR;
  process.env.FALLBACK_DATA_DIR = fallbackDir;

  const store = new Store(primaryDir);
  const fsModule = require('node:fs');
  const originalWriteFileSync = fsModule.writeFileSync;

  fsModule.writeFileSync = function patchedWriteFileSync(filePath, ...args) {
    if (String(filePath).startsWith(primaryDir)) {
      const error = new Error(`EPERM simulated for ${filePath}`);
      error.code = 'EPERM';
      throw error;
    }
    return originalWriteFileSync.call(this, filePath, ...args);
  };

  try {
    store.saveJson('users.json', [{ id: 'u1', fullName: 'Тест' }]);
    assert.equal(store.storageStatus().persistent, true);
    assert.equal(store.storageStatus().fallback, 'disk');
    assert.equal(store.dataDir, fallbackDir);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(fallbackDir, 'users.json'), 'utf8')),
      [{ id: 'u1', fullName: 'Тест' }],
    );
  } finally {
    fsModule.writeFileSync = originalWriteFileSync;
    if (previousFallback === undefined) {
      delete process.env.FALLBACK_DATA_DIR;
    } else {
      process.env.FALLBACK_DATA_DIR = previousFallback;
    }
  }
});

test('store selects existing disk fallback during startup when primary data directory is not writable', () => {
  const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-schedule-primary-'));
  const fallbackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-schedule-fallback-'));
  fs.writeFileSync(
    path.join(fallbackDir, 'users.json'),
    JSON.stringify([{ id: 'u1', fullName: 'Сохраненный пользователь' }]),
    'utf8',
  );
  fs.writeFileSync(path.join(fallbackDir, 'sessions.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(fallbackDir, 'schedules.json'), '{}', 'utf8');

  const previousFallback = process.env.FALLBACK_DATA_DIR;
  process.env.FALLBACK_DATA_DIR = fallbackDir;
  const fsModule = require('node:fs');
  const originalWriteFileSync = fsModule.writeFileSync;

  fsModule.writeFileSync = function patchedWriteFileSync(filePath, ...args) {
    if (String(filePath).startsWith(primaryDir)) {
      const error = new Error(`EPERM simulated for ${filePath}`);
      error.code = 'EPERM';
      throw error;
    }
    return originalWriteFileSync.call(this, filePath, ...args);
  };

  try {
    const store = new Store(primaryDir);
    assert.equal(store.dataDir, fallbackDir);
    assert.equal(store.storageStatus().persistent, true);
    assert.equal(store.storageStatus().fallback, 'disk');
    assert.equal(store.listUsers()[0].fullName, 'Сохраненный пользователь');
  } finally {
    fsModule.writeFileSync = originalWriteFileSync;
    if (previousFallback === undefined) {
      delete process.env.FALLBACK_DATA_DIR;
    } else {
      process.env.FALLBACK_DATA_DIR = previousFallback;
    }
  }
});
