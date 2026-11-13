'use strict';

const { capitalCost } = require('./financial-rates');
const START_MONTH = '2026-09';
const CAPITAL = 70000000;
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value) => { const n = Number(value || 0); if (!Number.isFinite(n)) throw new Error('Некорректное число в источнике финансовой модели.'); return n; };
const sum = (rows, key) => round(rows.reduce((total, row) => total + num(row[key]), 0));

const METRICS = [
  ['reward', 'Вознаграждение', 'руб.', 'Сумма «Вознаграждение» из управленческого отчета. Во втором варианте сумма включает НДС 5%.'],
  ['additionalIncome', 'Доп. доход', 'руб.', 'Сумма «Доп. доход» из отчета. Сохраняется без пересчета налогов, как в текущем варианте.'],
  ['payroll', 'ЗП на руки', 'руб.', 'Сумма «ЗП» из управленческого отчета.'],
  ['officialNet', 'Официальная ЗП на руки, 60%', 'руб.', 'ЗП × 60%. Доля работников условно равна доле фонда оплаты труда.'],
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
  ['taxes', 'Налоги с дохода', 'руб.', 'Текущий: «Налоги» из отчета. УСН: НДС + УСН к уплате. НДФЛ и взносы уже включены в расходы.'],
  ['profit', 'Прибыль до стоимости денег', 'руб.', 'Текущий: сумма «Прибыль». УСН: сумма по точкам ((Вознаграждение + Доп. доход − новые расходы − новые налоги) × коэффициент распределения прибыли).'],
  ['annualRate', 'Стоимость денег, годовая ставка', '%', 'Средневзвешенная по календарным дням ключевая ставка ЦБ + 2 процентных пункта.'],
  ['capitalCost', 'Стоимость денег за месяц', 'руб.', '70 000 000 × сумма по интервалам ((ставка ЦБ + 2) / 100 × дни интервала / дни в году).'],
  ['netProfit', 'Прибыль после стоимости денег', 'руб.', 'Прибыль до стоимости денег − стоимость денег за месяц.'],
  ['margin', 'Рентабельность после стоимости денег', '%', 'Прибыль после стоимости денег / (Вознаграждение + Доп. доход) × 100%.'],
  ['roi', 'Доходность инвестиций за месяц', '%', 'Прибыль после стоимости денег / 70 000 000 × 100%.'],
  ['payback', 'Окупаемость при темпе месяца', 'мес.', '70 000 000 / прибыль после стоимости денег. Только при положительной прибыли; это оценка, не прогноз.'],
];

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
    return { pointId: row.pointId, pointName: row.pointName, companyId: groupId, payroll, officialNet, officialGross, ndfl, contributions,
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
  const roundRecord = (record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'number' ? round(value) : value]));
  return { current, usn, points: points.map(roundRecord), companies: [...companies.values()].map(roundRecord),
    warnings: [...companies.values()].filter((group) => group.unassigned && (group.reward || group.contributions))
      .map((group) => `${group.name}. Вычет УСН рассчитан отдельно по этой точке, без объединения с другими ИП.`) };
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
  return { startMonth: START_MONTH, asOf, capital: CAPITAL, months, metrics: METRICS.map(([key, label, unit, formula]) => ({ key, label, unit, formula })),
    rateSource: { source: rates.source, verifiedThrough: rates.verifiedThrough, status: rates.status, warning: rates.warning },
    assumptions: [
      'Финансовая модель, не налоговая декларация. УСН рассчитан помесячно по каждой компании; фактический налог считается нарастающим итогом и зависит от даты уплаты взносов.',
      'Сценарий: УСН 6%, НДС 5%, официальная доля ФОТ 60%, взносы 30,2%, НДФЛ 13%. Льготы, прогрессивный НДФЛ, лимиты и право на налоговый режим требуют отдельной проверки бухгалтером.',
      'Вознаграждение включает НДС. Оборот товаров из столбца «Выручка» не является налоговой базой этой модели. Доп. доход перенесен без изменения налогов.',
      'Вариант УСН исключает весь столбец «Бух, ЗП налоги, др.», включая возможные бухгалтерские расходы, и заменяет его НДФЛ и взносами.',
      'Коэффициенты распределения прибыли сохранены по каждой точке. Стоимость капитала считается на все 70 млн руб., без уменьшения на коэффициенты и без сложных процентов.',
      'Текущий вариант не выделяет НДФЛ и взносы из совокупных расходов. Прочерк означает «не выделено» или «не рассчитано», а не ноль.',
      'Суммы округлены до копеек после расчета. Распределение вычета УСН между точками одной компании пропорционально их УСН до уменьшения.',
    ],
    sources: [
      { title: 'Ключевая ставка Банка России', url: 'https://www.cbr.ru/hd_base/KeyRate/' },
      { title: 'Ставка рефинансирования', url: 'https://www.cbr.ru/statistics/idkp_br/refinancing_rates1/' },
      { title: 'ФНС: НДС при УСН', url: 'https://www.nalog.gov.ru/rn77/taxation/taxes/nds_usn/' },
      { title: 'ФНС: УСН', url: 'https://www.nalog.gov.ru/rn77/taxation/taxes/usn/' },
      { title: 'ФНС: НДФЛ', url: 'https://www.nalog.gov.ru/rn50/taxation/taxes/ndfl/' },
    ] };
}

module.exports = { buildFinancialModel, calculateMonth, monthsThrough, START_MONTH };
