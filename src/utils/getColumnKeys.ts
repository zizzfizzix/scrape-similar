/**
 * Get internal keys for multiple columns
 * @param columnNames - Array of display column names
 * @param columns - Array of column definitions
 * @returns Array of internal keys
 */
export function getColumnKeys(columnNames: string[], columns: ColumnDefinition[]): string[] {
  // Map by index, not by name, to handle duplicate column names
  return columnNames.map((name, i) => columns[i]?.key || name)
}
