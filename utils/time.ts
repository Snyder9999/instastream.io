export function parseStartTime(raw: string | null): string | null {
  if (!raw || raw.trim() === "") return "0";
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value.toString();
}
