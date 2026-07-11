'use strict';

const state = {
  user: null,
  permissions: {},
  roles: [],
  sections: [],
  points: [],
  users: [],
  repairs: [],
  expenses: [],
  employeeDocumentTypes: [],
  expenseFilters: {
    point: '',
    payment: '',
    author: '',
  },
  repairStatuses: [],
  repairPriorities: [],
  expensePaymentMethods: [],
  schedule: null,
  canEditSchedule: false,
  canManageAllSchedule: false,
  employeeOptions: [],
  selectedEmployeeId: null,
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  bootstrap();
});

function bindElements() {
  Object.assign(els, {
    authScreen: document.getElementById('authScreen'),
    appShell: document.getElementById('appShell'),
    showLogin: document.getElementById('showLogin'),
    showRegister: document.getElementById('showRegister'),
    showForgot: document.getElementById('showForgot'),
    cancelForgot: document.getElementById('cancelForgot'),
    loginForm: document.getElementById('loginForm'),
    forgotPasswordForm: document.getElementById('forgotPasswordForm'),
    registerForm: document.getElementById('registerForm'),
    authNotice: document.getElementById('authNotice'),
    logoutButton: document.getElementById('logoutButton'),
    currentUserLine: document.getElementById('currentUserLine'),
    rolePill: document.getElementById('rolePill'),
    profileName: document.getElementById('profileName'),
    profilePhone: document.getElementById('profilePhone'),
    profileEmail: document.getElementById('profileEmail'),
    profileRole: document.getElementById('profileRole'),
    profileNotice: document.getElementById('profileNotice'),
    passwordForm: document.getElementById('passwordForm'),
    employeesTab: document.getElementById('employeesTab'),
    employeesBody: document.getElementById('employeesBody'),
    employeesNotice: document.getElementById('employeesNotice'),
    employeeAddPanel: document.getElementById('employeeAddPanel'),
    employeeForm: document.getElementById('employeeForm'),
    employeeCardPanel: document.getElementById('employeeCardPanel'),
    employeeCardTitle: document.getElementById('employeeCardTitle'),
    employeeCardForm: document.getElementById('employeeCardForm'),
    employeeCardPremiumRows: document.getElementById('employeeCardPremiumRows'),
    employeeDocumentType: document.getElementById('employeeDocumentType'),
    employeeDocumentFile: document.getElementById('employeeDocumentFile'),
    uploadEmployeeDocument: document.getElementById('uploadEmployeeDocument'),
    employeeDocumentsList: document.getElementById('employeeDocumentsList'),
    addPremiumRow: document.getElementById('addPremiumRow'),
    closeEmployeeCard: document.getElementById('closeEmployeeCard'),
    deleteEmployeeCard: document.getElementById('deleteEmployeeCard'),
    refreshEmployees: document.getElementById('refreshEmployees'),
    usersPanel: document.getElementById('usersPanel'),
    usersBody: document.getElementById('usersBody'),
    refreshUsers: document.getElementById('refreshUsers'),
    auditPanel: document.getElementById('auditPanel'),
    auditList: document.getElementById('auditList'),
    refreshAudit: document.getElementById('refreshAudit'),
    repairForm: document.getElementById('repairForm'),
    repairPointSelect: document.getElementById('repairPointSelect'),
    refreshRepairs: document.getElementById('refreshRepairs'),
    repairsBody: document.getElementById('repairsBody'),
    repairsNotice: document.getElementById('repairsNotice'),
    expenseForm: document.getElementById('expenseForm'),
    expensePointSelect: document.getElementById('expensePointSelect'),
    expenseDateInput: document.getElementById('expenseDateInput'),
    expensePaymentMethod: document.getElementById('expensePaymentMethod'),
    expensePointFilter: document.getElementById('expensePointFilter'),
    expensePaymentFilter: document.getElementById('expensePaymentFilter'),
    expenseAuthorFilter: document.getElementById('expenseAuthorFilter'),
    refreshExpenses: document.getElementById('refreshExpenses'),
    expensesBody: document.getElementById('expensesBody'),
    expensesNotice: document.getElementById('expensesNotice'),
    pointSelect: document.getElementById('pointSelect'),
    monthInput: document.getElementById('monthInput'),
    loadSchedule: document.getElementById('loadSchedule'),
    scheduleCaption: document.getElementById('scheduleCaption'),
    scheduleUpdated: document.getElementById('scheduleUpdated'),
    scheduleTable: document.getElementById('scheduleTable'),
    summaryTable: document.getElementById('summaryTable'),
    summaryBody: document.getElementById('summaryBody'),
    summaryFooter: document.getElementById('summaryFooter'),
    addRowButton: document.getElementById('addRowButton'),
    saveScheduleButton: document.getElementById('saveScheduleButton'),
    scheduleNotice: document.getElementById('scheduleNotice'),
  });
}

function bindEvents() {
  els.showLogin.addEventListener('click', () => switchAuthMode('login'));
  els.showRegister.addEventListener('click', () => switchAuthMode('register'));
  els.showForgot.addEventListener('click', showForgotPassword);
  els.cancelForgot.addEventListener('click', () => switchAuthMode('login'));
  els.loginForm.addEventListener('submit', handleLogin);
  els.forgotPasswordForm.addEventListener('submit', handleForgotPassword);
  els.registerForm.addEventListener('submit', handleRegister);
  els.logoutButton.addEventListener('click', handleLogout);
  els.passwordForm.addEventListener('submit', handlePasswordChange);
  els.employeeForm.addEventListener('submit', handleEmployeeCreate);
  els.employeeCardForm.addEventListener('submit', handleEmployeeCardSave);
  els.closeEmployeeCard.addEventListener('click', closeEmployeeCard);
  els.addPremiumRow.addEventListener('click', () => addPremiumHistoryRow());
  els.employeeCardPremiumRows.addEventListener('click', handlePremiumHistoryClick);
  els.employeeCardPremiumRows.addEventListener('change', handlePremiumHistoryChange);
  els.uploadEmployeeDocument.addEventListener('click', handleEmployeeDocumentUpload);
  els.employeeDocumentsList.addEventListener('click', handleEmployeeDocumentClick);
  els.deleteEmployeeCard.addEventListener('click', () => deleteEmployee(state.selectedEmployeeId, els.deleteEmployeeCard));
  els.refreshEmployees.addEventListener('click', loadUsers);
  els.refreshAudit.addEventListener('click', loadAudit);
  els.repairForm.addEventListener('submit', handleRepairCreate);
  els.refreshRepairs.addEventListener('click', loadRepairs);
  els.repairsBody.addEventListener('change', handleRepairStatusChange);
  els.expenseForm.addEventListener('submit', handleExpenseCreate);
  els.expensePointFilter.addEventListener('change', () => updateExpenseFilter('point', els.expensePointFilter.value));
  els.expensePaymentFilter.addEventListener('change', () => updateExpenseFilter('payment', els.expensePaymentFilter.value));
  els.expenseAuthorFilter.addEventListener('change', () => updateExpenseFilter('author', els.expenseAuthorFilter.value));
  els.expensesBody.addEventListener('click', handleExpenseTableClick);
  els.refreshExpenses.addEventListener('click', loadExpenses);
  els.loadSchedule.addEventListener('click', loadSchedule);
  els.pointSelect.addEventListener('change', loadSchedule);
  els.monthInput.addEventListener('change', loadSchedule);
  els.addRowButton.addEventListener('click', addScheduleRow);
  els.saveScheduleButton.addEventListener('click', saveSchedule);
  els.scheduleTable.addEventListener('input', updateScheduleFromInput);
  els.scheduleTable.addEventListener('change', updateScheduleFromInput);
  els.scheduleTable.addEventListener('click', handleScheduleClick);
  els.summaryBody.addEventListener('input', updateSummaryInput);
  els.summaryBody.addEventListener('change', updateSummaryInput);

  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => activateView(button.dataset.view));
  });
}

async function bootstrap() {
  els.monthInput.value = currentMonth();
  els.expenseDateInput.value = currentDate();
  try {
    await loadSession();
    await loadAppData();
    showApp();
  } catch {
    showAuth();
  }
}

async function loadSession() {
  const data = await api('/api/me');
  state.user = data.user;
  state.permissions = data.permissions;
  state.roles = data.roles;
  state.sections = data.sections || [];
  state.points = data.points || [];
}

async function loadAppData() {
  await loadPoints();
  renderProfile();
  renderEmployeeFormAccessControls();

  if (state.permissions.canViewUsers) {
    await loadUsers();
  }
  if (state.permissions.canViewAudit) {
    await loadAudit();
  }
  if (state.permissions.canViewRepairs) {
    await loadRepairs();
  } else {
    renderRepairs();
  }
  if (state.permissions.canViewExpenses) {
    await loadExpenses();
  } else {
    renderExpenses();
  }
  if (state.permissions.canViewSchedule) {
    await loadSchedule();
  } else {
    renderUnavailableSchedule();
  }
}

function showAuth() {
  els.authScreen.classList.remove('is-hidden');
  els.appShell.classList.add('is-hidden');
}

function showApp() {
  els.authScreen.classList.add('is-hidden');
  els.appShell.classList.remove('is-hidden');
}

function switchAuthMode(mode) {
  const isLogin = mode === 'login';
  els.showLogin.classList.toggle('is-active', isLogin);
  els.showRegister.classList.toggle('is-active', !isLogin);
  els.showLogin.setAttribute('aria-selected', String(isLogin));
  els.showRegister.setAttribute('aria-selected', String(!isLogin));
  els.loginForm.classList.toggle('is-active', isLogin);
  els.forgotPasswordForm.classList.remove('is-active');
  els.registerForm.classList.toggle('is-active', !isLogin);
  showNotice(els.authNotice, '');
}

function showForgotPassword() {
  els.showLogin.classList.add('is-active');
  els.showRegister.classList.remove('is-active');
  els.showLogin.setAttribute('aria-selected', 'true');
  els.showRegister.setAttribute('aria-selected', 'false');
  els.loginForm.classList.remove('is-active');
  els.registerForm.classList.remove('is-active');
  els.forgotPasswordForm.classList.add('is-active');
  els.forgotPasswordForm.elements.email.value = els.loginForm.elements.email.value.trim();
  showNotice(els.authNotice, '');
}

async function handleLogin(event) {
  event.preventDefault();
  const button = event.submitter;
  await runWithButton(button, async () => {
    const body = formValues(els.loginForm);
    await api('/api/login', { method: 'POST', body });
    await loadSession();
    await loadAppData();
    showApp();
    showNotice(els.authNotice, '');
  }, els.authNotice);
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const button = event.submitter;
  await runWithButton(button, async () => {
    const data = await api('/api/forgot-password', {
      method: 'POST',
      body: formValues(els.forgotPasswordForm),
    });
    els.forgotPasswordForm.reset();
    switchAuthMode('login');

    if (data.emailDelivery?.status === 'outbox') {
      showNotice(
        els.authNotice,
        [
          `${data.message} Причина: ${data.emailDelivery.reason}. Файл: ${data.emailDelivery.outboxPath}.`,
          storageWarningText(data.storage),
        ].filter(Boolean).join(' '),
        'warning',
      );
    } else {
      const storageWarning = storageWarningText(data.storage);
      showNotice(
        els.authNotice,
        [data.message, storageWarning].filter(Boolean).join(' '),
        storageWarning ? 'warning' : 'success',
      );
    }
  }, els.authNotice);
}

async function handleRegister(event) {
  event.preventDefault();
  const button = event.submitter;
  await runWithButton(button, async () => {
    const body = formValues(els.registerForm);
    const data = await api('/api/register', { method: 'POST', body });
    els.registerForm.reset();
    switchAuthMode('login');

    if (data.emailDelivery?.status === 'outbox') {
      showNotice(
        els.authNotice,
        [
          `${data.message} Причина: ${data.emailDelivery.reason}. Файл: ${data.emailDelivery.outboxPath}.`,
          storageWarningText(data.storage),
        ].filter(Boolean).join(' '),
        'warning',
      );
    } else {
      const storageWarning = storageWarningText(data.storage);
      showNotice(
        els.authNotice,
        [data.message, storageWarning].filter(Boolean).join(' '),
        storageWarning ? 'warning' : 'success',
      );
    }
  }, els.authNotice);
}

async function handleLogout() {
  await runWithButton(els.logoutButton, async () => {
    await api('/api/logout', { method: 'POST', body: {} });
    state.user = null;
    state.permissions = {};
    state.sections = [];
    state.points = [];
    state.schedule = null;
    state.expenses = [];
    state.selectedEmployeeId = null;
    showAuth();
  }, els.profileNotice);
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const button = event.submitter;
  await runWithButton(button, async () => {
    await api('/api/change-password', {
      method: 'POST',
      body: formValues(els.passwordForm),
    });
    els.passwordForm.reset();
    showNotice(els.profileNotice, 'Пароль обновлен.', 'success');
  }, els.profileNotice);
}

function activateView(viewId) {
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === viewId);
  });
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('is-active', view.id === viewId);
  });
}

function renderProfile() {
  const user = state.user;
  els.currentUserLine.textContent = `${user.fullName} · ${user.roleLabel}`;
  els.rolePill.textContent = user.roleLabel;
  els.profileName.textContent = user.fullName;
  els.profilePhone.textContent = user.phone;
  els.profileEmail.textContent = user.email;
  els.profileRole.textContent = user.roleLabel;
  els.employeesTab.classList.toggle('is-hidden', !state.permissions.canViewUsers);
  setTabVisibility('scheduleView', Boolean(state.permissions.canViewSchedule));
  setTabVisibility('repairsView', Boolean(state.permissions.canViewRepairs));
  setTabVisibility('expensesView', Boolean(state.permissions.canViewExpenses));
  els.employeeAddPanel.classList.toggle('is-hidden', !state.permissions.canManageRoles);
  if (els.usersPanel) {
    els.usersPanel.classList.add('is-hidden');
  }
  els.auditPanel.classList.toggle('is-hidden', !state.permissions.canViewAudit);
  ensureActiveTabVisible();
}

function setTabVisibility(viewId, visible) {
  const tab = document.querySelector(`.tab[data-view="${viewId}"]`);
  if (tab) tab.classList.toggle('is-hidden', !visible);
}

function ensureActiveTabVisible() {
  const active = document.querySelector('.tab.is-active');
  if (!active || active.classList.contains('is-hidden')) {
    activateView('profileView');
  }
}

async function loadPoints() {
  const data = await api('/api/points');
  state.points = data.points;
  fillPointSelect(els.pointSelect);
  fillPointSelect(els.repairPointSelect);
  fillPointSelect(els.expensePointSelect);
  renderEmployeeFormAccessControls();
}

function fillPointSelect(select) {
  select.replaceChildren(...state.points.map((point) => {
    const option = document.createElement('option');
    option.value = point.id;
    option.textContent = point.name;
    return option;
  }));
  select.disabled = !state.points.length;
}

async function loadRepairs() {
  if (!state.permissions.canViewRepairs) return;
  await runWithButton(els.refreshRepairs, async () => {
    const data = await api('/api/repairs');
    state.repairs = data.repairs;
    state.repairStatuses = data.statuses || [];
    state.repairPriorities = data.priorities || [];
    state.permissions.canManageRepairs = data.canManage;
    renderRepairs();
  }, els.repairsNotice);
}

function renderRepairs() {
  els.repairsBody.replaceChildren();
  const repairsAllowed = Boolean(state.permissions.canViewRepairs && state.points.length);
  Array.from(els.repairForm.elements).forEach((field) => {
    field.disabled = !repairsAllowed;
  });

  if (!state.repairs.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'empty-state';
    cell.textContent = 'Заявок на ремонт пока нет.';
    row.append(cell);
    els.repairsBody.append(row);
    return;
  }

  for (const repair of state.repairs) {
    els.repairsBody.append(buildRepairRow(repair));
  }
}

function buildRepairRow(repair) {
  const row = document.createElement('tr');
  row.dataset.repairId = repair.id;
  appendCell(row, formatDateTime(repair.createdAt));
  appendCell(row, repair.pointName);
  appendCell(row, repair.title);
  appendCell(row, repair.priorityLabel);
  row.append(repairStatusCell(repair));
  appendCell(row, repair.createdByName || '');
  appendCell(row, repair.description);
  return row;
}

function repairStatusCell(repair) {
  const cell = document.createElement('td');
  if (!state.permissions.canManageRepairs) {
    cell.textContent = repair.statusLabel;
    return cell;
  }

  const select = document.createElement('select');
  select.name = 'repairStatus';
  select.dataset.field = 'repairStatus';
  for (const status of state.repairStatuses) {
    const option = document.createElement('option');
    option.value = status.value;
    option.textContent = status.label;
    option.selected = status.value === repair.status;
    select.append(option);
  }
  cell.append(select);
  return cell;
}

async function handleRepairCreate(event) {
  event.preventDefault();
  if (!state.permissions.canViewRepairs || !state.points.length) {
    showNotice(els.repairsNotice, 'Нет доступа к заявкам или торговым точкам.', 'warning');
    return;
  }
  const button = event.submitter;
  await runWithButton(button, async () => {
    const data = await api('/api/repairs', {
      method: 'POST',
      body: formValues(els.repairForm),
    });
    state.repairs = [data.repair, ...state.repairs];
    els.repairForm.reset();
    if (state.points[0]) {
      els.repairPointSelect.value = state.points[0].id;
    }
    renderRepairs();
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    showNotice(
      els.repairsNotice,
      ['Заявка на ремонт создана.', storageWarning].filter(Boolean).join(' '),
      storageWarning ? 'warning' : 'success',
    );
  }, els.repairsNotice);
}

async function handleRepairStatusChange(event) {
  const select = event.target.closest('select[data-field="repairStatus"]');
  if (!select) return;
  const row = select.closest('tr[data-repair-id]');
  if (!row) return;
  select.disabled = true;
  try {
    const data = await api(`/api/repairs/${encodeURIComponent(row.dataset.repairId)}`, {
      method: 'PATCH',
      body: { status: select.value },
    });
    state.repairs = state.repairs.map((repair) => (repair.id === data.repair.id ? data.repair : repair));
    renderRepairs();
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    showNotice(
      els.repairsNotice,
      ['Статус заявки обновлен.', storageWarning].filter(Boolean).join(' '),
      storageWarning ? 'warning' : 'success',
    );
  } catch (error) {
    showNotice(els.repairsNotice, error.message, 'error');
    await loadRepairs();
  } finally {
    select.disabled = false;
  }
}

async function loadExpenses() {
  if (!state.permissions.canViewExpenses) return;
  await runWithButton(els.refreshExpenses, async () => {
    const data = await api('/api/expenses');
    state.expenses = data.expenses;
    state.expensePaymentMethods = data.paymentMethods || [];
    state.permissions.canManageExpenses = data.canManage;
    renderExpenses();
  }, els.expensesNotice);
}

function renderExpenses() {
  els.expensesBody.replaceChildren();
  fillExpensePaymentMethods();
  if (!els.expenseDateInput.value) {
    els.expenseDateInput.value = currentDate();
  }
  const expensesAllowed = Boolean(state.permissions.canManageExpenses && state.points.length);
  Array.from(els.expenseForm.elements).forEach((field) => {
    field.disabled = !expensesAllowed;
  });
  fillExpenseTableFilters();

  if (!state.expenses.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'empty-state';
    cell.textContent = 'Хозрасходов пока нет.';
    row.append(cell);
    els.expensesBody.append(row);
    return;
  }

  const expenses = filterExpenses(state.expenses).sort(compareExpensesByDateDesc);
  if (!expenses.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'empty-state';
    cell.textContent = 'Нет расходов по выбранному фильтру.';
    row.append(cell);
    els.expensesBody.append(row);
    els.expensesBody.append(buildExpenseTotalRow(expenses));
    return;
  }
  for (const expense of expenses) {
    els.expensesBody.append(buildExpenseRow(expense));
  }
  els.expensesBody.append(buildExpenseTotalRow(expenses));
}

function fillExpensePaymentMethods() {
  const methods = state.expensePaymentMethods.length
    ? state.expensePaymentMethods
    : [
        { value: 'corp_card', label: 'корп.карта' },
        { value: 'cash', label: 'наличные' },
        { value: 'card', label: 'карта' },
      ];
  els.expensePaymentMethod.replaceChildren(...methods.map((method) => {
    const option = document.createElement('option');
    option.value = method.value;
    option.textContent = method.label;
    return option;
  }));
}

function fillExpenseTableFilters() {
  fillExpenseColumnFilter(els.expensePointFilter, 'point', 'Все точки');
  fillExpenseColumnFilter(els.expensePaymentFilter, 'payment', 'Все оплаты');
  fillExpenseColumnFilter(els.expenseAuthorFilter, 'author', 'Все авторы');
}

function fillExpenseColumnFilter(select, filterName, allLabel) {
  const options = expenseFilterOptions(filterName);
  const currentValue = state.expenseFilters[filterName] || '';
  select.replaceChildren(selectOption('', allLabel));
  for (const option of options) {
    select.append(selectOption(option.value, option.label));
  }
  if (currentValue && !options.some((option) => option.value === currentValue)) {
    state.expenseFilters[filterName] = '';
  }
  select.value = state.expenseFilters[filterName] || '';
}

function updateExpenseFilter(filterName, value) {
  state.expenseFilters[filterName] = value;
  renderExpenses();
}

function selectOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function buildExpenseRow(expense) {
  const row = document.createElement('tr');
  row.dataset.expenseId = expense.id;
  appendCell(row, expense.expenseDate ? formatDate(expense.expenseDate) : formatDateTime(expense.createdAt));
  appendCell(row, expense.pointName);
  appendCell(row, formatMoney(expense.amount), 'numeric-cell');
  appendCell(row, expense.paymentMethodLabel);
  appendCell(row, expense.createdByName || '');

  const receiptCell = document.createElement('td');
  if (expense.receiptUrl) {
    const link = document.createElement('a');
    link.href = expense.receiptUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Открыть чек';
    receiptCell.append(link);
  } else {
    receiptCell.textContent = 'Недоступен';
  }
  row.append(receiptCell);

  const driveCell = document.createElement('td');
  const drive = expense.googleDrive || {};
  if (drive.status === 'uploaded' && drive.webViewLink) {
    const link = document.createElement('a');
    link.href = drive.webViewLink;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'В архиве';
    driveCell.append(link);
  } else {
    driveCell.textContent = drive.reason || 'Не загружен';
  }
  row.append(driveCell);

  const actionsCell = document.createElement('td');
  if (state.permissions.canManageExpenses) {
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger expense-delete-button';
    deleteButton.dataset.action = 'delete-expense';
    deleteButton.dataset.expenseId = expense.id;
    deleteButton.textContent = 'Удалить';
    actionsCell.append(deleteButton);
  } else {
    actionsCell.textContent = '—';
  }
  row.append(actionsCell);
  return row;
}

function buildExpenseTotalRow(expenses) {
  const row = document.createElement('tr');
  row.className = 'expense-total-row';

  const labelCell = document.createElement('td');
  labelCell.colSpan = 2;
  labelCell.className = 'expense-total-label';
  labelCell.textContent = 'Итого по списку';

  const amountCell = document.createElement('td');
  amountCell.className = 'numeric-cell expense-total-sum';
  amountCell.textContent = formatMoney(sumExpenses(expenses));

  const restCell = document.createElement('td');
  restCell.colSpan = 5;

  row.append(labelCell, amountCell, restCell);
  return row;
}

function filterExpenses(expenses) {
  return expenses.filter((expense) => (
    expenseMatchesFilter(expense, 'point')
    && expenseMatchesFilter(expense, 'payment')
    && expenseMatchesFilter(expense, 'author')
  ));
}

function expenseMatchesFilter(expense, filterName) {
  const filterValue = state.expenseFilters[filterName];
  return !filterValue || expenseFilterValue(expense, filterName) === filterValue;
}

function expenseFilterOptions(filterName) {
  const grouped = new Map();
  for (const expense of state.expenses) {
    const value = expenseFilterValue(expense, filterName);
    const current = grouped.get(value) || {
      value,
      label: value,
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total += toNumber(expense.amount);
    grouped.set(value, current);
  }
  return [...grouped.values()].sort((left, right) => left.label.localeCompare(right.label, 'ru'));
}

function expenseFilterValue(expense, filterName) {
  if (filterName === 'author') return expense.createdByName || 'Не указано';
  if (filterName === 'payment') return expense.paymentMethodLabel || 'Не указано';
  if (filterName === 'point') return expense.pointName || 'Не указано';
  return '';
}

function sumExpenses(expenses) {
  return expenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
}

function compareExpensesByDateDesc(left, right) {
  return expenseSortTime(right) - expenseSortTime(left);
}

function expenseSortTime(expense) {
  const date = expense.expenseDate
    ? `${expense.expenseDate}T23:59:59`
    : expense.createdAt;
  const time = new Date(date).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function handleExpenseCreate(event) {
  event.preventDefault();
  if (!state.permissions.canManageExpenses || !state.points.length) {
    showNotice(els.expensesNotice, 'Нет прав на внесение хозрасходов или доступных торговых точек.', 'warning');
    return;
  }
  const button = event.submitter;
  await runWithButton(button, async () => {
    const values = formValues(els.expenseForm);
    const file = els.expenseForm.elements.receipt.files[0];
    const receipt = await receiptPayloadFromFile(file);
    const data = await api('/api/expenses', {
      method: 'POST',
      body: { ...values, receipt },
    });
    state.expenses = [data.expense, ...state.expenses];
    els.expenseForm.reset();
    els.expenseDateInput.value = currentDate();
    if (state.points[0]) {
      els.expensePointSelect.value = state.points[0].id;
    }
    fillExpensePaymentMethods();
    renderExpenses();
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    const driveWarning = expenseDriveWarning(data.expense.googleDrive);
    showNotice(
      els.expensesNotice,
      ['Хозрасход сохранен.', driveWarning, storageWarning].filter(Boolean).join(' '),
      driveWarning || storageWarning ? 'warning' : 'success',
    );
  }, els.expensesNotice);
}

async function handleExpenseTableClick(event) {
  const button = event.target.closest('[data-action="delete-expense"]');
  if (!button) return;

  const expenseId = button.dataset.expenseId;
  const expense = state.expenses.find((item) => item.id === expenseId);
  const label = expense
    ? `${expense.expenseDate ? formatDate(expense.expenseDate) : 'без даты'}, ${expense.pointName}, ${formatMoney(expense.amount)}`
    : 'этот расход';
  if (!window.confirm(`Удалить ${label}?`)) return;

  await runWithButton(button, async () => {
    const data = await api(`/api/expenses/${encodeURIComponent(expenseId)}`, {
      method: 'DELETE',
      body: {},
    });
    state.expenses = state.expenses.filter((item) => item.id !== data.expense.id);
    renderExpenses();
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    const driveWarning = expenseDriveDeleteWarning(data.expense.googleDriveCleanup);
    showNotice(
      els.expensesNotice,
      ['Хозрасход удален.', driveWarning, storageWarning].filter(Boolean).join(' '),
      driveWarning || storageWarning ? 'warning' : 'success',
    );
  }, els.expensesNotice);
}

function expenseDriveWarning(googleDrive) {
  if (googleDrive?.status === 'uploaded') return '';
  return `Google Drive: ${googleDrive?.reason || 'чек не удалось отправить в архив.'}`;
}

function expenseDriveDeleteWarning(cleanup) {
  if (!cleanup || cleanup.status === 'deleted' || cleanup.status === 'skipped') return '';
  return `Google Drive: ${cleanup.reason || 'чек не удалось удалить из архива.'}`;
}

async function employeeDocumentPayloadFromFile(file) {
  if (!file) throw new Error('Выберите файл документа.');
  const lowerName = String(file.name || '').toLowerCase();
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
  const isJpeg = file.type === 'image/jpeg' || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg');
  if (!isPdf && !isJpeg) {
    throw new Error('Поддерживаются документы в формате JPEG или PDF.');
  }

  if (isPdf) {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('PDF документа слишком большой. Максимум 5 МБ.');
    }
    return {
      fileName: file.name,
      mimeType: 'application/pdf',
      size: file.size,
      dataUrl: await readFileAsDataUrlWithMime(file, 'application/pdf'),
    };
  }

  const compressed = await compressReceiptImage(file);
  if (compressed.size > 5 * 1024 * 1024) {
    throw new Error('Файл документа слишком большой. Максимум 5 МБ.');
  }
  return {
    fileName: file.name,
    mimeType: 'image/jpeg',
    size: compressed.size,
    dataUrl: compressed.dataUrl.replace(/^data:[^;]+;/, 'data:image/jpeg;'),
  };
}

async function receiptPayloadFromFile(file) {
  if (!file) throw new Error('Приложите чек.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
    throw new Error('Поддерживаются JPG, PNG, WebP или PDF.');
  }

  if (file.type === 'application/pdf') {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('PDF чека слишком большой. Максимум 5 МБ.');
    }
    return {
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      dataUrl: await readFileAsDataUrl(file),
    };
  }

  const compressed = await compressReceiptImage(file);
  if (compressed.size > 5 * 1024 * 1024) {
    throw new Error('Файл чека слишком большой. Максимум 5 МБ после сжатия.');
  }
  return {
    fileName: file.name,
    mimeType: compressed.mimeType,
    size: compressed.size,
    dataUrl: compressed.dataUrl,
  };
}

async function compressReceiptImage(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  try {
    const image = await loadImage(originalDataUrl);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (dataUrlByteSize(dataUrl) > 2.5 * 1024 * 1024) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.68);
    }
    return {
      dataUrl,
      mimeType: 'image/jpeg',
      size: dataUrlByteSize(dataUrl),
    };
  } catch {
    return {
      dataUrl: originalDataUrl,
      mimeType: file.type,
      size: file.size,
    };
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать фото чека.'));
    reader.readAsDataURL(file);
  });
}

async function readFileAsDataUrlWithMime(file, mimeType) {
  const dataUrl = await readFileAsDataUrl(file);
  return dataUrl.replace(/^data:[^;]*;/, `data:${mimeType};`);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось обработать фото чека.'));
    image.src = src;
  });
}

function dataUrlByteSize(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

async function loadUsers() {
  if (!state.permissions.canViewUsers) return;
  await runWithButton(els.refreshEmployees, async () => {
    const data = await api('/api/users');
    state.users = data.users;
    state.roles = data.roles;
    state.employeeDocumentTypes = data.documentTypes || [];
    state.sections = data.sections || state.sections;
    state.points = data.points || state.points;
    renderEmployeeFormAccessControls();
    renderEmployees();
    renderEmployeeCard();
  }, els.employeesNotice);
}

function renderEmployees() {
  els.employeesBody.replaceChildren();

  if (!state.users.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'empty-state';
    cell.textContent = 'Нет сотрудников.';
    row.append(cell);
    els.employeesBody.append(row);
    return;
  }

  for (const user of state.users) {
    els.employeesBody.append(buildEmployeeRow(user));
  }
}

function buildEmployeeRow(user) {
  const row = document.createElement('tr');
  row.dataset.userId = user.id;

  const nameCell = document.createElement('td');
  const nameButton = document.createElement('button');
  nameButton.className = 'text-link';
  nameButton.type = 'button';
  nameButton.textContent = user.fullName;
  nameButton.addEventListener('click', () => openEmployeeCard(user.id));
  nameCell.append(nameButton);
  row.append(nameCell);

  appendCell(row, user.phone || '');
  appendCell(row, user.email || '');
  appendCell(row, user.roleLabel || user.role || '');
  return row;
}

function openEmployeeCard(userId) {
  state.selectedEmployeeId = userId;
  renderEmployeeCard();
  els.employeeCardPanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function closeEmployeeCard() {
  state.selectedEmployeeId = null;
  renderEmployeeCard();
}

function selectedEmployee() {
  return state.users.find((user) => user.id === state.selectedEmployeeId) || null;
}

function selectedEmployeeEditable(user = selectedEmployee()) {
  return Boolean(user && state.permissions.canManageRoles && user.role !== 'owner');
}

function renderEmployeeCard() {
  const user = selectedEmployee();
  if (!user) {
    els.employeeCardPanel.classList.add('is-hidden');
    els.employeeCardForm.reset();
    els.employeeCardForm.dataset.userId = '';
    els.employeeDocumentFile.value = '';
    els.employeeDocumentsList.replaceChildren();
    return;
  }

  const editable = selectedEmployeeEditable(user);
  const form = els.employeeCardForm;
  form.dataset.userId = user.id;
  els.employeeCardTitle.textContent = `Карточка сотрудника: ${user.fullName}`;
  form.elements.fullName.value = user.fullName || '';
  form.elements.phone.value = user.phone || '';
  form.elements.email.value = user.email || '';
  form.elements.position.value = user.position || '';
  form.elements.hireDate.value = user.hireDate || '';
  form.elements.officialEmployment.checked = Boolean(user.officialEmployment);

  renderEmployeeCardRole(user, editable);
  renderEmployeeCardAccess(user, editable);
  renderPremiumHistoryRows(user.premiumHistory || [], editable);
  renderEmployeeDocumentTypeOptions();
  renderEmployeeDocuments(user.employeeDocuments || [], editable);
  setEmployeeCardEditable(editable);
  els.employeeCardPanel.classList.remove('is-hidden');
}

function renderEmployeeCardRole(user, editable) {
  const select = els.employeeCardForm.elements.role;
  select.replaceChildren();
  const options = user.role === 'owner'
    ? [{ value: 'owner', label: user.roleLabel || 'Владелец' }, ...state.roles]
    : state.roles;
  const seen = new Set();

  for (const role of options) {
    if (!role?.value || seen.has(role.value)) continue;
    seen.add(role.value);
    const option = document.createElement('option');
    option.value = role.value;
    option.textContent = role.label;
    option.selected = role.value === user.role;
    select.append(option);
  }
  select.disabled = !editable;
}

function renderEmployeeCardAccess(user, editable) {
  const sectionTarget = document.querySelector('[data-access-card="sections"]');
  const pointTarget = document.querySelector('[data-access-card="points"]');
  if (sectionTarget) {
    sectionTarget.replaceChildren(buildAccessCheckboxes('allowedSections', state.sections, new Set(user.allowedSections || [])));
    setInputsDisabled(sectionTarget, !editable);
  }
  if (pointTarget) {
    const pointOptions = state.points.map((point) => ({ id: point.id, label: point.name }));
    pointTarget.replaceChildren(buildAccessCheckboxes('allowedPoints', pointOptions, new Set(user.allowedPoints || [])));
    setInputsDisabled(pointTarget, !editable);
  }
}

function setEmployeeCardEditable(editable) {
  els.employeeCardForm
    .querySelectorAll('input, select')
    .forEach((field) => {
      field.disabled = !editable;
    });
  els.addPremiumRow.disabled = !editable;
  els.addPremiumRow.classList.toggle('is-hidden', !editable);
  els.employeeCardForm.querySelector('button[type="submit"]').classList.toggle('is-hidden', !editable);
  els.deleteEmployeeCard.classList.toggle('is-hidden', !editable);
  els.employeeCardPremiumRows
    .querySelectorAll('.premium-history-row')
    .forEach((row) => syncPremiumAmountState(row, editable));
  els.uploadEmployeeDocument.disabled = !editable;
  els.uploadEmployeeDocument.classList.toggle('is-hidden', !editable);
  els.employeeDocumentsList
    .querySelectorAll('button')
    .forEach((button) => {
      button.disabled = !editable;
      button.classList.toggle('is-hidden', !editable);
    });
}

function setInputsDisabled(root, disabled) {
  root.querySelectorAll('input, select, button').forEach((field) => {
    field.disabled = disabled;
  });
}

function renderPremiumHistoryRows(history, editable) {
  els.employeeCardPremiumRows.replaceChildren();
  const records = normalizePremiumHistoryForUi(history);

  if (!records.length) {
    renderEmptyPremiumHistory();
    return;
  }

  for (const record of records) {
    addPremiumHistoryRow(record, editable);
  }
}

function normalizePremiumHistoryForUi(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && item.startDate)
    .map((item) => ({
      startDate: item.startDate || '',
      active: item.active !== false,
      amount: item.amount || '',
    }))
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function renderEmptyPremiumHistory() {
  const empty = document.createElement('div');
  empty.className = 'empty-state premium-empty';
  empty.textContent = 'Премии не назначены.';
  els.employeeCardPremiumRows.append(empty);
}

function addPremiumHistoryRow(record = {}, editable = selectedEmployeeEditable()) {
  const empty = els.employeeCardPremiumRows.querySelector('.premium-empty');
  if (empty) empty.remove();

  const row = document.createElement('div');
  row.className = 'premium-history-row';

  const dateLabel = document.createElement('label');
  dateLabel.textContent = 'Дата начала';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.dataset.premiumField = 'startDate';
  dateInput.value = record.startDate || '';
  dateInput.disabled = !editable;
  dateLabel.append(dateInput);

  const activeLabel = document.createElement('label');
  activeLabel.className = 'check-row premium-check';
  const activeInput = document.createElement('input');
  activeInput.type = 'checkbox';
  activeInput.dataset.premiumField = 'active';
  activeInput.checked = record.active !== false;
  activeInput.disabled = !editable;
  const activeText = document.createElement('span');
  activeText.textContent = 'Активна';
  activeLabel.append(activeInput, activeText);

  const amountLabel = document.createElement('label');
  amountLabel.textContent = 'Сумма';
  const amountInput = document.createElement('input');
  amountInput.type = 'text';
  amountInput.inputMode = 'decimal';
  amountInput.pattern = '\\d*([,.]\\d+)?';
  amountInput.maxLength = 16;
  amountInput.dataset.premiumField = 'amount';
  amountInput.value = record.amount || '';
  amountLabel.append(amountInput);

  const remove = document.createElement('button');
  remove.className = 'danger premium-remove';
  remove.type = 'button';
  remove.dataset.removePremium = 'true';
  remove.textContent = 'Удалить';
  remove.disabled = !editable;

  row.append(dateLabel, activeLabel, amountLabel, remove);
  els.employeeCardPremiumRows.append(row);
  syncPremiumAmountState(row, editable);
}

function handlePremiumHistoryClick(event) {
  const button = event.target.closest('[data-remove-premium]');
  if (!button) return;
  button.closest('.premium-history-row')?.remove();
  if (!els.employeeCardPremiumRows.querySelector('.premium-history-row')) {
    renderEmptyPremiumHistory();
  }
}

function handlePremiumHistoryChange(event) {
  const row = event.target.closest('.premium-history-row');
  if (!row) return;
  syncPremiumAmountState(row, selectedEmployeeEditable());
}

function syncPremiumAmountState(row, editable) {
  const active = row.querySelector('[data-premium-field="active"]');
  const amount = row.querySelector('[data-premium-field="amount"]');
  if (!active || !amount) return;
  amount.disabled = !editable || !active.checked;
  if (!active.checked) {
    amount.value = '';
  }
}

function renderEmployeeDocumentTypeOptions() {
  const types = state.employeeDocumentTypes.length
    ? state.employeeDocumentTypes
    : [
        { value: 'passport_first', label: 'Паспорт 1-ая' },
        { value: 'passport_registration', label: 'Паспорт Прописка' },
        { value: 'inn', label: 'ИНН' },
        { value: 'snils', label: 'СНИЛС' },
        { value: 'card_details', label: 'Реквизиты карты' },
        { value: 'employment_contract', label: 'Трудовой договор' },
        { value: 'other', label: 'Прочие документы' },
      ];
  els.employeeDocumentType.replaceChildren(...types.map((type) => {
    const option = document.createElement('option');
    option.value = type.value;
    option.textContent = type.label;
    return option;
  }));
}

function renderEmployeeDocuments(documents, editable) {
  els.employeeDocumentsList.replaceChildren();
  if (!Array.isArray(documents) || !documents.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state employee-documents-empty';
    empty.textContent = 'Документы не загружены.';
    els.employeeDocumentsList.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'employee-documents-table';
  for (const documentItem of [...documents].sort(compareEmployeeDocuments)) {
    list.append(buildEmployeeDocumentRow(documentItem, editable));
  }
  els.employeeDocumentsList.append(list);
}

function buildEmployeeDocumentRow(documentItem, editable) {
  const row = document.createElement('div');
  row.className = 'employee-document-row';
  row.dataset.documentId = documentItem.id;

  const type = document.createElement('strong');
  type.textContent = documentItem.typeLabel || documentItem.type || 'Документ';

  const file = document.createElement('span');
  file.textContent = documentItem.fileName || documentItem.originalFileName || '';

  const date = document.createElement('span');
  date.textContent = documentItem.createdAt ? formatDateTime(documentItem.createdAt) : '';

  const linkWrap = document.createElement('span');
  if (documentItem.googleDrive?.webViewLink) {
    const link = document.createElement('a');
    link.href = documentItem.googleDrive.webViewLink;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Открыть';
    linkWrap.append(link);
  } else {
    linkWrap.textContent = documentItem.googleDrive?.reason || 'Нет ссылки';
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger employee-document-remove';
  remove.dataset.deleteEmployeeDocument = documentItem.id;
  remove.textContent = 'Удалить';
  remove.disabled = !editable;
  remove.classList.toggle('is-hidden', !editable);

  row.append(type, file, date, linkWrap, remove);
  return row;
}

function compareEmployeeDocuments(left, right) {
  const leftDate = left.createdAt || '';
  const rightDate = right.createdAt || '';
  return rightDate.localeCompare(leftDate) || String(left.typeLabel || '').localeCompare(String(right.typeLabel || ''), 'ru');
}

function employeeTextInputCell(user, field, editable, type = 'text') {
  const cell = document.createElement('td');
  if (!editable) {
    cell.textContent = field === 'hireDate' ? formatDate(user[field]) : (user[field] || '');
    return cell;
  }
  const input = document.createElement('input');
  input.name = field;
  input.type = type;
  input.value = user[field] || '';
  input.required = ['fullName', 'phone', 'email'].includes(field);
  if (field === 'fullName' || field === 'position') input.maxLength = 120;
  if (field === 'phone') input.maxLength = 32;
  if (field === 'email') input.maxLength = 180;
  if (field === 'premiumAmount') {
    input.inputMode = 'decimal';
    input.pattern = '\\d*([,.]\\d+)?';
    input.maxLength = 16;
  }
  cell.append(input);
  return cell;
}

function employeeOfficialCell(user, editable) {
  const cell = document.createElement('td');
  if (!editable) {
    cell.textContent = user.officialEmployment ? 'Да' : 'Нет';
    return cell;
  }
  const input = document.createElement('input');
  input.name = 'officialEmployment';
  input.type = 'checkbox';
  input.checked = Boolean(user.officialEmployment);
  cell.className = 'center-cell';
  cell.append(input);
  return cell;
}

function employeePremiumEnabledCell(user, editable) {
  const cell = document.createElement('td');
  if (!editable) {
    cell.textContent = user.premiumEnabled ? 'Да' : 'Нет';
    return cell;
  }
  const input = document.createElement('input');
  input.name = 'premiumEnabled';
  input.type = 'checkbox';
  input.checked = Boolean(user.premiumEnabled);
  cell.className = 'center-cell';
  cell.append(input);
  return cell;
}

function employeeRoleCell(user, editable) {
  const cell = document.createElement('td');
  if (!editable) {
    cell.textContent = user.roleLabel;
    return cell;
  }
  const select = document.createElement('select');
  select.name = 'role';
  for (const role of state.roles) {
    const option = document.createElement('option');
    option.value = role.value;
    option.textContent = role.label;
    option.selected = role.value === user.role;
    select.append(option);
  }
  cell.append(select);
  return cell;
}

function employeeAccessCell(user, editable, field, options) {
  const cell = document.createElement('td');
  const selected = new Set(user[field] || []);

  if (!editable) {
    const labels = options
      .filter((option) => selected.has(option.id))
      .map((option) => option.label);
    cell.textContent = user.role === 'owner' ? 'Все' : (labels.join(', ') || 'Нет');
    return cell;
  }

  cell.append(buildAccessCheckboxes(field, options, selected));
  return cell;
}

function buildAccessCheckboxes(field, options, selected = new Set()) {
  const wrap = document.createElement('div');
  wrap.className = 'access-options compact';

  if (!options.length) {
    const empty = document.createElement('span');
    empty.className = 'muted-inline';
    empty.textContent = 'Нет';
    wrap.append(empty);
    return wrap;
  }

  for (const option of options) {
    const label = document.createElement('label');
    label.className = 'mini-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = field;
    input.value = option.id;
    input.checked = selected.has(option.id);
    const text = document.createElement('span');
    text.textContent = option.label;
    label.append(input, text);
    wrap.append(label);
  }

  return wrap;
}

function renderEmployeeFormAccessControls() {
  const sectionTarget = document.querySelector('[data-access-form="sections"]');
  const pointTarget = document.querySelector('[data-access-form="points"]');
  if (sectionTarget) {
    sectionTarget.replaceChildren(buildAccessCheckboxes('allowedSections', state.sections));
  }
  if (pointTarget) {
    const pointOptions = state.points.map((point) => ({ id: point.id, label: point.name }));
    pointTarget.replaceChildren(buildAccessCheckboxes('allowedPoints', pointOptions));
  }
}

function employeeActionsCell(user, editable) {
  const cell = document.createElement('td');
  if (!editable) {
    cell.textContent = user.role === 'owner' ? 'Владелец' : '';
    return cell;
  }
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  const save = document.createElement('button');
  save.className = 'secondary';
  save.type = 'button';
  save.textContent = 'Сохранить';
  save.addEventListener('click', () => updateEmployee(user.id, save));
  const remove = document.createElement('button');
  remove.className = 'danger';
  remove.type = 'button';
  remove.textContent = 'Удалить';
  remove.addEventListener('click', () => deleteEmployee(user.id, remove));
  actions.append(save, remove);
  cell.append(actions);
  return cell;
}

async function handleEmployeeCreate(event) {
  event.preventDefault();
  const button = event.submitter;
  await runWithButton(button, async () => {
    const data = await api('/api/users', {
      method: 'POST',
      body: employeePayloadFromForm(els.employeeForm),
    });
    els.employeeForm.reset();
    state.selectedEmployeeId = data.user.id;
    await loadUsers();
    showEmployeeDelivery(data, 'Сотрудник добавлен.');
  }, els.employeesNotice);
}

async function handleEmployeeCardSave(event) {
  event.preventDefault();
  await updateEmployee(els.employeeCardForm.dataset.userId, event.submitter);
}

async function handleEmployeeDocumentUpload() {
  const userId = els.employeeCardForm.dataset.userId;
  if (!userId) return;
  const file = els.employeeDocumentFile.files[0];
  await runWithButton(els.uploadEmployeeDocument, async () => {
    const payload = await employeeDocumentPayloadFromFile(file);
    const data = await api(`/api/users/${encodeURIComponent(userId)}/documents`, {
      method: 'POST',
      body: {
        documentType: els.employeeDocumentType.value,
        file: payload,
      },
    });
    replaceUserInState(data.user);
    els.employeeDocumentFile.value = '';
    renderEmployees();
    renderEmployeeCard();
    showNotice(
      els.employeesNotice,
      ['Документ загружен в Google Drive.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.employeesNotice);
}

async function handleEmployeeDocumentClick(event) {
  const button = event.target.closest('[data-delete-employee-document]');
  if (!button) return;
  const userId = els.employeeCardForm.dataset.userId;
  const documentId = button.dataset.deleteEmployeeDocument;
  const user = selectedEmployee();
  const documentItem = user?.employeeDocuments?.find((item) => item.id === documentId);
  const label = documentItem ? `${documentItem.typeLabel}: ${documentItem.fileName}` : 'документ';
  if (!window.confirm(`Удалить ${label} из карточки и Google Drive?`)) return;

  await runWithButton(button, async () => {
    const data = await api(`/api/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    });
    replaceUserInState(data.user);
    renderEmployees();
    renderEmployeeCard();
    showNotice(
      els.employeesNotice,
      ['Документ удален из карточки и Google Drive.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.employeesNotice);
}

async function updateEmployee(userId, button) {
  if (!userId) return;
  await runWithButton(button, async () => {
    const data = await api(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: employeePayloadFromCard(els.employeeCardForm),
    });
    state.selectedEmployeeId = data.user.id;
    await loadUsers();
    showNotice(
      els.employeesNotice,
      ['Карточка сотрудника обновлена.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.employeesNotice);
}

async function deleteEmployee(userId, button) {
  if (!userId) return;
  if (!window.confirm('Удалить сотрудника из справочника и графиков?')) return;
  await runWithButton(button, async () => {
    const data = await api(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    state.selectedEmployeeId = null;
    await loadUsers();
    showNotice(
      els.employeesNotice,
      ['Сотрудник удален.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.employeesNotice);
}

function replaceUserInState(user) {
  const index = state.users.findIndex((item) => item.id === user.id);
  if (index === -1) {
    state.users.push(user);
  } else {
    state.users.splice(index, 1, user);
  }
}

function employeePayloadFromForm(form) {
  const values = formValues(form);
  values.officialEmployment = form.elements.officialEmployment.checked;
  values.premiumEnabled = form.elements.premiumEnabled.checked;
  values.allowedSections = formArrayValues(form, 'allowedSections');
  values.allowedPoints = formArrayValues(form, 'allowedPoints');
  return values;
}

function employeePayloadFromCard(form) {
  const values = formValues(form);
  values.officialEmployment = form.elements.officialEmployment.checked;
  values.allowedSections = checkedValues(form, 'allowedSections');
  values.allowedPoints = checkedValues(form, 'allowedPoints');
  values.premiumHistory = collectPremiumHistory();

  const latest = latestPremiumRecord(values.premiumHistory);
  values.premiumEnabled = Boolean(latest?.active);
  values.premiumAmount = latest?.active ? latest.amount : '';
  values.premiumStartDate = latest?.startDate || '';
  return values;
}

function collectPremiumHistory() {
  return Array.from(els.employeeCardPremiumRows.querySelectorAll('.premium-history-row'))
    .map((row) => ({
      startDate: row.querySelector('[data-premium-field="startDate"]')?.value || '',
      active: Boolean(row.querySelector('[data-premium-field="active"]')?.checked),
      amount: row.querySelector('[data-premium-field="amount"]')?.value.trim() || '',
    }))
    .filter((item) => item.startDate || item.amount)
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function latestPremiumRecord(history) {
  return Array.isArray(history) && history.length
    ? [...history].sort((left, right) => left.startDate.localeCompare(right.startDate)).at(-1)
    : null;
}

function employeePayloadFromRow(row) {
  const payload = {};
  row.querySelectorAll('input, select').forEach((field) => {
    if (field.name === 'allowedSections' || field.name === 'allowedPoints') return;
    payload[field.name] = field.type === 'checkbox' ? field.checked : field.value;
  });
  payload.allowedSections = checkedValues(row, 'allowedSections');
  payload.allowedPoints = checkedValues(row, 'allowedPoints');
  return payload;
}

function formArrayValues(form, name) {
  return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function checkedValues(root, name) {
  return Array.from(root.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function showEmployeeDelivery(data, fallbackMessage) {
  const storageWarning = storageWarningText(data.storage);
  const deliveryText = data.emailDelivery?.status === 'outbox'
    ? `${data.message || fallbackMessage} Причина: ${data.emailDelivery.reason}. Файл: ${data.emailDelivery.outboxPath}.`
    : (data.message || fallbackMessage);
  showNotice(
    els.employeesNotice,
    [deliveryText, storageWarning].filter(Boolean).join(' '),
    data.emailDelivery?.status === 'outbox' || storageWarning ? 'warning' : 'success',
  );
}

async function loadAudit() {
  if (!state.permissions.canViewAudit) return;
  await runWithButton(els.refreshAudit, async () => {
    const data = await api('/api/audit?limit=30');
    renderAudit(data.events);
  }, els.profileNotice);
}

function renderAudit(events) {
  els.auditList.replaceChildren();
  if (!events.length) {
    const item = document.createElement('li');
    item.textContent = 'Событий пока нет.';
    els.auditList.append(item);
    return;
  }

  for (const event of events) {
    const item = document.createElement('li');
    const at = document.createElement('span');
    at.className = 'audit-meta';
    at.textContent = formatDateTime(event.at);
    const action = document.createElement('strong');
    action.textContent = event.action;
    const details = document.createElement('span');
    details.className = 'audit-meta';
    details.textContent = JSON.stringify(event.details || {});
    item.append(at, action, details);
    els.auditList.append(item);
  }
}

async function loadSchedule() {
  if (!state.permissions.canViewSchedule) {
    renderUnavailableSchedule();
    return;
  }
  if (!state.points.length) {
    renderUnavailableSchedule('Нет доступных торговых точек.');
    return;
  }
  if (!els.pointSelect.value || !els.monthInput.value) return;
  await runWithButton(els.loadSchedule, async () => {
    const query = new URLSearchParams({
      pointId: els.pointSelect.value,
      month: els.monthInput.value,
    });
    const data = await api(`/api/schedule?${query}`);
    state.schedule = data.schedule;
    state.canEditSchedule = data.canEdit;
    state.canManageAllSchedule = data.canManageAll;
    state.employeeOptions = data.employeeOptions || data.schedule.employeeOptions || [];
    renderSchedule();
    showNotice(els.scheduleNotice, '');
  }, els.scheduleNotice);
}

function renderUnavailableSchedule(message = 'Нет доступа к графикам работ.') {
  state.schedule = null;
  state.canEditSchedule = false;
  state.canManageAllSchedule = false;
  state.employeeOptions = [];
  els.scheduleCaption.textContent = '';
  els.scheduleUpdated.textContent = '';
  els.addRowButton.classList.add('is-hidden');
  els.saveScheduleButton.classList.add('is-hidden');
  els.scheduleTable.style.minWidth = '';
  els.summaryTable.style.minWidth = '';
  els.scheduleTable.replaceChildren();
  els.summaryBody.replaceChildren();
  els.summaryFooter.replaceChildren();
  showNotice(els.scheduleNotice, message, 'warning');
}

function renderSchedule() {
  const schedule = state.schedule;
  els.scheduleCaption.textContent = `${schedule.pointName} · ${formatMonth(schedule.month)}`;
  els.scheduleUpdated.textContent = schedule.updatedAt
    ? `Обновлено: ${formatDateTime(schedule.updatedAt)}`
    : '';
  els.addRowButton.classList.toggle('is-hidden', !state.canEditSchedule);
  els.saveScheduleButton.classList.toggle('is-hidden', !state.canEditSchedule);
  syncSummaryWidth(schedule);
  els.scheduleTable.replaceChildren(buildScheduleHead(schedule), buildScheduleBody(schedule));
  renderScheduleSummary();
}

function syncSummaryWidth(schedule) {
  const baseColumnsWidth = 145 + 74 + (state.canEditSchedule ? 42 : 0);
  const dayColumnsWidth = schedule.daysInMonth * 30;
  const width = `${baseColumnsWidth + dayColumnsWidth}px`;
  els.scheduleTable.style.minWidth = width;
  els.summaryTable.style.minWidth = width;
}

function buildScheduleHead(schedule) {
  const thead = document.createElement('thead');
  const row = document.createElement('tr');
  row.append(headerCell('Сотрудник', 'employee-col'));
  row.append(headerCell('Показатель', 'metric-col'));

  for (let day = 1; day <= schedule.daysInMonth; day += 1) {
    const th = headerCell('', 'day-col');
    const label = document.createElement('span');
    label.className = 'day-label';
    const number = document.createElement('span');
    number.textContent = String(day);
    const weekday = document.createElement('span');
    weekday.textContent = shortWeekday(schedule.month, day);
    label.append(number, weekday);
    th.append(label);
    row.append(th);
  }

  if (state.canEditSchedule) {
    row.append(headerCell('', 'remove-col'));
  }
  thead.append(row);
  return thead;
}

function buildScheduleBody(schedule) {
  const tbody = document.createElement('tbody');
  if (!schedule.rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = schedule.daysInMonth + (state.canEditSchedule ? 3 : 2);
    cell.className = 'empty-state';
    cell.textContent = 'Нет строк графика.';
    row.append(cell);
    tbody.append(row);
    return tbody;
  }

  for (const scheduleRow of schedule.rows) {
    const rateRow = buildMetricRow(schedule, scheduleRow, 'rateRub', 'Ставка, руб', true);
    const issuedRow = buildMetricRow(schedule, scheduleRow, 'issuedCount', 'Выдано, шт', false);
    tbody.append(rateRow, issuedRow);
  }

  return tbody;
}

function buildMetricRow(schedule, scheduleRow, metric, label, isFirstMetricRow) {
  const row = document.createElement('tr');
  row.dataset.rowId = scheduleRow.id;
  row.dataset.metric = metric;
  if (isFirstMetricRow) {
    row.classList.add('employee-start-row');
    row.append(scheduleEmployeeCell(scheduleRow));
  }

  const metricCell = document.createElement('td');
  metricCell.className = 'metric-col';
  metricCell.textContent = label;
  row.append(metricCell);

  for (let day = 1; day <= schedule.daysInMonth; day += 1) {
    const cell = document.createElement('td');
    cell.className = 'day-col';
    const dayValue = scheduleRow.days[String(day)] || {};
    const value = dayValue[metric] || '';
    if (state.canEditSchedule) {
      const input = document.createElement('input');
      input.className = 'day-input';
      input.name = `${metric}-${day}`;
      input.dataset.field = 'dayMetric';
      input.dataset.metric = metric;
      input.dataset.day = String(day);
      input.inputMode = metric === 'issuedCount' ? 'numeric' : 'decimal';
      input.type = 'text';
      input.pattern = metric === 'issuedCount' ? '\\d*' : '\\d*([,.]\\d+)?';
      input.value = value;
      input.title = value;
      cell.append(input);
    } else {
      cell.textContent = value;
    }
    row.append(cell);
  }

  if (state.canEditSchedule) {
    const removeCell = document.createElement('td');
    removeCell.className = 'remove-col';
    if (isFirstMetricRow) {
      removeCell.rowSpan = 2;
      const button = document.createElement('button');
      button.className = 'remove-row';
      button.type = 'button';
      button.dataset.removeRow = scheduleRow.id;
      button.title = 'Удалить сотрудника из графика';
      button.textContent = '×';
      removeCell.append(button);
      row.append(removeCell);
    }
  }

  return row;
}

function scheduleEmployeeCell(scheduleRow) {
  const cell = document.createElement('td');
  cell.className = 'employee-col';
  cell.rowSpan = 2;

  if (!state.canEditSchedule) {
    cell.textContent = scheduleRow.employeeName;
    return cell;
  }

  const select = document.createElement('select');
  select.dataset.field = 'employeeId';
  select.name = 'employeeId';
  select.required = true;

  for (const employee of state.employeeOptions) {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = employee.fullName;
    option.selected = employee.id === scheduleRow.employeeId;
    select.append(option);
  }
  if (!scheduleRow.employeeId && state.employeeOptions.length === 1) {
    scheduleRow.employeeId = state.employeeOptions[0].id;
    scheduleRow.employeeName = state.employeeOptions[0].fullName;
    select.value = scheduleRow.employeeId;
  }
  select.disabled = !state.canManageAllSchedule && state.employeeOptions.length <= 1;
  cell.append(select);
  return cell;
}

function updateScheduleFromInput(event) {
  const input = event.target;
  const rowElement = input.closest('tr[data-row-id]');
  if (!rowElement || !state.schedule) return;

  const row = state.schedule.rows.find((item) => item.id === rowElement.dataset.rowId);
  if (!row) return;

  if (input.dataset.field === 'dayMetric') {
    const value = input.value.trim();
    input.title = value;
    const day = input.dataset.day;
    const metric = input.dataset.metric;
    row.days[day] = row.days[day] && typeof row.days[day] === 'object'
      ? row.days[day]
      : {};
    if (value) {
      row.days[day][metric] = value;
    } else {
      delete row.days[day][metric];
    }
    if (!row.days[day].rateRub && !row.days[day].issuedCount) {
      delete row.days[day];
    }
    renderScheduleSummary();
    return;
  }

  if (input.dataset.field === 'employeeId') {
    const employee = state.employeeOptions.find((item) => item.id === input.value);
    row.employeeId = employee ? employee.id : '';
    row.employeeName = employee ? employee.fullName : '';
    applyEmployeePremium(row, employee);
    renderScheduleSummary();
  }
}

function handleScheduleClick(event) {
  const button = event.target.closest('[data-remove-row]');
  if (!button || !state.schedule) return;
  state.schedule.rows = state.schedule.rows.filter((row) => row.id !== button.dataset.removeRow);
  renderSchedule();
}

function renderScheduleSummary() {
  if (!els.summaryBody || !state.schedule) return;
  els.summaryBody.replaceChildren();
  els.summaryFooter.replaceChildren();

  if (!state.schedule.rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 12;
    cell.className = 'empty-state';
    cell.textContent = 'Нет данных для итогов.';
    row.append(cell);
    els.summaryBody.append(row);
    return;
  }

  for (const scheduleRow of state.schedule.rows) {
    const totals = calculateEmployeeSummary(scheduleRow, state.schedule.daysInMonth);
    const row = document.createElement('tr');
    row.dataset.rowId = scheduleRow.id;
    appendCell(row, scheduleRow.employeeName || 'Сотрудник не выбран');
    appendCell(row, formatMoney(totals.issuedTotal), 'numeric-cell');
    appendCell(row, formatMoney(totals.rateFirstHalf), 'numeric-cell');
    row.append(summaryInputCell(scheduleRow, 'advanceCard'));
    appendCell(row, formatMoney(totals.rateSecondHalf), 'numeric-cell');
    row.append(summaryInputCell(scheduleRow, 'salaryCard'));
    appendCell(row, formatMoney(totals.issuedPay), 'numeric-cell');
    row.append(summaryInputCell(scheduleRow, 'bonusExtra'));
    row.append(summaryInputCell(scheduleRow, 'claims'));
    appendCell(row, formatMoney(totals.advanceTotal), 'numeric-cell advance-total-cell');
    appendCell(row, formatMoney(totals.salaryTotal), 'numeric-cell salary-total-cell');
    appendCell(row, formatMoney(totals.payrollFund), 'numeric-cell payroll-fund-cell');
    els.summaryBody.append(row);
  }
  renderSummaryFooter();
}

function renderSummaryFooter() {
  if (!els.summaryFooter || !state.schedule || !state.schedule.rows.length) return;
  els.summaryFooter.replaceChildren();

  const totals = state.schedule.rows.reduce((acc, scheduleRow) => {
    const rowTotals = calculateEmployeeSummary(scheduleRow, state.schedule.daysInMonth);
    acc.issuedTotal += rowTotals.issuedTotal;
    acc.rateFirstHalf += rowTotals.rateFirstHalf;
    acc.advanceCard += toNumber(scheduleRow.advanceCard);
    acc.rateSecondHalf += rowTotals.rateSecondHalf;
    acc.salaryCard += toNumber(scheduleRow.salaryCard);
    acc.issuedPay += rowTotals.issuedPay;
    acc.bonusExtra += toNumber(scheduleRow.bonusExtra);
    acc.claims += toNumber(scheduleRow.claims);
    acc.advanceTotal += rowTotals.advanceTotal;
    acc.salaryTotal += rowTotals.salaryTotal;
    acc.payrollFund += rowTotals.payrollFund;
    return acc;
  }, {
    issuedTotal: 0,
    rateFirstHalf: 0,
    advanceCard: 0,
    rateSecondHalf: 0,
    salaryCard: 0,
    issuedPay: 0,
    bonusExtra: 0,
    claims: 0,
    advanceTotal: 0,
    salaryTotal: 0,
    payrollFund: 0,
  });

  const row = document.createElement('tr');
  appendCell(row, 'Итого', 'summary-total-label');
  appendCell(row, formatMoney(totals.issuedTotal), 'numeric-cell');
  appendCell(row, formatMoney(totals.rateFirstHalf), 'numeric-cell');
  appendCell(row, formatMoney(totals.advanceCard), 'numeric-cell');
  appendCell(row, formatMoney(totals.rateSecondHalf), 'numeric-cell');
  appendCell(row, formatMoney(totals.salaryCard), 'numeric-cell');
  appendCell(row, formatMoney(totals.issuedPay), 'numeric-cell');
  appendCell(row, formatMoney(totals.bonusExtra), 'numeric-cell');
  appendCell(row, formatMoney(totals.claims), 'numeric-cell');
  appendCell(row, formatMoney(totals.advanceTotal), 'numeric-cell');
  appendCell(row, formatMoney(totals.salaryTotal), 'numeric-cell');
  appendCell(row, formatMoney(totals.payrollFund), 'numeric-cell');
  els.summaryFooter.append(row);
}

function summaryInputCell(scheduleRow, field) {
  const cell = document.createElement('td');
  cell.className = ['numeric-cell', `${field}-cell`].join(' ');
  const isPremiumField = field === 'bonusExtra';
  if (!state.canEditSchedule) {
    cell.textContent = formatMoney(toNumber(scheduleRow[field]));
    return cell;
  }
  const input = document.createElement('input');
  input.className = 'summary-input';
  input.name = field;
  input.dataset.field = field;
  input.type = 'text';
  input.inputMode = 'decimal';
  input.pattern = '\\d*([,.]\\d+)?';
  input.value = scheduleRow[field] || '';
  input.title = input.value;
  if (isPremiumField) {
    const assignedElsewhere = scheduleRow.premiumAssignedPointId && !scheduleRow.premiumActive;
    input.disabled = !scheduleRow.premiumActive;
    input.readOnly = true;
    input.title = scheduleRow.premiumActive
      ? 'Премия перенесена из карточки сотрудника.'
      : assignedElsewhere
        ? `Премия учтена на точке ${pointLabel(scheduleRow.premiumAssignedPointId)}.`
        : 'Премия не установлена в карточке сотрудника.';
  }
  cell.append(input);
  return cell;
}

function calculateEmployeeSummary(scheduleRow, daysInMonth) {
  let rateFirstHalf = 0;
  let rateSecondHalf = 0;
  let issuedTotal = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = scheduleRow.days[String(day)] || {};
    const rate = toNumber(value.rateRub);
    const issued = toNumber(value.issuedCount);
    if (day <= 15) {
      rateFirstHalf += rate;
    } else {
      rateSecondHalf += rate;
    }
    issuedTotal += issued;
  }

  const issuedPay = issuedTotal * 5;
  const bonusExtra = toNumber(scheduleRow.bonusExtra);
  const claims = toNumber(scheduleRow.claims);

  return {
    rateFirstHalf,
    rateSecondHalf,
    issuedTotal,
    issuedPay,
    advanceTotal: rateFirstHalf - toNumber(scheduleRow.advanceCard),
    salaryTotal: rateSecondHalf + issuedPay + bonusExtra - claims - toNumber(scheduleRow.salaryCard),
    payrollFund: rateFirstHalf + rateSecondHalf + issuedPay + bonusExtra - claims,
  };
}

function updateSummaryInput(event) {
  const input = event.target;
  if (!input.matches('.summary-input')) return;
  const rowElement = input.closest('tr[data-row-id]');
  if (!rowElement || !state.schedule) return;
  const row = state.schedule.rows.find((item) => item.id === rowElement.dataset.rowId);
  if (!row) return;
  row[input.dataset.field] = input.value.trim();
  input.title = row[input.dataset.field];
  updateSummaryTotals(rowElement, row);
  renderSummaryFooter();
}

function updateSummaryTotals(rowElement, scheduleRow) {
  const totals = calculateEmployeeSummary(scheduleRow, state.schedule.daysInMonth);
  const advanceCell = rowElement.querySelector('.advance-total-cell');
  const salaryCell = rowElement.querySelector('.salary-total-cell');
  const payrollCell = rowElement.querySelector('.payroll-fund-cell');
  if (advanceCell) advanceCell.textContent = formatMoney(totals.advanceTotal);
  if (salaryCell) salaryCell.textContent = formatMoney(totals.salaryTotal);
  if (payrollCell) payrollCell.textContent = formatMoney(totals.payrollFund);
}

function addScheduleRow() {
  if (!state.canEditSchedule || !state.schedule) return;
  const usedEmployeeIds = new Set(state.schedule.rows.map((row) => row.employeeId).filter(Boolean));
  const defaultEmployee = state.employeeOptions.find((employee) => !usedEmployeeIds.has(employee.id));
  if (!defaultEmployee) {
    showNotice(els.scheduleNotice, 'Все доступные сотрудники уже добавлены в график.', 'warning');
    return;
  }
  state.schedule.rows.push({
    id: window.crypto?.randomUUID?.() || String(Date.now()),
    employeeId: defaultEmployee?.id || '',
    employeeName: defaultEmployee?.fullName || '',
    advanceCard: '',
    salaryCard: '',
    bonusExtra: defaultEmployee?.premium?.active || defaultEmployee?.premium?.assignedPointId
      ? defaultEmployee.premium.amount
      : '',
    premiumActive: Boolean(defaultEmployee?.premium?.active),
    premiumStartDate: defaultEmployee?.premium?.startDate || '',
    premiumAssignedPointId: defaultEmployee?.premium?.assignedPointId || '',
    claims: '',
    days: {},
  });
  renderSchedule();
}

function applyEmployeePremium(scheduleRow, employee) {
  const premium = employee?.premium || {};
  scheduleRow.bonusExtra = premium.active || premium.assignedPointId ? premium.amount : '';
  scheduleRow.premiumActive = Boolean(premium.active);
  scheduleRow.premiumStartDate = premium.startDate || '';
  scheduleRow.premiumAssignedPointId = premium.assignedPointId || '';
}

async function saveSchedule() {
  if (!state.canEditSchedule || !state.schedule) return;
  await runWithButton(els.saveScheduleButton, async () => {
    const data = await api('/api/schedule', {
      method: 'POST',
      body: {
        pointId: state.schedule.pointId,
        month: state.schedule.month,
        rows: state.schedule.rows,
      },
    });
    state.employeeOptions = data.schedule.employeeOptions || state.employeeOptions;
    state.schedule = {
      ...data.schedule,
      pointName: state.schedule.pointName,
      daysInMonth: state.schedule.daysInMonth,
    };
    renderSchedule();
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    showNotice(
      els.scheduleNotice,
      ['График сохранен.', storageWarning].filter(Boolean).join(' '),
      storageWarning ? 'warning' : 'success',
    );
  }, els.scheduleNotice);
}

async function api(path, options = {}) {
  const init = {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: {},
  };

  if (options.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const details = Array.isArray(payload.details) ? ` ${payload.details.join(' ')}` : '';
    throw new Error(`${payload.error || 'Ошибка запроса.'}${details}`);
  }
  return payload;
}

async function runWithButton(button, task, noticeElement) {
  const originalText = button?.textContent;
  if (button) {
    button.disabled = true;
  }
  try {
    await task();
  } catch (error) {
    showNotice(noticeElement, error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function appendCell(row, text, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function headerCell(text, className) {
  const th = document.createElement('th');
  th.className = className;
  th.textContent = text;
  return th;
}

function showNotice(element, message, type = '') {
  if (!element) return;
  element.className = `notice${type ? ` ${type}` : ''}`;
  element.textContent = message;
}

function storageWarningText(storage) {
  if (!storage || storage.persistent !== false) return '';
  return storage.message || 'Файловое хранилище недоступно, данные временно сохранены в памяти сервера.';
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentDate() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatMonth(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(year, monthIndex - 1, 1));
}

function shortWeekday(month, day) {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
    .format(new Date(year, monthIndex - 1, day))
    .replace('.', '');
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU').format(new Date(`${value}T00:00:00`));
}

function pointLabel(pointId) {
  return state.points.find((point) => point.id === pointId)?.name || pointId || '';
}

function toNumber(value) {
  const normalized = String(value || '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(value);
}
