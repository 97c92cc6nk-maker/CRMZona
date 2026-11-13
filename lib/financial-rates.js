'use strict';

const { XMLParser, XMLValidator } = require('fast-xml-parser');
const SOURCE = 'https://www.cbr.ru/hd_base/KeyRate/';
const ENDPOINT = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';
// Verified against CBR daily history and the September/October 2026 decisions.
const SEED = { source: SOURCE, verifiedThrough: '2026-11-13', fetchedAt: '2026-11-13T00:00:00Z',
  entries: [{ date: '2026-07-27', rate: 14 }] };
const inflight = new WeakMap();
const attempts = new WeakMap();
const DAY = 86400000;

function moscowDate(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(now);
}

function parseRates(xml, asOf) {
  if (Buffer.byteLength(xml) > 2000000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error('Некорректный XML Банка России.');
  }
  const parsed = new XMLParser({ removeNSPrefix: true, parseTagValue: false, processEntities: false }).parse(xml);
  const records = parsed.Envelope?.Body?.KeyRateXMLResponse?.KeyRateXMLResult?.KeyRate?.KR;
  const rows = (Array.isArray(records) ? records : records ? [records] : []).map((row) => ({
    date: String(row.DT || '').slice(0, 10), rate: Number(String(row.Rate || '').replace(',', '.')),
  })).sort((a, b) => a.date.localeCompare(b.date));
  if (!validEntries(rows) || rows[0].date > '2026-09-01' || rows.at(-1).date > asOf
    || rows.some((row, index) => index > 0 && Date.parse(row.date) - Date.parse(rows[index - 1].date) > 14 * DAY)
    || Date.parse(asOf) - Date.parse(rows.at(-1).date) > 4 * DAY) {
    throw new Error('Банк России вернул неполную историю ставок.');
  }
  const entries = rows.filter((row, index) => !index || row.rate !== rows[index - 1].rate);
  return { source: SOURCE, entries, verifiedThrough: asOf, fetchedAt: new Date().toISOString() };
}

function validEntries(entries) {
  return Array.isArray(entries) && entries.length > 0 && entries.every((row, index) => (
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) && !Number.isNaN(Date.parse(row.date))
    && Number.isFinite(row.rate) && row.rate >= 0 && row.rate <= 100
    && (!index || row.date > entries[index - 1].date)
  ));
}

async function fetchRates(asOf, fetchImpl = fetch) {
  const body = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><KeyRateXML xmlns="http://web.cbr.ru/"><fromDate>2026-08-20T00:00:00</fromDate><ToDate>${asOf}T00:00:00</ToDate></KeyRateXML></soap:Body></soap:Envelope>`;
  const response = await fetchImpl(ENDPOINT, { method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'http://web.cbr.ru/KeyRateXML' },
    body, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Банк России: HTTP ${response.status}.`);
  return parseRates(await response.text(), asOf);
}

async function getRates(store, { now = new Date(), fetchImpl = fetch } = {}) {
  const asOf = moscowDate(now);
  const cached = await store.loadJson('finance_key_rates.json', null);
  const saved = cached && validEntries(cached.entries) && /^\d{4}-\d{2}-\d{2}$/.test(cached.verifiedThrough)
    ? cached : SEED;
  if (saved.verifiedThrough >= asOf) return { ...saved, status: cached ? 'cached' : 'verified', warning: '' };
  if (inflight.has(store)) return inflight.get(store);
  const previous = attempts.get(store);
  if (previous && Date.now() - previous.at < 60000) return previous.result;
  const promise = (async () => {
    let result;
    try {
      const fresh = await fetchRates(asOf, fetchImpl);
      await store.saveJson('finance_key_rates.json', fresh);
      await store.audit('finance.rates_updated', { verifiedThrough: fresh.verifiedThrough, source: SOURCE });
      result = { ...fresh, status: 'live', warning: '' };
    } catch {
      result = { ...saved, status: 'stale', warning: `Источник ЦБ недоступен или вернул неполные данные. Последняя проверка ставок: ${saved.verifiedThrough}. Неподтвержденные периоды не рассчитываются.` };
      await store.audit('finance.rates_unavailable', { source: SOURCE, verifiedThrough: saved.verifiedThrough });
    }
    attempts.set(store, { at: Date.now(), result });
    return result;
  })();
  inflight.set(store, promise);
  try { return await promise; } finally { inflight.delete(store); }
}

function capitalCost(month, rates, asOf) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const end = last.toISOString().slice(0, 10);
  const required = end < asOf ? end : asOf;
  if (!validEntries(rates?.entries) || rates.verifiedThrough < required || rates.entries[0].date > `${month}-01`) {
    return { amount: null, annualRate: null, segments: [], projected: false };
  }
  let amount = 0, weightedRate = 0;
  const segments = [];
  for (let day = new Date(first); day <= last; day = new Date(day.getTime() + DAY)) {
    const date = day.toISOString().slice(0, 10);
    const lookup = date > asOf ? asOf : date;
    const rate = rates.entries.filter((entry) => entry.date <= lookup).at(-1)?.rate;
    if (rate === undefined) return { amount: null, annualRate: null, segments: [], projected: false };
    const year = day.getUTCFullYear();
    const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY;
    amount += 70000000 * (rate + 2) / 100 / daysInYear;
    weightedRate += rate + 2;
    const previous = segments.at(-1);
    if (previous && previous.rate === rate && previous.daysInYear === daysInYear) { previous.days++; previous.to = date; }
    else segments.push({ from: date, to: date, rate, days: 1, daysInYear });
  }
  return { amount: Math.round(amount * 100) / 100, annualRate: weightedRate / last.getUTCDate(), segments, projected: end > asOf };
}

module.exports = { getRates, fetchRates, parseRates, capitalCost, moscowDate, SEED };
