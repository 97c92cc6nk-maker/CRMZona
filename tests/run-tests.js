'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ApiError,
  Store,
  SupabaseStore,
  buildAdminPayrollReport,
  buildEmployeePayrollReport,
  createCaptchaChallenge,
  permissionsFor,
  reportDirectoryForUser,
  retailPointCompanyOptions,
  resetUserPasswordAsOwner,
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

function googleDrivePublicPermissionRequests(requests, fileId) {
  return requests.filter((request) => (
    request.url === `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true&fields=id`
    && request.options.method === 'POST'
  ));
}

function assertGoogleDrivePublicPermission(request) {
  assert.equal(request.options.headers.Authorization.startsWith('Bearer '), true);
  assert.deepEqual(JSON.parse(request.options.body), {
    role: 'reader',
    type: 'anyone',
    allowFileDiscovery: false,
  });
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

test('admin can manage employees but cannot change employee section access', () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Employee Access',
    phone: '+79990000131',
    email: 'owner-employee-access@example.com',
    password: 'OwnerPass123',
  });
  const admin = store.createUser({
    fullName: 'Admin Employee Access',
    phone: '+79990000132',
    email: 'admin-employee-access@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedPoints: ['moscow_6231'],
  });
  const employee = store.createUser({
    fullName: 'Employee With Sections',
    phone: '+79990000133',
    email: 'employee-with-sections@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['schedule', 'claims'],
    allowedPoints: ['krasnogorsk_466'],
  });

  const adminPermissions = permissionsFor(admin);
  assert.equal(adminPermissions.canViewUsers, true);
  assert.equal(adminPermissions.canManageRoles, true);
  assert.equal(adminPermissions.allowedSections.includes('employees'), true);

  const updated = store.updateUser(admin, employee.id, {
    ...employee,
    position: 'Senior employee',
    role: 'admin',
    allowedSections: ['expenses'],
    allowedPoints: ['moscow_6231'],
  });

  assert.equal(updated.position, 'Senior employee');
  assert.equal(updated.role, 'employee');
  assert.deepEqual(updated.allowedSections, ['schedule', 'claims']);
  assert.deepEqual(updated.allowedPoints, ['krasnogorsk_466', 'moscow_6231']);
  assert.throws(
    () => store.updateUserRole(admin, employee.id, 'admin'),
    (error) => error instanceof ApiError && error.status === 403,
  );
  assert.equal(owner.role, 'owner');
});

test('retail point access belongs only to one admin', () => {
  const store = createTempStore();
  store.createUser({
    fullName: 'Owner User',
    phone: '+79990000034',
    email: 'owner-admin-points@example.com',
    password: 'OwnerPass123',
  });
  store.createUser({
    fullName: 'Admin One',
    phone: '+79990000035',
    email: 'admin-one@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedSections: ['points'],
    allowedPoints: ['moscow_6231'],
  });
  store.createUser({
    fullName: 'Partner User',
    phone: '+79990000037',
    email: 'partner-with-points@example.com',
    password: 'PartnerPass123',
    role: 'partner',
    allowedSections: ['points'],
    allowedPoints: ['krasnogorsk_466'],
  });

  assert.throws(
    () => store.createUser({
      fullName: 'Admin Two',
      phone: '+79990000036',
      email: 'admin-two@example.com',
      password: 'AdminPass123',
      role: 'admin',
      allowedSections: ['points'],
      allowedPoints: ['moscow_6231'],
    }),
    (error) => error instanceof ApiError && error.status === 409,
  );
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
  }, '2026-07', [
    {
      id: 'claim-admin-1',
      date: '2026-07-15',
      amount: '250',
      pointId: 'moscow_6231',
      claimNumber: 'A-1',
      company: 'Marketplace',
      status: 'withheld',
      guiltyEmployeeId: 'admin-1',
    },
    {
      id: 'claim-admin-new',
      date: '2026-07-16',
      amount: '999',
      pointId: 'moscow_6231',
      claimNumber: 'A-2',
      company: 'Marketplace',
      status: 'new',
      guiltyEmployeeId: 'admin-1',
    },
  ]);

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].fullName, 'Anna Admin');
  assert.equal(report.rows[0].bonusPoints, '6000');
  assert.equal(report.rows[0].premium, '7000');
  assert.equal(report.rows[0].fines, '1250');
  assert.equal(report.rows[0].payable, '44750');
  assert.equal(report.rows[0].comment, 'Checked');
});

test('employee payroll report calculates monthly schedule totals', () => {
  const users = [
    {
      id: 'owner-1',
      fullName: 'Owner User',
      role: 'owner',
      allowedPoints: ['moscow_6231', 'krasnogorsk_466'],
      allowedSections: ['reports', 'schedule'],
    },
    {
      id: 'employee-1',
      fullName: 'Ivan Employee',
      role: 'employee',
      allowedPoints: ['moscow_6231'],
      premiumHistory: [
        { active: true, amount: '500', startDate: '2026-07-01' },
      ],
    },
  ];
  const schedules = {
    'moscow_6231:2026-07': {
      pointId: 'moscow_6231',
      month: '2026-07',
      removedEmployeeIds: [],
      rows: [
        {
          id: 'row-1',
          employeeId: 'employee-1',
          employeeName: 'Ivan Employee',
          advanceCard: '50',
          salaryCard: '20',
          bonusExtra: '500',
          claims: '30',
          days: {
            1: { rateRub: '100', issuedCount: '2' },
            16: { rateRub: '200', issuedCount: '3' },
          },
        },
      ],
    },
  };
  const claims = [
    {
      id: 'claim-1',
      date: '2026-07-20',
      amount: '30',
      pointId: 'moscow_6231',
      guiltyEmployeeId: 'employee-1',
    },
  ];

  const report = buildEmployeePayrollReport(users, schedules, claims, '2026-07', users[0]);

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].fullName, 'Ivan Employee');
  assert.equal(report.rows[0].pointId, 'moscow_6231');
  assert.equal(report.rows[0].issuedTotal, '5');
  assert.equal(report.rows[0].rateFirstHalf, '100');
  assert.equal(report.rows[0].advanceCard, '50');
  assert.equal(report.rows[0].rateSecondHalf, '200');
  assert.equal(report.rows[0].salaryCard, '20');
  assert.equal(report.rows[0].bonus, '25');
  assert.equal(report.rows[0].premium, '500');
  assert.equal(report.rows[0].claims, '30');
  assert.equal(report.rows[0].advanceTotal, '50');
  assert.equal(report.rows[0].salaryTotal, '675');
  assert.equal(report.rows[0].payrollFund, '795');
  assert.equal(report.totals.payrollFund, '795');
});

test('employee payroll report access shows all points and supports admin ownership metadata', () => {
  const users = [
    {
      id: 'viewer-1',
      fullName: 'Report Viewer',
      role: 'employee',
      allowedSections: ['reports'],
      allowedReports: ['employee-payroll'],
      allowedPoints: ['moscow_6231'],
    },
    {
      id: 'admin-moscow',
      fullName: 'Admin Moscow',
      role: 'admin',
      allowedPoints: ['moscow_6231'],
      allowedSections: ['reports'],
    },
    {
      id: 'admin-krasnogorsk',
      fullName: 'Admin Krasnogorsk',
      role: 'admin',
      allowedPoints: ['krasnogorsk_466'],
      allowedSections: ['reports'],
    },
    {
      id: 'employee-moscow',
      fullName: 'Employee Moscow',
      role: 'employee',
      allowedPoints: ['moscow_6231'],
    },
    {
      id: 'employee-krasnogorsk',
      fullName: 'Employee Krasnogorsk',
      role: 'employee',
      allowedPoints: ['krasnogorsk_466'],
    },
  ];
  const schedules = {
    'moscow_6231:2026-07': {
      pointId: 'moscow_6231',
      month: '2026-07',
      removedEmployeeIds: [],
      rows: [{
        id: 'row-moscow',
        employeeId: 'employee-moscow',
        employeeName: 'Employee Moscow',
        days: { 1: { rateRub: '100', issuedCount: '1' } },
      }],
    },
    'krasnogorsk_466:2026-07': {
      pointId: 'krasnogorsk_466',
      month: '2026-07',
      removedEmployeeIds: [],
      rows: [{
        id: 'row-krasnogorsk',
        employeeId: 'employee-krasnogorsk',
        employeeName: 'Employee Krasnogorsk',
        days: { 1: { rateRub: '200', issuedCount: '2' } },
      }],
    },
  };

  const report = buildEmployeePayrollReport(users, schedules, [], '2026-07', users[0]);
  const pointIds = [...new Set(report.rows.map((row) => row.pointId))].sort();
  const krasnogorskRow = report.rows.find((row) => row.pointId === 'krasnogorsk_466');
  const moscowRow = report.rows.find((row) => row.pointId === 'moscow_6231');

  assert.deepEqual(pointIds, ['krasnogorsk_466', 'moscow_6231']);
  assert.equal(report.adminOptions.length, 2);
  assert.deepEqual(krasnogorskRow.adminIds, ['admin-krasnogorsk']);
  assert.deepEqual(moscowRow.adminIds, ['admin-moscow']);
});

test('report access can be scoped per employee', () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Reports Scope',
    phone: '+79990000201',
    email: 'owner-report-scope@example.com',
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Employee Reports Scope',
    phone: '+79990000202',
    email: 'employee-report-scope@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['reports'],
    allowedReports: ['employee-payroll'],
  });

  assert.deepEqual(employee.allowedReports, ['employee-payroll']);
  assert.deepEqual(reportDirectoryForUser(employee).map((report) => report.id), ['employee-payroll']);

  const updated = store.updateUser(owner, employee.id, {
    ...employee,
    allowedSections: [],
    allowedReports: ['admin-payroll'],
  });

  assert.deepEqual(updated.allowedReports, []);
  assert.deepEqual(reportDirectoryForUser(updated).map((report) => report.id), []);
});

test('development proposals are scoped by access and reviewed by owner', async () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Development',
    phone: '+79990000211',
    email: 'owner-development@example.com',
    password: 'OwnerPass123',
  });
  const admin = store.createUser({
    fullName: 'Admin Development',
    phone: '+79990000212',
    email: 'admin-development@example.com',
    password: 'AdminPass123',
    role: 'admin',
  });
  const otherAdmin = store.createUser({
    fullName: 'Other Admin Development',
    phone: '+79990000213',
    email: 'other-admin-development@example.com',
    password: 'AdminPass123',
    role: 'admin',
  });
  const employee = store.createUser({
    fullName: 'Employee Development',
    phone: '+79990000214',
    email: 'employee-development@example.com',
    password: 'EmployeePass123',
    role: 'employee',
  });
  const employeeWithDevelopment = store.createUser({
    fullName: 'Employee With Development Access',
    phone: '+79990000217',
    email: 'employee-development-access@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['development'],
  });

  assert.equal(permissionsFor(admin).canViewDevelopment, true);
  assert.equal(permissionsFor(admin).canCreateDevelopmentProposals, true);
  assert.equal(permissionsFor(admin).canManageDevelopment, false);
  assert.equal(permissionsFor(employee).canViewDevelopment, false);
  assert.equal(permissionsFor(employeeWithDevelopment).canViewDevelopment, true);
  assert.equal(permissionsFor(employeeWithDevelopment).canCreateDevelopmentProposals, true);

  const proposal = store.createDevelopmentProposal(admin, {
    title: 'Добавить быстрый фильтр',
    description: 'Нужен быстрый фильтр по статусу для списка предложений.',
  });

  assert.equal(proposal.status, 'new');
  assert.equal(store.listDevelopmentProposals(admin).length, 1);
  assert.equal(store.listDevelopmentProposals(otherAdmin).length, 0);
  assert.equal(store.listDevelopmentProposals(owner).length, 1);
  assert.throws(
    () => store.createDevelopmentProposal(employee, {
      title: 'Нельзя',
      description: 'Сотрудник не должен создавать предложения в разделе разработки.',
    }),
    (error) => error instanceof ApiError && error.status === 403,
  );
  const employeeProposal = store.createDevelopmentProposal(employeeWithDevelopment, {
    title: 'Employee idea',
    description: 'Employee can submit proposals after Development access is enabled.',
  });
  assert.equal(employeeProposal.status, 'new');
  assert.equal(store.listDevelopmentProposals(employeeWithDevelopment).length, 1);
  assert.equal(store.listDevelopmentProposals(otherAdmin).length, 0);
  assert.equal(store.listDevelopmentProposals(owner).length, 2);
  assert.throws(
    () => store.updateDevelopmentProposal(admin, proposal.id, {
      status: 'implemented',
      ownerComment: '',
      codexTask: '',
    }),
    (error) => error instanceof ApiError && error.status === 403,
  );

  const reviewed = store.updateDevelopmentProposal(owner, proposal.id, {
    status: 'in_work',
    ownerComment: 'Берем в работу.',
    codexTask: 'Сделать фильтр по статусу в разделе Разработка.',
  });

  assert.equal(reviewed.status, 'in_work');
  assert.equal(reviewed.statusLabel, 'В работе');
  assert.equal(reviewed.ownerComment, 'Берем в работу.');
  assert.equal(reviewed.codexTask, 'Сделать фильтр по статусу в разделе Разработка.');
});

test('development proposal attachments keep local fallback when Google Drive is unavailable', async () => {
  const store = createTempStore();
  store.createUser({
    fullName: 'Owner Development Files',
    phone: '+79990000215',
    email: 'owner-development-files@example.com',
    password: 'OwnerPass123',
  });
  const admin = store.createUser({
    fullName: 'Admin Development Files',
    phone: '+79990000216',
    email: 'admin-development-files@example.com',
    password: 'AdminPass123',
    role: 'admin',
  });
  const proposal = store.createDevelopmentProposal(admin, {
    title: 'Приложить пример',
    description: 'Нужно приложить текстовый файл к предложению.',
  });
  const driveEnvKeys = [
    'GOOGLE_DRIVE_ACCESS_TOKEN',
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_SERVICE_ACCOUNT_BASE64',
    'GOOGLE_DRIVE_CLIENT_ID',
    'GOOGLE_DRIVE_CLIENT_SECRET',
    'GOOGLE_DRIVE_REFRESH_TOKEN',
    'GOOGLE_DRIVE_DEVELOPMENT_FOLDER_ID',
  ];
  const previousDriveEnv = Object.fromEntries(driveEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of driveEnvKeys) {
    delete process.env[key];
  }

  try {
    const added = await store.addDevelopmentAttachment(admin, proposal.id, {
      file: {
        fileName: 'idea.txt',
        dataUrl: `data:text/plain;base64,${Buffer.from('development idea').toString('base64')}`,
      },
    });

    assert.equal(added.attachment.googleDrive.status, 'unavailable');
    assert.equal(added.attachment.localUrl.includes(`/api/development/${proposal.id}/attachments/`), true);
    assert.equal(added.proposal.attachments.length, 1);

    const file = store.getDevelopmentAttachmentFile(admin, proposal.id, added.attachment.id);
    assert.equal(file.mimeType, 'text/plain');
    assert.equal(file.buffer.toString('utf8'), 'development idea');

    const deleted = await store.deleteDevelopmentAttachment(admin, proposal.id, added.attachment.id);
    assert.equal(deleted.googleDriveCleanup.status, 'skipped');
    assert.equal(deleted.proposal.attachments.length, 0);
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

test('tasks can be assigned between employees with file attachments', async () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Tasks',
    phone: '+79990000231',
    email: 'owner-tasks@example.com',
    password: 'OwnerPass123',
  });
  const admin = store.createUser({
    fullName: 'Admin Tasks',
    phone: '+79990000232',
    email: 'admin-tasks@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedSections: ['tasks'],
  });
  const author = store.createUser({
    fullName: 'Author Tasks',
    phone: '+79990000233',
    email: 'author-tasks@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['tasks'],
  });
  const assignee = store.createUser({
    fullName: 'Assignee Tasks',
    phone: '+79990000234',
    email: 'assignee-tasks@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['tasks'],
  });
  const noAccess = store.createUser({
    fullName: 'No Access Tasks',
    phone: '+79990000235',
    email: 'no-access-tasks@example.com',
    password: 'EmployeePass123',
    role: 'employee',
  });

  assert.equal(permissionsFor(author).canViewTasks, true);
  assert.equal(permissionsFor(author).canCreateTasks, true);
  assert.equal(permissionsFor(noAccess).canViewTasks, false);
  assert.equal(permissionsFor(admin).canManageTasks, true);

  const driveEnvKeys = [
    'GOOGLE_DRIVE_ACCESS_TOKEN',
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_SERVICE_ACCOUNT_BASE64',
    'GOOGLE_DRIVE_CLIENT_ID',
    'GOOGLE_DRIVE_CLIENT_SECRET',
    'GOOGLE_DRIVE_REFRESH_TOKEN',
    'GOOGLE_DRIVE_TASKS_FOLDER_ID',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
  ];
  const previousDriveEnv = Object.fromEntries(driveEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of driveEnvKeys) {
    delete process.env[key];
  }

  try {
    const task = await store.createTask(author, {
      title: 'Prepare shop report',
      assigneeId: assignee.id,
      priority: 'urgent',
      deadline: '2026-08-30',
      description: 'Collect photos and comments for the shop report.',
      attachments: [{
        fileName: 'task.txt',
        dataUrl: `data:text/plain;base64,${Buffer.from('task attachment').toString('base64')}`,
      }],
    });

    assert.equal(task.priority, 'urgent');
    assert.equal(task.assigneeName, assignee.fullName);
    assert.equal(task.attachments.length, 1);
    assert.equal(task.attachments[0].googleDrive.status, 'unavailable');
    assert.equal(task.attachments[0].localUrl.includes(`/api/tasks/${task.id}/attachments/`), true);
    assert.equal(task.emailDelivery.status, 'outbox');
    assert.equal(task.emailDelivery.sourceUnavailable, true);
    const outboxFile = path.isAbsolute(task.emailDelivery.outboxPath)
      ? task.emailDelivery.outboxPath
      : path.join(path.dirname(__dirname), task.emailDelivery.outboxPath);
    const outboxText = fs.readFileSync(outboxFile, 'utf8');
    assert.match(outboxText, /assignee-tasks@example\.com/);
    assert.match(outboxText, /Prepare shop report/);
    assert.match(outboxText, /Collect photos and comments for the shop report\./);
    assert.equal(store.listTasks(author).length, 1);
    assert.equal(store.listTasks(assignee).length, 1);
    assert.equal(store.listTasks(admin).length, 1);
    assert.equal(store.listTasks(owner).length, 1);
    assert.throws(
      () => store.listTasks(noAccess),
      (error) => error instanceof ApiError && error.status === 403,
    );
    await assert.rejects(
      () => store.createTask(noAccess, {
        title: 'No access',
        assigneeId: assignee.id,
        priority: 'normal',
        deadline: '2026-08-30',
        description: 'No access user cannot create tasks.',
      }),
      (error) => error instanceof ApiError && error.status === 403,
    );

    const file = store.getTaskAttachmentFile(assignee, task.id, task.attachments[0].id);
    assert.equal(file.mimeType, 'text/plain');
    assert.equal(file.buffer.toString('utf8'), 'task attachment');
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

test('owner can reset employee password without exposing stored passwords', async () => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;

  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Password',
    phone: '+79990000121',
    email: 'owner-password-reset@example.com',
    password: 'OwnerPass123',
  });
  const admin = store.createUser({
    fullName: 'Admin Password',
    phone: '+79990000122',
    email: 'admin-password-reset@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedSections: ['employees'],
  });
  const employee = store.createUser({
    fullName: 'Employee Password',
    phone: '+79990000123',
    email: 'employee-password-reset@example.com',
    password: 'EmployeePass123',
    role: 'employee',
  });
  const sessionId = store.createSession(employee.id);

  const result = await resetUserPasswordAsOwner(store, owner, employee.id);
  const rawEmployee = store.getUserById(employee.id);

  assert.equal(result.user.id, employee.id);
  assert.equal(result.user.password, undefined);
  assert.equal(result.emailDelivery.status, 'outbox');
  assert.equal(verifyPassword(result.password, rawEmployee.password), true);
  assert.equal(verifyPassword('EmployeePass123', rawEmployee.password), false);
  assert.equal(store.getSession(sessionId), null);
  await assert.rejects(
    () => resetUserPasswordAsOwner(store, admin, employee.id),
    (error) => error instanceof ApiError && error.status === 403,
  );
  await assert.rejects(
    () => resetUserPasswordAsOwner(store, owner, owner.id),
    (error) => error instanceof ApiError && error.status === 403,
  );
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
  const coworker = store.createUser({
    fullName: 'Second Schedule Employee',
    phone: '+79990000013',
    email: 'second-schedule@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['schedule'],
    allowedPoints: ['moscow_6231'],
  });

  store.saveSchedule(owner, 'moscow_6231', '2026-06', [{
    employeeId: coworker.id,
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
      employeeId: coworker.id,
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
  const coworkerRow = ownerView.rows.find((row) => row.employeeId === coworker.id);
  const employeeRow = ownerView.rows.find((row) => row.employeeId === employee.id);

  assert.equal(coworkerRow.days['1'].rateRub, '15');
  assert.equal(employeeRow.days['2'].issuedCount, '4');
  assert.equal(employeeRow.advanceCard, '50');
  assert.equal(employeeRow.salaryCard, '75');
  assert.equal(employeeRow.bonusExtra, '');
  assert.equal(employeeRow.claims, '');
});

test('employee schedule view hides and preserves financial summary fields', () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Finance Schedule',
    phone: '+79990000151',
    email: 'owner-finance-schedule@example.com',
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Employee Finance Hidden',
    phone: '+79990000152',
    email: 'employee-finance-hidden@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['schedule'],
    allowedPoints: ['moscow_6231'],
    premiumHistory: [
      { active: true, amount: '5000', startDate: '2026-06-01' },
    ],
  });

  store.saveSchedule(owner, 'moscow_6231', '2026-06', [{
    employeeId: employee.id,
    advanceCard: '100',
    salaryCard: '200',
    days: { 1: { rateRub: '10', issuedCount: '2' } },
  }]);

  const employeeView = store.getSchedule('moscow_6231', '2026-06', employee);
  const hiddenRow = employeeView.rows.find((row) => row.employeeId === employee.id);

  assert.equal(permissionsFor(employee).canViewScheduleFinancials, false);
  assert.equal(hiddenRow.advanceCard, '');
  assert.equal(hiddenRow.salaryCard, '');
  assert.equal(hiddenRow.bonusExtra, '');
  assert.equal(hiddenRow.premiumActive, false);
  assert.equal(employeeView.employeeOptions[0].premium.active, false);

  store.saveSchedule(employee, 'moscow_6231', '2026-06', [{
    employeeId: employee.id,
    advanceCard: '999',
    salaryCard: '888',
    bonusExtra: '777',
    days: { 2: { rateRub: '11', issuedCount: '3' } },
  }]);

  const ownerView = store.getSchedule('moscow_6231', '2026-06', owner);
  const ownerRow = ownerView.rows.find((row) => row.employeeId === employee.id);

  assert.equal(permissionsFor(owner).canViewScheduleFinancials, true);
  assert.equal(ownerRow.advanceCard, '100');
  assert.equal(ownerRow.salaryCard, '200');
  assert.equal(ownerRow.bonusExtra, '5000');
  assert.equal(ownerRow.days['2'].issuedCount, '3');
});

test('assigned retail point grants employee schedule access without section flag', () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Point Schedule',
    phone: '+79990000141',
    email: 'owner-point-schedule@example.com',
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Maxim Tokarev',
    phone: '+79990000142',
    email: 'tokarev-schedule@example.com',
    password: 'EmployeePass123',
    role: 'employee',
  });
  const point = store.createRetailPoint(owner, {
    name: 'MOSCOW_5863',
  });

  store.updateUser(owner, employee.id, {
    ...employee,
    allowedPoints: [point.id],
  });
  const assignedEmployee = store.getUserById(employee.id);
  const permissions = permissionsFor(assignedEmployee);

  assert.deepEqual(assignedEmployee.allowedSections, []);
  assert.equal(permissions.canViewSchedule, true);
  assert.equal(permissions.canEditSchedule, true);
  assert.deepEqual(permissions.allowedPoints, [point.id]);

  const employeeView = store.getSchedule(point.id, '2026-07', assignedEmployee);
  assert.equal(employeeView.rows.length, 1);
  assert.equal(employeeView.rows[0].employeeId, employee.id);

  store.saveSchedule(assignedEmployee, point.id, '2026-07', [{
    employeeId: employee.id,
    days: { 1: { rateRub: '1000', issuedCount: '10' } },
  }]);

  const ownerView = store.getSchedule(point.id, '2026-07', owner);
  const savedRow = ownerView.rows.find((row) => row.employeeId === employee.id);
  assert.equal(savedRow.days['1'].rateRub, '1000');
  assert.equal(savedRow.days['1'].issuedCount, '10');
});

test('admin can access every schedule without changing assigned payroll points', () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Admin Schedule',
    phone: '+79990000151',
    email: 'owner-admin-schedule@example.com',
    password: 'OwnerPass123',
  });
  const admin = store.createUser({
    fullName: 'Admin Schedule',
    phone: '+79990000152',
    email: 'admin-schedule@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedSections: ['schedule'],
    allowedPoints: ['moscow_6231'],
    unofficialSalary: '50000',
  });
  const krasnogorskEmployee = store.createUser({
    fullName: 'Krasnogorsk Schedule Employee',
    phone: '+79990000153',
    email: 'krasnogorsk-schedule-admin@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedPoints: ['krasnogorsk_466'],
  });

  const permissions = permissionsFor(admin);
  assert.equal(permissions.canViewSchedule, true);
  assert.equal(permissions.canEditSchedule, true);
  assert.deepEqual(permissions.allowedPoints, ['moscow_6231']);

  const adminView = store.getSchedule('krasnogorsk_466', '2026-07', admin);
  assert.deepEqual(adminView.employeeOptions.map((employee) => employee.id), [krasnogorskEmployee.id]);
  assert.deepEqual(adminView.rows.map((row) => row.employeeId), [krasnogorskEmployee.id]);

  store.saveSchedule(admin, 'krasnogorsk_466', '2026-07', [{
    employeeId: krasnogorskEmployee.id,
    days: { 1: { rateRub: '1000', issuedCount: '10' } },
  }]);

  const ownerView = store.getSchedule('krasnogorsk_466', '2026-07', owner);
  const savedRow = ownerView.rows.find((row) => row.employeeId === krasnogorskEmployee.id);
  assert.equal(savedRow.days['1'].rateRub, '1000');
  assert.equal(savedRow.days['1'].issuedCount, '10');

  const adminPayroll = buildAdminPayrollReport(store.listUsers(), { adminPayroll: {} }, '2026-07');
  assert.equal(adminPayroll.rows.length, 1);
  assert.equal(adminPayroll.rows[0].pointsCount, 1);
  assert.equal(adminPayroll.rows[0].bonusPoints, '3000');
});

test('schedule defaults include only employees assigned to the selected point', () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Schedule Defaults',
    phone: '+79990000191',
    email: 'owner-schedule-defaults@example.com',
    password: 'OwnerPass123',
  });
  const moscowEmployee = store.createUser({
    fullName: 'Moscow Employee',
    phone: '+79990000192',
    email: 'moscow-defaults@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedPoints: ['moscow_6231'],
  });
  const krasnogorskEmployee = store.createUser({
    fullName: 'Krasnogorsk Employee',
    phone: '+79990000193',
    email: 'krasnogorsk-defaults@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedPoints: ['krasnogorsk_466'],
  });
  const unassignedEmployee = store.createUser({
    fullName: 'Unassigned Employee',
    phone: '+79990000194',
    email: 'unassigned-defaults@example.com',
    password: 'EmployeePass123',
    role: 'employee',
  });

  const moscow = store.getSchedule('moscow_6231', '2026-09', owner);
  assert.deepEqual(moscow.rows.map((row) => row.employeeId), [moscowEmployee.id]);
  assert.deepEqual(moscow.employeeOptions.map((employee) => employee.id), [moscowEmployee.id]);

  const krasnogorsk = store.getSchedule('krasnogorsk_466', '2026-09', owner);
  assert.deepEqual(krasnogorsk.rows.map((row) => row.employeeId), [krasnogorskEmployee.id]);
  assert.deepEqual(krasnogorsk.employeeOptions.map((employee) => employee.id), [krasnogorskEmployee.id]);
  assert.equal(moscow.rows.some((row) => row.employeeId === owner.id), false);
  assert.equal(moscow.rows.some((row) => row.employeeId === unassignedEmployee.id), false);

  store.saveJson('schedules.json', {
    'moscow_6231:2026-10': {
      pointId: 'moscow_6231',
      month: '2026-10',
      rows: [
        { employeeId: moscowEmployee.id, days: {} },
        { employeeId: krasnogorskEmployee.id, days: {} },
        { employeeId: unassignedEmployee.id, days: {} },
      ],
      removedEmployeeIds: [],
      updatedAt: new Date().toISOString(),
      updatedBy: owner.id,
    },
  });
  const cleaned = store.getSchedule('moscow_6231', '2026-10', owner);
  assert.deepEqual(cleaned.rows.map((row) => row.employeeId), [moscowEmployee.id]);
});

test('schedule keeps removed employee rows after save', () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Schedule',
    phone: '+79990000111',
    email: 'owner-remove-schedule@example.com',
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Employee Removed',
    phone: '+79990000112',
    email: 'employee-remove-schedule@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['schedule'],
    allowedPoints: ['moscow_6231'],
  });

  const initial = store.getSchedule('moscow_6231', '2026-06', owner);
  assert.equal(initial.rows.some((row) => row.employeeId === employee.id), true);

  const rowsWithoutEmployee = initial.rows.filter((row) => row.employeeId !== employee.id);
  store.saveSchedule(owner, 'moscow_6231', '2026-06', rowsWithoutEmployee, [employee.id]);

  const afterRemove = store.getSchedule('moscow_6231', '2026-06', owner);
  assert.equal(afterRemove.rows.some((row) => row.employeeId === employee.id), false);
  assert.equal(afterRemove.removedEmployeeIds.includes(employee.id), true);

  store.saveSchedule(owner, 'moscow_6231', '2026-06', [
    ...afterRemove.rows,
    {
      employeeId: employee.id,
      days: { 1: { rateRub: '10', issuedCount: '1' } },
    },
  ], afterRemove.removedEmployeeIds);

  const afterRestore = store.getSchedule('moscow_6231', '2026-06', owner);
  assert.equal(afterRestore.rows.some((row) => row.employeeId === employee.id), true);
  assert.equal(afterRestore.removedEmployeeIds.includes(employee.id), false);
});

test('claims are visible by point access and withheld amounts are applied to their own point', async () => {
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

  const firstClaim = await store.createClaim(owner, {
    date: '2026-06-10',
    amount: '1200',
    pointId: 'krasnogorsk_466',
    claimNumber: 'CL-001',
    company: 'Маркетплейс',
    status: 'withheld',
    guiltyEmployeeId: employee.id,
    comment: 'Недостача',
  });
  await store.createClaim(owner, {
    date: '2026-06-20',
    amount: '300',
    pointId: 'moscow_6231',
    claimNumber: 'CL-002',
    company: 'Маркетплейс',
    status: 'withheld',
    guiltyEmployeeId: employee.id,
    comment: 'Повторная претензия',
  });
  await store.createClaim(owner, {
    date: '2026-06-21',
    amount: '900',
    pointId: 'moscow_6231',
    claimNumber: 'CL-003',
    company: 'Маркетплейс',
    status: 'new',
    guiltyEmployeeId: employee.id,
    comment: 'Еще рассматривается',
  });

  assert.equal(store.listClaims(owner).length, 3);
  const employeeClaims = store.listClaims(employee);
  assert.equal(employeeClaims.length, 3);
  assert.equal(employeeClaims.every((claim) => claim.company === ''), true);

  const moscow = store.getSchedule('moscow_6231', '2026-06', owner)
    .rows.find((row) => row.employeeId === employee.id);
  const krasnogorsk = store.getSchedule('krasnogorsk_466', '2026-06', owner)
    .rows.find((row) => row.employeeId === employee.id);
  assert.equal(moscow.claims, '300');
  assert.equal(moscow.claimAssignedPointId, 'moscow_6231');
  assert.equal(krasnogorsk.claims, '1200');
  assert.equal(krasnogorsk.claimAssignedPointId, 'krasnogorsk_466');

  await store.deleteClaim(owner, firstClaim.id);
  const afterDelete = store.getSchedule('krasnogorsk_466', '2026-06', owner)
    .rows.find((row) => row.employeeId === employee.id);
  assert.equal(afterDelete.claims, '0');
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

test('employee with repair access can create repair requests with attachments', async () => {
  const store = createTempStore();
  store.createUser({
    fullName: 'Owner Repairs',
    phone: '+79990000161',
    email: 'owner-repairs@example.com',
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Employee Repairs',
    phone: '+79990000162',
    email: 'employee-repairs@example.com',
    password: 'EmployeePass123',
    role: 'employee',
    allowedSections: ['repairs'],
  });
  const admin = store.createUser({
    fullName: 'Admin Repairs',
    phone: '+79990000163',
    email: 'admin-repairs@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedSections: ['repairs'],
  });
  const driveEnvKeys = [
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64',
    'GOOGLE_SERVICE_ACCOUNT_BASE64',
    'GOOGLE_DRIVE_ACCESS_TOKEN',
    'GOOGLE_DRIVE_OAUTH_CLIENT_JSON',
    'GOOGLE_DRIVE_OAUTH_CLIENT_BASE64',
    'GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN',
    'GOOGLE_DRIVE_CLIENT_ID',
    'GOOGLE_DRIVE_CLIENT_SECRET',
    'GOOGLE_DRIVE_REFRESH_TOKEN',
  ];
  const previousDriveEnv = Object.fromEntries(driveEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of driveEnvKeys) {
    delete process.env[key];
  }

  try {
    const permissions = permissionsFor(employee);
    assert.equal(permissions.canViewRepairs, true);
    assert.equal(permissions.canCreateRepairs, true);
    assert.equal(permissions.canManageRepairs, false);
    assert.deepEqual(permissions.allowedPoints, []);
    const adminPermissions = permissionsFor(admin);
    assert.equal(adminPermissions.canViewRepairs, true);
    assert.equal(adminPermissions.canCreateRepairs, true);
    assert.equal(adminPermissions.canManageRepairs, true);
    assert.deepEqual(adminPermissions.allowedPoints, []);

    const repair = await store.createRepair(employee, {
      pointId: 'moscow_6231',
      priority: 'high',
      title: 'Broken shelf',
      description: 'Shelf needs repair',
      attachments: [{
        fileName: 'shelf.jpg',
        dataUrl: `data:image/jpeg;base64,${Buffer.from('repair-file').toString('base64')}`,
      }],
    });

    assert.equal(repair.createdBy, employee.id);
    assert.equal(repair.attachments.length, 1);
    assert.equal(repair.attachments[0].googleDrive.status, 'unavailable');
    assert.equal(repair.attachments[0].localUrl.includes(`/api/repairs/${repair.id}/attachments/`), true);

    const file = store.getRepairAttachmentFile(employee, repair.id, repair.attachments[0].id);
    assert.equal(file.fileName.endsWith('.jpg'), true);
    assert.equal(file.buffer.toString(), 'repair-file');

    const visibleRepairs = store.listRepairs(employee);
    assert.equal(visibleRepairs.length, 1);
    assert.equal(visibleRepairs[0].attachments.length, 1);

    const adminRepair = await store.createRepair(admin, {
      pointId: 'krasnogorsk_466',
      priority: 'normal',
      title: 'Admin repair',
      description: 'Admin can create repair without assigned points',
    });
    assert.equal(adminRepair.pointId, 'krasnogorsk_466');
    const updatedRepair = store.updateRepair(admin, repair.id, { status: 'in_progress' });
    assert.equal(updatedRepair.status, 'in_progress');
    assert.equal(store.listRepairs(admin).length, 2);
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

test('housekeeping receipt upload is shared by link in Google Drive', async () => {
  const store = createTempStore();
  const admin = store.createUser({
    fullName: 'Admin Public Receipt',
    phone: '+79990000183',
    email: 'admin-public-receipt@example.com',
    password: 'AdminPass123',
    role: 'admin',
    allowedSections: ['expenses'],
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
          id: 'expense-receipt-file-1',
          webViewLink: 'https://drive.google.com/file/d/expense-receipt-file-1/view',
        }),
      };
    }
    if (request.url.startsWith('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true') && options.method === 'POST') {
      folderCounter += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `expense-folder-${folderCounter}`, name: JSON.parse(options.body).name }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    };
  };

  try {
    const expense = await store.createExpense(admin, {
      pointId: 'moscow_6231',
      expenseDate: '2026-07-11',
      amount: '900',
      paymentMethod: 'card',
      receipt: {
        fileName: 'receipt.pdf',
        dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-public-receipt').toString('base64')}`,
      },
    });

    assert.equal(expense.googleDrive.status, 'uploaded');
    assert.equal(expense.googleDrive.fileId, 'expense-receipt-file-1');
    assert.equal(expense.googleDrive.publicAccess, 'anyone_with_link');
    const publicPermissionRequests = googleDrivePublicPermissionRequests(requests, 'expense-receipt-file-1');
    assert.equal(publicPermissionRequests.length, 1);
    assertGoogleDrivePublicPermission(publicPermissionRequests[0]);
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
    assert.equal(added.document.googleDrive.publicAccess, 'anyone_with_link');
    assert.match(added.document.fileName, /^\d{4}-\d{2}-\d{2}-Паспорт_1-ая-[a-f0-9]+\.pdf$/);
    assert.equal(added.user.employeeDocuments.length, 1);
    const publicPermissionRequests = googleDrivePublicPermissionRequests(requests, 'employee-document-file-1');
    assert.equal(publicPermissionRequests.length, 1);
    assertGoogleDrivePublicPermission(publicPermissionRequests[0]);

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

test('employee document upload falls back to service account when OAuth refresh fails', async () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner OAuth Fallback',
    phone: '+79990000161',
    email: 'owner-oauth-fallback@example.com',
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Employee OAuth Fallback',
    phone: '+79990000162',
    email: 'employee-oauth-fallback@example.com',
    password: 'EmployeePass123',
    role: 'employee',
  });
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccount = {
    client_email: 'crmzona-test@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };

  const previousFetch = global.fetch;
  const envKeys = [
    'GOOGLE_DRIVE_ACCESS_TOKEN',
    'GOOGLE_DRIVE_CLIENT_ID',
    'GOOGLE_DRIVE_CLIENT_SECRET',
    'GOOGLE_DRIVE_REFRESH_TOKEN',
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_SERVICE_ACCOUNT_BASE64',
    'GOOGLE_DRIVE_FOLDER_ID',
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const tokenGrantTypes = [];
  const requests = [];
  process.env.GOOGLE_DRIVE_CLIENT_ID = 'broken-client-id';
  process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'broken-client-secret';
  process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'broken-refresh-token';
  process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON = JSON.stringify(serviceAccount);
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'employee-docs-root';
  delete process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  delete process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;

  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, options });
    if (requestUrl === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(String(options.body));
      const grantType = body.get('grant_type');
      tokenGrantTypes.push(grantType);
      if (grantType === 'refresh_token') {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: 'invalid_grant' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'service-account-token' }),
      };
    }
    if (requestUrl.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      assert.equal(options.headers.Authorization, 'Bearer service-account-token');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'employee-document-service-account-file',
          webViewLink: 'https://drive.google.com/file/d/employee-document-service-account-file/view',
        }),
      };
    }
    if (requestUrl.startsWith('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true')) {
      if (options.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: `folder-${JSON.parse(options.body).name}` }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ files: [] }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    };
  };

  try {
    const dataUrl = `data:application/pdf;base64,${Buffer.from('%PDF-fallback-doc').toString('base64')}`;
    const added = await store.addEmployeeDocument(owner, employee.id, {
      documentType: 'inn',
      file: {
        fileName: 'inn.pdf',
        dataUrl,
      },
    });

    assert.deepEqual(tokenGrantTypes, [
      'refresh_token',
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    ]);
    assert.equal(added.document.googleDrive.status, 'uploaded');
    assert.equal(added.document.googleDrive.fileId, 'employee-document-service-account-file');
    assert.equal(added.document.googleDrive.publicAccess, 'anyone_with_link');
    assert.equal(added.user.employeeDocuments.length, 1);
    const publicPermissionRequests = requests.filter((request) => (
      request.url === 'https://www.googleapis.com/drive/v3/files/employee-document-service-account-file/permissions?supportsAllDrives=true&fields=id'
      && request.options.method === 'POST'
    ));
    assert.equal(publicPermissionRequests.length, 1);
    assertGoogleDrivePublicPermission(publicPermissionRequests[0]);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('employee document upload stores a site copy when Google Drive rejects the file', async () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Owner Local Document',
    phone: '+79990000171',
    email: 'owner-local-document@example.com',
    password: 'OwnerPass123',
  });
  const employee = store.createUser({
    fullName: 'Employee Local Document',
    phone: '+79990000172',
    email: 'employee-local-document@example.com',
    password: 'EmployeePass123',
    role: 'employee',
  });
  const previousFetch = global.fetch;
  const previousToken = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  process.env.GOOGLE_DRIVE_ACCESS_TOKEN = 'test-drive-token';
  global.fetch = async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      error: { message: 'Service Accounts do not have storage quota.' },
    }),
  });

  try {
    const fileBytes = Buffer.from('%PDF-site-copy-doc');
    const added = await store.addEmployeeDocument(owner, employee.id, {
      documentType: 'snils',
      file: {
        fileName: 'snils.pdf',
        dataUrl: `data:application/pdf;base64,${fileBytes.toString('base64')}`,
      },
    });
    const savedUser = store.getUserById(employee.id);
    const savedDocument = savedUser.employeeDocuments[0];
    const file = await store.getEmployeeDocumentFile(owner, employee.id, savedDocument.id);

    assert.equal(added.document.googleDrive.status, 'failed');
    assert.equal(added.document.localUrl.includes(`/api/users/${employee.id}/documents/`), true);
    assert.equal(savedUser.employeeDocuments.length, 1);
    assert.equal(file.mimeType, 'application/pdf');
    assert.equal(file.buffer.toString('utf8'), fileBytes.toString('utf8'));
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) {
      delete process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
    } else {
      process.env.GOOGLE_DRIVE_ACCESS_TOKEN = previousToken;
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

test('retail point seed fills an empty store', () => {
  const store = createTempStore();
  const owner = store.createUser({
    fullName: 'Seed Owner',
    phone: '+79990000069',
    email: 'owner-retail-seed@example.com',
    password: 'OwnerPass123',
  });

  const points = store.listRetailPoints(owner);
  const saved = store.loadJson('retail_points.json', []);

  assert.equal(points.length, 26);
  assert.equal(saved.length, 26);
  assert.ok(points.some((point) => point.name.endsWith('_123')));
  assert.ok(points.some((point) => point.rentCost === '125000'));
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
    unofficialSalary: '25000',
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
  assert.equal(point.curatorAdminId, '');
  assert.equal(point.curatorAdminName, '');
  assert.equal(point.rentCost, '125000');
  assert.equal(point.comment, 'Rent test');
  assert.equal(point.internet.payment, 'invoice');
  assert.equal(point.video.camerasCount, '6');

  const assignedAdmin = store.updateUser(owner, admin.id, {
    fullName: admin.fullName,
    phone: admin.phone,
    email: admin.email,
    role: 'admin',
    unofficialSalary: admin.unofficialSalary,
    allowedSections: admin.allowedSections,
    allowedPoints: [...admin.allowedPoints, point.id],
  });
  const assignedPoint = store.listRetailPoints(owner).find((item) => item.id === point.id);
  assert.equal(assignedPoint.curatorAdminId, assignedAdmin.id);
  assert.equal(assignedPoint.curatorAdminName, assignedAdmin.fullName);

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
    assert.equal(added.document.googleDrive.publicAccess, 'anyone_with_link');
    assert.match(added.document.fileName, /^\d{4}-\d{2}-\d{2}-lease-[a-f0-9]+\.pdf$/);
    assert.equal(added.point.documents.length, 1);
    const publicPermissionRequests = googleDrivePublicPermissionRequests(requests, 'retail-point-document-file-1');
    assert.equal(publicPermissionRequests.length, 1);
    assertGoogleDrivePublicPermission(publicPermissionRequests[0]);

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
    assert.equal(added.document.googleDrive.publicAccess, 'anyone_with_link');
    assert.match(added.document.fileName, /^\d{4}-\d{2}-\d{2}-requisites-[a-f0-9]+\.pdf$/);
    assert.equal(added.company.documents.length, 1);
    const publicPermissionRequests = googleDrivePublicPermissionRequests(requests, 'company-document-file-1');
    assert.equal(publicPermissionRequests.length, 1);
    assertGoogleDrivePublicPermission(publicPermissionRequests[0]);

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

  assert.throws(
    () => store.updateUser(owner, employee.id, {
      ...employee,
      unofficialSalary: '',
      role: 'admin',
    }),
    (error) => error instanceof ApiError && error.status === 400,
  );

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
    allowedPoints: ['moscow_6231'],
  });

  assert.equal(updated.role, 'employee');
  assert.equal(updated.fullName, 'Петров Петр Петрович');
  assert.equal(updated.lastName, 'Петров');
  assert.equal(updated.firstName, 'Петр');
  assert.equal(updated.middleName, 'Петрович');
  assert.equal(updated.position, 'Администратор');
  assert.equal(updated.officialSalary, '110000.5');
  assert.equal(updated.unofficialSalary, '');
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

test('supabase store falls back when remote fetch fails', async () => {
  const fallbackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-schedule-supabase-fallback-'));
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFallbackDir = process.env.SUPABASE_FALLBACK_DATA_DIR;
  const previousFetch = global.fetch;

  process.env.SUPABASE_URL = 'https://unavailable.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SUPABASE_FALLBACK_DATA_DIR = fallbackDir;
  global.fetch = async () => {
    throw new TypeError('fetch failed');
  };

  try {
    const store = new SupabaseStore();
    await store.saveJson('users.json', [{ id: 'u1', fullName: 'Fallback User' }]);
    const users = await store.loadJson('users.json', []);
    const status = store.storageStatus();

    assert.deepEqual(users, [{ id: 'u1', fullName: 'Fallback User' }]);
    assert.equal(status.persistent, false);
    assert.equal(status.fallback, 'supabase-unavailable');
    assert.match(status.message, /Supabase/);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = previousUrl;
    }
    if (previousKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
    if (previousFallbackDir === undefined) {
      delete process.env.SUPABASE_FALLBACK_DATA_DIR;
    } else {
      process.env.SUPABASE_FALLBACK_DATA_DIR = previousFallbackDir;
    }
  }
});

test('supabase store recovers after fallback when remote returns', async () => {
  const fallbackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-schedule-supabase-recovery-'));
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFallbackDir = process.env.SUPABASE_FALLBACK_DATA_DIR;
  const previousFetch = global.fetch;
  let online = false;
  const remote = new Map();

  process.env.SUPABASE_URL = 'https://recovered.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SUPABASE_FALLBACK_DATA_DIR = fallbackDir;
  global.fetch = async (url, options = {}) => {
    if (!online) throw new TypeError('fetch failed');
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      remote.set(body.key, body.value);
      return { ok: true, text: async () => '' };
    }
    const key = String(url).match(/key=eq\.([^&]+)/)?.[1];
    const value = key ? remote.get(decodeURIComponent(key)) : undefined;
    return {
      ok: true,
      json: async () => (value === undefined ? [] : [{ value }]),
      text: async () => '',
    };
  };

  try {
    const store = new SupabaseStore();
    await store.saveJson('users.json', [{ id: 'fallback' }]);
    assert.equal(store.storageStatus().fallback, 'supabase-unavailable');

    store.lastRecoveryAttemptAt = 0;
    online = true;
    await store.saveJson('users.json', [{ id: 'remote' }]);
    const users = await store.loadJson('users.json', []);

    assert.deepEqual(users, [{ id: 'remote' }]);
    assert.equal(store.storageStatus().persistent, true);
    assert.equal(store.storageStatus().fallback, 'supabase');
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = previousUrl;
    }
    if (previousKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
    if (previousFallbackDir === undefined) {
      delete process.env.SUPABASE_FALLBACK_DATA_DIR;
    } else {
      process.env.SUPABASE_FALLBACK_DATA_DIR = previousFallbackDir;
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
