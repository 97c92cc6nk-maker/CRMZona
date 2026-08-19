'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

process.env.SMTP_HOST = '';
process.env.SMTP_PORT = '';
process.env.GOOGLE_DRIVE_ACCESS_TOKEN = '';
process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON = '';
process.env.GOOGLE_DRIVE_CLIENT_ID = '';
process.env.GOOGLE_DRIVE_CLIENT_SECRET = '';
process.env.GOOGLE_DRIVE_REFRESH_TOKEN = '';

const { Store, createRequestHandler } = require('../lib/app');

delete process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
delete process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
delete process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_BASE64;
delete process.env.GOOGLE_DRIVE_EXPENSES_FOLDER_ID;
delete process.env.GOOGLE_DRIVE_CLIENT_ID;
delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-schedule-smoke-'));
  const store = new Store(dataDir);
  store.createUser({
    fullName: 'Тестовый Владелец',
    phone: '+79990000009',
    email: 'owner-smoke@example.com',
    password: 'OwnerPass123',
  });
  const server = http.createServer(createRequestHandler(store));

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const captcha = await jsonFetch(`${baseUrl}/api/captcha`);
    const registration = await jsonFetch(`${baseUrl}/api/register`, {
      method: 'POST',
      body: {
        lastName: 'Тестовый',
        firstName: 'Сотрудник',
        middleName: 'Проверочный',
        phone: '+79990000010',
        email: 'registered-smoke@example.com',
        captchaToken: captcha.captcha.token,
        captchaAnswer: solveCaptcha(captcha.captcha.question),
      },
    });
    assert.equal(registration.user.role, 'employee');
    assert.deepEqual(registration.user.allowedSections, []);
    assert.deepEqual(registration.user.allowedPoints, []);
    assert.equal(registration.emailDelivery.status, 'outbox');

    const password = readPasswordFromOutbox(dataDir, 'registered-smoke@example.com');
    assert.ok(password.length >= 10);

    const reset = await jsonFetch(`${baseUrl}/api/forgot-password`, {
      method: 'POST',
      body: {
        email: 'registered-smoke@example.com',
      },
    });
    assert.equal(reset.emailDelivery.status, 'outbox');
    const resetPassword = readPasswordFromOutbox(dataDir, 'registered-smoke@example.com');
    assert.ok(resetPassword.length >= 10);
    assert.notEqual(resetPassword, password);

    await assert.rejects(
      () => jsonFetch(`${baseUrl}/api/login`, {
      method: 'POST',
      body: {
          email: 'registered-smoke@example.com',
          password,
        },
      }),
      /401/,
    );

    const employeeLogin = await jsonFetch(`${baseUrl}/api/login`, {
      method: 'POST',
      body: {
        email: 'registered-smoke@example.com',
        password: resetPassword,
      },
      includeHeaders: true,
    });
    const employeeCookie = employeeLogin.headers.get('set-cookie').split(';')[0];
    assert.equal(employeeLogin.body.user.role, 'employee');

    const employeeMe = await jsonFetch(`${baseUrl}/api/me`, {
      headers: { Cookie: employeeCookie },
    });
    assert.equal(employeeMe.permissions.canViewSchedule, false);
    assert.equal(employeeMe.permissions.canViewRepairs, false);
    assert.equal(employeeMe.permissions.canViewUsers, false);

    const login = await jsonFetch(`${baseUrl}/api/login`, {
      method: 'POST',
      body: {
        email: 'owner-smoke@example.com',
        password: 'OwnerPass123',
      },
      includeHeaders: true,
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal(login.body.user.role, 'owner');

    const me = await jsonFetch(`${baseUrl}/api/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(me.permissions.canEditSchedule, true);

    const createdEmployee = await jsonFetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {
        fullName: 'Иван Сотрудник',
        phone: '+79990000011',
        email: 'employee-smoke@example.com',
        position: 'Продавец',
        hireDate: '2026-06-01',
        officialEmployment: true,
        premiumEnabled: true,
        premiumAmount: '300',
        premiumStartDate: '2026-06-01',
        role: 'employee',
      },
    });
    assert.equal(createdEmployee.user.position, 'Продавец');
    assert.equal(createdEmployee.user.officialEmployment, true);
    assert.equal(createdEmployee.user.premiumAmount, '300');

    const users = await jsonFetch(`${baseUrl}/api/users`, {
      headers: { Cookie: cookie },
    });
    assert.equal(users.users.length, 3);

    const createdRepair = await jsonFetch(`${baseUrl}/api/repairs`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {
        pointId: 'moscow_6231',
        priority: 'high',
        title: 'Repair shutters',
        description: 'Main entrance does not open.',
      },
    });
    assert.equal(createdRepair.repair.status, 'new');
    assert.equal(createdRepair.repair.pointId, 'moscow_6231');

    const repairs = await jsonFetch(`${baseUrl}/api/repairs`, {
      headers: { Cookie: cookie },
    });
    assert.equal(repairs.repairs.length, 1);
    assert.equal(repairs.canManage, true);

    const updatedRepair = await jsonFetch(`${baseUrl}/api/repairs/${createdRepair.repair.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie },
      body: { status: 'in_progress' },
    });
    assert.equal(updatedRepair.repair.status, 'in_progress');

    const createdExpense = await jsonFetch(`${baseUrl}/api/expenses`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {
        pointId: 'moscow_6231',
        expenseDate: '2026-07-09',
        amount: '321,50',
        paymentMethod: 'corp_card',
        receipt: {
          fileName: 'receipt.pdf',
          dataUrl: `data:application/pdf;base64,${Buffer.from('%PDF-smoke').toString('base64')}`,
        },
      },
    });
    assert.equal(createdExpense.expense.amount, '321.5');
    assert.equal(createdExpense.expense.expenseDate, '2026-07-09');
    assert.equal(createdExpense.expense.paymentMethod, 'corp_card');
    assert.equal(createdExpense.expense.googleDrive.status, 'unavailable');
    assert.match(createdExpense.expense.receipt.fileName, /^2026-07-09-Тестовый_Владелец-МОСКВА_6231-[a-f0-9]+\.pdf$/);

    const expenses = await jsonFetch(`${baseUrl}/api/expenses`, {
      headers: { Cookie: cookie },
    });
    assert.equal(expenses.expenses.length, 1);
    assert.equal(expenses.canManage, true);

    const receiptResponse = await fetch(`${baseUrl}${createdExpense.expense.receiptUrl}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(receiptResponse.status, 200);
    assert.equal(receiptResponse.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.from(await receiptResponse.arrayBuffer()).toString('utf8'), '%PDF-smoke');

    const deletedExpense = await jsonFetch(`${baseUrl}/api/expenses/${createdExpense.expense.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    assert.equal(deletedExpense.expense.id, createdExpense.expense.id);
    const expensesAfterDelete = await jsonFetch(`${baseUrl}/api/expenses`, {
      headers: { Cookie: cookie },
    });
    assert.equal(expensesAfterDelete.expenses.length, 0);

    const scheduleRows = [{
      employeeId: createdEmployee.user.id,
      advanceCard: '1000',
      salaryCard: '2000',
      bonusExtra: '300',
      claims: '999',
      days: {
        1: { rateRub: '12.5', issuedCount: '7' },
        2: { rateRub: '10', issuedCount: '0' },
      },
    }];

    const saved = await jsonFetch(`${baseUrl}/api/schedule`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {
        pointId: 'moscow_6231',
        month: '2026-06',
        rows: scheduleRows,
      },
    });
    assert.equal(
      saved.schedule.rows.some((row) => row.employeeId === createdEmployee.user.id),
      true,
    );

    const createdClaim = await jsonFetch(`${baseUrl}/api/claims`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: {
        date: '2026-06-15',
        amount: '100',
        pointId: 'moscow_6231',
        claimNumber: 'SMOKE-CLAIM-1',
        company: 'Smoke Company',
        status: 'withheld',
        guiltyEmployeeId: createdEmployee.user.id,
        comment: 'Smoke claim',
      },
    });
    assert.equal(createdClaim.claim.amount, '100');

    const claims = await jsonFetch(`${baseUrl}/api/claims`, {
      headers: { Cookie: cookie },
    });
    assert.equal(claims.claims.length, 1);
    assert.equal(claims.canManage, true);

    const loaded = await jsonFetch(`${baseUrl}/api/schedule?pointId=moscow_6231&month=2026-06`, {
      headers: { Cookie: cookie },
    });
    assert.equal(loaded.schedule.pointName, 'МОСКВА_6231');
    const loadedEmployeeRow = loaded.schedule.rows.find((row) => row.employeeId === createdEmployee.user.id);
    assert.equal(loadedEmployeeRow.employeeName, 'Иван Сотрудник');
    assert.equal(loadedEmployeeRow.days['1'].rateRub, '12.5');
    assert.equal(loadedEmployeeRow.days['1'].issuedCount, '7');
    assert.equal(loadedEmployeeRow.advanceCard, '1000');
    assert.equal(loadedEmployeeRow.salaryCard, '2000');
    assert.equal(loadedEmployeeRow.bonusExtra, '300');
    assert.equal(loadedEmployeeRow.premiumActive, true);
    assert.equal(loadedEmployeeRow.claims, '100');

    await jsonFetch(`${baseUrl}/api/users/${createdEmployee.user.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    const afterDelete = await jsonFetch(`${baseUrl}/api/users`, {
      headers: { Cookie: cookie },
    });
    assert.equal(afterDelete.users.length, 2);

    console.log(`Smoke OK: ${baseUrl}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status}: ${body.error}`);
  }
  return options.includeHeaders ? { body, headers: response.headers } : body;
}

function readPasswordFromOutbox(dataDir, email = '') {
  const outboxDir = path.join(dataDir, 'outbox');
  const safeEmail = email.replace(/[^a-z0-9@._-]+/gi, '_');
  const files = fs.readdirSync(outboxDir)
    .filter((name) => name.endsWith('.eml') && (!safeEmail || name.includes(safeEmail)))
    .sort();
  const fileName = files[files.length - 1];
  if (!fileName) throw new Error(`Password email was not written to outbox for ${email || 'any address'}.`);
  const raw = fs.readFileSync(path.join(outboxDir, fileName), 'utf8');
  const match = raw.match(/Пароль:\s*(.+)/);
  if (!match) throw new Error('Password was not written to outbox.');
  return match[1].trim();
}

function solveCaptcha(question) {
  const match = String(question || '').match(/^(\d+) ([+-]) (\d+)/);
  if (!match) throw new Error(`Unexpected captcha question: ${question}`);
  const left = Number(match[1]);
  const right = Number(match[3]);
  return String(match[2] === '+' ? left + right : left - right);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
