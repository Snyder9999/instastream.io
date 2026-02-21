export function isValidStreamIndex(value: string | null): boolean {
  if (value === null) return false;
  return /^\d+$/.test(value);
}
