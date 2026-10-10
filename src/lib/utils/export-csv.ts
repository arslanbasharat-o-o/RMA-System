/**
 * Escapes a single CSV cell value to prevent CSV / Spreadsheet formula injection attacks.
 * If the value starts with '=', '+', '-', '@', '\t', or '\r', a leading single quote is prepended.
 * Any quotes inside the string are escaped by doubling them, and the string is wrapped in quotes if needed.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  let str = String(value);
  let wasEscaped = false;

  // Formula injection prevention
  const dangerousPrefixes = ["=", "+", "-", "@", "\t", "\r"];
  if (dangerousPrefixes.some((prefix) => str.startsWith(prefix))) {
    str = `'${str}`;
    wasEscaped = true;
  }

  // Double any existing quotes
  const escaped = str.replace(/"/g, '""');

  // Wrap in quotes if it contains commas, quotes, newlines, or was formula-escaped
  if (wasEscaped || /[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
}

/**
 * Builds a valid, safe CSV string from an array of headers and rows.
 */
export function buildCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const headerLine = headers.map(sanitizeCsvCell).join(",");
  const rowLines = rows.map((row) => row.map(sanitizeCsvCell).join(","));
  return [headerLine, ...rowLines].join("\r\n");
}
