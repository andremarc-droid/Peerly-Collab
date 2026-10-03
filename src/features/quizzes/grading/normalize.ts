export function normalizeAnswer(value: string, caseSensitive: boolean): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('en-US')
}
