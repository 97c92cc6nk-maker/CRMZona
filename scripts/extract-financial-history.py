"""Read cached Excel results without changing the workbook or recalculating formulas."""
import hashlib
import json
import math
import re
import sys
from pathlib import Path
import openpyxl
from openpyxl.utils import get_column_letter

MONTHS = {'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4, 'май': 5, 'июн': 6,
          'июл': 7, 'авг': 8, 'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12}
HEADERS = {'salary': 'ЗП', 'reward': 'Вознаграждение', 'totalExpenses': 'Итого',
           'taxes': 'Налоги', 'profit': 'Прибыль', 'revenue': 'Выручка',
           'issued': 'Кол-во посылок', 'accountingPayrollTaxesOther': 'Бухгалтерия, зп налоги и прочее'}


def extract(source):
    data = openpyxl.load_workbook(source, data_only=True)
    formulas = openpyxl.load_workbook(source, data_only=False)
    months = {}
    for sheet in data:
        match = re.fullmatch(r'([А-Яа-я]+)(24|25|26)', sheet.title)
        if not match or match[1].lower()[:3] not in MONTHS:
            raise ValueError(f'Unknown month: {sheet.title}')
        month = f'20{match[2]}-{MONTHS[match[1].lower()[:3]]:02}'
        if not '2024-01' <= month <= '2026-08' or month in months:
            raise ValueError(f'Unexpected or duplicate month: {month}')
        header = next(row for row in sheet if any(cell.value == 'Вознаграждение' for cell in row))
        columns = {cell.value: cell.column for cell in header if cell.value is not None}
        total_rows = [cell.row for row in sheet for cell in row if str(cell.value).strip().lower() == 'итого:']
        if len(total_rows) != 1:
            raise ValueError(f'{sheet.title}: expected exactly one total row')
        total_row = total_rows[0]
        first = header[0].row + 1
        f = formulas[sheet.title]

        def number(row, column):
            cell = sheet.cell(row, column)
            value = cell.value
            if value is None and f.cell(row, column).data_type != 'f':
                return 0
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f'{sheet.title}!{cell.coordinate}: missing/invalid numeric result')
            return value

        totals, sources, warnings = {}, {}, []
        for key, label in HEADERS.items():
            col = columns.get(label)
            if col is None:
                if key != 'accountingPayrollTaxesOther':
                    raise ValueError(f'{sheet.title}: missing {label}')
                totals[key] = 0
                sources[key] = {'cell': '', 'formula': '', 'value': 0, 'method': 'column_absent'}
                warnings.append('В Excel нет отдельного столбца «Бух, ЗП налоги, др.». В сценариях из расходов по этому столбцу ничего не исключено.')
                continue
            expected = sum(number(row, col) for row in range(first, total_row))
            value = number(total_row, col)
            if abs(value - expected) > 0.02:
                raise ValueError(f'{sheet.title}!{get_column_letter(col)}{total_row}: total does not reconcile ({value} != {expected})')
            totals[key] = round(value, 2)
            cell = sheet.cell(total_row, col).coordinate
            sources[key] = {'cell': cell, 'formula': f[cell].value, 'value': round(value, 2), 'method': 'excel_total'}

        groups = {}
        for row in range(first, total_row):
            values = {key: number(row, columns[label]) if label in columns else 0 for key, label in HEADERS.items()}
            if not any(values.values()):
                continue
            formula = f.cell(row, columns['Прибыль']).value
            # Only the observed same-row subtraction formulas and /2 share are accepted.
            pattern = rf'=\(?[A-Z]+{row}(?:-[A-Z]+{row}){{2,3}}\)?(/2)?'
            if not isinstance(formula, str) or not re.fullmatch(pattern, formula):
                raise ValueError(f'{sheet.title}: unsupported profit formula at row {row}')
            share = 50 if formula.endswith('/2') else 100
            if abs(values['profit'] - (values['reward'] - values['taxes'] - values['totalExpenses']) * share / 100) > 0.02:
                raise ValueError(f'{sheet.title}: profit share does not reconcile at row {row}')
            group = groups.setdefault(share, {'profitDistributionRate': share, 'rowCount': 0, **{key: 0 for key in HEADERS}})
            group['rowCount'] += 1
            for key, value in values.items():
                group[key] += value
        for key, value in totals.items():
            if abs(value - sum(group[key] for group in groups.values())) > 0.02:
                raise ValueError(f'{sheet.title}: share groups do not reconcile for {key}')
        cohorts = [{key: round(value, 2) for key, value in group.items()} for group in groups.values()]
        months[month] = {'month': month, 'sheet': sheet.title, 'totalRow': total_row, 'totals': totals,
                         'cohorts': cohorts, 'sourceCells': sources, 'warnings': warnings}
    expected = [f'{year}-{month:02}' for year in range(2024, 2027) for month in range(1, 13) if f'{year}-{month:02}' <= '2026-08']
    if sorted(months) != expected:
        raise ValueError('Workbook does not cover all 32 historical months')
    return {'version': 1, 'source': {'name': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()},
            'assumptions': {'ausnCompanyCount': 6, 'taxGrouping': 'network', 'profitShares': 'excel'},
            'months': {month: months[month] for month in sorted(months)}}


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    source, output = map(Path, sys.argv[1:3])
    result = extract(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'months': len(result['months']), 'sourceHash': result['source']['sha256'],
                      'first': next(iter(result['months'])), 'last': list(result['months'])[-1]}, ensure_ascii=False))
