'use strict';

const state = {
  user: null,
  permissions: {},
  roles: [],
  sections: [],
  points: [],
  schedulePoints: [],
  repairPoints: [],
  users: [],
  retailPoints: [],
  retailPointPaymentMethods: [],
  retailPointAdminOptions: [],
  retailPointCompanyOptions: [],
  companies: [],
  companyPoints: [],
  repairs: [],
  tasks: [],
  taskPriorities: [],
  taskAssigneeOptions: [],
  developmentProposals: [],
  developmentStatuses: [],
  expenses: [],
  claims: [],
  claimPoints: [],
  claimStatuses: [],
  reports: [],
  reportOptions: [],
  adminPayrollReport: null,
  employeePayrollReport: null,
  employeePayrollFilters: {
    pointId: '',
    adminId: '',
    employeeId: '',
  },
  claimEmployees: [],
  employeeDocumentTypes: [],
  employeeSortMode: 'name',
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
  canViewScheduleFinancials: false,
  employeeOptions: [],
  revealedEmployeePasswords: {},
  selectedEmployeeId: null,
  selectedRetailPointId: null,
  selectedCompanyId: null,
  selectedTaskId: null,
  selectedDevelopmentProposalId: null,
  selectedReportId: null,
  retailPointsLoading: false,
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
    registerCaptchaQuestion: document.getElementById('registerCaptchaQuestion'),
    refreshCaptcha: document.getElementById('refreshCaptcha'),
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
    employeeSortSelect: document.getElementById('employeeSortSelect'),
    employeePasswordHeader: document.getElementById('employeePasswordHeader'),
    employeesBody: document.getElementById('employeesBody'),
    employeesNotice: document.getElementById('employeesNotice'),
    employeeAddPanel: document.getElementById('employeeAddPanel'),
    employeeForm: document.getElementById('employeeForm'),
    employeeCardPanel: document.getElementById('employeeCardPanel'),
    employeeCardTitle: document.getElementById('employeeCardTitle'),
    employeeCardForm: document.getElementById('employeeCardForm'),
    employeeCardPremiumRows: document.getElementById('employeeCardPremiumRows'),
    employeeCardReports: document.getElementById('employeeCardReports'),
    employeeFormReports: document.getElementById('employeeFormReports'),
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
    retailPointForm: document.getElementById('retailPointForm'),
    retailPointAddPanel: document.getElementById('retailPointAddPanel'),
    retailPointCardPanel: document.getElementById('retailPointCardPanel'),
    retailPointCardTitle: document.getElementById('retailPointCardTitle'),
    retailPointCardForm: document.getElementById('retailPointCardForm'),
    retailPointLegalEntity: document.getElementById('retailPointLegalEntity'),
    retailPointCardLegalEntity: document.getElementById('retailPointCardLegalEntity'),
    retailPointInternetPayment: document.getElementById('retailPointInternetPayment'),
    retailPointCuratorAdmin: document.getElementById('retailPointCuratorAdmin'),
    retailPointDocumentFile: document.getElementById('retailPointDocumentFile'),
    uploadRetailPointDocument: document.getElementById('uploadRetailPointDocument'),
    retailPointDocumentsList: document.getElementById('retailPointDocumentsList'),
    closeRetailPointCard: document.getElementById('closeRetailPointCard'),
    refreshRetailPoints: document.getElementById('refreshRetailPoints'),
    retailPointsBody: document.getElementById('retailPointsBody'),
    retailPointsNotice: document.getElementById('retailPointsNotice'),
    companyForm: document.getElementById('companyForm'),
    companyAddPanel: document.getElementById('companyAddPanel'),
    companyCardPanel: document.getElementById('companyCardPanel'),
    companyCardTitle: document.getElementById('companyCardTitle'),
    companyCardForm: document.getElementById('companyCardForm'),
    companyPointOptions: document.getElementById('companyPointOptions'),
    companyDocumentFile: document.getElementById('companyDocumentFile'),
    uploadCompanyDocument: document.getElementById('uploadCompanyDocument'),
    companyDocumentsList: document.getElementById('companyDocumentsList'),
    closeCompanyCard: document.getElementById('closeCompanyCard'),
    refreshCompanies: document.getElementById('refreshCompanies'),
    companiesBody: document.getElementById('companiesBody'),
    companiesNotice: document.getElementById('companiesNotice'),
    reportsListPanel: document.getElementById('reportsListPanel'),
    reportsList: document.getElementById('reportsList'),
    reportsNotice: document.getElementById('reportsNotice'),
    refreshReports: document.getElementById('refreshReports'),
    reportDetailsPanel: document.getElementById('reportDetailsPanel'),
    reportDetailsTitle: document.getElementById('reportDetailsTitle'),
    reportMonthInput: document.getElementById('reportMonthInput'),
    loadReport: document.getElementById('loadReport'),
    saveAdminPayrollReport: document.getElementById('saveAdminPayrollReport'),
    closeReport: document.getElementById('closeReport'),
    employeePayrollFilters: document.getElementById('employeePayrollFilters'),
    employeePayrollPointFilter: document.getElementById('employeePayrollPointFilter'),
    employeePayrollAdminFilter: document.getElementById('employeePayrollAdminFilter'),
    employeePayrollEmployeeFilter: document.getElementById('employeePayrollEmployeeFilter'),
    reportContent: document.getElementById('reportContent'),
    taskForm: document.getElementById('taskForm'),
    taskAuthorInput: document.getElementById('taskAuthorInput'),
    taskCreatedAtInput: document.getElementById('taskCreatedAtInput'),
    taskDeadlineInput: document.getElementById('taskDeadlineInput'),
    taskAssigneeSelect: document.getElementById('taskAssigneeSelect'),
    taskPrioritySelect: document.getElementById('taskPrioritySelect'),
    taskAttachmentFiles: document.getElementById('taskAttachmentFiles'),
    refreshTasks: document.getElementById('refreshTasks'),
    tasksBody: document.getElementById('tasksBody'),
    tasksNotice: document.getElementById('tasksNotice'),
    developmentForm: document.getElementById('developmentForm'),
    developmentAddPanel: document.getElementById('developmentAddPanel'),
    refreshDevelopment: document.getElementById('refreshDevelopment'),
    developmentBody: document.getElementById('developmentBody'),
    developmentNotice: document.getElementById('developmentNotice'),
    developmentCardPanel: document.getElementById('developmentCardPanel'),
    developmentCardTitle: document.getElementById('developmentCardTitle'),
    developmentCardForm: document.getElementById('developmentCardForm'),
    developmentStatus: document.getElementById('developmentStatus'),
    developmentAttachmentFile: document.getElementById('developmentAttachmentFile'),
    uploadDevelopmentAttachment: document.getElementById('uploadDevelopmentAttachment'),
    developmentAttachmentsList: document.getElementById('developmentAttachmentsList'),
    closeDevelopmentCard: document.getElementById('closeDevelopmentCard'),
    repairForm: document.getElementById('repairForm'),
    repairPointSelect: document.getElementById('repairPointSelect'),
    repairAttachmentFiles: document.getElementById('repairAttachmentFiles'),
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
    claimForm: document.getElementById('claimForm'),
    claimCreatePanel: document.getElementById('claimCreatePanel'),
    claimDateInput: document.getElementById('claimDateInput'),
    claimPointSelect: document.getElementById('claimPointSelect'),
    claimStatusSelect: document.getElementById('claimStatusSelect'),
    claimCompanyField: document.getElementById('claimCompanyField'),
    claimCompanyHeader: document.getElementById('claimCompanyHeader'),
    claimEmployeeSelect: document.getElementById('claimEmployeeSelect'),
    claimAttachmentFiles: document.getElementById('claimAttachmentFiles'),
    refreshClaims: document.getElementById('refreshClaims'),
    claimsBody: document.getElementById('claimsBody'),
    claimsNotice: document.getElementById('claimsNotice'),
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
  els.registerForm.elements.phone.addEventListener('input', formatRegisterPhoneInput);
  els.refreshCaptcha.addEventListener('click', refreshCaptcha);
  els.logoutButton.addEventListener('click', handleLogout);
  els.passwordForm.addEventListener('submit', handlePasswordChange);
  els.employeeForm.addEventListener('submit', handleEmployeeCreate);
  els.employeeSortSelect?.addEventListener('change', () => {
    state.employeeSortMode = els.employeeSortSelect.value || 'name';
    renderEmployees();
  });
  els.employeeForm.elements.role.addEventListener('change', renderEmployeeFormAccessControls);
  els.employeeCardForm.addEventListener('submit', handleEmployeeCardSave);
  els.employeeCardForm.elements.role.addEventListener('change', () => {
    const editable = selectedEmployeeEditable();
    renderEmployeeCardAccess(selectedEmployee(), editable);
    setEmployeeCardEditable(editable);
    syncUnofficialSalaryField(els.employeeCardForm, { editable });
  });
  els.closeEmployeeCard.addEventListener('click', closeEmployeeCard);
  els.addPremiumRow.addEventListener('click', () => addPremiumHistoryRow());
  els.employeeCardPremiumRows.addEventListener('click', handlePremiumHistoryClick);
  els.employeeCardPremiumRows.addEventListener('change', handlePremiumHistoryChange);
  els.uploadEmployeeDocument.addEventListener('click', handleEmployeeDocumentUpload);
  els.employeeDocumentsList.addEventListener('click', handleEmployeeDocumentClick);
  els.deleteEmployeeCard.addEventListener('click', () => deleteEmployee(state.selectedEmployeeId, els.deleteEmployeeCard));
  els.refreshEmployees.addEventListener('click', loadUsers);
  els.refreshAudit.addEventListener('click', loadAudit);
  els.retailPointForm.addEventListener('submit', handleRetailPointCreate);
  els.retailPointCardForm.addEventListener('submit', handleRetailPointSave);
  els.closeRetailPointCard.addEventListener('click', closeRetailPointCard);
  els.uploadRetailPointDocument.addEventListener('click', handleRetailPointDocumentUpload);
  els.retailPointDocumentsList.addEventListener('click', handleRetailPointDocumentClick);
  els.refreshRetailPoints.addEventListener('click', loadRetailPoints);
  els.companyForm.addEventListener('submit', handleCompanyCreate);
  els.companyCardForm.addEventListener('submit', handleCompanySave);
  els.closeCompanyCard.addEventListener('click', closeCompanyCard);
  els.uploadCompanyDocument.addEventListener('click', handleCompanyDocumentUpload);
  els.companyDocumentsList.addEventListener('click', handleCompanyDocumentClick);
  els.refreshCompanies.addEventListener('click', loadCompanies);
  els.refreshReports.addEventListener('click', loadReports);
  els.reportsList.addEventListener('click', handleReportsListClick);
  els.closeReport.addEventListener('click', closeReport);
  els.loadReport.addEventListener('click', loadSelectedReport);
  els.reportMonthInput.addEventListener('change', loadSelectedReport);
  els.saveAdminPayrollReport.addEventListener('click', saveAdminPayrollReport);
  els.employeePayrollPointFilter?.addEventListener('change', () => {
    state.employeePayrollFilters.pointId = els.employeePayrollPointFilter.value || '';
    renderEmployeePayrollReport();
  });
  els.employeePayrollAdminFilter?.addEventListener('change', () => {
    state.employeePayrollFilters.adminId = els.employeePayrollAdminFilter.value || '';
    renderEmployeePayrollReport();
  });
  els.employeePayrollEmployeeFilter?.addEventListener('change', () => {
    state.employeePayrollFilters.employeeId = els.employeePayrollEmployeeFilter.value || '';
    renderEmployeePayrollReport();
  });
  els.reportContent.addEventListener('input', handleReportContentInput);
  els.taskForm?.addEventListener('submit', handleTaskCreate);
  els.refreshTasks?.addEventListener('click', loadTasks);
  els.developmentForm?.addEventListener('submit', handleDevelopmentCreate);
  els.refreshDevelopment?.addEventListener('click', loadDevelopmentProposals);
  els.developmentBody?.addEventListener('click', handleDevelopmentTableClick);
  els.developmentCardForm?.addEventListener('submit', handleDevelopmentCardSave);
  els.uploadDevelopmentAttachment?.addEventListener('click', handleDevelopmentAttachmentUpload);
  els.developmentAttachmentsList?.addEventListener('click', handleDevelopmentAttachmentClick);
  els.closeDevelopmentCard?.addEventListener('click', closeDevelopmentCard);
  els.repairForm.addEventListener('submit', handleRepairCreate);
  els.refreshRepairs.addEventListener('click', loadRepairs);
  els.repairsBody.addEventListener('change', handleRepairStatusChange);
  els.expenseForm.addEventListener('submit', handleExpenseCreate);
  els.expensePointFilter.addEventListener('change', () => updateExpenseFilter('point', els.expensePointFilter.value));
  els.expensePaymentFilter.addEventListener('change', () => updateExpenseFilter('payment', els.expensePaymentFilter.value));
  els.expenseAuthorFilter.addEventListener('change', () => updateExpenseFilter('author', els.expenseAuthorFilter.value));
  els.expensesBody.addEventListener('click', handleExpenseTableClick);
  els.refreshExpenses.addEventListener('click', loadExpenses);
  els.claimForm.addEventListener('submit', handleClaimCreate);
  els.claimsBody.addEventListener('click', handleClaimTableClick);
  els.refreshClaims.addEventListener('click', loadClaims);
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
  els.reportMonthInput.value = currentMonth();
  els.expenseDateInput.value = currentDate();
  els.claimDateInput.value = currentDate();
  if (els.taskCreatedAtInput) els.taskCreatedAtInput.value = currentDate();
  if (els.taskDeadlineInput) els.taskDeadlineInput.value = currentDate();
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
  state.schedulePoints = data.schedulePoints || data.points || [];
  state.repairPoints = data.repairPoints || data.points || [];
}

async function loadAppData() {
  await loadPoints();
  renderProfile();
  renderEmployeeFormAccessControls();

  const loaders = [];
  if (state.permissions.canViewUsers) {
    loaders.push(loadUsers());
  }
  if (state.permissions.canViewAudit) {
    loaders.push(loadAudit());
  }
  if (state.permissions.canViewRetailPoints) {
    loaders.push(loadRetailPoints());
  } else {
    renderRetailPoints();
  }
  if (state.permissions.canViewCompanies) {
    loaders.push(loadCompanies());
  } else {
    renderCompanies();
  }
  if (state.permissions.canViewReports) {
    loaders.push(loadReports());
  } else {
    renderReportsUnavailable();
  }
  if (state.permissions.canViewTasks) {
    loaders.push(loadTasks());
  } else {
    renderTasks();
  }
  if (state.permissions.canViewDevelopment) {
    loaders.push(loadDevelopmentProposals());
  } else {
    renderDevelopmentProposals();
  }
  if (state.permissions.canViewRepairs) {
    loaders.push(loadRepairs());
  } else {
    renderRepairs();
  }
  if (state.permissions.canViewExpenses) {
    loaders.push(loadExpenses());
  } else {
    renderExpenses();
  }
  if (state.permissions.canViewClaims) {
    loaders.push(loadClaims());
  } else {
    renderClaims();
  }
  if (state.permissions.canViewSchedule) {
    loaders.push(loadSchedule());
  } else {
    renderUnavailableSchedule();
  }
  await Promise.all(loaders);
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
  if (!isLogin) refreshCaptcha();
}

function showForgotPassword() {
  els.showLogin.classList.add('is-active');
  els.showRegister.classList.remove('is-active');
  els.showLogin.setAttribute('aria-selected', 'true');
  els.showRegister.setAttribute('aria-selected', 'false');
  els.loginForm.classList.remove('is-active');
  els.registerForm.classList.remove('is-active');
  els.forgotPasswordForm.classList.add('is-active');
  const loginValue = els.loginForm.elements.login.value.trim();
  els.forgotPasswordForm.elements.email.value = loginValue.includes('@') ? loginValue : '';
  showNotice(els.authNotice, '');
}

async function refreshCaptcha() {
  try {
    const data = await api('/api/captcha');
    const captcha = data.captcha || {};
    els.registerCaptchaQuestion.textContent = captcha.question || '';
    els.registerForm.elements.captchaToken.value = captcha.token || '';
    els.registerForm.elements.captchaAnswer.value = '';
  } catch {
    els.registerCaptchaQuestion.textContent = 'Недоступна';
    els.registerForm.elements.captchaToken.value = '';
  }
}

function formatRegisterPhoneInput(event) {
  const input = event.target;
  const digits = input.value.replace(/\D/g, '');
  const national = (digits.length > 10 && (digits.startsWith('7') || digits.startsWith('8')))
    ? digits.slice(1, 11)
    : digits.slice(0, 10);
  input.value = formatRussianPhoneNational(national);
}

function formatRussianPhoneNational(digits) {
  if (!digits) return '';
  const parts = [];
  if (digits.length > 0) parts.push(`(${digits.slice(0, 3)}`);
  if (digits.length >= 3) parts[0] += ')';
  if (digits.length > 3) parts.push(` ${digits.slice(3, 6)}`);
  if (digits.length > 6) parts.push(`-${digits.slice(6, 8)}`);
  if (digits.length > 8) parts.push(`-${digits.slice(8, 10)}`);
  return parts.join('');
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
    state.schedulePoints = [];
    state.repairPoints = [];
    state.schedule = null;
    state.expenses = [];
    state.claims = [];
    state.claimPoints = [];
    state.claimStatuses = [];
    state.tasks = [];
    state.taskPriorities = [];
    state.taskAssigneeOptions = [];
    state.developmentProposals = [];
    state.developmentStatuses = [];
    state.reports = [];
    state.reportOptions = [];
    state.adminPayrollReport = null;
    state.employeePayrollReport = null;
    state.claimEmployees = [];
    state.revealedEmployeePasswords = {};
    state.selectedEmployeeId = null;
    state.selectedDevelopmentProposalId = null;
    state.selectedReportId = null;
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
  refreshViewData(viewId);
}

function refreshViewData(viewId) {
  if (viewId === 'retailPointsView') {
    loadRetailPoints();
  }
  if (viewId === 'developmentView') {
    loadDevelopmentProposals();
  }
  if (viewId === 'tasksView') {
    loadTasks();
  }
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
  setTabVisibility('retailPointsView', Boolean(state.permissions.canViewRetailPoints));
  setTabVisibility('companiesView', Boolean(state.permissions.canViewCompanies));
  setTabVisibility('scheduleView', Boolean(state.permissions.canViewSchedule));
  setTabVisibility('reportsView', Boolean(state.permissions.canViewReports));
  setTabVisibility('tasksView', Boolean(state.permissions.canViewTasks));
  setTabVisibility('developmentView', Boolean(state.permissions.canViewDevelopment));
  setTabVisibility('repairsView', Boolean(state.permissions.canViewRepairs));
  setTabVisibility('expensesView', Boolean(state.permissions.canViewExpenses));
  setTabVisibility('claimsView', Boolean(state.permissions.canViewClaims));
  els.employeeAddPanel.classList.toggle('is-hidden', !state.permissions.canManageRoles);
  els.retailPointAddPanel.classList.toggle('is-hidden', !state.permissions.canManageRetailPoints);
  els.companyAddPanel.classList.toggle('is-hidden', !state.permissions.canManageCompanies);
  els.developmentAddPanel?.classList.toggle('is-hidden', !state.permissions.canCreateDevelopmentProposals);
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
  state.points = data.points || [];
  state.schedulePoints = data.schedulePoints || state.points;
  state.repairPoints = data.repairPoints || state.points;
  fillPointSelect(els.pointSelect, state.schedulePoints);
  fillPointSelect(els.repairPointSelect, state.repairPoints);
  fillPointSelect(els.expensePointSelect);
  fillPointSelect(els.claimPointSelect);
  renderEmployeeFormAccessControls();
}

function fillPointSelect(select, points = state.points) {
  const availablePoints = Array.isArray(points) ? points : [];
  select.replaceChildren(...availablePoints.map((point) => {
    const option = document.createElement('option');
    option.value = point.id;
    option.textContent = point.name;
    return option;
  }));
  select.disabled = !availablePoints.length;
}

async function loadRetailPoints() {
  if (!state.permissions.canViewRetailPoints || state.retailPointsLoading) return;
  state.retailPointsLoading = true;
  await runWithButton(els.refreshRetailPoints, async () => {
    const data = await api('/api/retail-points');
    state.retailPoints = data.points || [];
    state.retailPointPaymentMethods = data.paymentMethods || [];
    state.retailPointAdminOptions = data.adminOptions || [];
    state.retailPointCompanyOptions = data.companyOptions || [];
    state.permissions.canManageRetailPoints = Boolean(data.canManage);
    renderRetailPoints();
    renderRetailPointCard();
  }, els.retailPointsNotice);
  state.retailPointsLoading = false;
}

function renderRetailPoints() {
  if (!els.retailPointsBody) return;
  els.retailPointsBody.replaceChildren();
  const canManage = Boolean(state.permissions.canManageRetailPoints);
  if (els.retailPointAddPanel) {
    els.retailPointAddPanel.classList.toggle('is-hidden', !canManage);
  }
  fillRetailPointCompanySelect(els.retailPointLegalEntity, els.retailPointLegalEntity?.value || '');
  if (els.retailPointForm) {
    Array.from(els.retailPointForm.elements).forEach((field) => {
      field.disabled = !canManage;
    });
  }

  if (!state.permissions.canViewRetailPoints) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'empty-state';
    cell.textContent = 'Нет доступа к разделу торговых точек.';
    row.append(cell);
    els.retailPointsBody.append(row);
    closeRetailPointCard();
    return;
  }

  if (!state.retailPoints.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'empty-state';
    cell.textContent = 'Торговые точки пока не добавлены.';
    row.append(cell);
    els.retailPointsBody.append(row);
    return;
  }

  const points = [...state.retailPoints].sort((left, right) => (
    String(left.name || '').localeCompare(String(right.name || ''), 'ru')
  ));
  for (const point of points) {
    els.retailPointsBody.append(buildRetailPointRow(point));
  }
}

function buildRetailPointRow(point) {
  const row = document.createElement('tr');
  row.dataset.pointId = point.id;

  const nameCell = document.createElement('td');
  const nameButton = document.createElement('button');
  nameButton.type = 'button';
  nameButton.className = 'text-link';
  nameButton.textContent = point.name || 'Без названия';
  nameButton.addEventListener('click', () => openRetailPointCard(point.id));
  nameCell.append(nameButton);
  row.append(nameCell);

  appendCell(row, point.address || '');
  appendCell(row, point.landlord || '');
  appendCell(row, point.legalEntity || '');
  appendCell(row, point.ownerName || '');
  appendCell(row, point.phone || '');
  appendCell(row, point.email || '');
  appendCell(row, point.curatorAdminName || '');
  return row;
}

function openRetailPointCard(pointId) {
  state.selectedRetailPointId = pointId;
  renderRetailPointCard();
  els.retailPointCardPanel?.classList.remove('is-hidden');
  els.retailPointCardPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeRetailPointCard() {
  state.selectedRetailPointId = null;
  els.retailPointCardPanel?.classList.add('is-hidden');
  if (els.retailPointCardForm) {
    els.retailPointCardForm.reset();
    delete els.retailPointCardForm.dataset.pointId;
  }
  if (els.retailPointDocumentsList) {
    els.retailPointDocumentsList.replaceChildren();
  }
}

function selectedRetailPoint() {
  return state.retailPoints.find((point) => point.id === state.selectedRetailPointId) || null;
}

function renderRetailPointCard() {
  if (!els.retailPointCardForm) return;
  const point = selectedRetailPoint();
  if (!point) {
    els.retailPointCardPanel?.classList.add('is-hidden');
    return;
  }

  fillRetailPointPaymentOptions();
  fillRetailPointAdminOptions(point);
  fillRetailPointCompanySelect(els.retailPointCardLegalEntity, point.legalEntity);
  els.retailPointCardPanel?.classList.remove('is-hidden');
  els.retailPointCardForm.dataset.pointId = point.id;
  if (els.retailPointCardTitle) {
    els.retailPointCardTitle.textContent = `Карточка торговой точки: ${point.name || 'без названия'}`;
  }

  const fields = ['name', 'address', 'landlord', 'legalEntity', 'rentCost', 'ownerName', 'phone', 'email', 'comment'];
  for (const field of fields) {
    setRetailPointFormValue(field, point[field]);
  }
  const internet = point.internet || {};
  setRetailPointFormValue('internet.provider', internet.provider);
  setRetailPointFormValue('internet.payment', internet.payment);
  setRetailPointFormValue('internet.contractNumber', internet.contractNumber);
  setRetailPointFormValue('internet.contractHolder', internet.contractHolder);
  setRetailPointFormValue('internet.tariff', internet.tariff);
  setRetailPointFormValue('internet.login', internet.login);
  setRetailPointFormValue('internet.password', internet.password);

  const video = point.video || {};
  setRetailPointFormValue('video.operator', video.operator);
  setRetailPointFormValue('video.camerasCount', video.camerasCount);
  setRetailPointFormValue('video.contractNumber', video.contractNumber);
  setRetailPointFormValue('video.contractHolder', video.contractHolder);
  setRetailPointFormValue('video.tariff', video.tariff);
  setRetailPointFormValue('video.login', video.login);
  setRetailPointFormValue('video.password', video.password);

  const editable = Boolean(state.permissions.canManageRetailPoints);
  setRetailPointCardEditable(editable);
  renderRetailPointDocuments(point.documents || [], editable);
}

function fillRetailPointPaymentOptions() {
  const methods = state.retailPointPaymentMethods.length
    ? state.retailPointPaymentMethods
    : [
        { value: 'account', label: 'в лк' },
        { value: 'mobile', label: 'мобильный' },
        { value: 'link', label: 'по ссылке' },
        { value: 'invoice', label: 'по счету' },
      ];
  const options = [{ value: '', label: 'Не указано' }, ...methods];
  els.retailPointInternetPayment?.replaceChildren(...options.map((method) => {
    const option = document.createElement('option');
    option.value = method.value;
    option.textContent = method.label;
    return option;
  }));
}

function fillRetailPointAdminOptions(point = selectedRetailPoint()) {
  if (els.retailPointCuratorAdmin) {
    els.retailPointCuratorAdmin.value = point?.curatorAdminName || 'Не указан';
  }
}

function fillRetailPointCompanySelect(select, selectedValue = '') {
  if (!select) return;
  const normalizedSelected = String(selectedValue || '').trim();
  const options = [
    { value: '', label: 'Не указано' },
    ...state.retailPointCompanyOptions,
  ];
  const hasSelected = !normalizedSelected || options.some((option) => option.value === normalizedSelected);
  const finalOptions = hasSelected
    ? options
    : [...options, { value: normalizedSelected, label: `${normalizedSelected} (нет в справочнике)` }];

  select.replaceChildren(...finalOptions.map((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label || item.value;
    return option;
  }));
  select.value = normalizedSelected;
}

function setRetailPointFormValue(name, value) {
  const field = els.retailPointCardForm.elements[name];
  if (field) field.value = value || '';
}

function setRetailPointCardEditable(editable) {
  Array.from(els.retailPointCardForm.elements).forEach((field) => {
    field.disabled = !editable;
  });
  if (els.uploadRetailPointDocument) {
    els.uploadRetailPointDocument.disabled = !editable;
  }
}

function renderRetailPointDocuments(documents, editable) {
  els.retailPointDocumentsList.replaceChildren();
  if (!Array.isArray(documents) || !documents.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state retail-point-documents-empty';
    empty.textContent = 'Документы по торговой точке не загружены.';
    els.retailPointDocumentsList.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'retail-point-documents-table';
  for (const documentItem of [...documents].sort(compareRetailPointDocuments)) {
    list.append(buildRetailPointDocumentRow(documentItem, editable));
  }
  els.retailPointDocumentsList.append(list);
}

function buildRetailPointDocumentRow(documentItem, editable) {
  const row = document.createElement('div');
  row.className = 'retail-point-document-row';
  row.dataset.documentId = documentItem.id;

  const file = document.createElement('strong');
  file.textContent = documentItem.fileName || documentItem.originalFileName || 'Документ';

  const date = document.createElement('span');
  date.textContent = documentItem.createdAt ? formatDateTime(documentItem.createdAt) : '';

  const size = document.createElement('span');
  size.textContent = documentItem.size ? formatFileSize(documentItem.size) : '';

  const linkWrap = document.createElement('span');
  if (documentItem.googleDrive?.webViewLink || documentItem.localUrl) {
    const link = document.createElement('a');
    link.href = documentItem.googleDrive?.webViewLink || documentItem.localUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Открыть';
    linkWrap.append(link);
  } else {
    linkWrap.textContent = documentItem.googleDrive?.reason || 'Нет ссылки';
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger retail-point-document-remove';
  remove.dataset.deleteRetailPointDocument = documentItem.id;
  remove.textContent = 'Удалить';
  remove.disabled = !editable;
  remove.classList.toggle('is-hidden', !editable);

  row.append(file, date, size, linkWrap, remove);
  return row;
}

function compareRetailPointDocuments(left, right) {
  const leftDate = left.createdAt || '';
  const rightDate = right.createdAt || '';
  return rightDate.localeCompare(leftDate) || String(left.fileName || '').localeCompare(String(right.fileName || ''), 'ru');
}

async function handleRetailPointCreate(event) {
  event.preventDefault();
  const button = event.submitter;
  await runWithButton(button, async () => {
    const data = await api('/api/retail-points', {
      method: 'POST',
      body: retailPointPayloadFromBasicForm(els.retailPointForm),
    });
    replaceRetailPointInState(data.point);
    state.selectedRetailPointId = data.point.id;
    els.retailPointForm.reset();
    renderRetailPoints();
    renderRetailPointCard();
    showNotice(
      els.retailPointsNotice,
      ['Торговая точка добавлена.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.retailPointsNotice);
}

async function handleRetailPointSave(event) {
  event.preventDefault();
  const pointId = els.retailPointCardForm.dataset.pointId;
  if (!pointId) return;
  await runWithButton(event.submitter, async () => {
    const data = await api(`/api/retail-points/${encodeURIComponent(pointId)}`, {
      method: 'PATCH',
      body: retailPointPayloadFromCard(els.retailPointCardForm),
    });
    replaceRetailPointInState(data.point);
    state.selectedRetailPointId = data.point.id;
    renderRetailPoints();
    renderRetailPointCard();
    showNotice(
      els.retailPointsNotice,
      ['Карточка торговой точки обновлена.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.retailPointsNotice);
}

async function handleRetailPointDocumentUpload() {
  const pointId = els.retailPointCardForm.dataset.pointId;
  if (!pointId) return;
  const file = els.retailPointDocumentFile.files[0];
  await runWithButton(els.uploadRetailPointDocument, async () => {
    const payload = await retailPointDocumentPayloadFromFile(file);
    const data = await api(`/api/retail-points/${encodeURIComponent(pointId)}/documents`, {
      method: 'POST',
      body: { file: payload },
    });
    replaceRetailPointInState(data.point);
    state.selectedRetailPointId = data.point.id;
    els.retailPointDocumentFile.value = '';
    renderRetailPoints();
    renderRetailPointCard();
    showNotice(
      els.retailPointsNotice,
      ['Документ загружен в Google Drive.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.retailPointsNotice);
}

async function handleRetailPointDocumentClick(event) {
  const button = event.target.closest('[data-delete-retail-point-document]');
  if (!button) return;
  const pointId = els.retailPointCardForm.dataset.pointId;
  const documentId = button.dataset.deleteRetailPointDocument;
  const point = selectedRetailPoint();
  const documentItem = point?.documents?.find((item) => item.id === documentId);
  const label = documentItem?.fileName || 'документ';
  if (!window.confirm(`Удалить ${label} из карточки и Google Drive?`)) return;

  await runWithButton(button, async () => {
    const data = await api(`/api/retail-points/${encodeURIComponent(pointId)}/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    });
    replaceRetailPointInState(data.point);
    state.selectedRetailPointId = data.point.id;
    renderRetailPoints();
    renderRetailPointCard();
    const driveWarning = retailPointDriveDeleteWarning(data.googleDriveCleanup);
    showNotice(
      els.retailPointsNotice,
      ['Документ удален из карточки и Google Drive.', driveWarning, storageWarningText(data.storage)].filter(Boolean).join(' '),
      driveWarning || data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.retailPointsNotice);
}

function retailPointDriveDeleteWarning(cleanup) {
  if (!cleanup || cleanup.status === 'deleted' || cleanup.status === 'skipped') return '';
  return `Google Drive: ${cleanup.reason || 'документ не удалось удалить из архива.'}`;
}

function retailPointPayloadFromBasicForm(form) {
  const values = formValues(form);
  return {
    name: values.name,
    address: values.address,
    landlord: values.landlord,
    legalEntity: values.legalEntity,
    rentCost: values.rentCost,
    ownerName: values.ownerName,
    phone: values.phone,
    email: values.email,
    comment: values.comment,
  };
}

function retailPointPayloadFromCard(form) {
  const values = formValues(form);
  return {
    name: values.name,
    address: values.address,
    landlord: values.landlord,
    legalEntity: values.legalEntity,
    rentCost: values.rentCost,
    ownerName: values.ownerName,
    phone: values.phone,
    email: values.email,
    comment: values.comment,
    internet: {
      provider: values['internet.provider'],
      payment: values['internet.payment'],
      contractNumber: values['internet.contractNumber'],
      contractHolder: values['internet.contractHolder'],
      tariff: values['internet.tariff'],
      login: values['internet.login'],
      password: values['internet.password'],
    },
    video: {
      operator: values['video.operator'],
      camerasCount: values['video.camerasCount'],
      contractNumber: values['video.contractNumber'],
      contractHolder: values['video.contractHolder'],
      tariff: values['video.tariff'],
      login: values['video.login'],
      password: values['video.password'],
    },
  };
}

function replaceRetailPointInState(point) {
  const index = state.retailPoints.findIndex((item) => item.id === point.id);
  if (index === -1) {
    state.retailPoints.push(point);
  } else {
    state.retailPoints.splice(index, 1, point);
  }
}

async function retailPointDocumentPayloadFromFile(file) {
  if (!file) throw new Error('Выберите файл документа.');
  const lowerName = String(file.name || '').toLowerCase();
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
  const isImage = (
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    || lowerName.endsWith('.jpg')
    || lowerName.endsWith('.jpeg')
    || lowerName.endsWith('.png')
    || lowerName.endsWith('.webp')
  );
  if (!isPdf && !isImage) {
    throw new Error('Поддерживаются изображения JPG, PNG, WebP или PDF.');
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

async function loadCompanies() {
  if (!state.permissions.canViewCompanies) return;
  await runWithButton(els.refreshCompanies, async () => {
    const data = await api('/api/companies');
    state.companies = data.companies || [];
    state.retailPointCompanyOptions = companyOptionsFromCompanies(state.companies);
    fillRetailPointCompanySelect(els.retailPointLegalEntity, els.retailPointLegalEntity?.value || '');
    const point = selectedRetailPoint();
    if (point) {
      fillRetailPointCompanySelect(els.retailPointCardLegalEntity, point.legalEntity);
    }
    state.companyPoints = data.points || state.points || [];
    state.permissions.canManageCompanies = Boolean(data.canManage);
    renderCompanies();
    renderCompanyCard();
  }, els.companiesNotice);
}

function renderCompanies() {
  if (!els.companiesBody) return;
  els.companiesBody.replaceChildren();
  const canManage = Boolean(state.permissions.canManageCompanies);
  if (els.companyAddPanel) {
    els.companyAddPanel.classList.toggle('is-hidden', !canManage);
  }
  if (els.companyForm) {
    Array.from(els.companyForm.elements).forEach((field) => {
      field.disabled = !canManage;
    });
  }

  if (!state.permissions.canViewCompanies) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'empty-state';
    cell.textContent = 'Нет доступа к разделу компаний.';
    row.append(cell);
    els.companiesBody.append(row);
    closeCompanyCard();
    return;
  }

  if (!state.companies.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'empty-state';
    cell.textContent = 'Компании пока не добавлены.';
    row.append(cell);
    els.companiesBody.append(row);
    return;
  }

  const companies = [...state.companies].sort((left, right) => (
    String(left.shortName || left.name || '').localeCompare(String(right.shortName || right.name || ''), 'ru')
  ));
  for (const company of companies) {
    els.companiesBody.append(buildCompanyRow(company));
  }
}

function buildCompanyRow(company) {
  const row = document.createElement('tr');
  row.dataset.companyId = company.id;

  const nameCell = document.createElement('td');
  const nameButton = document.createElement('button');
  nameButton.type = 'button';
  nameButton.className = 'text-link';
  nameButton.textContent = company.shortName || company.name || 'Без названия';
  nameButton.addEventListener('click', () => openCompanyCard(company.id));
  nameCell.append(nameButton);
  row.append(nameCell);

  appendCell(row, company.name || '');
  appendCell(row, company.inn || '');
  appendCell(row, company.ogrnip || '');
  appendCell(row, company.phone || '');
  appendCell(row, company.email || '');
  appendCell(row, (company.pointNames || []).join(', '));
  return row;
}

function openCompanyCard(companyId) {
  state.selectedCompanyId = companyId;
  renderCompanyCard();
  els.companyCardPanel?.classList.remove('is-hidden');
  els.companyCardPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeCompanyCard() {
  state.selectedCompanyId = null;
  els.companyCardPanel?.classList.add('is-hidden');
  if (els.companyCardForm) {
    els.companyCardForm.reset();
    delete els.companyCardForm.dataset.companyId;
  }
  if (els.companyPointOptions) {
    els.companyPointOptions.replaceChildren();
  }
  if (els.companyDocumentsList) {
    els.companyDocumentsList.replaceChildren();
  }
}

function selectedCompany() {
  return state.companies.find((company) => company.id === state.selectedCompanyId) || null;
}

function renderCompanyCard() {
  if (!els.companyCardForm) return;
  const company = selectedCompany();
  if (!company) {
    els.companyCardPanel?.classList.add('is-hidden');
    return;
  }

  els.companyCardPanel?.classList.remove('is-hidden');
  els.companyCardForm.dataset.companyId = company.id;
  if (els.companyCardTitle) {
    els.companyCardTitle.textContent = `Карточка компании: ${company.shortName || company.name || 'без названия'}`;
  }

  [
    'shortName',
    'name',
    'legalAddress',
    'actualAddress',
    'postalAddress',
    'director',
    'phone',
    'email',
    'inn',
    'ogrnip',
    'okpo',
    'okato',
    'oktmo',
    'okved',
    'bankName',
    'bankBik',
    'bankAccount',
    'bankCorrespondentAccount',
    'bankInn',
    'bankKpp',
  ].forEach((field) => setCompanyFormValue(field, company[field]));

  const editable = Boolean(state.permissions.canManageCompanies);
  renderCompanyPointOptions(company, editable);
  setCompanyCardEditable(editable);
  renderCompanyDocuments(company.documents || [], editable);
}

function setCompanyFormValue(name, value) {
  const field = els.companyCardForm.elements[name];
  if (field) field.value = value || '';
}

function setCompanyCardEditable(editable) {
  Array.from(els.companyCardForm.elements).forEach((field) => {
    field.disabled = !editable;
  });
  if (els.uploadCompanyDocument) {
    els.uploadCompanyDocument.disabled = !editable;
  }
}

function renderCompanyPointOptions(company, editable) {
  const options = state.companyPoints.length ? state.companyPoints : state.points;
  const selected = new Set(company?.pointIds || []);
  els.companyPointOptions.replaceChildren(...options.map((point) => {
    const label = document.createElement('label');
    label.className = 'check-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'pointIds';
    input.value = point.id;
    input.checked = selected.has(point.id);
    input.disabled = !editable;
    const text = document.createElement('span');
    text.textContent = point.name;
    label.append(input, text);
    return label;
  }));
}

function renderCompanyDocuments(documents, editable) {
  els.companyDocumentsList.replaceChildren();
  if (!Array.isArray(documents) || !documents.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state company-documents-empty';
    empty.textContent = 'Документы компании не загружены.';
    els.companyDocumentsList.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'company-documents-table';
  for (const documentItem of [...documents].sort(compareRetailPointDocuments)) {
    list.append(buildCompanyDocumentRow(documentItem, editable));
  }
  els.companyDocumentsList.append(list);
}

function buildCompanyDocumentRow(documentItem, editable) {
  const row = document.createElement('div');
  row.className = 'company-document-row';
  row.dataset.documentId = documentItem.id;

  const file = document.createElement('strong');
  file.textContent = documentItem.fileName || documentItem.originalFileName || 'Документ';

  const date = document.createElement('span');
  date.textContent = documentItem.createdAt ? formatDateTime(documentItem.createdAt) : '';

  const size = document.createElement('span');
  size.textContent = documentItem.size ? formatFileSize(documentItem.size) : '';

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
  remove.className = 'danger company-document-remove';
  remove.dataset.deleteCompanyDocument = documentItem.id;
  remove.textContent = 'Удалить';
  remove.disabled = !editable;
  remove.classList.toggle('is-hidden', !editable);

  row.append(file, date, size, linkWrap, remove);
  return row;
}

async function handleCompanyCreate(event) {
  event.preventDefault();
  const button = event.submitter;
  await runWithButton(button, async () => {
    const data = await api('/api/companies', {
      method: 'POST',
      body: companyPayloadFromBasicForm(els.companyForm),
    });
    replaceCompanyInState(data.company);
    state.selectedCompanyId = data.company.id;
    els.companyForm.reset();
    renderCompanies();
    renderCompanyCard();
    showNotice(
      els.companiesNotice,
      ['Компания добавлена.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.companiesNotice);
}

async function handleCompanySave(event) {
  event.preventDefault();
  const companyId = els.companyCardForm.dataset.companyId;
  if (!companyId) return;
  await runWithButton(event.submitter, async () => {
    const data = await api(`/api/companies/${encodeURIComponent(companyId)}`, {
      method: 'PATCH',
      body: companyPayloadFromCard(els.companyCardForm),
    });
    replaceCompanyInState(data.company);
    state.selectedCompanyId = data.company.id;
    renderCompanies();
    renderCompanyCard();
    showNotice(
      els.companiesNotice,
      ['Карточка компании обновлена.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.companiesNotice);
}

async function handleCompanyDocumentUpload() {
  const companyId = els.companyCardForm.dataset.companyId;
  if (!companyId) return;
  const file = els.companyDocumentFile.files[0];
  await runWithButton(els.uploadCompanyDocument, async () => {
    const payload = await retailPointDocumentPayloadFromFile(file);
    const data = await api(`/api/companies/${encodeURIComponent(companyId)}/documents`, {
      method: 'POST',
      body: { file: payload },
    });
    replaceCompanyInState(data.company);
    state.selectedCompanyId = data.company.id;
    els.companyDocumentFile.value = '';
    renderCompanies();
    renderCompanyCard();
    showNotice(
      els.companiesNotice,
      ['Документ загружен в Google Drive.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.companiesNotice);
}

async function handleCompanyDocumentClick(event) {
  const button = event.target.closest('[data-delete-company-document]');
  if (!button) return;
  const companyId = els.companyCardForm.dataset.companyId;
  const documentId = button.dataset.deleteCompanyDocument;
  const company = selectedCompany();
  const documentItem = company?.documents?.find((item) => item.id === documentId);
  const label = documentItem?.fileName || 'документ';
  if (!window.confirm(`Удалить ${label} из карточки и Google Drive?`)) return;

  await runWithButton(button, async () => {
    const data = await api(`/api/companies/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    });
    replaceCompanyInState(data.company);
    state.selectedCompanyId = data.company.id;
    renderCompanies();
    renderCompanyCard();
    const driveWarning = retailPointDriveDeleteWarning(data.googleDriveCleanup);
    showNotice(
      els.companiesNotice,
      ['Документ удален из карточки и Google Drive.', driveWarning, storageWarningText(data.storage)].filter(Boolean).join(' '),
      driveWarning || data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.companiesNotice);
}

function companyPayloadFromBasicForm(form) {
  const values = formValues(form);
  return {
    shortName: values.shortName,
    name: values.name,
    inn: values.inn,
    ogrnip: values.ogrnip,
    phone: values.phone,
    email: values.email,
  };
}

function companyPayloadFromCard(form) {
  const values = formValues(form);
  return {
    shortName: values.shortName,
    name: values.name,
    legalAddress: values.legalAddress,
    actualAddress: values.actualAddress,
    postalAddress: values.postalAddress,
    director: values.director,
    phone: values.phone,
    email: values.email,
    inn: values.inn,
    ogrnip: values.ogrnip,
    okpo: values.okpo,
    okato: values.okato,
    oktmo: values.oktmo,
    okved: values.okved,
    bankName: values.bankName,
    bankBik: values.bankBik,
    bankAccount: values.bankAccount,
    bankCorrespondentAccount: values.bankCorrespondentAccount,
    bankInn: values.bankInn,
    bankKpp: values.bankKpp,
    pointIds: checkedValues(form, 'pointIds'),
  };
}

function replaceCompanyInState(company) {
  const index = state.companies.findIndex((item) => item.id === company.id);
  if (index === -1) {
    state.companies.push(company);
  } else {
    state.companies.splice(index, 1, company);
  }
  state.retailPointCompanyOptions = companyOptionsFromCompanies(state.companies);
  fillRetailPointCompanySelect(els.retailPointLegalEntity, els.retailPointLegalEntity?.value || '');
  const point = selectedRetailPoint();
  if (point) {
    fillRetailPointCompanySelect(els.retailPointCardLegalEntity, point.legalEntity);
  }
}

function companyOptionsFromCompanies(companies) {
  const byValue = new Map();
  for (const company of companies || []) {
    const value = String(company.shortName || company.name || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (!byValue.has(key)) {
      byValue.set(key, {
        value,
        label: value,
        companyId: company.id || '',
        shortName: company.shortName || '',
        name: company.name || '',
      });
    }
  }
  return [...byValue.values()].sort((left, right) => left.label.localeCompare(right.label, 'ru'));
}

async function loadTasks() {
  if (!state.permissions.canViewTasks) return;
  await runWithButton(els.refreshTasks, async () => {
    const data = await api('/api/tasks');
    state.tasks = data.tasks || [];
    state.taskPriorities = data.priorities || [];
    state.taskAssigneeOptions = data.assigneeOptions || [];
    state.permissions.canCreateTasks = Boolean(data.canCreate);
    state.permissions.canManageTasks = Boolean(data.canManage);
    renderTasks();
  }, els.tasksNotice);
}

function renderTasks() {
  if (!els.tasksBody) return;
  els.tasksBody.replaceChildren();
  const canView = Boolean(state.permissions.canViewTasks);
  const canCreate = Boolean(state.permissions.canCreateTasks && state.taskAssigneeOptions.length);
  if (els.taskAuthorInput) els.taskAuthorInput.value = state.user?.fullName || '';
  if (els.taskCreatedAtInput) els.taskCreatedAtInput.value = currentDate();
  if (els.taskDeadlineInput && !els.taskDeadlineInput.value) els.taskDeadlineInput.value = currentDate();
  fillTaskAssigneeSelect();
  fillTaskPrioritySelect();

  if (els.taskForm) {
    Array.from(els.taskForm.elements).forEach((field) => {
      field.disabled = !canCreate;
      if (field.readOnly) field.disabled = false;
    });
  }

  if (!canView) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'empty-state';
    cell.textContent = 'Нет доступа к разделу Задачи.';
    row.append(cell);
    els.tasksBody.append(row);
    return;
  }

  if (!state.tasks.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'empty-state';
    cell.textContent = 'Задач пока нет.';
    row.append(cell);
    els.tasksBody.append(row);
    return;
  }

  for (const task of [...state.tasks].sort(compareTasksByDateDesc)) {
    els.tasksBody.append(buildTaskRow(task));
  }
}

function fillTaskAssigneeSelect() {
  if (!els.taskAssigneeSelect) return;
  const previous = els.taskAssigneeSelect.value;
  const options = (state.taskAssigneeOptions || []).map((employee) => {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = employee.roleLabel
      ? `${employee.fullName} (${employee.roleLabel})`
      : employee.fullName;
    return option;
  });
  els.taskAssigneeSelect.replaceChildren(...options);
  if (options.some((option) => option.value === previous)) {
    els.taskAssigneeSelect.value = previous;
  }
}

function fillTaskPrioritySelect() {
  if (!els.taskPrioritySelect || !state.taskPriorities.length) return;
  const previous = els.taskPrioritySelect.value || 'normal';
  els.taskPrioritySelect.replaceChildren(...state.taskPriorities.map((priority) => {
    const option = document.createElement('option');
    option.value = priority.value;
    option.textContent = priority.label;
    return option;
  }));
  els.taskPrioritySelect.value = state.taskPriorities.some((priority) => priority.value === previous)
    ? previous
    : 'normal';
}

function compareTasksByDateDesc(left, right) {
  return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
}

function buildTaskRow(task) {
  const row = document.createElement('tr');
  appendCell(row, formatDateTime(task.createdAt));
  appendCell(row, task.title);
  appendCell(row, task.createdByName || '');
  appendCell(row, task.assigneeName || '');
  appendCell(row, task.priorityLabel || task.priority);
  appendCell(row, formatDate(task.deadline));
  appendCell(row, shortText(task.description, 140), 'development-description-cell');
  row.append(taskAttachmentsCell(task));
  return row;
}

function taskAttachmentsCell(task) {
  const cell = document.createElement('td');
  cell.className = 'task-attachments-cell';
  const attachments = Array.isArray(task.attachments) ? task.attachments : [];
  if (!attachments.length) {
    cell.textContent = '—';
    return cell;
  }

  const list = document.createElement('div');
  list.className = 'task-attachments-list';
  for (const attachment of attachments) {
    const link = document.createElement('a');
    link.className = 'repair-file-link';
    link.href = attachment.googleDrive?.webViewLink || attachment.localUrl || '#';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = attachment.fileName || attachment.originalFileName || 'Файл';
    if (!attachment.googleDrive?.webViewLink && !attachment.localUrl) {
      link.removeAttribute('href');
      link.textContent = attachment.googleDrive?.reason || 'Файл недоступен';
    }
    list.append(link);
    if (attachment.size) {
      const meta = document.createElement('span');
      meta.className = 'repair-file-meta';
      meta.textContent = formatFileSize(attachment.size);
      list.append(meta);
    }
  }
  cell.append(list);
  return cell;
}

async function handleTaskCreate(event) {
  event.preventDefault();
  if (!state.permissions.canCreateTasks) {
    showNotice(els.tasksNotice, 'Нет доступа к созданию задач.', 'warning');
    return;
  }
  const button = event.submitter;
  await runWithButton(button, async () => {
    const values = formValues(els.taskForm);
    const attachments = await repairAttachmentPayloadsFromInput(els.taskAttachmentFiles);
    const data = await api('/api/tasks', {
      method: 'POST',
      body: {
        title: values.title,
        assigneeId: values.assigneeId,
        priority: values.priority,
        deadline: values.deadline,
        description: values.description,
        attachments,
      },
    });
    state.tasks = [data.task, ...state.tasks];
    els.taskForm.reset();
    if (els.taskAttachmentFiles) els.taskAttachmentFiles.value = '';
    renderTasks();
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    const driveWarning = repairAttachmentsDriveWarning(data.task.attachments || []);
    const deliveryWarning = taskEmailDeliveryWarning(data.emailDelivery || data.task.emailDelivery);
    showNotice(
      els.tasksNotice,
      ['Задача создана.', deliveryWarning || 'Уведомление отправлено на email исполнителя.', driveWarning, storageWarning].filter(Boolean).join(' '),
      deliveryWarning || driveWarning || storageWarning ? 'warning' : 'success',
    );
  }, els.tasksNotice);
}

function taskEmailDeliveryWarning(delivery) {
  if (!delivery || delivery.status === 'sent') return '';
  if (delivery.status === 'skipped') {
    return `Email-уведомление не отправлено: ${delivery.reason || 'у исполнителя не указан email.'}`;
  }
  if (delivery.status === 'outbox') {
    return `Email-уведомление сохранено в outbox. Причина: ${delivery.reason || 'SMTP недоступен.'}${delivery.outboxPath ? ` Файл: ${delivery.outboxPath}.` : ''}`;
  }
  return `Email-уведомление не отправлено: ${delivery.reason || 'неизвестная ошибка.'}`;
}

async function loadDevelopmentProposals() {
  if (!state.permissions.canViewDevelopment) return;
  await runWithButton(els.refreshDevelopment, async () => {
    const data = await api('/api/development');
    state.developmentProposals = data.proposals || [];
    state.developmentStatuses = data.statuses || [];
    state.permissions.canCreateDevelopmentProposals = Boolean(data.canCreate);
    state.permissions.canManageDevelopment = Boolean(data.canManage);
    renderDevelopmentProposals();
    renderDevelopmentCard();
  }, els.developmentNotice);
}

function renderDevelopmentProposals() {
  if (!els.developmentBody) return;
  els.developmentBody.replaceChildren();
  const canView = Boolean(state.permissions.canViewDevelopment);
  const canCreate = Boolean(state.permissions.canCreateDevelopmentProposals);
  els.developmentAddPanel?.classList.toggle('is-hidden', !canCreate);
  if (els.developmentForm) {
    Array.from(els.developmentForm.elements).forEach((field) => {
      field.disabled = !canCreate;
    });
  }

  if (!canView) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'empty-state';
    cell.textContent = 'Нет доступа к разделу Разработка.';
    row.append(cell);
    els.developmentBody.append(row);
    closeDevelopmentCard();
    return;
  }

  if (!state.developmentProposals.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'empty-state';
    cell.textContent = 'Предложения пока не добавлены.';
    row.append(cell);
    els.developmentBody.append(row);
    return;
  }

  for (const proposal of [...state.developmentProposals].sort(compareDevelopmentProposals)) {
    els.developmentBody.append(buildDevelopmentProposalRow(proposal));
  }
}

function compareDevelopmentProposals(left, right) {
  return String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || ''));
}

function buildDevelopmentProposalRow(proposal) {
  const row = document.createElement('tr');
  const titleCell = document.createElement('td');
  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'text-link';
  title.dataset.developmentProposalId = proposal.id;
  title.textContent = proposal.title || 'Без темы';
  titleCell.append(title);

  appendCell(row, formatDateTime(proposal.createdAt));
  row.append(titleCell);
  appendCell(row, developmentStatusLabel(proposal.status), `status-cell status-${proposal.status}`);
  appendCell(row, proposal.createdByName || '');
  appendCell(row, shortText(proposal.description, 140), 'development-description-cell');
  appendCell(row, String((proposal.attachments || []).length), 'center-cell');
  appendCell(row, formatDateTime(proposal.updatedAt));
  return row;
}

function handleDevelopmentTableClick(event) {
  const button = event.target.closest('[data-development-proposal-id]');
  if (!button) return;
  state.selectedDevelopmentProposalId = button.dataset.developmentProposalId;
  renderDevelopmentCard();
}

function selectedDevelopmentProposal() {
  return state.developmentProposals.find((proposal) => proposal.id === state.selectedDevelopmentProposalId) || null;
}

function renderDevelopmentCard() {
  if (!els.developmentCardPanel || !els.developmentCardForm) return;
  const proposal = selectedDevelopmentProposal();
  els.developmentCardPanel.classList.toggle('is-hidden', !proposal);
  if (!proposal) {
    els.developmentCardForm.dataset.proposalId = '';
    return;
  }

  const canManage = Boolean(state.permissions.canManageDevelopment);
  const canAttach = canManage || !['rejected', 'implemented'].includes(proposal.status);
  els.developmentCardForm.dataset.proposalId = proposal.id;
  els.developmentCardTitle.textContent = proposal.title || 'Предложение';
  setFormValue(els.developmentCardForm, 'title', proposal.title);
  setFormValue(els.developmentCardForm, 'description', proposal.description);
  setFormValue(els.developmentCardForm, 'createdByName', proposal.createdByName);
  setFormValue(els.developmentCardForm, 'createdAt', formatDateTime(proposal.createdAt));
  setFormValue(els.developmentCardForm, 'ownerComment', proposal.ownerComment);
  setFormValue(els.developmentCardForm, 'codexTask', proposal.codexTask);
  fillDevelopmentStatusSelect(els.developmentStatus, proposal.status);

  Array.from(els.developmentCardForm.elements).forEach((field) => {
    if (field.type === 'submit') {
      field.disabled = !canManage;
      return;
    }
    const ownerField = ['status', 'ownerComment', 'codexTask'].includes(field.name);
    field.disabled = !ownerField || !canManage;
  });
  els.developmentCardForm.querySelector('button[type="submit"]')?.classList.toggle('is-hidden', !canManage);
  els.uploadDevelopmentAttachment.disabled = !canAttach;
  els.uploadDevelopmentAttachment.classList.toggle('is-hidden', !canAttach);
  renderDevelopmentAttachments(proposal.attachments || [], canAttach);
}

function fillDevelopmentStatusSelect(select, selected) {
  if (!select) return;
  select.replaceChildren(...(state.developmentStatuses || []).map((status) => {
    const option = document.createElement('option');
    option.value = status.value;
    option.textContent = status.label;
    return option;
  }));
  select.value = selected || 'new';
}

function renderDevelopmentAttachments(attachments, editable) {
  if (!els.developmentAttachmentsList) return;
  els.developmentAttachmentsList.replaceChildren();
  if (!Array.isArray(attachments) || !attachments.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state development-attachments-empty';
    empty.textContent = 'Файлы не прикреплены.';
    els.developmentAttachmentsList.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'development-attachments-table';
  for (const attachment of [...attachments].sort(compareRetailPointDocuments)) {
    list.append(buildDevelopmentAttachmentRow(attachment, editable));
  }
  els.developmentAttachmentsList.append(list);
}

function buildDevelopmentAttachmentRow(attachment, editable) {
  const row = document.createElement('div');
  row.className = 'development-attachment-row';

  const file = document.createElement('strong');
  file.textContent = attachment.fileName || attachment.originalFileName || 'Файл';

  const date = document.createElement('span');
  date.textContent = attachment.createdAt ? formatDateTime(attachment.createdAt) : '';

  const size = document.createElement('span');
  size.textContent = attachment.size ? formatFileSize(attachment.size) : '';

  const linkWrap = document.createElement('span');
  if (attachment.googleDrive?.webViewLink || attachment.localUrl) {
    const link = document.createElement('a');
    link.href = attachment.googleDrive?.webViewLink || attachment.localUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Открыть';
    linkWrap.append(link);
  } else {
    linkWrap.textContent = attachment.googleDrive?.reason || 'Нет ссылки';
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger development-attachment-remove';
  remove.dataset.deleteDevelopmentAttachment = attachment.id;
  remove.textContent = 'Удалить';
  remove.disabled = !editable;
  remove.classList.toggle('is-hidden', !editable);

  row.append(file, date, size, linkWrap, remove);
  return row;
}

async function handleDevelopmentCreate(event) {
  event.preventDefault();
  await runWithButton(event.submitter, async () => {
    const values = formValues(els.developmentForm);
    const data = await api('/api/development', {
      method: 'POST',
      body: {
        title: values.title,
        description: values.description,
      },
    });
    replaceDevelopmentProposalInState(data.proposal);
    state.selectedDevelopmentProposalId = data.proposal.id;
    const file = els.developmentForm.elements.initialFile?.files?.[0];
    els.developmentForm.reset();
    renderDevelopmentProposals();
    renderDevelopmentCard();

    let driveWarning = '';
    if (file) {
      const attachmentData = await uploadDevelopmentAttachment(data.proposal.id, file);
      driveWarning = developmentDriveWarning(attachmentData.attachment?.googleDrive);
    }
    const storageWarning = storageWarningText(data.storage);
    showNotice(
      els.developmentNotice,
      ['Предложение создано.', driveWarning, storageWarning].filter(Boolean).join(' '),
      driveWarning || storageWarning ? 'warning' : 'success',
    );
  }, els.developmentNotice);
}

async function handleDevelopmentCardSave(event) {
  event.preventDefault();
  const proposalId = els.developmentCardForm.dataset.proposalId;
  if (!proposalId || !state.permissions.canManageDevelopment) return;
  await runWithButton(event.submitter, async () => {
    const values = formValues(els.developmentCardForm);
    const data = await api(`/api/development/${encodeURIComponent(proposalId)}`, {
      method: 'PATCH',
      body: {
        status: values.status,
        ownerComment: values.ownerComment,
        codexTask: values.codexTask,
      },
    });
    replaceDevelopmentProposalInState(data.proposal);
    state.selectedDevelopmentProposalId = data.proposal.id;
    renderDevelopmentProposals();
    renderDevelopmentCard();
    const storageWarning = storageWarningText(data.storage);
    showNotice(
      els.developmentNotice,
      ['Предложение обновлено.', storageWarning].filter(Boolean).join(' '),
      storageWarning ? 'warning' : 'success',
    );
  }, els.developmentNotice);
}

async function handleDevelopmentAttachmentUpload() {
  const proposalId = els.developmentCardForm.dataset.proposalId;
  if (!proposalId) return;
  const file = els.developmentAttachmentFile.files[0];
  await runWithButton(els.uploadDevelopmentAttachment, async () => {
    const data = await uploadDevelopmentAttachment(proposalId, file);
    els.developmentAttachmentFile.value = '';
    renderDevelopmentProposals();
    renderDevelopmentCard();
    const driveWarning = developmentDriveWarning(data.attachment?.googleDrive);
    showNotice(
      els.developmentNotice,
      [driveWarning ? 'Файл сохранен на сайте.' : 'Файл загружен в Google Drive.', driveWarning, storageWarningText(data.storage)].filter(Boolean).join(' '),
      driveWarning || data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.developmentNotice);
}

async function uploadDevelopmentAttachment(proposalId, file) {
  const payload = await developmentAttachmentPayloadFromFile(file);
  const data = await api(`/api/development/${encodeURIComponent(proposalId)}/attachments`, {
    method: 'POST',
    body: { file: payload },
  });
  replaceDevelopmentProposalInState(data.proposal);
  state.selectedDevelopmentProposalId = data.proposal.id;
  return data;
}

async function handleDevelopmentAttachmentClick(event) {
  const button = event.target.closest('[data-delete-development-attachment]');
  if (!button) return;
  const proposalId = els.developmentCardForm.dataset.proposalId;
  const attachmentId = button.dataset.deleteDevelopmentAttachment;
  const proposal = selectedDevelopmentProposal();
  const attachment = proposal?.attachments?.find((item) => item.id === attachmentId);
  const label = attachment?.fileName || 'файл';
  if (!window.confirm(`Удалить ${label} из предложения и Google Drive?`)) return;

  await runWithButton(button, async () => {
    const data = await api(`/api/development/${encodeURIComponent(proposalId)}/attachments/${encodeURIComponent(attachmentId)}`, {
      method: 'DELETE',
    });
    replaceDevelopmentProposalInState(data.proposal);
    state.selectedDevelopmentProposalId = data.proposal.id;
    renderDevelopmentProposals();
    renderDevelopmentCard();
    const driveWarning = retailPointDriveDeleteWarning(data.googleDriveCleanup);
    showNotice(
      els.developmentNotice,
      ['Файл удален из предложения и Google Drive.', driveWarning, storageWarningText(data.storage)].filter(Boolean).join(' '),
      driveWarning || data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.developmentNotice);
}

function closeDevelopmentCard() {
  state.selectedDevelopmentProposalId = null;
  renderDevelopmentCard();
  showNotice(els.developmentNotice, '');
}

function replaceDevelopmentProposalInState(proposal) {
  const index = state.developmentProposals.findIndex((item) => item.id === proposal.id);
  if (index === -1) {
    state.developmentProposals.push(proposal);
  } else {
    state.developmentProposals.splice(index, 1, proposal);
  }
}

function developmentStatusLabel(status) {
  return (state.developmentStatuses || []).find((item) => item.value === status)?.label || status || '';
}

function developmentDriveWarning(googleDrive) {
  if (googleDrive?.status === 'uploaded') return '';
  return `Google Drive: ${googleDrive?.reason || 'файл не удалось отправить в архив.'}`;
}

async function developmentAttachmentPayloadFromFile(file) {
  if (!file) throw new Error('Выберите файл.');
  const lowerName = String(file.name || '').toLowerCase();
  const isImage = (
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    || ['.jpg', '.jpeg', '.png', '.webp'].some((extension) => lowerName.endsWith(extension))
  );
  const documentMime = developmentAttachmentMime(file);
  if (!isImage && !documentMime) {
    throw new Error('Поддерживаются JPG, PNG, WebP, PDF, DOC, DOCX, XLS, XLSX или TXT.');
  }

  if (!isImage) {
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Файл слишком большой. Максимум 5 МБ.');
    }
    return {
      fileName: file.name,
      mimeType: documentMime,
      size: file.size,
      dataUrl: await readFileAsDataUrlWithMime(file, documentMime),
    };
  }

  const compressed = await compressReceiptImage(file);
  if (compressed.size > 5 * 1024 * 1024) {
    throw new Error('Файл изображения слишком большой. Максимум 5 МБ.');
  }
  return {
    fileName: file.name,
    mimeType: 'image/jpeg',
    size: compressed.size,
    dataUrl: compressed.dataUrl.replace(/^data:[^;]+;/, 'data:image/jpeg;'),
  };
}

function developmentAttachmentMime(file) {
  const name = String(file?.name || '').toLowerCase();
  if (file?.type === 'application/pdf' || name.endsWith('.pdf')) return 'application/pdf';
  if (file?.type === 'application/msword' || name.endsWith('.doc')) return 'application/msword';
  if (
    file?.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || name.endsWith('.docx')
  ) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (file?.type === 'application/vnd.ms-excel' || name.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (
    file?.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || name.endsWith('.xlsx')
  ) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (file?.type === 'text/plain' || name.endsWith('.txt')) return 'text/plain';
  return '';
}

function shortText(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

async function loadReports() {
  if (!state.permissions.canViewReports) return;
  await runWithButton(els.refreshReports, async () => {
    const data = await api('/api/reports');
    state.reports = data.reports || [];
    state.permissions.canManageReports = Boolean(data.canManage);
    if (state.selectedReportId && !state.reports.some((report) => report.id === state.selectedReportId)) {
      state.selectedReportId = null;
      state.adminPayrollReport = null;
      state.employeePayrollReport = null;
      resetEmployeePayrollFilters();
      els.employeePayrollFilters?.classList.add('is-hidden');
    }
    renderReportsList();
  }, els.reportsNotice);
}

function renderReportsUnavailable() {
  state.reports = [];
  state.selectedReportId = null;
  state.adminPayrollReport = null;
  state.employeePayrollReport = null;
  resetEmployeePayrollFilters();
  els.employeePayrollFilters?.classList.add('is-hidden');
  renderReportsList();
}

function renderReportsList() {
  if (!els.reportsList || !els.reportsListPanel || !els.reportDetailsPanel) return;
  const isReportOpen = Boolean(state.selectedReportId);
  els.reportsListPanel.classList.toggle('is-hidden', isReportOpen);
  els.reportDetailsPanel.classList.toggle('is-hidden', !isReportOpen);
  els.reportsList.replaceChildren();

  if (!state.permissions.canViewReports) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Нет доступа к разделу отчетов.';
    els.reportsList.append(empty);
    return;
  }

  if (!state.reports.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Отчеты пока не настроены.';
    els.reportsList.append(empty);
    return;
  }

  for (const report of state.reports) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'report-link';
    button.dataset.reportId = report.id;
    button.textContent = report.title;
    els.reportsList.append(button);
  }
}

function handleReportsListClick(event) {
  const button = event.target.closest('[data-report-id]');
  if (!button) return;
  openReport(button.dataset.reportId);
}

async function openReport(reportId) {
  state.selectedReportId = reportId;
  state.adminPayrollReport = null;
  state.employeePayrollReport = null;
  resetEmployeePayrollFilters();
  if (!els.reportMonthInput.value) {
    els.reportMonthInput.value = currentMonth();
  }
  renderReportsList();
  await loadSelectedReport();
}

function closeReport() {
  state.selectedReportId = null;
  state.adminPayrollReport = null;
  state.employeePayrollReport = null;
  resetEmployeePayrollFilters();
  els.employeePayrollFilters?.classList.add('is-hidden');
  showNotice(els.reportsNotice, '');
  renderReportsList();
}

async function loadSelectedReport() {
  if (!state.selectedReportId || !state.permissions.canViewReports) return;
  if (!els.reportMonthInput.value) {
    els.reportMonthInput.value = currentMonth();
  }
  if (state.selectedReportId === 'admin-payroll') {
    await loadAdminPayrollReport();
    return;
  }
  if (state.selectedReportId === 'employee-payroll') {
    await loadEmployeePayrollReport();
  }
}

async function loadAdminPayrollReport() {
  await runWithButton(els.loadReport, async () => {
    const month = els.reportMonthInput.value || currentMonth();
    const data = await api(`/api/reports/admin-payroll?month=${encodeURIComponent(month)}`);
    state.adminPayrollReport = data.report;
    state.permissions.canManageReports = Boolean(data.canManage);
    renderAdminPayrollReport();
    showNotice(els.reportsNotice, '');
  }, els.reportsNotice);
}

async function loadEmployeePayrollReport() {
  await runWithButton(els.loadReport, async () => {
    const month = els.reportMonthInput.value || currentMonth();
    const data = await api(`/api/reports/employee-payroll?month=${encodeURIComponent(month)}`);
    state.employeePayrollReport = data.report;
    state.permissions.canManageReports = Boolean(data.canManage);
    renderEmployeePayrollReport();
    showNotice(els.reportsNotice, '');
  }, els.reportsNotice);
}

function renderEmployeePayrollReport() {
  const employeeReport = state.employeePayrollReport;
  if (!employeeReport) return;
  els.reportDetailsTitle.textContent = `${employeeReport.title} · ${formatMonth(employeeReport.month)}`;
  els.saveAdminPayrollReport.classList.add('is-hidden');
  els.reportContent.replaceChildren();
  syncEmployeePayrollFilters(employeeReport);

  const columns = employeePayrollColumns();
  const filteredRows = filteredEmployeePayrollRows(employeeReport.rows || []);
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap report-table-wrap';
  const table = document.createElement('table');
  table.className = 'reports-table employee-payroll-table';
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  columns.forEach((column) => {
    const th = document.createElement('th');
    th.textContent = column.label;
    if (column.numeric) th.className = 'numeric-cell';
    header.append(th);
  });
  thead.append(header);
  table.append(thead);

  const tbody = document.createElement('tbody');
  if (!filteredRows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = columns.length;
    cell.className = 'empty-state';
    cell.textContent = employeeReport.rows.length
      ? 'Нет строк по выбранному отбору.'
      : 'Сотрудники для отчета не найдены.';
    row.append(cell);
    tbody.append(row);
  } else {
    for (const rowData of filteredRows) {
      tbody.append(buildEmployeePayrollRow(rowData, columns));
    }
  }
  table.append(tbody);

  if (filteredRows.length) {
    table.append(buildEmployeePayrollFooter(calculateEmployeePayrollTotals(filteredRows, columns), columns));
  }

  wrap.append(table);
  els.reportContent.append(wrap);

  if (employeeReport.generatedAt) {
    const generated = document.createElement('p');
    generated.className = 'report-updated';
    generated.textContent = `Сформировано: ${formatDateTime(employeeReport.generatedAt)}`;
    els.reportContent.append(generated);
  }
}

function employeePayrollColumns() {
  return [
    { key: 'fullName', label: 'ФИО' },
    { key: 'pointName', label: 'Точка' },
    { key: 'issuedTotal', label: 'Выдано', numeric: true },
    { key: 'rateFirstHalf', label: 'Ставка 1-15', numeric: true },
    { key: 'advanceCard', label: 'Аванс на карту', numeric: true },
    { key: 'rateSecondHalf', label: 'Ставка 16+', numeric: true },
    { key: 'salaryCard', label: 'ЗП на карту', numeric: true },
    { key: 'bonus', label: 'Бонус', numeric: true },
    { key: 'premium', label: 'Премия', numeric: true },
    { key: 'claims', label: 'Претензии', numeric: true },
    { key: 'advanceTotal', label: 'Итого аванс', numeric: true },
    { key: 'salaryTotal', label: 'Итого ЗП', numeric: true },
    { key: 'payrollFund', label: 'Фонд оплаты', numeric: true },
  ];
}

function resetEmployeePayrollFilters() {
  state.employeePayrollFilters = { pointId: '', adminId: '', employeeId: '' };
}

function syncEmployeePayrollFilters(report) {
  if (!els.employeePayrollFilters || !els.employeePayrollPointFilter || !els.employeePayrollEmployeeFilter) return;
  els.employeePayrollFilters.classList.remove('is-hidden');

  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const adminOptions = Array.isArray(report?.adminOptions)
    ? report.adminOptions.map((admin) => ({ value: admin.id, label: admin.fullName }))
    : [];
  if (state.employeePayrollFilters.adminId && !adminOptions.some((option) => option.value === state.employeePayrollFilters.adminId)) {
    state.employeePayrollFilters.adminId = '';
  }
  if (els.employeePayrollAdminFilter) {
    fillReportFilterSelect(
      els.employeePayrollAdminFilter,
      'Все администраторы',
      adminOptions,
      state.employeePayrollFilters.adminId,
    );
  }

  const rowsForPointOptions = state.employeePayrollFilters.adminId
    ? rows.filter((row) => reportRowBelongsToAdmin(row, state.employeePayrollFilters.adminId))
    : rows;
  const pointOptions = uniqueReportOptions(rowsForPointOptions, 'pointId', 'pointName');
  if (state.employeePayrollFilters.pointId && !pointOptions.some((option) => option.value === state.employeePayrollFilters.pointId)) {
    state.employeePayrollFilters.pointId = '';
  }
  fillReportFilterSelect(
    els.employeePayrollPointFilter,
    'Все точки',
    pointOptions,
    state.employeePayrollFilters.pointId,
  );

  const rowsForEmployeeOptions = rows.filter((row) => {
    if (state.employeePayrollFilters.adminId && !reportRowBelongsToAdmin(row, state.employeePayrollFilters.adminId)) return false;
    if (state.employeePayrollFilters.pointId && row.pointId !== state.employeePayrollFilters.pointId) return false;
    return true;
  });
  const employeeOptions = uniqueReportOptions(rowsForEmployeeOptions, 'employeeId', 'fullName');
  if (state.employeePayrollFilters.employeeId && !employeeOptions.some((option) => option.value === state.employeePayrollFilters.employeeId)) {
    state.employeePayrollFilters.employeeId = '';
  }
  fillReportFilterSelect(
    els.employeePayrollEmployeeFilter,
    'Все сотрудники',
    employeeOptions,
    state.employeePayrollFilters.employeeId,
  );
}

function uniqueReportOptions(rows, valueKey, labelKey) {
  const byValue = new Map();
  for (const row of rows) {
    const value = row?.[valueKey] || '';
    const label = row?.[labelKey] || value;
    if (!value || byValue.has(value)) continue;
    byValue.set(value, { value, label });
  }
  return [...byValue.values()].sort((left, right) => left.label.localeCompare(right.label, 'ru'));
}

function fillReportFilterSelect(select, allLabel, options, selectedValue) {
  select.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = allLabel;
  select.append(all);
  for (const item of options) {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  }
  select.value = selectedValue || '';
}

function filteredEmployeePayrollRows(rows) {
  const filters = state.employeePayrollFilters || {};
  return rows.filter((row) => {
    if (filters.adminId && !reportRowBelongsToAdmin(row, filters.adminId)) return false;
    if (filters.pointId && row.pointId !== filters.pointId) return false;
    if (filters.employeeId && row.employeeId !== filters.employeeId) return false;
    return true;
  });
}

function reportRowBelongsToAdmin(row, adminId) {
  return Array.isArray(row?.adminIds) && row.adminIds.includes(adminId);
}

function calculateEmployeePayrollTotals(rows, columns) {
  const totals = {};
  for (const column of columns) {
    if (column.numeric) totals[column.key] = 0;
  }
  for (const row of rows) {
    for (const key of Object.keys(totals)) {
      totals[key] += toNumber(row[key]);
    }
  }
  return totals;
}

function buildEmployeePayrollRow(rowData, columns) {
  const row = document.createElement('tr');
  for (const column of columns) {
    const value = column.numeric
      ? formatMoney(toNumber(rowData[column.key]))
      : rowData[column.key] || '';
    const classNames = [
      column.numeric ? 'numeric-cell' : '',
      column.key === 'fullName' ? 'report-name-cell' : '',
      isNegativeEmployeePayrollTotal(column.key, rowData[column.key]) ? 'report-negative-cell' : '',
    ].filter(Boolean).join(' ');
    appendCell(row, value, classNames);
  }
  return row;
}

function isNegativeEmployeePayrollTotal(key, value) {
  return ['advanceTotal', 'salaryTotal'].includes(key) && toNumber(value) < 0;
}

function buildEmployeePayrollFooter(totals, columns) {
  const tfoot = document.createElement('tfoot');
  const row = document.createElement('tr');
  for (const column of columns) {
    if (column.key === 'fullName') {
      appendCell(row, 'Итого', 'summary-total-label');
    } else if (column.numeric) {
      appendCell(row, formatMoney(toNumber(totals[column.key])), 'numeric-cell');
    } else {
      appendCell(row, '');
    }
  }
  tfoot.append(row);
  return tfoot;
}

function renderAdminPayrollReport() {
  const report = state.adminPayrollReport;
  if (!report) return;
  const canManage = Boolean(state.permissions.canManageReports);
  els.reportDetailsTitle.textContent = `${report.title} · ${formatMonth(report.month)}`;
  els.saveAdminPayrollReport.classList.toggle('is-hidden', !canManage);
  els.employeePayrollFilters?.classList.add('is-hidden');
  els.reportContent.replaceChildren();

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap report-table-wrap';
  const table = document.createElement('table');
  table.className = 'reports-table admin-payroll-table';
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  [
    'ФИО',
    'Бонус за точки',
    'Неоф. оклад',
    'Премия',
    'Аванс на карту',
    'ЗП на карту',
    'Аванс экстра',
    'Штрафы',
    'К выплате',
    'Комментарий',
  ].forEach((title, index) => {
    const th = document.createElement('th');
    th.textContent = title;
    if (index > 0 && index < 9) th.className = 'numeric-cell';
    header.append(th);
  });
  thead.append(header);
  table.append(thead);

  const tbody = document.createElement('tbody');
  if (!report.rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 10;
    cell.className = 'empty-state';
    cell.textContent = 'Администраторы для отчета не найдены.';
    row.append(cell);
    tbody.append(row);
  } else {
    for (const rowData of report.rows) {
      tbody.append(buildAdminPayrollRow(rowData, canManage));
    }
  }
  table.append(tbody);
  wrap.append(table);
  els.reportContent.append(wrap);

  if (report.updatedAt) {
    const updated = document.createElement('p');
    updated.className = 'report-updated';
    updated.textContent = `Сохранено: ${formatDateTime(report.updatedAt)}`;
    els.reportContent.append(updated);
  }
}

function buildAdminPayrollRow(rowData, canManage) {
  const row = document.createElement('tr');
  row.dataset.employeeId = rowData.employeeId;
  appendCell(row, rowData.fullName, 'report-name-cell');
  appendCell(row, formatMoney(toNumber(rowData.bonusPoints)), 'numeric-cell');
  appendCell(row, formatMoney(toNumber(rowData.unofficialSalary)), 'numeric-cell');
  appendCell(row, formatMoney(toNumber(rowData.premium)), 'numeric-cell');

  for (const field of ['advanceCard', 'salaryCard', 'advanceExtra', 'fines']) {
    const cell = document.createElement('td');
    cell.className = 'numeric-cell';
    cell.append(reportNumberInput(rowData, field, canManage));
    row.append(cell);
  }

  const payableCell = appendCell(row, formatMoney(calculateAdminPayrollPayable(rowData)), 'numeric-cell report-payable-cell');
  payableCell.dataset.payable = rowData.employeeId;

  const commentCell = document.createElement('td');
  const comment = document.createElement('input');
  comment.type = 'text';
  comment.maxLength = 500;
  comment.value = rowData.comment || '';
  comment.disabled = !canManage;
  comment.className = 'report-comment-input';
  comment.dataset.employeeId = rowData.employeeId;
  comment.dataset.reportField = 'comment';
  commentCell.append(comment);
  row.append(commentCell);

  return row;
}

function reportNumberInput(rowData, field, canManage) {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.pattern = '\\d*([,.]\\d+)?';
  input.maxLength = 16;
  input.value = rowData[field] || '';
  input.disabled = !canManage;
  input.className = 'report-number-input';
  input.dataset.employeeId = rowData.employeeId;
  input.dataset.reportField = field;
  return input;
}

function handleReportContentInput(event) {
  const input = event.target.closest('[data-report-field]');
  if (!input || state.selectedReportId !== 'admin-payroll' || !state.adminPayrollReport) return;
  const row = state.adminPayrollReport.rows.find((item) => item.employeeId === input.dataset.employeeId);
  if (!row) return;
  row[input.dataset.reportField] = input.value;
  const rowElement = input.closest('tr');
  const payableCell = rowElement?.querySelector('[data-payable]');
  if (payableCell) {
    payableCell.textContent = formatMoney(calculateAdminPayrollPayable(row));
  }
}

function calculateAdminPayrollPayable(row) {
  return toNumber(row.unofficialSalary)
    + toNumber(row.premium)
    + toNumber(row.bonusPoints)
    - toNumber(row.advanceCard)
    - toNumber(row.salaryCard)
    - toNumber(row.fines)
    - toNumber(row.advanceExtra);
}

async function saveAdminPayrollReport() {
  if (!state.adminPayrollReport || !state.permissions.canManageReports) return;
  await runWithButton(els.saveAdminPayrollReport, async () => {
    const data = await api('/api/reports/admin-payroll', {
      method: 'POST',
      body: {
        month: state.adminPayrollReport.month,
        rows: state.adminPayrollReport.rows.map((row) => ({
          employeeId: row.employeeId,
          advanceCard: row.advanceCard || '',
          salaryCard: row.salaryCard || '',
          advanceExtra: row.advanceExtra || '',
          fines: row.fines || '',
          comment: row.comment || '',
        })),
      },
    });
    state.adminPayrollReport = data.report;
    renderAdminPayrollReport();
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    showNotice(
      els.reportsNotice,
      ['Отчет сохранен.', storageWarning].filter(Boolean).join(' '),
      storageWarning ? 'warning' : 'success',
    );
  }, els.reportsNotice);
}

async function loadRepairs() {
  if (!state.permissions.canViewRepairs) return;
  await runWithButton(els.refreshRepairs, async () => {
    const data = await api('/api/repairs');
    state.repairs = data.repairs;
    state.repairStatuses = data.statuses || [];
    state.repairPriorities = data.priorities || [];
    state.permissions.canManageRepairs = data.canManage;
    state.permissions.canCreateRepairs = data.canCreate;
    renderRepairs();
  }, els.repairsNotice);
}

function renderRepairs() {
  els.repairsBody.replaceChildren();
  const repairsAllowed = Boolean(state.permissions.canCreateRepairs && state.repairPoints.length);
  Array.from(els.repairForm.elements).forEach((field) => {
    field.disabled = !repairsAllowed;
  });

  if (!state.repairs.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
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
  row.append(repairAttachmentsCell(repair));
  return row;
}

function repairAttachmentsCell(repair) {
  const cell = document.createElement('td');
  cell.className = 'repair-attachments-cell';
  const attachments = Array.isArray(repair.attachments) ? repair.attachments : [];
  if (!attachments.length) {
    cell.textContent = '—';
    return cell;
  }

  const list = document.createElement('div');
  list.className = 'repair-attachments-list';
  for (const attachment of attachments) {
    const link = document.createElement('a');
    link.className = 'repair-file-link';
    link.href = attachment.googleDrive?.webViewLink || attachment.localUrl || '#';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = attachment.fileName || attachment.originalFileName || 'Файл';
    if (!attachment.googleDrive?.webViewLink && !attachment.localUrl) {
      link.removeAttribute('href');
      link.textContent = attachment.googleDrive?.reason || 'Файл недоступен';
    }
    list.append(link);
    if (attachment.size) {
      const meta = document.createElement('span');
      meta.className = 'repair-file-meta';
      meta.textContent = formatFileSize(attachment.size);
      list.append(meta);
    }
  }
  cell.append(list);
  return cell;
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
  if (!state.permissions.canCreateRepairs || !state.repairPoints.length) {
    showNotice(els.repairsNotice, 'Нет доступа к заявкам или торговым точкам.', 'warning');
    return;
  }
  const button = event.submitter;
  await runWithButton(button, async () => {
    const values = formValues(els.repairForm);
    const attachments = await repairAttachmentPayloadsFromInput(els.repairAttachmentFiles);
    const data = await api('/api/repairs', {
      method: 'POST',
      body: {
        pointId: values.pointId,
        priority: values.priority,
        title: values.title,
        description: values.description,
        attachments,
      },
    });
    state.repairs = [data.repair, ...state.repairs];
    els.repairForm.reset();
    if (els.repairAttachmentFiles) {
      els.repairAttachmentFiles.value = '';
    }
    if (state.repairPoints[0]) {
      els.repairPointSelect.value = state.repairPoints[0].id;
    }
    renderRepairs();
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    const driveWarning = repairAttachmentsDriveWarning(data.repair.attachments || []);
    showNotice(
      els.repairsNotice,
      ['Заявка на ремонт создана.', driveWarning, storageWarning].filter(Boolean).join(' '),
      driveWarning || storageWarning ? 'warning' : 'success',
    );
  }, els.repairsNotice);
}

async function repairAttachmentPayloadsFromInput(input) {
  const files = Array.from(input?.files || []);
  if (files.length > 5) {
    throw new Error('К одной заявке можно прикрепить не больше 5 файлов.');
  }
  const payloads = [];
  for (const file of files) {
    payloads.push(await developmentAttachmentPayloadFromFile(file));
  }
  return payloads;
}

function repairAttachmentsDriveWarning(attachments) {
  const warnings = (attachments || [])
    .map((attachment) => developmentDriveWarning(attachment.googleDrive))
    .filter(Boolean);
  return [...new Set(warnings)].join(' ');
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

async function loadClaims() {
  if (!state.permissions.canViewClaims) return;
  await runWithButton(els.refreshClaims, async () => {
    const data = await api('/api/claims');
    state.claims = data.claims || [];
    state.claimPoints = data.points || [];
    state.claimStatuses = data.statuses || [];
    state.claimEmployees = data.employeeOptions || [];
    state.permissions.canManageClaims = Boolean(data.canManage);
    state.permissions.canViewClaimCompany = Boolean(data.canViewCompany);
    renderClaims();
  }, els.claimsNotice);
}

function renderClaims() {
  if (!els.claimsBody) return;
  els.claimsBody.replaceChildren();
  const canManage = Boolean(state.permissions.canManageClaims && claimPointOptions().length && state.claimEmployees.length);
  const canViewCompany = Boolean(state.permissions.canViewClaimCompany);
  if (!els.claimDateInput.value) {
    els.claimDateInput.value = currentDate();
  }
  fillClaimPointOptions();
  fillClaimStatusSelect(els.claimStatusSelect, els.claimStatusSelect?.value || 'new');
  fillClaimEmployeeOptions();
  els.claimCreatePanel?.classList.toggle('is-hidden', !canManage);
  els.claimCompanyField?.classList.toggle('is-hidden', !canViewCompany);
  els.claimCompanyHeader?.classList.toggle('is-hidden', !canViewCompany);
  if (els.claimForm) {
    Array.from(els.claimForm.elements).forEach((field) => {
      field.disabled = !canManage;
    });
    if (els.claimForm.elements.company) {
      els.claimForm.elements.company.required = canViewCompany;
    }
  }

  if (!state.permissions.canViewClaims) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = claimTableColumnCount();
    cell.className = 'empty-state';
    cell.textContent = 'Нет доступа к разделу претензий.';
    row.append(cell);
    els.claimsBody.append(row);
    return;
  }

  if (!state.claims.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = claimTableColumnCount();
    cell.className = 'empty-state';
    cell.textContent = 'Претензий пока нет.';
    row.append(cell);
    els.claimsBody.append(row);
    return;
  }

  for (const claim of [...state.claims].sort(compareClaimsByDateDesc)) {
    els.claimsBody.append(buildClaimRow(claim));
  }
}

function fillClaimEmployeeOptions() {
  const employees = state.claimEmployees.length
    ? state.claimEmployees
    : state.users.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
      }));
  els.claimEmployeeSelect.replaceChildren(...employees.map((employee) => {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = employee.email ? `${employee.fullName} · ${employee.email}` : employee.fullName;
    return option;
  }));
}

function fillClaimPointOptions() {
  if (!els.claimPointSelect) return;
  const previous = els.claimPointSelect.value;
  const options = claimPointOptions();
  els.claimPointSelect.replaceChildren(...options.map((point) => selectOption(point.id, point.name)));
  if (options.some((point) => point.id === previous)) {
    els.claimPointSelect.value = previous;
  }
}

function fillClaimStatusSelect(select, value = 'new') {
  if (!select) return;
  const statuses = claimStatusOptions();
  select.replaceChildren(...statuses.map((status) => selectOption(status.value, status.label)));
  select.value = statuses.some((status) => status.value === value) ? value : 'new';
}

function claimPointOptions() {
  return state.claimPoints.length ? state.claimPoints : state.points;
}

function claimStatusOptions() {
  return state.claimStatuses.length
    ? state.claimStatuses
    : [
        { value: 'new', label: 'Новая' },
        { value: 'review', label: 'На рассмотрении' },
        { value: 'withheld', label: 'Удержана' },
      ];
}

function claimTableColumnCount() {
  return state.permissions.canViewClaimCompany ? 10 : 9;
}

function buildClaimRow(claim) {
  const row = document.createElement('tr');
  row.dataset.claimId = claim.id;
  const canManage = Boolean(state.permissions.canManageClaims);
  const canViewCompany = Boolean(state.permissions.canViewClaimCompany);

  if (canManage) {
    row.append(claimInputCell('date', claim.date || '', 'date'));
    row.append(claimInputCell('amount', claim.amount || '', 'text', {
      inputmode: 'decimal',
      pattern: '\\d*([,.]\\d+)?',
      maxlength: '16',
    }));
    row.append(claimSelectCell('pointId', claimPointOptions(), claim.pointId, 'id', 'name'));
    row.append(claimInputCell('claimNumber', claim.claimNumber || '', 'text', { maxlength: '120' }));
    row.append(claimSelectCell('status', claimStatusOptions(), claim.status || 'new', 'value', 'label'));
    if (canViewCompany) {
      row.append(claimInputCell('company', claim.company || '', 'text', { maxlength: '160' }));
    }
    row.append(claimSelectCell('guiltyEmployeeId', state.claimEmployees, claim.guiltyEmployeeId, 'id', 'fullName'));
    row.append(claimTextareaCell('comment', claim.comment || ''));
  } else {
    appendCell(row, claim.date ? formatDate(claim.date) : '');
    appendCell(row, formatMoney(toNumber(claim.amount)), 'numeric-cell');
    appendCell(row, claim.pointName || '');
    appendCell(row, claim.claimNumber || '');
    appendCell(row, claim.statusLabel || claim.status || '');
    if (canViewCompany) appendCell(row, claim.company || '');
    appendCell(row, claim.guiltyEmployeeName || '');
    appendCell(row, claim.comment || '');
  }
  row.append(claimAttachmentsCell(claim));

  const actionsCell = document.createElement('td');
  if (canManage) {
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'secondary claim-save-button';
    saveButton.dataset.action = 'save-claim';
    saveButton.dataset.claimId = claim.id;
    saveButton.textContent = 'Сохранить';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger claim-delete-button';
    deleteButton.dataset.action = 'delete-claim';
    deleteButton.dataset.claimId = claim.id;
    deleteButton.textContent = 'Удалить';
    actionsCell.append(saveButton, deleteButton);
  } else {
    actionsCell.textContent = '-';
  }
  row.append(actionsCell);
  return row;
}

function claimInputCell(name, value, type = 'text', attrs = {}) {
  const cell = document.createElement('td');
  const input = document.createElement('input');
  input.className = 'claim-table-input';
  input.name = name;
  input.dataset.claimField = name;
  input.type = type;
  input.value = value || '';
  if (attrs.maxlength) input.maxLength = Number(attrs.maxlength);
  if (attrs.inputmode) input.inputMode = attrs.inputmode;
  if (attrs.pattern) input.pattern = attrs.pattern;
  cell.append(input);
  return cell;
}

function claimTextareaCell(name, value) {
  const cell = document.createElement('td');
  const textarea = document.createElement('textarea');
  textarea.className = 'claim-table-textarea';
  textarea.name = name;
  textarea.dataset.claimField = name;
  textarea.maxLength = 1000;
  textarea.value = value || '';
  cell.append(textarea);
  return cell;
}

function claimSelectCell(name, options, value, valueKey, labelKey) {
  const cell = document.createElement('td');
  const select = document.createElement('select');
  select.className = 'claim-table-select';
  select.name = name;
  select.dataset.claimField = name;
  for (const item of options || []) {
    const option = document.createElement('option');
    option.value = item[valueKey];
    option.textContent = name === 'guiltyEmployeeId' && item.email
      ? `${item[labelKey]} · ${item.email}`
      : item[labelKey];
    select.append(option);
  }
  select.value = value || '';
  cell.append(select);
  return cell;
}

function claimAttachmentsCell(claim) {
  const cell = document.createElement('td');
  cell.className = 'claim-attachments-cell';
  const attachments = Array.isArray(claim.attachments) ? claim.attachments : [];
  if (!attachments.length) {
    cell.textContent = '-';
    return cell;
  }

  const list = document.createElement('div');
  list.className = 'claim-attachments-list';
  for (const attachment of attachments) {
    const link = document.createElement('a');
    link.className = 'repair-file-link';
    link.href = attachment.googleDrive?.webViewLink || attachment.localUrl || '#';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = attachment.fileName || attachment.originalFileName || 'Файл';
    if (!attachment.googleDrive?.webViewLink && !attachment.localUrl) {
      link.removeAttribute('href');
      link.textContent = attachment.googleDrive?.reason || 'Файл недоступен';
    }
    list.append(link);
    if (attachment.size) {
      const meta = document.createElement('span');
      meta.className = 'repair-file-meta';
      meta.textContent = formatFileSize(attachment.size);
      list.append(meta);
    }
  }
  cell.append(list);
  return cell;
}

function compareClaimsByDateDesc(left, right) {
  return claimSortTime(right) - claimSortTime(left);
}

function claimSortTime(claim) {
  const date = claim.date ? `${claim.date}T23:59:59` : claim.createdAt;
  const time = new Date(date).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function handleClaimCreate(event) {
  event.preventDefault();
  if (!state.permissions.canManageClaims || !claimPointOptions().length || !state.claimEmployees.length) {
    showNotice(els.claimsNotice, 'Нет прав на внесение претензий, доступных торговых точек или сотрудников.', 'warning');
    return;
  }
  const button = event.submitter;
  await runWithButton(button, async () => {
    const values = formValues(els.claimForm);
    const attachments = await repairAttachmentPayloadsFromInput(els.claimAttachmentFiles);
    const data = await api('/api/claims', {
      method: 'POST',
      body: {
        ...values,
        company: state.permissions.canViewClaimCompany ? values.company : '',
        attachments,
      },
    });
    state.claims = [data.claim, ...state.claims];
    els.claimForm.reset();
    els.claimDateInput.value = currentDate();
    if (els.claimAttachmentFiles) els.claimAttachmentFiles.value = '';
    fillClaimStatusSelect(els.claimStatusSelect, 'new');
    const points = claimPointOptions();
    if (points[0]) {
      els.claimPointSelect.value = points[0].id;
    }
    renderClaims();
    await refreshViewsAfterClaimChange(data.claim.date);
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    const driveWarning = repairAttachmentsDriveWarning(data.claim.attachments || []);
    showNotice(
      els.claimsNotice,
      ['Претензия сохранена.', driveWarning, storageWarning].filter(Boolean).join(' '),
      driveWarning || storageWarning ? 'warning' : 'success',
    );
  }, els.claimsNotice);
}

async function handleClaimTableClick(event) {
  const saveButton = event.target.closest('[data-action="save-claim"]');
  if (saveButton) {
    await handleClaimSave(saveButton);
    return;
  }

  const button = event.target.closest('[data-action="delete-claim"]');
  if (!button) return;

  const claimId = button.dataset.claimId;
  const claim = state.claims.find((item) => item.id === claimId);
  const label = claim
    ? `${claim.date ? formatDate(claim.date) : 'без даты'}, ${claim.guiltyEmployeeName}, ${formatMoney(toNumber(claim.amount))}`
    : 'эту претензию';
  if (!window.confirm(`Удалить ${label}?`)) return;

  await runWithButton(button, async () => {
    const data = await api(`/api/claims/${encodeURIComponent(claimId)}`, {
      method: 'DELETE',
      body: {},
    });
    state.claims = state.claims.filter((item) => item.id !== data.claim.id);
    renderClaims();
    await refreshViewsAfterClaimChange(data.claim.date);
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    const driveWarning = claimDeleteDriveWarning(data.claim.googleDriveCleanup);
    showNotice(
      els.claimsNotice,
      ['Претензия удалена.', driveWarning, storageWarning].filter(Boolean).join(' '),
      driveWarning || storageWarning ? 'warning' : 'success',
    );
  }, els.claimsNotice);
}

async function handleClaimSave(button) {
  const claimId = button.dataset.claimId;
  const current = state.claims.find((item) => item.id === claimId);
  const row = button.closest('tr');
  if (!row || !current) return;
  const payload = claimPayloadFromRow(row);
  await runWithButton(button, async () => {
    const data = await api(`/api/claims/${encodeURIComponent(claimId)}`, {
      method: 'PATCH',
      body: payload,
    });
    state.claims = state.claims.map((item) => (item.id === data.claim.id ? data.claim : item));
    renderClaims();
    await refreshViewsAfterClaimChange(current.date, data.claim.date);
    await loadAudit();
    const storageWarning = storageWarningText(data.storage);
    showNotice(
      els.claimsNotice,
      ['Претензия обновлена.', storageWarning].filter(Boolean).join(' '),
      storageWarning ? 'warning' : 'success',
    );
  }, els.claimsNotice);
}

function claimPayloadFromRow(row) {
  const payload = {};
  row.querySelectorAll('[data-claim-field]').forEach((field) => {
    payload[field.dataset.claimField] = field.value;
  });
  if (!state.permissions.canViewClaimCompany) {
    payload.company = '';
  }
  return payload;
}

async function refreshScheduleForClaimMonth(date) {
  if (!state.schedule || !date || state.schedule.month !== String(date).slice(0, 7)) return;
  await loadSchedule();
}

async function refreshViewsAfterClaimChange(...dates) {
  const months = new Set(dates.filter(Boolean).map((date) => String(date).slice(0, 7)));
  if (state.schedule && months.has(state.schedule.month)) {
    await loadSchedule();
  }
  if (state.selectedReportId && state.reportMonthInput && months.has(state.reportMonthInput.value)) {
    await loadSelectedReport();
  }
}

function claimDeleteDriveWarning(cleanup) {
  const failures = (cleanup || [])
    .filter((item) => item.status === 'failed' || item.status === 'unavailable')
    .map((item) => item.reason)
    .filter(Boolean);
  if (!failures.length) return '';
  return `Google Drive: ${failures.join(' ')}`;
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
    state.reportOptions = data.reports || state.reportOptions;
    state.points = data.points || state.points;
    renderEmployeeFormAccessControls();
    renderEmployees();
    renderEmployeeCard();
  }, els.employeesNotice);
}

function renderEmployees() {
  els.employeesBody.replaceChildren();
  const canResetPasswords = canResetEmployeePasswords();
  els.employeePasswordHeader?.classList.toggle('is-hidden', !canResetPasswords);
  if (els.employeeSortSelect) {
    els.employeeSortSelect.value = state.employeeSortMode || 'name';
  }

  if (!state.users.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = canResetPasswords ? 9 : 8;
    cell.className = 'empty-state';
    cell.textContent = 'Нет сотрудников.';
    row.append(cell);
    els.employeesBody.append(row);
    return;
  }

  for (const user of sortedEmployeesForList(state.users)) {
    els.employeesBody.append(buildEmployeeRow(user));
  }
}

function buildEmployeeRow(user) {
  const row = document.createElement('tr');
  row.dataset.userId = user.id;
  const nameParts = employeeNameParts(user);

  const lastNameCell = document.createElement('td');
  const nameButton = document.createElement('button');
  nameButton.className = 'text-link';
  nameButton.type = 'button';
  nameButton.textContent = nameParts.lastName || user.fullName;
  nameButton.addEventListener('click', () => openEmployeeCard(user.id));
  lastNameCell.append(nameButton);
  row.append(lastNameCell);

  appendCell(row, nameParts.firstName || '');
  appendCell(row, nameParts.middleName || '');
  appendCell(row, user.phone || '');
  appendCell(row, user.email || '');
  appendCell(row, employeePointListText(user), 'employee-points-cell');
  if (canResetEmployeePasswords()) {
    row.append(employeePasswordCell(user));
  }
  appendCell(row, user.roleLabel || user.role || '');
  row.append(employeeListActionsCell(user));
  return row;
}

function employeePasswordCell(user) {
  const cell = document.createElement('td');
  cell.className = 'password-reset-cell';
  if (user.role === 'owner') {
    cell.textContent = 'Личный кабинет';
    return cell;
  }

  const passwordRecord = state.revealedEmployeePasswords[user.id];
  if (passwordRecord?.value) {
    const value = document.createElement('span');
    value.className = 'password-reset-value';
    value.textContent = passwordRecord.visible
      ? passwordRecord.value
      : '*'.repeat(passwordRecord.value.length);
    cell.append(value);

    const reveal = document.createElement('button');
    reveal.className = 'secondary password-reveal-button';
    reveal.type = 'button';
    reveal.textContent = passwordRecord.visible ? 'Скрыть' : 'Показать';
    reveal.addEventListener('click', () => toggleEmployeePasswordVisibility(user.id));
    cell.append(reveal);
  }

  const reset = document.createElement('button');
  reset.className = 'secondary password-reset-button';
  reset.type = 'button';
  reset.textContent = passwordRecord?.value ? 'Сбросить еще' : 'Сбросить';
  reset.addEventListener('click', () => resetEmployeePassword(user, reset));
  cell.append(reset);
  return cell;
}

function toggleEmployeePasswordVisibility(userId) {
  const passwordRecord = state.revealedEmployeePasswords[userId];
  if (!passwordRecord) return;
  passwordRecord.visible = !passwordRecord.visible;
  renderEmployees();
}

function employeeListActionsCell(user) {
  const cell = document.createElement('td');
  const editable = selectedEmployeeEditable(user);
  if (!editable) {
    cell.textContent = user.role === 'owner' ? 'Владелец' : '';
    return cell;
  }

  const remove = document.createElement('button');
  remove.className = 'danger employee-list-delete';
  remove.type = 'button';
  remove.textContent = 'Удалить';
  remove.addEventListener('click', () => deleteEmployee(user.id, remove));
  cell.append(remove);
  return cell;
}

function employeeNameParts(user) {
  const parts = String(user.fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    lastName: user.lastName || parts[0] || '',
    firstName: user.firstName || parts[1] || '',
    middleName: user.middleName || parts.slice(2).join(' '),
  };
}

function sortedEmployeesForList(users) {
  const sortMode = state.employeeSortMode || 'name';
  return [...users].sort((left, right) => {
    if (sortMode === 'point') {
      const pointCompare = employeePointSortValue(left).localeCompare(employeePointSortValue(right), 'ru');
      if (pointCompare) return pointCompare;
    }
    return employeeNameSortValue(left).localeCompare(employeeNameSortValue(right), 'ru');
  });
}

function employeeNameSortValue(user) {
  const parts = employeeNameParts(user);
  return [parts.lastName, parts.firstName, parts.middleName, user.fullName || '']
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru');
}

function employeePointSortValue(user) {
  const labels = employeePointLabels(user);
  if (!labels.length) return 'яяя';
  return labels[0].toLocaleLowerCase('ru');
}

function employeePointListText(user) {
  if (user.role === 'owner') return 'Все';
  const labels = employeePointLabels(user);
  return labels.length ? labels.join(', ') : 'Нет';
}

function employeePointLabels(user) {
  if (user.role === 'owner') return ['Все'];
  const allowedPoints = Array.isArray(user.allowedPoints) ? user.allowedPoints : [];
  return allowedPoints
    .map((pointId) => pointLabel(pointId))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'ru'));
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

function canResetEmployeePasswords() {
  return state.user?.role === 'owner';
}

function canManageEmployeeSections() {
  return state.user?.role === 'owner';
}

function canManageEmployeeRoles() {
  return state.user?.role === 'owner';
}

function canManageEmployeePoints() {
  return state.user?.role === 'owner' || state.user?.role === 'admin';
}

function roleRequiresUnofficialSalary(role) {
  return ['owner', 'admin', 'installer'].includes(role);
}

function shouldShowUnofficialSalary(role) {
  return role !== 'employee';
}

function syncUnofficialSalaryField(form, options = {}) {
  const field = form?.elements?.unofficialSalary;
  if (!field) return;
  const role = form.elements.role?.value || selectedEmployee()?.role || 'employee';
  const editable = options.editable !== false;
  const visible = shouldShowUnofficialSalary(role);
  const label = field.closest('label');

  label?.classList.toggle('is-hidden', !visible);
  field.required = visible && roleRequiresUnofficialSalary(role);
  if (!visible) {
    field.value = '';
  }
  field.disabled = !visible || !editable;
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
  const nameParts = employeeNameParts(user);
  form.dataset.userId = user.id;
  els.employeeCardTitle.textContent = `Карточка сотрудника: ${user.fullName}`;
  form.elements.lastName.value = nameParts.lastName;
  form.elements.firstName.value = nameParts.firstName;
  form.elements.middleName.value = nameParts.middleName;
  form.elements.phone.value = user.phone || '';
  form.elements.email.value = user.email || '';
  form.elements.position.value = user.position || '';
  form.elements.officialSalary.value = user.officialSalary || '';
  form.elements.unofficialSalary.value = user.unofficialSalary || '';
  form.elements.hireDate.value = user.hireDate || '';
  form.elements.officialEmployment.checked = Boolean(user.officialEmployment);

  renderEmployeeCardRole(user, editable);
  renderEmployeeCardAccess(user, editable);
  renderPremiumHistoryRows(user.premiumHistory || [], editable);
  renderEmployeeDocumentTypeOptions();
  renderEmployeeDocuments(user.employeeDocuments || [], editable);
  setEmployeeCardEditable(editable);
  syncUnofficialSalaryField(form, { editable });
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
  select.disabled = !editable || !canManageEmployeeRoles();
}

function renderEmployeeCardAccess(user, editable) {
  const sectionTarget = document.querySelector('[data-access-card="sections"]');
  const reportTarget = document.querySelector('[data-access-card="reports"]');
  const pointTarget = document.querySelector('[data-access-card="points"]');
  const role = els.employeeCardForm.elements.role.value || user?.role || 'employee';
  if (sectionTarget) {
    const canEditSections = editable && canManageEmployeeSections();
    sectionTarget.closest('fieldset')?.classList.toggle('is-hidden', !canManageEmployeeSections());
    sectionTarget.replaceChildren(buildAccessCheckboxes('allowedSections', state.sections, new Set(user?.allowedSections || [])));
    sectionTarget.onchange = syncEmployeeCardReportAccess;
    setInputsDisabled(sectionTarget, !canEditSections);
  }
  if (reportTarget) {
    const canEditReports = editable && canManageEmployeeSections();
    reportTarget.replaceChildren(buildAccessCheckboxes('allowedReports', reportAccessOptions(), new Set(user?.allowedReports || [])));
    syncEmployeeCardReportAccess();
    setInputsDisabled(reportTarget, !canEditReports || !employeeCardReportsSectionChecked());
  }
  if (pointTarget) {
    const pointOptions = pointAccessOptions(user?.id, role);
    const canEditPoints = editable && canManageEmployeePoints();
    pointTarget.replaceChildren(buildPointAccessDropdown('allowedPoints', pointOptions, new Set(user?.allowedPoints || []), canEditPoints));
    pointTarget.closest('fieldset')?.classList.remove('is-hidden');
    setInputsDisabled(pointTarget, !canEditPoints);
  }
}

function setEmployeeCardEditable(editable) {
  els.employeeCardForm
    .querySelectorAll('input, select')
    .forEach((field) => {
      field.disabled = !editable
        || field.dataset.locked === 'true'
        || (field.name === 'role' && !canManageEmployeeRoles())
        || (field.name === 'allowedSections' && !canManageEmployeeSections())
        || (field.name === 'allowedReports' && (!canManageEmployeeSections() || !employeeCardReportsSectionChecked()))
        || (field.name === 'allowedPoints' && !canManageEmployeePoints());
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
    field.disabled = disabled || field.dataset.locked === 'true';
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
  input.required = ['lastName', 'firstName', 'middleName', 'phone', 'email'].includes(field);
  if (['lastName', 'firstName', 'middleName'].includes(field)) input.maxLength = 60;
  if (field === 'position') input.maxLength = 120;
  if (field === 'phone') input.maxLength = 32;
  if (field === 'email') input.maxLength = 180;
  if (['premiumAmount', 'officialSalary', 'unofficialSalary'].includes(field)) {
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
    if (option.disabled) {
      input.disabled = true;
      input.dataset.locked = 'true';
    }
    const text = document.createElement('span');
    text.textContent = option.note ? `${option.label} (${option.note})` : option.label;
    label.append(input, text);
    wrap.append(label);
  }

  return wrap;
}

function buildPointAccessDropdown(field, options, selected = new Set(), editable = false) {
  const selectedLabels = options
    .filter((option) => selected.has(option.id))
    .map((option) => option.label);
  const summaryText = selectedLabels.length ? selectedLabels.join(', ') : 'Нет доступных точек';

  if (!editable) {
    const readonly = document.createElement('div');
    readonly.className = 'point-dropdown-readonly';
    readonly.textContent = summaryText;
    return readonly;
  }

  const details = document.createElement('details');
  details.className = 'point-dropdown';
  const summary = document.createElement('summary');
  summary.textContent = summaryText;
  details.append(summary);

  const menu = document.createElement('div');
  menu.className = 'point-dropdown-menu';
  const optionsWrap = buildAccessCheckboxes(field, options, selected);
  optionsWrap.addEventListener('change', () => {
    const checkedLabels = Array.from(optionsWrap.querySelectorAll(`input[name="${field}"]:checked`))
      .map((input) => options.find((option) => option.id === input.value)?.label)
      .filter(Boolean);
    summary.textContent = checkedLabels.length ? checkedLabels.join(', ') : 'Нет доступных точек';
  });
  menu.append(optionsWrap);
  details.append(menu);
  return details;
}

function renderEmployeeFormAccessControls() {
  const sectionTarget = document.querySelector('[data-access-form="sections"]');
  const reportTarget = document.querySelector('[data-access-form="reports"]');
  const pointTarget = document.querySelector('[data-access-form="points"]');
  if (els.employeeForm?.elements.role) {
    if (!canManageEmployeeRoles()) {
      els.employeeForm.elements.role.value = 'employee';
    }
    els.employeeForm.elements.role.disabled = !canManageEmployeeRoles();
  }
  const role = els.employeeForm?.elements.role?.value || 'employee';
  if (sectionTarget) {
    sectionTarget.closest('fieldset')?.classList.toggle('is-hidden', !canManageEmployeeSections());
    sectionTarget.replaceChildren(buildAccessCheckboxes('allowedSections', state.sections));
    sectionTarget.onchange = syncEmployeeFormReportAccess;
    setInputsDisabled(sectionTarget, !canManageEmployeeSections());
  }
  if (reportTarget) {
    reportTarget.replaceChildren(buildAccessCheckboxes('allowedReports', reportAccessOptions()));
    syncEmployeeFormReportAccess();
    setInputsDisabled(reportTarget, !canManageEmployeeSections() || !employeeFormReportsSectionChecked());
  }
  if (pointTarget) {
    const pointOptions = pointAccessOptions('', role);
    const canEditPoints = canManageEmployeePoints();
    pointTarget.replaceChildren(buildPointAccessDropdown('allowedPoints', pointOptions, new Set(), canEditPoints));
    pointTarget.closest('fieldset')?.classList.remove('is-hidden');
    setInputsDisabled(pointTarget, !canEditPoints);
  }
  syncUnofficialSalaryField(els.employeeForm, { editable: true });
}

function reportAccessOptions() {
  return (state.reportOptions || []).map((report) => ({
    id: report.id,
    label: report.title || report.label || report.id,
  }));
}

function employeeCardReportsSectionChecked() {
  return Boolean(els.employeeCardForm?.querySelector('input[name="allowedSections"][value="reports"]:checked'));
}

function employeeFormReportsSectionChecked() {
  return Boolean(els.employeeForm?.querySelector('input[name="allowedSections"][value="reports"]:checked'));
}

function syncEmployeeCardReportAccess() {
  const reportTarget = document.querySelector('[data-access-card="reports"]');
  if (!reportTarget) return;
  const visible = canManageEmployeeSections() && employeeCardReportsSectionChecked();
  reportTarget.closest('fieldset')?.classList.toggle('is-hidden', !visible);
  setInputsDisabled(reportTarget, !visible || !selectedEmployeeEditable());
  if (!visible) {
    clearCheckedValues(reportTarget, 'allowedReports');
  }
}

function syncEmployeeFormReportAccess() {
  const reportTarget = document.querySelector('[data-access-form="reports"]');
  if (!reportTarget) return;
  const visible = canManageEmployeeSections() && employeeFormReportsSectionChecked();
  reportTarget.closest('fieldset')?.classList.toggle('is-hidden', !visible);
  setInputsDisabled(reportTarget, !visible || !canManageEmployeeSections());
  if (!visible) {
    clearCheckedValues(reportTarget, 'allowedReports');
  }
}

function clearCheckedValues(root, name) {
  root.querySelectorAll(`input[name="${name}"]:checked`).forEach((input) => {
    input.checked = false;
  });
}

function pointAccessOptions(exceptUserId = '', targetRole = '') {
  return state.points.map((point) => {
    const assigned = pointAssignedAdmin(point.id, exceptUserId);
    const lockedByAdmin = targetRole === 'admin' && Boolean(assigned);
    return {
      id: point.id,
      label: point.name,
      disabled: lockedByAdmin,
      note: lockedByAdmin ? `закреплена за ${assigned.fullName}` : '',
    };
  });
}

function pointAssignedAdmin(pointId, exceptUserId = '') {
  return state.users.find((user) => (
    user.role === 'admin'
    && user.id !== exceptUserId
    && Array.isArray(user.allowedPoints)
    && user.allowedPoints.includes(pointId)
  )) || null;
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
    renderEmployeeFormAccessControls();
    state.selectedEmployeeId = data.user.id;
    await loadUsers();
    await refreshRetailPointsAfterEmployeeChange();
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
    const googleDrive = data.document?.googleDrive || {};
    const driveUploaded = googleDrive.status === 'uploaded';
    const message = driveUploaded
      ? 'Документ загружен в Google Drive.'
      : `Документ сохранен на сайте. Google Drive недоступен: ${googleDrive.reason || 'архив не создан.'}`;
    showNotice(
      els.employeesNotice,
      [message, storageWarningText(data.storage)].filter(Boolean).join(' '),
      driveUploaded && data.storage?.persistent !== false ? 'success' : 'warning',
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
    await refreshRetailPointsAfterEmployeeChange();
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
    await refreshRetailPointsAfterEmployeeChange();
    showNotice(
      els.employeesNotice,
      ['Сотрудник удален.', storageWarningText(data.storage)].filter(Boolean).join(' '),
      data.storage?.persistent === false ? 'warning' : 'success',
    );
  }, els.employeesNotice);
}

async function resetEmployeePassword(user, button) {
  if (!user?.id) return;
  if (!window.confirm(`Сбросить пароль для ${user.fullName}? Старый пароль перестанет работать.`)) return;

  await runWithButton(button, async () => {
    const data = await api(`/api/users/${encodeURIComponent(user.id)}/password-reset`, {
      method: 'POST',
    });
    state.revealedEmployeePasswords[data.user.id] = {
      value: data.password,
      visible: false,
    };
    replaceUserInState(data.user);
    renderEmployees();
    showEmployeePasswordReset(data);
    await loadAudit();
  }, els.employeesNotice);
}

async function refreshRetailPointsAfterEmployeeChange() {
  if (state.permissions.canViewRetailPoints) {
    await loadRetailPoints();
  }
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
  const role = canManageEmployeeRoles() ? values.role || 'employee' : 'employee';
  values.officialEmployment = form.elements.officialEmployment.checked;
  values.premiumEnabled = form.elements.premiumEnabled.checked;
  if (role === 'employee') {
    delete values.unofficialSalary;
  }
  if (!canManageEmployeeRoles()) {
    delete values.role;
  }
  if (canManageEmployeeSections()) {
    values.allowedSections = formArrayValues(form, 'allowedSections');
    values.allowedReports = values.allowedSections.includes('reports')
      ? formArrayValues(form, 'allowedReports')
      : [];
  } else {
    delete values.allowedSections;
    delete values.allowedReports;
  }
  if (canManageEmployeePoints()) {
    values.allowedPoints = formArrayValues(form, 'allowedPoints');
  } else {
    delete values.allowedPoints;
  }
  return values;
}

function employeePayloadFromCard(form) {
  const values = formValues(form);
  const currentRole = selectedEmployee()?.role || form.elements.role.value || values.role || 'employee';
  const effectiveRole = canManageEmployeeRoles() ? values.role || currentRole : currentRole;
  values.officialEmployment = form.elements.officialEmployment.checked;
  if (effectiveRole === 'employee') {
    delete values.unofficialSalary;
  }
  if (!canManageEmployeeRoles()) {
    delete values.role;
  }
  if (canManageEmployeeSections()) {
    values.allowedSections = checkedValues(form, 'allowedSections');
    values.allowedReports = values.allowedSections.includes('reports')
      ? checkedValues(form, 'allowedReports')
      : [];
  } else {
    delete values.allowedSections;
    delete values.allowedReports;
  }
  if (canManageEmployeePoints()) {
    values.allowedPoints = checkedValues(form, 'allowedPoints');
  } else {
    delete values.allowedPoints;
  }
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
  payload.allowedPoints = payload.role === 'admin' ? checkedValues(row, 'allowedPoints') : [];
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

function showEmployeePasswordReset(data) {
  const storageWarning = storageWarningText(data.storage);
  const passwordText = `Новый пароль для ${data.user.fullName} сгенерирован. В таблице он скрыт под звездочками.`;
  const deliveryText = data.emailDelivery?.status === 'outbox'
    ? `${data.message} Причина: ${data.emailDelivery.reason}. Файл: ${data.emailDelivery.outboxPath}.`
    : data.message;
  showNotice(
    els.employeesNotice,
    [passwordText, deliveryText, storageWarning].filter(Boolean).join(' '),
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
  if (!state.schedulePoints.length) {
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
    state.canViewScheduleFinancials = Boolean(data.canViewFinancials);
    state.employeeOptions = data.employeeOptions || data.schedule.employeeOptions || [];
    renderSchedule();
    showNotice(els.scheduleNotice, '');
  }, els.scheduleNotice);
}

function renderUnavailableSchedule(message = 'Нет доступа к графикам работ.') {
  state.schedule = null;
  state.canEditSchedule = false;
  state.canManageAllSchedule = false;
  state.canViewScheduleFinancials = false;
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
  renderSummaryHead();
  els.scheduleTable.replaceChildren(buildScheduleHead(schedule), buildScheduleBody(schedule));
  renderScheduleSummary();
}

function canViewScheduleFinancials() {
  return Boolean(state.canViewScheduleFinancials);
}

function visibleSummaryColumns() {
  const columns = [
    { key: 'employee', label: 'Сотрудник' },
    { key: 'issuedTotal', label: 'Выдано' },
    { key: 'rateFirstHalf', label: 'Ставка 1-15' },
    { key: 'advanceCard', label: 'Аванс на карту', financial: true },
    { key: 'rateSecondHalf', label: 'Ставка 16+' },
    { key: 'salaryCard', label: 'ЗП на карту', financial: true },
    { key: 'issuedPay', label: 'Бонус' },
    { key: 'bonusExtra', label: 'Премия', financial: true },
    { key: 'claims', label: 'Претензии' },
    { key: 'advanceTotal', label: 'Итого аванс' },
    { key: 'salaryTotal', label: 'Итого ЗП' },
    { key: 'payrollFund', label: 'Фонд оплаты', financial: true },
  ];
  return columns.filter((column) => !column.financial || canViewScheduleFinancials());
}

function renderSummaryHead() {
  const thead = els.summaryTable.querySelector('thead');
  if (!thead) return;
  const row = document.createElement('tr');
  for (const column of visibleSummaryColumns()) {
    row.append(headerCell(column.label, ''));
  }
  thead.replaceChildren(row);
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
    const value = dayValue[metric] ?? '';
    const isFilledRate = metric === 'rateRub' && String(value).trim() !== '';
    cell.classList.toggle('rate-filled', isFilledRate);
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
    rowElement
      .querySelector(`input[data-metric="${input.dataset.metric}"][data-day="${input.dataset.day}"]`)
      ?.closest('td')
      ?.classList.toggle('rate-filled', input.dataset.metric === 'rateRub' && value !== '');
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
    const previousEmployeeId = row.employeeId;
    const employee = state.employeeOptions.find((item) => item.id === input.value);
    row.employeeId = employee ? employee.id : '';
    row.employeeName = employee ? employee.fullName : '';
    applyEmployeePremium(row, employee);
    if (previousEmployeeId && previousEmployeeId !== row.employeeId) {
      rememberRemovedScheduleEmployee(previousEmployeeId);
    }
    forgetRemovedScheduleEmployee(row.employeeId);
    renderScheduleSummary();
  }
}

function handleScheduleClick(event) {
  const button = event.target.closest('[data-remove-row]');
  if (!button || !state.schedule) return;
  const removedRow = state.schedule.rows.find((row) => row.id === button.dataset.removeRow);
  state.schedule.rows = state.schedule.rows.filter((row) => row.id !== button.dataset.removeRow);
  rememberRemovedScheduleEmployee(removedRow?.employeeId);
  renderSchedule();
}

function rememberRemovedScheduleEmployee(employeeId) {
  if (!state.schedule || !employeeId) return;
  const stillUsed = state.schedule.rows.some((row) => row.employeeId === employeeId);
  if (stillUsed) return;
  const removed = new Set(state.schedule.removedEmployeeIds || []);
  removed.add(employeeId);
  state.schedule.removedEmployeeIds = [...removed];
}

function forgetRemovedScheduleEmployee(employeeId) {
  if (!state.schedule || !employeeId) return;
  state.schedule.removedEmployeeIds = (state.schedule.removedEmployeeIds || [])
    .filter((id) => id !== employeeId);
}

function renderScheduleSummary() {
  if (!els.summaryBody || !state.schedule) return;
  els.summaryBody.replaceChildren();
  els.summaryFooter.replaceChildren();

  if (!state.schedule.rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = visibleSummaryColumns().length;
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
    if (canViewScheduleFinancials()) row.append(summaryInputCell(scheduleRow, 'advanceCard'));
    appendCell(row, formatMoney(totals.rateSecondHalf), 'numeric-cell');
    if (canViewScheduleFinancials()) row.append(summaryInputCell(scheduleRow, 'salaryCard'));
    appendCell(row, formatMoney(totals.issuedPay), 'numeric-cell');
    if (canViewScheduleFinancials()) row.append(summaryInputCell(scheduleRow, 'bonusExtra'));
    row.append(summaryInputCell(scheduleRow, 'claims'));
    appendCell(row, formatMoney(totals.advanceTotal), 'numeric-cell advance-total-cell');
    appendCell(row, formatMoney(totals.salaryTotal), 'numeric-cell salary-total-cell');
    if (canViewScheduleFinancials()) {
      appendCell(row, formatMoney(totals.payrollFund), 'numeric-cell payroll-fund-cell');
    }
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
  if (canViewScheduleFinancials()) appendCell(row, formatMoney(totals.advanceCard), 'numeric-cell');
  appendCell(row, formatMoney(totals.rateSecondHalf), 'numeric-cell');
  if (canViewScheduleFinancials()) appendCell(row, formatMoney(totals.salaryCard), 'numeric-cell');
  appendCell(row, formatMoney(totals.issuedPay), 'numeric-cell');
  if (canViewScheduleFinancials()) appendCell(row, formatMoney(totals.bonusExtra), 'numeric-cell');
  appendCell(row, formatMoney(totals.claims), 'numeric-cell');
  appendCell(row, formatMoney(totals.advanceTotal), 'numeric-cell');
  appendCell(row, formatMoney(totals.salaryTotal), 'numeric-cell');
  if (canViewScheduleFinancials()) appendCell(row, formatMoney(totals.payrollFund), 'numeric-cell');
  els.summaryFooter.append(row);
}

function summaryInputCell(scheduleRow, field) {
  const cell = document.createElement('td');
  cell.className = ['numeric-cell', `${field}-cell`].join(' ');
  const isPremiumField = field === 'bonusExtra';
  const isClaimsField = field === 'claims';
  if (!state.canEditSchedule || isClaimsField) {
    cell.textContent = formatMoney(toNumber(scheduleRow[field]));
    if (isClaimsField) {
      const assignedElsewhere = scheduleRow.claimAssignedPointId
        && scheduleRow.claimAssignedPointId !== state.schedule.pointId;
      cell.title = scheduleRow.claimAssignedPointId
        ? assignedElsewhere
          ? `Претензии учтены на точке ${pointLabel(scheduleRow.claimAssignedPointId)}.`
          : 'Претензии перенесены из раздела Претензии.'
        : 'Претензии редактируются только через раздел Претензии.';
    }
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
  forgetRemovedScheduleEmployee(defaultEmployee.id);
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
    claimAssignedPointId: '',
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
        removedEmployeeIds: state.schedule.removedEmployeeIds || [],
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

function setFormValue(form, name, value) {
  const field = form?.elements?.[name];
  if (field) field.value = value || '';
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

function formatFileSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  }
  return `${Math.max(1, Math.round(size / 1024))} КБ`;
}

function pointLabel(pointId) {
  const points = [
    ...(state.points || []),
    ...(state.schedulePoints || []),
    ...(state.repairPoints || []),
    ...(state.retailPoints || []),
  ];
  return points.find((point) => point.id === pointId)?.name || pointId || '';
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
