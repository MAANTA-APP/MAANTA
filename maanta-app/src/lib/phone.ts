/** Kenyan mobile: 07XXXXXXXX, +2547XXXXXXXX, or 2547XXXXXXXX. */
export function isValidKenyanPhone(phone: string): boolean {
  const normalized = phone.replace(/[\s-]/g, "");
  return /^(\+?254|0)?7\d{8}$/.test(normalized);
}
