/**
 * Reusable CSV writer for exports.
 *
 *  - RFC 4180 quoting (commas, quotes and line breaks inside a cell), CRLF line endings.
 *  - A UTF-8 byte-order mark, so Excel opens names in any script correctly.
 *  - Spreadsheet formula injection defence: a text cell that starts with = + - @ (or a tab / carriage return) would be
 *    run as a formula by Excel and Sheets, and exported data contains customer-typed text, so such cells are
 *    prefixed with an apostrophe. Numbers are written as numbers and never altered.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
export const CSV_BOM = '﻿';
export function csvCell(value) {
    if (value === null || value === undefined)
        return '';
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? '' : value.toISOString();
    if (typeof value === 'number')
        return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    let text = value;
    if (FORMULA_START.test(text))
        text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function toCsv(rows, columns) {
    const lines = [columns.map((c) => csvCell(c.header)).join(',')];
    for (const row of rows)
        lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
    return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}
/** A file name that is safe in a Content-Disposition header: letters, digits, dot, dash, underscore only. */
export const safeFileName = (name) => name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '') || 'export';
//# sourceMappingURL=csv.js.map