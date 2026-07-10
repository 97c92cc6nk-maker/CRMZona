'use strict';

const state = {
  user: null,
  permissions: {},
  roles: [],
  points: [],
  users: [],
  repairs: [],
  repairStatuses: [],
  repairPriorities: [],
  schedule: null,
  canEditSchedule: false,
  canManageAllSchedule: false,
  employeeOptions: [],
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
  els.refreshEmployees.addEventListener('click', loadUsers);
  els.refreshAudit.addEventListener('click', loadAudit);
  els.repairForm.addEventListener('submit', handleRepairCreate);
  els.refreshRepairs.addEventListener('click', loadRepairs);
  els.repairsBody.addEventListener('change', handleRepairStatusChange);
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
}

async function loadAppData() {
  await loadPoints();
  renderProfile();

  if (state.permissions.canViewUsers) {
    await loadUsers();
  }
  if (state.permissions.canViewAudit) {
    await loadAudit();
  }
  await loadRepairs();
  await loadSchedule();
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
    state.schedule = null;
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
  els.employeeAddPanel.classList.toggle('is-hidden', !state.permissions.canManageRoles);
  if (els.usersPanel) {
    els.usersPanel.classList.add('is-hidden');
  }
  els.auditPanel.classList.toggle('is-hidden', !state.permissions.canViewAudit);
}

async function loadPoints() {
  const data = await api('/api/points');
  state.points = data.points;
  els.pointSelect.replaceChildren(...state.points.map((point) => {
    const option = document.createElement('option');
    option.value = point.id;
    option.textContent = point.name;
    return option;
  }));
  els.repairPointSelect.replaceChildren(...state.points.map((point) => {
    const option = document.createElement('option');
    option.value = point.id;
    option.textContent = point.name;
    return option;
  }));
}

async function loadRepairs() {
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

async function loadUsers() {
  if (!state.permissions.canViewUsers) return;
  await runWithButton(els.refreshEmployees, async () => {
    const data = await api('/api/users');
    state.users = data.users;
    state.roles = data.roles;
    renderEmployees();
  }, els.employeesNotice);
}

function renderEmployees() {
  els.employeesBody.replaceChildren();

  if (!state.users.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
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
  const editable = state.permissions.canManageRoles && user.role !== 'owner';

  row.append(employeeTextInputCell(user, 'fullName', editable));
  row.append(employeeTextInputCell(user, 'phone', editable));
  row.append(employeeTextInputCell(user, 'email', editable, 'email'));
  row.append(employeeTextInputCell(user, 'position', editable));
  row.append(employeeTextInputCell(user, 'hireDate', editable, 'date'));
  row.append(employeeOfficialCell(user, editable));
  row.append(employeeRoleCell(user, editable));
  row.append(employeeActionsCell(user, editable));
  return row;
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
    await loadUsers();
    showEmployeeDelivery(data, 'Сотрудник добавлен.');
  }, els.employeesNotice);
}

async function updateEmployee(userId, button) {
  const row = els.employeesBody.querySelector(`tr[data-user-id="${CSS.escape(userId)}"]`);
  if (!row) return;
  await runWithButton(button, async () => {
    const data = await api(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: employeePayloadFromRow(row),
    });
    await loadUsers();
    showNotice(
      els.employeesNotice,
      ['Карточка сотрудника обновлена.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.employeesNotice);
}

async function deleteEmployee(userId, button) {
  if (!window.confirm('Удалить сотрудника из справочника и графиков?')) return;
  await runWithButton(button, async () => {
    const data = await api(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    await loadUsers();
    showNotice(
      els.employeesNotice,
      ['Сотрудник удален.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.employeesNotice);
}

function employeePayloadFromForm(form) {
  const values = formValues(form);
  values.officialEmployment = form.elements.officialEmployment.checked;
  return values;
}

function employeePayloadFromRow(row) {
  const payload = {};
  row.querySelectorAll('input, select').forEach((field) => {
    payload[field.name] = field.type === 'checkbox' ? field.checked : field.value;
  });
  return payload;
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
    bonusExtra: '',
    claims: '',
    days: {},
  });
  renderSchedule();
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
