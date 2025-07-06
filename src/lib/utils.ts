import { ColumnDefinition } from '@/core/types'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get internal keys for multiple columns
 * @param columnNames - Array of display column names
 * @param columns - Array of column definitions
 * @returns Array of internal keys
 */
export function getColumnKeys(columnNames: string[], columns: ColumnDefinition[]): string[] {
  // Map by index, not by name, to handle duplicate column names
  return columnNames.map((_, i) => columns[i]?.key || columnNames[i])
}
