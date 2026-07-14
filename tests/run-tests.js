'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ApiError,
  Store,
  buildAdminPayrollReport,
  createCaptchaChallenge,
  retailPointCompanyOptions,
  sendPasswordEmail,
  validateRegistration,
  validateScheduleRows,
  verifyCaptcha,
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
    lastName: 'Иван',
    firstName: 'Петров',
    middleName: '',
    phone: '+7 (999) 111-22-33',
    email: 'ivan@example.com',
  });

  const splitValue = validateRegistration({
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Иванович',
    phone: '9991112233',
    email: 'IVANOV@example.com',
  });

  assert.deepEqual(splitValue, {
    fullName: 'Иванов Иван Иванович',
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Иванович',
    phone: '+7 (999) 111-22-33',
    email: 'ivanov@example.com',
  });
});

test('captcha challenge verifies the registration answer', () => {
  const captcha = createCaptchaChallenge();
  const [, left, operation, right] = captcha.question.match(/^(\d+) ([+-]) (\d+)/);
  const answer = operation === '+'
    ? Number(left) + Number(right)
    : Number(left) - Number(right);

  assert.equal(verifyCaptcha(captcha.token, String(answer)), true);
  assert.throws(
    () => verifyCaptcha(captcha.token, String(answer + 1)),
    (error) => error instanceof ApiError && error.status === 400,
  );
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
  assert.equal(store.getUserByPhone('9990000002').email, 'employee@example.com');
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

test('admin payroll report calculates monthly payout fields', () => {
  const report = buildAdminPayrollReport([
    {
      id: 'admin-1',
      fullName: 'Anna Admin',
      role: 'admin',
      allowedPoints: ['moscow_6231', 'krasnogorsk_466'],
      unofficialSalary: '50000',
      premiumHistory: [
        { active: true, amount: '7000', startDate: '2026-07-01' },
      ],
    },
    {
      id: 'employee-1',
      fullName: 'Ivan Employee',
      role: 'employee',
      allowedPoints: ['moscow_6231'],
      unofficialSalary: '30000',
    },
  ], {
    adminPayroll: {
      '2026-07': {
        rows: {
          'admin-1': {
            advanceCard: '10000',
            salaryCard: '5000',
            advanceExtra: '2000',
            fines: '1000',
            comment: 'Checked',
          },
        },
      },
    },
  }, '2026-07');

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].fullName, 'Anna Admin');
  assert.equal(report.rows[0].bonusPoints, '6000');
  assert.equal(report.rows[0].premium, '7000');
  assert.equal(report.rows[0].payable, '45000');
  assert.equal(report.rows[0].comment, 'Checked');
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
  assert.equal(rows[0].claims, '');
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
  assert.equal(employeeRow.claims, '');
});

test('claims are created in directory and distributed to the busiest point', () => {
  const store = createTempStore();
  const owner = store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000081',
      email: 'owner-claims@example.com',
    }),
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Иван Претензия',
    phone: '+79990000082',
    email: 'claims-employee@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['schedule', 'claims'],
    allowedPoints: ['moscow_6231', 'krasnogorsk_466'],
  });

  store.saveSchedule(owner, 'moscow_6231', '2026-06', [{
    employeeId: employee.id,
    claims: '999',
    days: {
      1: { rateRub: '10', issuedCount: '1' },
      2: { rateRub: '10', issuedCount: '' },
      3: { rateRub: '', issuedCount: '2' },
    },
  }]);
  store.saveSchedule(owner, 'krasnogorsk_466', '2026-06', [{
    employeeId: employee.id,
    claims: '999',
    days: {
      1: { rateRub: '10', issuedCount: '1' },
    },
  }]);

  const beforeClaim = store.getSchedule('moscow_6231', '2026-06', owner)
    .rows.find((row) => row.employeeId === employee.id);
  assert.equal(beforeClaim.claims, '');

  const firstClaim = store.createClaim(owner, {
    date: '2026-06-10',
    amount: '1200',
    pointId: 'krasnogorsk_466',
    claimNumber: 'CL-001',
    company: 'Маркетплейс',
    guiltyEmployeeId: employee.id,
    comment: 'Недостача',
  });
  store.createClaim(owner, {
    date: '2026-06-20',
    amount: '300',
    pointId: 'moscow_6231',
    claimNumber: 'CL-002',
    company: 'Маркетплейс',
    guiltyEmployeeId: employee.id,
    comment: 'Повторная претензия',
  });

  assert.equal(store.listClaims(owner).length, 2);

  const moscow = store.getSchedule('moscow_6231', '2026-06', owner)
    .rows.find((row) => row.employeeId === employee.id);
  const krasnogorsk = store.getSchedule('krasnogorsk_466', '2026-06', owner)
    .rows.find((row) => row.employeeId === employee.id);
  assert.equal(moscow.claims, '1500');
  assert.equal(moscow.claimAssignedPointId, 'moscow_6231');
  assert.equal(krasnogorsk.claims, '0');
  assert.equal(krasnogorsk.claimAssignedPointId, 'moscow_6231');

  store.deleteClaim(owner, firstClaim.id);
  const afterDelete = store.getSchedule('moscow_6231', '2026-06', owner)
    .rows.find((row) => row.employeeId === employee.id);
  assert.equal(afterDelete.claims, '300');
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

    const deleted = await store.deleteExpense(admin, expense.id);
    assert.equal(deleted.id, expense.id);
    assert.equal(deleted.googleDriveCleanup.status, 'skipped');
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

test('deleting housekeeping expense removes archived Google Drive file', async () => {
  const store = createTempStore();
  store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000048',
      email: 'owner-drive-delete@example.com',
    }),
    password: 'OwnerPass123',
  });
  const admin = store.createUser({
    fullName: 'Иван Администратор',
    phone: '+79990000049',
    email: 'admin-drive-delete@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedSections: ['expenses'],
    allowedPoints: ['moscow_6231'],
  });
  const now = new Date().toISOString();
  const receipt = await store.saveReceiptFile({
    id: 'receipt-drive-delete',
    archiveName: 'receipt-drive-delete.pdf',
    buffer: Buffer.from('%PDF-drive-delete'),
    mimeType: 'application/pdf',
    size: 17,
  });
  store.saveJson('expenses.json', [{
    id: 'expense-drive-delete',
    pointId: 'moscow_6231',
    expenseDate: '2026-07-10',
    amount: '500',
    paymentMethod: 'card',
    receipt,
    googleDrive: {
      status: 'uploaded',
      sourceUnavailable: false,
      fileId: 'drive-file-delete-1',
      webViewLink: 'https://drive.google.com/file/d/drive-file-delete-1/view',
      reason: '',
    },
    createdBy: admin.id,
    createdByName: admin.fullName,
    createdAt: now,
    updatedAt: now,
    updatedBy: admin.id,
  }]);

  const previousFetch = global.fetch;
  const previousToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const requests = [];
  process.env.GOOGLE_DRIVE_ACCESS_TOKEN = 'test-drive-token';
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 204,
      json: async () => ({}),
    };
  };

  try {
    const deleted = await store.deleteExpense(admin, 'expense-drive-delete');
    assert.equal(deleted.id, 'expense-drive-delete');
    assert.equal(deleted.googleDriveCleanup.status, 'deleted');
    assert.equal(deleted.googleDriveCleanup.fileId, 'drive-file-delete-1');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://www.googleapis.com/drive/v3/files/drive-file-delete-1?supportsAllDrives=true');
    assert.equal(requests[0].options.method, 'DELETE');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer test-drive-token');
    assert.equal(store.listExpenses(admin).length, 0);
    await assert.rejects(
      () => store.readReceiptFile(receipt),
      (error) => error instanceof ApiError && error.status === 404,
    );
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) {
      delete process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
    } else {
      process.env.GOOGLE_DRIVE_ACCESS_TOKEN = previousToken;
    }
  }
});

test('employee documents are archived and deleted in Google Drive', async () => {
  const store = createTempStore();
  const owner = store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000050',
      email: 'owner-employee-docs@example.com',
    }),
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Петр Документов',
    phone: '+79990000051',
    email: 'employee-docs@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['employees'],
    allowedPoints: ['moscow_6231'],
  });

  const previousFetch = global.fetch;
  const previousToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const previousFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const requests = [];
  let folderCounter = 0;
  process.env.GOOGLE_DRIVE_ACCESS_TOKEN = 'test-drive-token';
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'root-folder-1';
  global.fetch = async (url, options = {}) => {
    const request = { url: String(url), options };
    requests.push(request);
    if (request.url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'employee-document-file-1',
          webViewLink: 'https://drive.google.com/file/d/employee-document-file-1/view',
        }),
      };
    }
    if (request.url.includes('/drive/v3/files/employee-document-file-1') && options.method === 'DELETE') {
      return {
        ok: true,
        status: 204,
        json: async () => ({}),
      };
    }
    if (request.url.startsWith('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true') && options.method === 'POST') {
      folderCounter += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `folder-${folderCounter}`, name: JSON.parse(options.body).name }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    };
  };

  try {
    const dataUrl = `data:application/pdf;base64,${Buffer.from('%PDF-employee-doc').toString('base64')}`;
    const added = await store.addEmployeeDocument(owner, employee.id, {
      documentType: 'passport_first',
      file: {
        fileName: 'passport.pdf',
        dataUrl,
      },
    });
    assert.equal(added.document.type, 'passport_first');
    assert.equal(added.document.typeLabel, 'Паспорт 1-ая');
    assert.equal(added.document.googleDrive.fileId, 'employee-document-file-1');
    assert.match(added.document.fileName, /^\d{4}-\d{2}-\d{2}-Паспорт_1-ая-[a-f0-9]+\.pdf$/);
    assert.equal(added.user.employeeDocuments.length, 1);

    const createdFolderNames = requests
      .filter((request) => request.options.method === 'POST' && request.url.startsWith('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true'))
      .map((request) => JSON.parse(request.options.body).name);
    assert.deepEqual(createdFolderNames, ['Документы сотрудников', 'Петр Документов']);

    const deleted = await store.deleteEmployeeDocument(owner, employee.id, added.document.id);
    assert.equal(deleted.googleDriveCleanup.status, 'deleted');
    assert.equal(deleted.user.employeeDocuments.length, 0);
    assert.ok(requests.some((request) => (
      request.url === 'https://www.googleapis.com/drive/v3/files/employee-document-file-1?supportsAllDrives=true'
      && request.options.method === 'DELETE'
    )));
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) {
      delete process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
    } else {
      process.env.GOOGLE_DRIVE_ACCESS_TOKEN = previousToken;
    }
    if (previousFolderId === undefined) {
      delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    } else {
      process.env.GOOGLE_DRIVE_FOLDER_ID = previousFolderId;
    }
  }
});

test('retail point legal entity options use company short names', () => {
  const options = retailPointCompanyOptions([
    { id: 'company-a', shortName: 'OIA', name: 'Company OIA', pointIds: ['moscow_6231'] },
    { id: 'company-b', shortName: 'BNF', name: 'Company BNF', pointIds: ['krasnogorsk_466'] },
    { id: 'company-c', shortName: 'OIA', name: 'Duplicate OIA', pointIds: ['moscow_6231'] },
  ], {
    role: 'admin',
    allowedSections: ['points'],
    allowedPoints: ['moscow_6231'],
  });

  assert.deepEqual(options.map((option) => option.value), ['OIA']);
  assert.equal(options[0].label, 'OIA');
});

test('retail points can store cards and Google Drive documents', async () => {
  const store = createTempStore();
  const owner = store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000070',
      email: 'owner-retail-points@example.com',
    }),
    password: 'OwnerPass123',
  });
  const admin = store.createUser({
    fullName: 'Ольга Администратор',
    phone: '+79990000072',
    email: 'retail-admin@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedSections: ['points'],
    allowedPoints: ['moscow_6231', 'krasnogorsk_466'],
  });

  const defaults = store.listRetailPoints(owner);
  assert.ok(defaults.some((point) => point.name === 'МОСКВА_6231'));

  const point = store.createRetailPoint(owner, {
    name: 'САНКТ-ПЕТЕРБУРГ_100',
    address: 'Невский проспект, 10',
    landlord: 'ООО Аренда',
    legalEntity: 'ООО CRMZona',
    rentCost: '125000',
    ownerName: 'Иван Собственник',
    phone: '+79990000071',
    email: 'spb-point@example.com',
    comment: 'Rent test',
    curatorAdminId: admin.id,
    internet: {
      provider: 'Ростелеком',
      payment: 'invoice',
      contractNumber: 'LS-100',
      contractHolder: 'ООО CRMZona',
      tariff: '300 Мбит',
      login: 'spb-login',
      password: 'spb-pass',
    },
    video: {
      operator: 'ВидеоОператор',
      camerasCount: '6',
      contractNumber: 'CAM-100',
      contractHolder: 'ООО CRMZona',
      tariff: 'Архив 30 дней',
      login: 'cam-login',
      password: 'cam-pass',
    },
  });

  assert.equal(point.name, 'САНКТ-ПЕТЕРБУРГ_100');
  assert.equal(point.curatorAdminId, admin.id);
  assert.equal(point.curatorAdminName, 'Ольга Администратор');
  assert.equal(point.rentCost, '125000');
  assert.equal(point.comment, 'Rent test');
  assert.equal(point.internet.payment, 'invoice');
  assert.equal(point.video.camerasCount, '6');

  const updated = store.updateRetailPoint(owner, point.id, {
    ...point,
    internet: {
      ...point.internet,
      login: 'updated-login',
    },
  });
  assert.equal(updated.internet.login, 'updated-login');
  assert.equal(updated.curatorAdminName, 'Ольга Администратор');

  const previousFetch = global.fetch;
  const previousToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const previousFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const previousRetailFolderId = process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_ID;
  const previousRetailFolderName = process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_NAME;
  const requests = [];
  let folderCounter = 0;
  process.env.GOOGLE_DRIVE_ACCESS_TOKEN = 'test-drive-token';
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'root-folder-1';
  delete process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_ID;
  delete process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_NAME;
  global.fetch = async (url, options = {}) => {
    const request = { url: String(url), options };
    requests.push(request);
    if (request.url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'retail-point-document-file-1',
          webViewLink: 'https://drive.google.com/file/d/retail-point-document-file-1/view',
        }),
      };
    }
    if (request.url.includes('/drive/v3/files/retail-point-document-file-1') && options.method === 'DELETE') {
      return {
        ok: true,
        status: 204,
        json: async () => ({}),
      };
    }
    if (request.url.startsWith('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true') && options.method === 'POST') {
      folderCounter += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `retail-folder-${folderCounter}`, name: JSON.parse(options.body).name }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    };
  };

  try {
    const dataUrl = `data:application/pdf;base64,${Buffer.from('%PDF-retail-point-doc').toString('base64')}`;
    const added = await store.addRetailPointDocument(owner, point.id, {
      file: {
        fileName: 'lease.pdf',
        dataUrl,
      },
    });
    assert.equal(added.document.googleDrive.fileId, 'retail-point-document-file-1');
    assert.match(added.document.fileName, /^\d{4}-\d{2}-\d{2}-lease-[a-f0-9]+\.pdf$/);
    assert.equal(added.point.documents.length, 1);

    const createdFolderNames = requests
      .filter((request) => request.options.method === 'POST' && request.url.startsWith('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true'))
      .map((request) => JSON.parse(request.options.body).name);
    assert.deepEqual(createdFolderNames, ['Документы по Торговым точкам', 'САНКТ-ПЕТЕРБУРГ_100']);

    const deleted = await store.deleteRetailPointDocument(owner, point.id, added.document.id);
    assert.equal(deleted.googleDriveCleanup.status, 'deleted');
    assert.equal(deleted.point.documents.length, 0);
    assert.ok(requests.some((request) => (
      request.url === 'https://www.googleapis.com/drive/v3/files/retail-point-document-file-1?supportsAllDrives=true'
      && request.options.method === 'DELETE'
    )));
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) {
      delete process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
    } else {
      process.env.GOOGLE_DRIVE_ACCESS_TOKEN = previousToken;
    }
    if (previousFolderId === undefined) {
      delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    } else {
      process.env.GOOGLE_DRIVE_FOLDER_ID = previousFolderId;
    }
    if (previousRetailFolderId === undefined) {
      delete process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_ID;
    } else {
      process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_ID = previousRetailFolderId;
    }
    if (previousRetailFolderName === undefined) {
      delete process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_NAME;
    } else {
      process.env.GOOGLE_DRIVE_RETAIL_POINT_DOCUMENTS_FOLDER_NAME = previousRetailFolderName;
    }
  }
});

test('companies can store requisites, point links and Google Drive documents', async () => {
  const store = createTempStore();
  const owner = store.createUser({
    ...validateRegistration({
      fullName: 'Анна Владелец',
      phone: '+79990000080',
      email: 'owner-companies@example.com',
    }),
    password: 'OwnerPass123',
  });
  const admin = store.createUser({
    fullName: 'Ольга Компании',
    phone: '+79990000081',
    email: 'company-admin@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedSections: ['companies'],
    allowedPoints: ['moscow_6231'],
  });

  const company = store.createCompany(owner, {
    shortName: 'ИП ТСТ',
    name: 'Индивидуальный предприниматель Тест Сергей Петрович',
    legalAddress: 'г Москва, тестовая улица, д 1',
    inn: '770000000001',
    ogrnip: '325770000000001',
    phone: '+79990000082',
    email: 'company-test@example.com',
    bankName: 'ПАО Тест Банк',
    bankBik: '044525000',
    bankAccount: '40802810000000000001',
    bankCorrespondentAccount: '30101810000000000001',
    pointIds: ['moscow_6231'],
  });

  assert.equal(company.shortName, 'ИП ТСТ');
  assert.deepEqual(company.pointNames, ['МОСКВА_6231']);
  assert.throws(
    () => store.updateCompany(admin, company.id, { ...company, pointIds: ['krasnogorsk_466'] }),
    (error) => error instanceof ApiError && error.status === 403,
  );

  const updated = store.updateCompany(admin, company.id, {
    ...company,
    bankName: 'ПАО Новый Банк',
    pointIds: ['moscow_6231'],
  });
  assert.equal(updated.bankName, 'ПАО Новый Банк');

  const previousFetch = global.fetch;
  const previousToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const previousFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const previousCompanyFolderId = process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_ID;
  const previousCompanyFolderName = process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_NAME;
  const requests = [];
  let folderCounter = 0;
  process.env.GOOGLE_DRIVE_ACCESS_TOKEN = 'test-drive-token';
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'root-folder-1';
  delete process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_ID;
  delete process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_NAME;
  global.fetch = async (url, options = {}) => {
    const request = { url: String(url), options };
    requests.push(request);
    if (request.url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'company-document-file-1',
          webViewLink: 'https://drive.google.com/file/d/company-document-file-1/view',
        }),
      };
    }
    if (request.url.includes('/drive/v3/files/company-document-file-1') && options.method === 'DELETE') {
      return {
        ok: true,
        status: 204,
        json: async () => ({}),
      };
    }
    if (request.url.startsWith('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true') && options.method === 'POST') {
      folderCounter += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `company-folder-${folderCounter}`, name: JSON.parse(options.body).name }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    };
  };

  try {
    const dataUrl = `data:application/pdf;base64,${Buffer.from('%PDF-company-doc').toString('base64')}`;
    const added = await store.addCompanyDocument(owner, company.id, {
      file: {
        fileName: 'requisites.pdf',
        dataUrl,
      },
    });
    assert.equal(added.document.googleDrive.fileId, 'company-document-file-1');
    assert.match(added.document.fileName, /^\d{4}-\d{2}-\d{2}-requisites-[a-f0-9]+\.pdf$/);
    assert.equal(added.company.documents.length, 1);

    const createdFolderNames = requests
      .filter((request) => request.options.method === 'POST' && request.url.startsWith('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true'))
      .map((request) => JSON.parse(request.options.body).name);
    assert.deepEqual(createdFolderNames, ['Документы по компаниям', 'ИП ТСТ']);

    const deleted = await store.deleteCompanyDocument(owner, company.id, added.document.id);
    assert.equal(deleted.googleDriveCleanup.status, 'deleted');
    assert.equal(deleted.company.documents.length, 0);
    assert.ok(requests.some((request) => (
      request.url === 'https://www.googleapis.com/drive/v3/files/company-document-file-1?supportsAllDrives=true'
      && request.options.method === 'DELETE'
    )));
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) {
      delete process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
    } else {
      process.env.GOOGLE_DRIVE_ACCESS_TOKEN = previousToken;
    }
    if (previousFolderId === undefined) {
      delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    } else {
      process.env.GOOGLE_DRIVE_FOLDER_ID = previousFolderId;
    }
    if (previousCompanyFolderId === undefined) {
      delete process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_ID;
    } else {
      process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_ID = previousCompanyFolderId;
    }
    if (previousCompanyFolderName === undefined) {
      delete process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_NAME;
    } else {
      process.env.GOOGLE_DRIVE_COMPANY_DOCUMENTS_FOLDER_NAME = previousCompanyFolderName;
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
    officialSalary: '100000',
    unofficialSalary: '25000',
    hireDate: '2026-01-15',
    officialEmployment: true,
  });

  assert.equal(employee.role, 'admin');
  assert.equal(employee.lastName, 'Петр');
  assert.equal(employee.firstName, 'Админ');
  assert.equal(employee.position, 'Управляющий');
  assert.equal(employee.officialSalary, '100000');
  assert.equal(employee.unofficialSalary, '25000');
  assert.equal(employee.hireDate, '2026-01-15');
  assert.equal(employee.officialEmployment, true);

  const updated = store.updateUser(owner, employee.id, {
    lastName: 'Петров',
    firstName: 'Петр',
    middleName: 'Петрович',
    phone: '+79990000023',
    email: 'admin-updated@example.com',
    position: 'Администратор',
    officialSalary: '110000,50',
    unofficialSalary: '30000',
    hireDate: '2026-02-01',
    officialEmployment: false,
    role: 'employee',
  });

  assert.equal(updated.role, 'employee');
  assert.equal(updated.fullName, 'Петров Петр Петрович');
  assert.equal(updated.lastName, 'Петров');
  assert.equal(updated.firstName, 'Петр');
  assert.equal(updated.middleName, 'Петрович');
  assert.equal(updated.position, 'Администратор');
  assert.equal(updated.officialSalary, '110000.5');
  assert.equal(updated.unofficialSalary, '30000');
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
