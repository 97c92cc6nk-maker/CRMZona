'use strict';

const { capitalCost } = require('./financial-rates');
const START_MONTH = '2026-09';
const CAPITAL = 70000000;
const SCENARIOS = [
  { id: 'current', title: 'Текущий' }, { id: 'usn', title: 'УСН 6+5%' },
  { id: 'usn15', title: 'УСН 15% Д−Р + НДС 5%' }, { id: 'ausn', title: 'АУСН 20% Д−Р' },
];
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value) => { const n = Number(value || 0); if (!Number.isFinite(n)) throw new Error('Некорректное число в источнике финансовой модели.'); return n; };
const sum = (rows, key) => round(rows.reduce((total, row) => total + num(row[key]), 0));

const METRICS = [
  ['reward', 'Вознаграждение', 'руб.', 'Сумма «Вознаграждение» из управленческого отчета. Во втором варианте сумма включает НДС 5%.'],
  ['additionalIncome', 'Доп. доход', 'руб.', 'Сумма «Доп. доход» из отчета. Сохраняется без пересчета налогов, как в текущем варианте.'],
  ['payroll', 'ЗП на руки', 'руб.', 'Сумма «ЗП» из управленческого отчета.'],
  ['officialNet', 'Официальная ЗП на руки', 'руб.', 'ЗП × 60%. Доля работников условно равна доле фонда оплаты труда.'],
  ['officialGross', 'Официальная ЗП до НДФЛ', 'руб.', 'Официальная ЗП на руки / (1 − 13%) = ЗП × 60% / 0,87.'],
  ['ndfl', 'НДФЛ', 'руб.', 'Официальная ЗП до НДФЛ × 13%. Добавляется к расходам, поскольку исходная ЗП указана на руки.'],
  ['contributions', 'Страховые взносы', 'руб.', 'Официальная ЗП до НДФЛ × 30,2%. В модели взносы считаются уплаченными в том же месяце.'],
  ['replacedExpenses', 'Исключено «Бух, ЗП налоги, др.»', 'руб.', 'Во втором варианте весь этот столбец исключается из исходных расходов.'],
  ['expenses', 'Итого расходов', 'руб.', 'Текущий: сумма из отчета. УСН: исходные расходы − «Бух, ЗП налоги, др.» + НДФЛ + страховые взносы.'],
  ['netReward', 'Вознаграждение без НДС', 'руб.', 'Вознаграждение / 1,05.'],
  ['vat', 'НДС 5%', 'руб.', 'Вознаграждение × 5 / 105. Входной НДС к вычету не принимается.'],
  ['usnBefore', 'УСН 6% до уменьшения', 'руб.', 'Вознаграждение без НДС × 6%.'],
  ['deduction', 'Уменьшение УСН', 'руб.', 'По каждой компании: минимум из страховых взносов и 50% УСН до уменьшения. НДФЛ не уменьшает УСН.'],
  ['usn', 'УСН к уплате', 'руб.', 'УСН до уменьшения − уменьшение УСН.'],
  ['payrollTopUp', 'Дополнение ЗП до 5 × 60 000', 'руб.', 'Только АУСН: сумма по ИП максимумов (300 000 − исходная ЗП; 0).'],
  ['excludedPayroll', 'ЗП вне налоговых расходов', 'руб.', 'Неофициальная ЗП остается фактическим расходом, но не уменьшает налоговую базу.'],
  ['deductibleExpenses', 'Расходы для расчета налога', 'руб.', 'Фактические расходы − ЗП вне налоговых расходов. НДФЛ включен в начисленную официальную ЗП один раз.'],
  ['taxIncome', 'Доход для расчета налога', 'руб.', 'УСН 15%: Вознаграждение / 1,05. АУСН: Вознаграждение без выделения НДС.'],
  ['taxBase', 'Доходы минус расходы', 'руб.', 'Доход для расчета налога − расходы для расчета налога. Убытки разных ИП не взаимозачитываются.'],
  ['calculatedTax', 'Налог по обычной ставке', 'руб.', 'По каждому ИП: максимум (доходы − налоговые расходы; 0) × 15% для УСН или × 20% для АУСН.'],
  ['minimumTax', 'Минимальный налог', 'руб.', 'По каждому ИП: налоговый доход × 1% для УСН или × 3% для АУСН.'],
  ['businessTax', 'Налог с учетом минимума', 'руб.', 'Сумма по ИП максимумов (налог по обычной ставке; минимальный налог). НДС прибавляется отдельно.'],
  ['taxes', 'Налоги с дохода', 'руб.', 'Текущий: «Налоги» из отчета. УСН: НДС + УСН к уплате. НДФЛ и взносы уже включены в расходы.'],
  ['profit', 'Прибыль до стоимости денег', 'руб.', 'Текущий: сумма «Прибыль». УСН: сумма по точкам ((Вознаграждение + Доп. доход − новые расходы − новые налоги) × коэффициент распределения прибыли).'],
  ['annualRate', 'Стоимость денег, годовая ставка', '%', 'Средневзвешенная по календарным дням ключевая ставка ЦБ + 2 процентных пункта.'],
  ['capitalCost', 'Стоимость денег за месяц', 'руб.', '70 000 000 × сумма по интервалам ((ставка ЦБ + 2) / 100 × дни интервала / дни в году).'],
  ['netProfit', 'Прибыль после стоимости денег', 'руб.', 'Прибыль до стоимости денег − стоимость денег за месяц.'],
  ['margin', 'Рентабельность после стоимости денег', '%', 'Прибыль после стоимости денег / (Вознаграждение + Доп. доход) × 100%.'],
  ['roi', 'Доходность инвестиций за месяц', '%', 'Прибыль после стоимости денег / 70 000 000 × 100%.'],
  ['payback', 'Окупаемость при темпе месяца', 'мес.', '70 000 000 / прибыль после стоимости денег. Только при положительной прибыли; это оценка, не прогноз.'],
];

const FORMULAS = {
  usn15: {
    reward: 'Вознаграждение из управленческого отчета, включая НДС 5%.',
    expenses: 'Исходные расходы − «Бух, ЗП налоги, др.» + НДФЛ + взносы. Вся ЗП на руки остается фактическим расходом.',
    replacedExpenses: 'Весь столбец «Бух, ЗП налоги, др.» заменен расчетными НДФЛ и взносами.',
    excludedPayroll: 'ЗП × 40%. Эта часть не уменьшает налоговую базу.',
    deductibleExpenses: 'Исходные расходы − «Бух, ЗП налоги, др.» − вся ЗП + (ЗП × 60% / 0,87) + взносы.',
    taxIncome: 'Вознаграждение / 1,05. Доп. доход, как в ранее заданных вариантах, не добавляется к налоговой базе.',
    calculatedTax: 'Сумма по каждому ИП: максимум (налоговый доход − налоговые расходы; 0) × 15%. Вычет 50% не применяется: взносы уже включены в расходы.',
    minimumTax: 'Налоговый доход × 1%. Помесячная оценка для сравнения; фактический минимум УСН определяется по итогам года.',
    taxes: 'НДС + налог УСН с учетом минимума 1%.',
    profit: 'Сумма по точкам ((Вознаграждение + Доп. доход − фактические расходы − НДС − распределенный налог УСН) × коэффициент распределения прибыли).',
  },
  ausn: {
    reward: 'Вознаграждение сохранено в исходной сумме. В сценарии АУСН НДС из него не выделяется.',
    officialNet: 'Количество ИП с точками в отчете × 5 работников × 60 000 руб. на руки. Считается один раз на ИП, не на точку.',
    officialGross: 'Официальная ЗП на руки / 0,87. На одно ИП: 300 000 / 0,87.',
    ndfl: 'Официальная ЗП до НДФЛ × 13%. На одно ИП: 300 000 / 0,87 × 13%.',
    contributions: '0 по условиям сценария. Обязательный фиксированный взнос на травматизм не включен в эту модель.',
    replacedExpenses: 'Весь столбец «Бух, ЗП налоги, др.» исключен. Вместо него добавлен только расчетный НДФЛ.',
    expenses: 'Исходные расходы − «Бух, ЗП налоги, др.» + НДФЛ + дополнение ЗП до 300 000 руб. на ИП (если исходная ЗП меньше).',
    excludedPayroll: 'Сумма по ИП максимумов (исходная ЗП − 300 000; 0). Остальная ЗП не вычитается из налогооблагаемого дохода.',
    deductibleExpenses: 'Исходные расходы − «Бух, ЗП налоги, др.» − вся исходная ЗП + количество ИП × (300 000 / 0,87). Прочие расходы приняты полностью.',
    netReward: 'Вознаграждение, без выделения НДС.',
    vat: '0. Сценарий АУСН без НДС, специальных случаев налогового агента и импорта нет.',
    taxIncome: 'Вознаграждение целиком. Доп. доход перенесен без изменения налогов, как в остальных вариантах.',
    calculatedTax: 'Сумма по каждому ИП: максимум (налоговый доход − налоговые расходы; 0) × 20%.',
    minimumTax: 'Налоговый доход × 3% за месяц по каждому ИП.',
    taxes: 'Налог АУСН с учетом минимума 3%. НДФЛ уже включен в фактические расходы.',
    profit: 'Сумма по точкам ((Вознаграждение + Доп. доход − фактические расходы − распределенный налог АУСН) × коэффициент распределения прибыли).',
  },
};

const roundRecord = (record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'number' ? round(value) : value]));

function expenseScenario(sourcePoints, financing, id) {
  const ausn = id === 'ausn';
  const points = sourcePoints.map((point) => ({ ...point }));
  if (ausn && points.some((point) => point.companyId.startsWith('unassigned:'))) {
    return { warnings: ['АУСН не рассчитан: у части торговых точек не указана компания. Нельзя определить количество ИП и зарплатный фонд 5 × 60 000.'] };
  }
  if (points.some((point) => point.originalExpenses - point.replacedExpenses < point.payroll - 0.01)) {
    return { warnings: [`${ausn ? 'АУСН' : 'УСН 15%'} не рассчитан: расходы после исключения «Бух, ЗП налоги, др.» меньше исходной ЗП. Проверьте управленческий отчет.`] };
  }
  const groups = new Map();
  for (const point of points) {
    if (!groups.has(point.companyId)) groups.set(point.companyId, []);
    groups.get(point.companyId).push(point);
  }
  const companies = [], warnings = [];
  for (const [companyId, members] of groups) {
    const totalPayroll = members.reduce((total, point) => total + point.payroll, 0);
    const reward = members.reduce((total, point) => total + point.reward, 0);
    const company = { id: companyId, name: members[0].companyName, payroll: totalPayroll, reward };
    for (const point of members) {
      const share = totalPayroll > 0 ? point.payroll / totalPayroll : reward > 0 ? point.reward / reward : 1 / members.length;
      point.payrollTopUp = ausn ? Math.max(300000 - totalPayroll, 0) * share : 0;
      point.officialNet = ausn ? 300000 * share : point.payroll * 0.6;
      point.officialGross = point.officialNet / 0.87;
      point.ndfl = point.officialGross * 0.13;
      point.contributions = ausn ? 0 : point.officialGross * 0.302;
      point.excludedPayroll = ausn ? Math.max(totalPayroll - 300000, 0) * share : point.payroll * 0.4;
      point.expenses = point.originalExpenses - point.replacedExpenses + point.payrollTopUp + point.ndfl + point.contributions;
      point.deductibleExpenses = point.expenses - point.excludedPayroll;
      point.netReward = ausn ? point.reward : point.reward / 1.05;
      point.vat = point.reward - point.netReward;
      point.taxIncome = point.netReward;
      point.taxBase = point.taxIncome - point.deductibleExpenses;
    }
    for (const key of ['officialNet', 'officialGross', 'ndfl', 'contributions', 'payrollTopUp', 'excludedPayroll', 'expenses', 'deductibleExpenses', 'taxIncome', 'taxBase', 'vat']) {
      company[key] = members.reduce((total, point) => total + point[key], 0);
    }
    company.calculatedTax = Math.max(company.taxBase, 0) * (ausn ? 0.2 : 0.15);
    company.minimumTax = company.taxIncome * (ausn ? 0.03 : 0.01);
    company.businessTax = Math.max(company.calculatedTax, company.minimumTax);
    for (const point of members) {
      const share = company.taxIncome > 0 ? point.taxIncome / company.taxIncome : 0;
      for (const key of ['calculatedTax', 'minimumTax', 'businessTax']) point[key] = company[key] * share;
      point.taxes = point.vat + point.businessTax;
      point.profit = (point.reward + point.additionalIncome - point.expenses - point.taxes) * point.coefficient;
    }
    if (ausn && company.payrollTopUp > 0) warnings.push(`АУСН, ${company.name}: исходная ЗП ниже 300 000 руб. Фактические расходы увеличены до фонда 5 × 60 000, без изменения исходного отчета.`);
    if (ausn && reward > 60000000) warnings.push(`АУСН, ${company.name}: доход уже за этот месяц превышает годовой лимит 60 млн руб. Сценарий только сравнительный, режим неприменим при таком доходе.`);
    companies.push(roundRecord(company));
  }
  const keys = ['reward', 'additionalIncome', 'payroll', 'officialNet', 'officialGross', 'ndfl', 'contributions', 'replacedExpenses',
    'payrollTopUp', 'excludedPayroll', 'expenses', 'deductibleExpenses', 'taxIncome', 'taxBase', 'calculatedTax', 'minimumTax', 'businessTax', 'netReward', 'vat', 'taxes', 'profit'];
  return { values: { ...finish(Object.fromEntries(keys.map((key) => [key, sum(points, key)])), financing), companyCount: companies.length },
    points: points.map(roundRecord), companies, warnings };
}

function monthsThrough(to, asOf) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(to) || to < START_MONTH || to > asOf.slice(0, 7)) {
    throw new Error('Выберите месяц с сентября 2026 до текущего месяца.');
  }
  const result = [];
  let [year, month] = START_MONTH.split('-').map(Number);
  while (`${year}-${String(month).padStart(2, '0')}` <= to && result.length < 240) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    month++; if (month === 13) { month = 1; year++; }
  }
  return result;
}

function finish(values, financing) {
  const netProfit = financing.amount === null ? null : round(values.profit - financing.amount);
  const income = values.reward + values.additionalIncome;
  return { ...values, capitalCost: financing.amount, annualRate: financing.annualRate === null ? null : round(financing.annualRate),
    netProfit, margin: netProfit !== null && income > 0 ? round(netProfit / income * 100) : null,
    roi: netProfit === null ? null : round(netProfit / CAPITAL * 100),
    payback: netProfit !== null && netProfit > 0 ? round(CAPITAL / netProfit) : null };
}

function calculateMonth(report, financing) {
  const rows = report.rows || [];
  const current = finish({ reward: sum(rows, 'reward'), additionalIncome: sum(rows, 'additionalIncome'), payroll: sum(rows, 'salary'),
    expenses: sum(rows, 'totalExpenses'), taxes: sum(rows, 'taxes'), profit: sum(rows, 'profit') }, financing);
  const companies = new Map();
  const points = rows.map((row) => {
    const payroll = num(row.salary);
    if (payroll < 0) throw new Error(`Отрицательная ЗП у точки ${row.pointName}: расчет начисленной зарплаты невозможен.`);
    const officialNet = payroll * 0.6, officialGross = officialNet / 0.87;
    const ndfl = officialGross * 0.13, contributions = officialGross * 0.302;
    const reward = num(row.reward), netReward = reward / 1.05, vat = reward - netReward, usnBefore = netReward * 0.06;
    const groupId = row.companyId || `unassigned:${row.pointId}`;
    if (!companies.has(groupId)) companies.set(groupId, { id: groupId, name: row.companyShortName || `Компания не указана: ${row.pointName}`, unassigned: !row.companyId,
      reward: 0, netReward: 0, vat: 0, usnBefore: 0, contributions: 0 });
    const group = companies.get(groupId);
    for (const [key, value] of Object.entries({ reward, netReward, vat, usnBefore, contributions })) group[key] += value;
    return { pointId: row.pointId, pointName: row.pointName, companyId: groupId, companyName: group.name, payroll, officialNet, officialGross, ndfl, contributions,
      reward, additionalIncome: num(row.additionalIncome), netReward, vat, usnBefore, replacedExpenses: num(row.accountingPayrollTaxesOther),
      originalExpenses: num(row.totalExpenses), coefficient: num(row.profitDistributionRate) / 100 };
  });
  for (const group of companies.values()) {
    group.deduction = Math.min(group.contributions, group.usnBefore * 0.5);
    group.usn = group.usnBefore - group.deduction;
  }
  for (const point of points) {
    const group = companies.get(point.companyId);
    point.deduction = group.usnBefore > 0 ? group.deduction * point.usnBefore / group.usnBefore : 0;
    point.usn = point.usnBefore - point.deduction;
    point.expenses = point.originalExpenses - point.replacedExpenses + point.ndfl + point.contributions;
    point.taxes = point.vat + point.usn;
    point.profit = (point.reward + point.additionalIncome - point.expenses - point.taxes) * point.coefficient;
  }
  const keys = ['reward', 'additionalIncome', 'payroll', 'officialNet', 'officialGross', 'ndfl', 'contributions', 'replacedExpenses',
    'expenses', 'netReward', 'vat', 'usnBefore', 'deduction', 'usn', 'taxes', 'profit'];
  const usn = finish(Object.fromEntries(keys.map((key) => [key, sum(points, key)])), financing);
  const usn15 = expenseScenario(points, financing, 'usn15');
  const ausn = expenseScenario(points, financing, 'ausn');
  return { current, usn, usn15: usn15.values || null, ausn: ausn.values || null,
    points: points.map(roundRecord), companies: [...companies.values()].map(roundRecord),
    usn15Points: usn15.points || [], usn15Companies: usn15.companies || [], ausnPoints: ausn.points || [], ausnCompanies: ausn.companies || [],
    warnings: [...usn15.warnings, ...ausn.warnings, ...[...companies.values()].filter((group) => group.unassigned && (group.reward || group.contributions))
      .map((group) => `${group.name}. Налоги УСН рассчитаны отдельно по этой точке, без объединения с другими ИП.`)] };
}

function buildFinancialModel({ sources, rates, asOf }) {
  const months = sources.map(({ month, report, saved }) => {
    const financing = capitalCost(month, rates, asOf);
    if (!saved || !Object.keys(saved.rows || {}).length) return { month, status: 'missing', warnings: ['Управленческий отчет за месяц не сохранен. Финансовые показатели не рассчитаны.'], financing };
    const uncovered = report.rows.filter((row) => !Object.hasOwn(saved.rows, row.pointId)).length;
    const warnings = [];
    if (month === asOf.slice(0, 7)) warnings.push('Текущий месяц: предварительные данные. Стоимость денег оценена за полный месяц по известным ставкам.');
    if (uncovered) warnings.push(`Для ${uncovered} точек нет сохраненных ручных показателей. Данные месяца неполные.`);
    if (financing.amount === null) warnings.push('Нет подтвержденной ставки ЦБ для этого периода. Стоимость денег и зависящие от нее показатели не рассчитаны.');
    try {
      const calculated = calculateMonth(report, financing);
      return { month, status: warnings.length || calculated.warnings.length ? 'partial' : 'ready', savedAt: saved.updatedAt || '', financing,
        ...calculated, warnings: [...warnings, ...calculated.warnings] };
    } catch (error) { return { month, status: 'invalid', financing, warnings: [error.message] }; }
  });
  return { startMonth: START_MONTH, asOf, capital: CAPITAL, months, scenarios: SCENARIOS,
    metrics: METRICS.map(([key, label, unit, formula]) => ({ key, label, unit, formula, formulas: { usn15: FORMULAS.usn15[key], ausn: FORMULAS.ausn[key] } })),
    rateSource: { source: rates.source, verifiedThrough: rates.verifiedThrough, status: rates.status, warning: rates.warning },
    assumptions: [
      'Финансовая модель, не налоговая декларация. УСН рассчитан помесячно по каждой компании; фактический налог считается нарастающим итогом и зависит от даты уплаты взносов.',
      'Сценарий: УСН 6%, НДС 5%, официальная доля ФОТ 60%, взносы 30,2%, НДФЛ 13%. Льготы, прогрессивный НДФЛ, лимиты и право на налоговый режим требуют отдельной проверки бухгалтером.',
      'Вознаграждение включает НДС. Оборот товаров из столбца «Выручка» не является налоговой базой этой модели. Доп. доход перенесен без изменения налогов.',
      'Вариант УСН исключает весь столбец «Бух, ЗП налоги, др.», включая возможные бухгалтерские расходы, и заменяет его НДФЛ и взносами.',
      'Коэффициенты распределения прибыли сохранены по каждой точке. Стоимость капитала считается на все 70 млн руб., без уменьшения на коэффициенты и без сложных процентов.',
      'Текущий вариант не выделяет НДФЛ и взносы из совокупных расходов. Прочерк означает «не выделено» или «не рассчитано», а не ноль.',
      'Суммы округлены до копеек после расчета. Распределение вычета УСН между точками одной компании пропорционально их УСН до уменьшения.',
      'УСН 15%: 60% ЗП признано официальным ФОТ; оставшиеся 40% не уменьшают налог. Прочие расходы приняты полностью, при условии их документального подтверждения и допустимости для режима. Взносы включены в расходы, а не вычитаются повторно из налога.',
      'Минимум УСН 1% показан помесячно как сравнительная оценка. По закону он определяется за год; перенос убытков и годовой перерасчет здесь не моделируются. У АУСН налоговый период — месяц, минимум — 3%.',
      'АУСН: по 5 работников × 60 000 руб. на руки один раз на каждую компанию с точками в отчете. НДФЛ: 300 000 / 0,87 × 13% на компанию. Компании без точек в отчете не участвуют.',
      'АУСН: вся исходная ЗП остается фактическим расходом. В налоговые расходы входит только официальный ФОТ 300 000 / 0,87 на ИП. Если исходная ЗП ниже 300 000, добавляется недостающая сумма. Прочие расходы приняты полностью; старый столбец «Бух, ЗП налоги, др.» исключен.',
      'АУСН: НДС не выделяется, сумма вознаграждения сохранена. Взносы приняты равными нулю по заданию; обязательный фиксированный взнос на травматизм (2 959 руб. за 2026 год на страхователя) не учтен.',
      'АУСН требует не более 5 работников всего, а не только официально оформленных, дохода не более 60 млн руб. в год, безналичной зарплаты и соблюдения остальных ограничений. Эта модель не подтверждает право ИП на режим; неполный период с сентября не позволяет проверить годовой доход.',
      'Налог Д−Р и минимум считаются отдельно по каждой компании. Налог распределен по ее точкам пропорционально налоговому доходу; официальный ФОТ АУСН — пропорционально исходной ЗП (при нулевой ЗП — вознаграждению, затем поровну). Стоимость капитала не является налоговым расходом этой модели.',
    ],
    sources: [
      { title: 'Ключевая ставка Банка России', url: 'https://www.cbr.ru/hd_base/KeyRate/' },
      { title: 'Ставка рефинансирования', url: 'https://www.cbr.ru/statistics/idkp_br/refinancing_rates1/' },
      { title: 'ФНС: НДС при УСН', url: 'https://www.nalog.gov.ru/rn77/taxation/taxes/nds_usn/' },
      { title: 'ФНС: УСН', url: 'https://www.nalog.gov.ru/rn77/taxation/taxes/usn/' },
      { title: 'ФНС: НДФЛ', url: 'https://www.nalog.gov.ru/rn50/taxation/taxes/ndfl/' },
      { title: 'ФНС: расчет УСН и минимальный налог', url: 'https://www.nalog.gov.ru/create_business/ip/in_progress/usn/step3/' },
      { title: 'ФНС: АУСН', url: 'https://ausn.nalog.gov.ru/' },
      { title: 'ФНС: изменения 2026 года', url: 'https://www.nalog.gov.ru/rn77/promo/new2026/' },
    ] };
}

module.exports = { buildFinancialModel, calculateMonth, monthsThrough, START_MONTH };
