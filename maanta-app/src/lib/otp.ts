/** Six-digit merchant redemption code (000000–999999). */
export function isValidOtpCode(code: unknown): code is string {
  return typeof code === "string" && /^\d{6}$/.test(code);
}
