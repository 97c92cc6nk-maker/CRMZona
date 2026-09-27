'use strict';

const printFormsUI = (() => {
  const model = window.PrintFormsModel;
  let directory = null;
  let loadVersion = 0;
  let selectionVersion = 0;
  let dirty = false;
  let revision = 0;
  let contextReady = false;
  let initialized = false;
  const byId = (id) => document.getElementById(id);
  const notice = (message, type = 'error') => showNotice(byId('printFormsNotice'), message, type);
  const selectedIds = () => [...document.querySelectorAll('#printFormList input:checked')].map((input) => input.value);
  const employee = () => directory?.employees.find((item) => item.id === byId('printEmployee').value);
  const company = () => directory?.companies.find((item) => item.id === byId('printCompany').value);
  function clearPreview() {
    ++revision;
    byId('printPreview').replaceChildren();
    byId('printOutput').replaceChildren();
  }
  function selectOptions(select, rows, label) {
    select.replaceChildren(new Option('Выберите...', ''));
    for (const row of rows) select.add(new Option(label(row), row.id));
  }
  function init() {
    if (initialized) return;
    initialized = true;
    const list = byId('printFormList');
    for (const form of model.forms) {
      const label = document.createElement('label');
      label.className = 'print-form-choice';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.value = form.id;
      input.checked = form.id === 'contract';
      const body = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = form.title;
      const note = document.createElement('small'); note.textContent = `${form.category}. ${form.note}`;
      body.append(title, note); label.append(input, body); list.append(label);
    }
    const groups = new Map();
    for (const field of model.settingsFields) {
      let group = groups.get(field.group);
      if (!group) {
        group = document.createElement('fieldset');
        const legend = document.createElement('legend'); legend.textContent = field.group;
        group.append(legend); byId('printSettings').append(group); groups.set(field.group, group);
      }
      const label = document.createElement('label'); label.dataset.printField = field.key;
      const title = document.createElement('span'); title.textContent = field.label;
      const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
      input.name = field.key;
      if (field.type !== 'textarea') input.type = field.type || 'text';
      if (field.type === 'checkbox') label.classList.add('check-row');
      if (field.type === 'textarea') input.rows = 3;
      if (field.type === 'number') { input.min = field.min; input.max = field.max; input.step = '1'; }
      if (!['number', 'date', 'checkbox'].includes(field.type)) input.maxLength = 6000;
      label.append(title, input); group.append(label);
    }
    for (const source of model.sources) {
      const link = document.createElement('a'); link.href = source.url; link.textContent = source.title;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; byId('printLegalSources').append(link);
    }
    byId('printFormList').addEventListener('change', () => { syncFields(); clearPreview(); });
    byId('printSettingsForm').addEventListener('input', () => { dirty = true; clearPreview(); });
    byId('printSettingsForm').addEventListener('submit', (event) => event.preventDefault());
    for (const id of ['printEmployee', 'printCompany']) byId(id).addEventListener('change', selectContext);
    byId('printPoint').addEventListener('change', () => { dirty = true; clearPreview(); });
    byId('refreshPrintForms').addEventListener('click', () => load(true));
    byId('previewPrintForms').addEventListener('click', () => generate(false));
    byId('printDocuments').addEventListener('click', () => generate(true));
    byId('savePrintSettings').addEventListener('click', saveDraft);
    byId('printOpenEmployee').addEventListener('click', async () => {
      const id = employee()?.id;
      if (!id || !state.permissions.canViewUsers) return;
      await loadUsers(); state.selectedEmployeeId = id; activateView('employeesView'); renderEmployeeCard();
    });
    syncFields();
  }
  function syncFields() {
    const keys = new Set(model.relevantFields(selectedIds()).map((field) => field.key));
    for (const label of document.querySelectorAll('[data-print-field]')) label.hidden = !keys.has(label.dataset.printField);
    for (const group of byId('printSettings').children) group.hidden = ![...group.querySelectorAll('label')].some((label) => !label.hidden);
  }
  async function load(force = false) {
    init();
    if (!state.permissions.canViewPrintForms) { reset(); return; }
    if (force && dirty && !window.confirm('Обновить данные? Несохраненные условия печати будут потеряны.')) return;
    const version = ++loadVersion;
    const previousEmployee = byId('printEmployee').value;
    const previousCompany = byId('printCompany').value;
    const previousPoint = byId('printPoint').value;
    contextReady = false;
    clearPreview();
    byId('printWorkspace').setAttribute('aria-busy', 'true');
    try {
      const data = await api('/api/print-forms');
      if (version !== loadVersion) return;
      directory = data;
      selectOptions(byId('printEmployee'), data.employees, (u) => `${u.fullName}${u.archived ? ' (архив)' : ''}`);
      selectOptions(byId('printCompany'), data.companies, (c) => c.shortName ? `${c.shortName} — ${c.name}` : c.name);
      selectOptions(byId('printPoint'), data.points, (p) => p.name);
      byId('printEmployee').value = previousEmployee;
      byId('printCompany').value = previousCompany;
      byId('printPoint').value = previousPoint;
      if (!directory.employees.length || !directory.companies.length) notice('Для печати нужны сотрудник и компания. Добавьте их в соответствующие справочники.');
      else notice('');
      // Returning from an employee card refreshes authoritative fields without discarding unfinished conditions.
      if (dirty && !force && employee() && company()) { renderSummary(); contextReady = true; }
      else await selectContext();
    } catch (error) {
      directory = null; clearPreview(); byId('printContextSummary').textContent = '';
      notice(`Данные для печати не загружены. ${error.message}`);
    } finally { if (version === loadVersion) byId('printWorkspace').removeAttribute('aria-busy'); }
  }
  function renderSummary() {
    const u = employee(), c = company();
    const summary = byId('printContextSummary');
    summary.textContent = u ? `${u.fullName} · Должность: ${u.position || 'не заполнена в карточке'} · Оф. оклад: ${u.officialSalary || 'не заполнен'} · Начало работы: ${u.hireDate || 'не заполнено'}` : '';
    if (c) summary.textContent += `\n${c.name} · ИНН: ${c.inn || 'не заполнен'} · Адрес: ${c.legalAddress || 'не заполнен'}`;
    byId('printOpenEmployee').hidden = !u || !state.permissions.canViewUsers;
  }
  async function selectContext() {
    const version = ++selectionVersion;
    contextReady = false;
    byId('printSettingsForm').inert = true;
    clearPreview(); dirty = false; renderSummary();
    byId('printSettingsForm').reset(); byId('printPoint').value = '';
    const u = employee(), c = company();
    if (!u || !c) return;
    const form = byId('printSettingsForm');
    const now = new Date();
    form.elements.documentDate.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    form.elements.representative.value = c.director || '';
    if (model.isIp(c)) form.elements.authority.value = 'Индивидуальный предприниматель действует от своего имени';
    try {
      const { draft } = await api(`/api/print-forms/draft?employeeId=${encodeURIComponent(u.id)}&companyId=${encodeURIComponent(c.id)}`);
      if (version !== selectionVersion) return;
      if (draft) {
        for (const field of model.settingsFields) {
          if (field.type === 'checkbox') form.elements[field.key].checked = draft.settings[field.key] === true;
          else form.elements[field.key].value = draft.settings[field.key] || '';
        }
        byId('printPoint').value = draft.settings.pointId || '';
        byId('printSavedStatus').textContent = `Условия сохранены: ${draft.updatedBy}, ${new Date(draft.updatedAt).toLocaleString('ru-RU')}`;
      } else {
        const assigned = directory.points.filter((p) => c.pointIds?.includes(p.id) || p.legalEntity === c.id || p.legalEntity === c.shortName);
        if (assigned.length === 1) byId('printPoint').value = assigned[0].id;
        byId('printSavedStatus').textContent = '';
      }
      notice(u.position ? '' : 'Заполните должность в карточке сотрудника перед печатью.');
      contextReady = true;
      form.inert = false;
    } catch (error) { if (version === selectionVersion) notice(`Условия печати не загружены. ${error.message}`); }
  }
  function payload() {
    if (!employee() || !company()) throw new Error('Выберите сотрудника и компанию.');
    if (!contextReady) throw new Error('Данные для печати еще не загружены. Обновите данные и повторите попытку.');
    const form = byId('printSettingsForm');
    const settings = Object.fromEntries(model.settingsFields.map((field) => [field.key, field.type === 'checkbox' ? form.elements[field.key].checked : form.elements[field.key].value]));
    settings.pointId = byId('printPoint').value;
    return { employeeId: employee().id, companyId: company().id, settings, formIds: selectedIds() };
  }
  async function saveDraft() {
    await runWithButton(byId('savePrintSettings'), async () => {
      const savedRevision = revision;
      const { draft } = await api('/api/print-forms/draft', { method: 'PUT', body: payload() });
      if (savedRevision !== revision) return;
      dirty = false;
      byId('printSavedStatus').textContent = `Условия сохранены: ${draft.updatedBy}, ${new Date(draft.updatedAt).toLocaleString('ru-RU')}`;
      notice('Условия печати сохранены.', 'success');
    }, byId('printFormsNotice'));
  }
  async function generate(print) {
    clearPreview();
    const generatedRevision = revision;
    await runWithButton(byId(print ? 'printDocuments' : 'previewPrintForms'), async () => {
      const data = await api('/api/print-forms/render', { method: 'POST', body: { ...payload(), purpose: print ? 'print' : 'preview' } });
      if (generatedRevision !== revision || !state.permissions.canViewPrintForms) return;
      byId('printPreview').innerHTML = data.html;
      byId('printOutput').innerHTML = data.html;
      notice('');
      if (print) window.print();
      else byId('printPreview').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, byId('printFormsNotice'));
  }
  function reset() {
    ++loadVersion; ++selectionVersion; directory = null; dirty = false; contextReady = false;
    if (!initialized) return;
    clearPreview(); byId('printSettingsForm').reset();
    for (const id of ['printEmployee', 'printCompany', 'printPoint']) byId(id).replaceChildren();
    byId('printContextSummary').textContent = ''; byId('printSavedStatus').textContent = '';
  }
  function renderEmployeeDetails(user) {
    const target = byId('employeeEmploymentDetails');
    if (!target) return;
    target.replaceChildren();
    for (const [key, title, type] of model.employeeFields) {
      const label = document.createElement('label'); label.textContent = title;
      const input = document.createElement('input'); input.name = `employment_${key}`;
      input.type = type || 'text'; input.maxLength = 500;
      input.value = user.employmentDetails?.[key] || '';
      label.append(input); target.append(label);
    }
  }
  function collectEmployeeDetails(form) {
    return Object.fromEntries(model.employeeFields.map(([key]) => [key, form.elements[`employment_${key}`]?.value || '']));
  }
  return { load, reset, renderEmployeeDetails, collectEmployeeDetails };
})();
