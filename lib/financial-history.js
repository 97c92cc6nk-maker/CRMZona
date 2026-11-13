'use strict';

const KEY = 'financial_history.json';
const START = '2024-01';
const END = '2026-08';
const FIELDS = ['salary', 'reward', 'totalExpenses', 'taxes', 'profit', 'revenue', 'issued', 'accountingPayrollTaxesOther'];
const months = () => Array.from({ length: 32 }, (_, i) => `${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`);

function validateHistory(value) {
  const invalid = () => { throw new Error('Архив финансовой модели поврежден или не прошел сверку итогов.'); };
  if (!value || value.version !== 1 || !value.source || typeof value.source.name !== 'string'
    || value.source.name.length > 200 || !/^[a-f0-9]{64}$/.test(value.source.sha256 || '')
    || value.assumptions?.ausnCompanyCount !== 6 || value.assumptions?.taxGrouping !== 'network'
    || value.assumptions?.profitShares !== 'excel' || !value.months
    || JSON.stringify(Object.keys(value.months).sort()) !== JSON.stringify(months())) invalid();
  for (const [month, item] of Object.entries(value.months)) {
    if (item.month !== month || typeof item.sheet !== 'string' || item.sheet.length > 100
      || !Number.isInteger(item.totalRow) || item.totalRow < 2 || item.totalRow > 10000
      || !Array.isArray(item.cohorts) || item.cohorts.length < 1 || item.cohorts.length > 2
      || new Set(item.cohorts.map((row) => row.profitDistributionRate)).size !== item.cohorts.length
      || !Array.isArray(item.warnings) || item.warnings.some((text) => typeof text !== 'string' || text.length > 500)) invalid();
    for (const record of [item.totals, ...item.cohorts]) {
      if (!record || FIELDS.some((key) => typeof record[key] !== 'number' || !Number.isFinite(record[key])
        || Math.abs(record[key]) > 1e12 || (key !== 'profit' && record[key] < 0))) invalid();
    }
    for (const row of item.cohorts) {
      if (![50, 100].includes(row.profitDistributionRate) || !Number.isInteger(row.rowCount) || row.rowCount < 1
        || Math.abs(row.profit - (row.reward - row.taxes - row.totalExpenses) * row.profitDistributionRate / 100) > 0.05) invalid();
    }
    for (const key of FIELDS) {
      if (Math.abs(item.totals[key] - item.cohorts.reduce((total, row) => total + row[key], 0)) > 0.05) invalid();
      const source = item.sourceCells?.[key];
      if (!source || source.value !== item.totals[key] || !['excel_total', 'column_absent'].includes(source.method)
        || typeof source.cell !== 'string' || (source.method === 'excel_total' && !/^[A-Z]{1,3}[1-9][0-9]{0,4}$/.test(source.cell))
        || (source.method === 'column_absent' && (key !== 'accountingPayrollTaxesOther' || source.value !== 0))
        || typeof source.formula !== 'string' || source.formula.length > 500) invalid();
    }
  }
  return value;
}

function historicalSource(history, month) {
  const item = history?.months[month];
  if (!item) return { month, historical: true };
  return { month, historical: true, history: item, archiveSource: history.source,
    calculationOptions: { ausnCompanyMultiplier: history.assumptions.ausnCompanyCount },
    report: { rows: item.cohorts.map((cohort) => ({ ...cohort, additionalIncome: 0,
      pointId: `history-share-${cohort.profitDistributionRate}`, pointName: `Доля ${cohort.profitDistributionRate}% (Excel)`,
      companyId: 'history-network', companyShortName: 'Сеть: 6 ИП, оценка по общим суммам' })) } };
}

module.exports = { KEY, START, END, FIELDS, validateHistory, historicalSource };
