/**
 * Minimal CSV writer — RFC 4180 escaping (wrap in quotes when the field has
 * a comma, quote, or newline; double up any quote inside). Not a general
 * CSV library, just enough for one-off exports like the contact list
 * download (see campaigns/[connectionId]/listas/[listId]/export/route.ts).
 */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: string[][]): string {
  // \r\n line endings + a leading BOM so Excel (the realistic target for a
  // "baixar lista" button) opens UTF-8 accented characters correctly
  // instead of mangling them.
  const BOM = "﻿";
  return BOM + rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}
