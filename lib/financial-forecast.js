'use strict';

const { calculateMonth } = require('./financial-model');
const { capitalCost } = require('./financial-rates');
const BASE_MONTHS = Array.from({ length: 12 }, (_, i) => `${i < 10 ? 2026 : 2025}-${String(i + 1).padStart(2, '0')}`);
const YEARS = [2027, 2028];
const SCENARIOS = ['current', 'usn', 'usn15', 'ausn'];
const CAPITAL = 70000000;
const USN_ANNUAL_REWARD = 150589002;
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const FIELDS = ['reward', 'salary', 'totalExpenses', 'taxes', 'additionalIncome', 'accountingPayrollTaxesOther'];

function networkRows(source) {
  if (!source?.report?.rows?.length || (source.historical ? !source.history : !Object.keys(source.saved?.rows || {}).length)) {
    throw new Error('Базовый месяц не загружен или управленческий отчет не сохранен.');
  }
  const groups = new Map();
  for (const row of source.report.rows) {
    const share = Number(row.profitDistributionRate);
    if (!Number.isFinite(share) || share < 0 || share > 100) throw new Error('Некорректная доля прибыли в базовом месяце.');
    if (!groups.has(share)) groups.set(share, { pointId: `forecast-share-${share}`, pointName: `Доля ${share}%`,
      companyId: 'forecast-network', companyShortName: 'Сеть: 6 ИП', profitDistributionRate: share,
      ...Object.fromEntries(FIELDS.map((key) => [key, 0])) });
    const group = groups.get(share);
    for (const key of FIELDS) {
      const value = Number(row[key] || 0);
      if (!Number.isFinite(value) || value < 0) throw new Error('Некорректная сумма в базовом месяце.');
      group[key] += value;
    }
  }
  return [...groups.values()].sort((a, b) => a.profitDistributionRate - b.profitDistributionRate);
}

function annualSummary(months, year) {
  const result = { year, scenarios: {}, calculatedMonths: {} };
  const period = months.filter((month) => month.month.startsWith(`${year}-`));
  const fields = ['reward', 'additionalIncome', 'payroll', 'officialNet', 'officialGross', 'ndfl', 'contributions',
    'replacedExpenses', 'expenses', 'netReward', 'vat', 'usnBefore', 'deduction', 'usn', 'payrollTopUp',
    'excludedPayroll', 'deductibleExpenses', 'taxIncome', 'taxBase', 'calculatedTax', 'minimumTax',
    'businessTax', 'taxes', 'profit', 'capitalCost', 'netProfit'];
  for (const id of SCENARIOS) {
    const values = period.map((month) => month[id]).filter(Boolean);
    result.calculatedMonths[id] = values.length;
    if (values.length !== 12) { result.scenarios[id] = null; continue; }
    const total = Object.fromEntries(fields.map((key) => [key, values.every((v) => Number.isFinite(v[key]))
      ? round(values.reduce((sum, v) => sum + v[key], 0)) : null]));
    total.roi = total.netProfit === null ? null : round(total.netProfit / CAPITAL * 100);
    total.margin = total.netProfit !== null && total.reward + total.additionalIncome > 0
      ? round(total.netProfit / (total.reward + total.additionalIncome) * 100) : null;
    total.payback = total.netProfit > 0 ? round(CAPITAL / (total.netProfit / 12)) : null;
    result.scenarios[id] = total;
  }
  return result;
}

function usnRewardByMonth(prepared) {
  if (prepared.size !== BASE_MONTHS.length) return null;
  const entries = BASE_MONTHS.flatMap((month) => prepared.get(month).map((row) => ({ month, reward: row.reward })));
  const total = entries.reduce((sum, row) => sum + row.reward, 0);
  if (!(total > 0)) return null;
  const targetCents = USN_ANNUAL_REWARD * 100;
  const rewards = new Map(BASE_MONTHS.map((month) => [month, []]));
  let cumulative = 0, allocated = 0;
  // Cumulative rounding preserves seasonal/share weights and the exact annual amount in cents.
  for (const [index, entry] of entries.entries()) {
    cumulative += entry.reward;
    const next = index === entries.length - 1 ? targetCents : Math.round(cumulative / total * targetCents);
    rewards.get(entry.month).push((next - allocated) / 100);
    allocated = next;
  }
  return rewards;
}

function buildFinancialForecast({ sources, rates, asOf }) {
  const sourceMap = new Map(sources.map((source) => [source.month, source]));
  const warnings = [], prepared = new Map(), base = [];
  for (const [index, month] of BASE_MONTHS.entries()) {
    const source = sourceMap.get(month);
    const metadata = { calendarMonth: index + 1, month, expenseMonth: month,
      source: month <= '2026-08' ? 'Excel' : 'Управленческий отчет' };
    try {
      const rows = networkRows(source);
      prepared.set(month, rows);
      for (const [key, field] of [['reward', 'reward'], ['payroll', 'salary'], ['expenses', 'totalExpenses']]) {
        metadata[key] = round(rows.reduce((sum, row) => sum + row[field], 0));
      }
      for (const warning of source.history?.warnings || []) warnings.push(`${month}: ${warning}`);
      if (!source.historical) {
        const uncovered = source.report.rows.filter((row) => !Object.hasOwn(source.saved.rows, row.pointId)).length;
        if (uncovered) warnings.push(`${month}: для ${uncovered} точек не сохранены ручные показатели; прогноз по этому месяцу неполный.`);
      }
    } catch (error) { warnings.push(`${month}: ${error.message}`); }
    base.push(metadata);
  }
  const usnRewards = usnRewardByMonth(prepared);
  if (!usnRewards) warnings.push('Прогноз УСН не рассчитан: для распределения годового вознаграждения 150 589 002 руб. нужны все 12 базовых месяцев и положительная сумма вознаграждения.');
  const months = [];
  for (const year of YEARS) {
    const expenseFactor = round(1.05 ** (year - 2026) * 10000) / 10000;
    for (const baseMonth of BASE_MONTHS) {
      const month = `${year}-${baseMonth.slice(5)}`;
      const sourceRows = prepared.get(baseMonth);
      const financing = capitalCost(month, rates, asOf);
      const result = { month, baseMonth, expenseFactor, financing, warnings: [] };
      if (!sourceRows) { result.status = 'missing'; months.push(result); continue; }
      try {
        // Inflate operating inputs once; payroll taxes and business taxes are recalculated below.
        const rows = sourceRows.map((original) => {
          const row = { ...original };
          for (const key of ['salary', 'totalExpenses', 'accountingPayrollTaxesOther']) row[key] *= expenseFactor;
          row.profit = (row.reward + row.additionalIncome - row.totalExpenses - row.taxes) * row.profitDistributionRate / 100;
          return row;
        });
        const calculated = calculateMonth({ rows }, financing, { ausnCompanyMultiplier: 6, ausnSalaryFactor: expenseFactor });
        for (const id of SCENARIOS) result[id] = calculated[id];
        if (usnRewards) {
          const usnRows = rows.map((row, index) => ({ ...row, reward: usnRewards.get(baseMonth)[index] }));
          const adjusted = calculateMonth({ rows: usnRows }, financing, { ausnCompanyMultiplier: 6, ausnSalaryFactor: expenseFactor });
          result.usn = adjusted.usn;
          result.usn15 = adjusted.usn15;
        } else {
          result.usn = null;
          result.usn15 = null;
        }
        result.warnings = calculated.warnings;
        result.status = calculated.warnings.length || !usnRewards ? 'partial' : 'projected';
        for (const warning of calculated.warnings) warnings.push(`${month}: ${warning}`);
      } catch (error) { result.status = 'invalid'; result.warnings.push(error.message); warnings.push(`${month}: ${error.message}`); }
      months.push(result);
    }
  }
  const confirmedRate = rates.verifiedThrough >= asOf ? rates.entries?.filter((row) => row.date <= asOf).at(-1)?.rate : null;
  if (confirmedRate === null || confirmedRate === undefined) warnings.push('Нет актуальной подтвержденной ставки ЦБ. Стоимость денег, прибыль после нее и доходность прогноза не рассчитаны.');
  return { asOf, capital: CAPITAL, base, months, years: YEARS.map((year) => annualSummary(months, year)), warnings: [...new Set(warnings)],
    assumptions: [
      'База каждого календарного месяца: январь–октябрь 2026, ноябрь–декабрь 2025. Вознаграждение вариантов «Текущий» и АУСН, дополнительный доход, доли прибыли и фактические налоги варианта «Текущий» сохраняются на уровне базового месяца. Условия работы сети считаются неизменными.',
      'Только в прогнозе УСН 6+5% и УСН 15% Д−Р + НДС 5% вознаграждение (включая НДС 5%) = 150 589 002 руб. за 2027 и отдельно 150 589 002 руб. за 2028. Распределение по месяцам и группам долей пропорционально базовому вознаграждению: сумма группы / годовая базовая сумма × 150 589 002, с выравниванием копеек до точного годового итога. Остальные исходные показатели и формулы не меняются.',
      'ЗП, аренда и остальные исходные расходы: база × 1,05 в 2027; база × 1,05² = база × 1,1025 в 2028. Налог с дохода не входит в индексируемые расходы. Затраты ноября–декабря 2025 также индексируются один раз на 5% для 2027 и дважды для 2028.',
      'Варианты 2–4: расчет по общим суммам сети, без разбивки по ИП, с сохранением долей прибыли исходного месяца. Условия сценариев сохранены, изменения законодательства не прогнозируются. Это финансовое сравнение, не налоговая декларация.',
      'УСН 6+5% и УСН 15% Д−Р + НДС 5%: официальная ЗП = новая ЗП × 60%; начислено = официальная ЗП / 0,87; НДФЛ = начислено × 13%; взносы = начислено × 30,2%. Расходы = исходные расходы × коэффициент − «Бух, ЗП налоги, др.» × коэффициент + НДФЛ + взносы.',
      'УСН 6+5%: НДС = вознаграждение × 5/105; доход без НДС = вознаграждение / 1,05; УСН = доход без НДС × 6% − минимум (взносы; 50% УСН до вычета).',
      'УСН 15%: налоговые расходы = новые расходы − новая ЗП × 40%; налог = максимум (максимум (доход без НДС − налоговые расходы; 0) × 15%; доход без НДС × 1%). Минимум 1% остается помесячной оценкой, а не годовым расчетом декларации.',
      'АУСН: всегда 6 ИП × 5 работников. Оклад на руки: 63 000 руб. в 2027; 66 150 руб. в 2028. Официальный фонд = 1 890 000 / 1 984 500 руб. в месяц соответственно; начислено = фонд / 0,87. Взносы и НДС — 0 по условиям модели, НДФЛ — начислено × 13%.',
      'АУСН: новые расходы = исходные расходы × коэффициент − «Бух, ЗП налоги, др.» × коэффициент + НДФЛ + максимум (официальный фонд − новая исходная ЗП; 0). Налоговые расходы = новые расходы − максимум (новая исходная ЗП − официальный фонд; 0). Налог = максимум (максимум (вознаграждение − налоговые расходы; 0) × 20%; вознаграждение × 3%).',
      'Прибыль = сумма по группам долей ((вознаграждение + дополнительный доход − новые расходы − новые налоги) × доля прибыли). Налоги распределяются пропорционально вознаграждению; официальный фонд АУСН — пропорционально исходной ЗП.',
      confirmedRate === null || confirmedRate === undefined ? 'Стоимость капитала не рассчитана: актуальная ставка ЦБ недоступна.'
        : `Стоимость денег: 70 000 000 × (${confirmedRate}% + 2 п.п.) × календарные дни месяца / дни в году. Ставка ЦБ зафиксирована на ${asOf} для обоих прогнозных лет; это допущение, не прогноз ставки ЦБ. В 2028 учтено 366 дней.`,
      'Прибыль после стоимости денег = прибыль − стоимость денег. Годовые суммы складываются из 12 месяцев; доходность за год = годовая прибыль после стоимости денег / 70 000 000 × 100%. ЗП, НДФЛ и взносы показаны отдельно, но уже входят в расходы, повторно их прибавлять не нужно. Прочерк — показатель не выделен или не рассчитан, а не ноль.',
    ] };
}

module.exports = { BASE_MONTHS, buildFinancialForecast };
