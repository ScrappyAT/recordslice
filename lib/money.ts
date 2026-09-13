// The one place a major-unit amount ("12.34") becomes the integer minor
// units the database stores. Deliberately not `Math.round(Number(amount) *
// 100)`: a decimal like 12.34 usually has no exact binary floating-point
// representation, so multiplying it by 100 can land a hair off the intended
// integer before rounding ever runs. Splitting on "." and treating the
// whole and fractional parts as separate integers avoids that step
// entirely - `Number(wholePart) * 100` is safe because both operands are
// already whole numbers, which float64 represents exactly in this range.
//
// Assumes its input already matches the schema in lib/validation/schemas.ts
// (digits, optional ".", one or two fraction digits) - it converts, it does
// not re-validate.
export function toMinorUnits(amountMajor: string): number {
  const [wholePart, fractionPart = ""] = amountMajor.split(".");
  const minorFraction = fractionPart.padEnd(2, "0");
  return Number(wholePart) * 100 + Number(minorFraction);
}

// The reverse, for display. Integer division and remainder on a whole
// number (amountMinor) are exact in float64 for the magnitudes this domain
// ever holds, so this stays consistent with toMinorUnits() in never routing
// the actual value through a decimal multiplication or division step.
// Doesn't handle a negative amountMinor - the CHECK constraint from the
// Invoice migration already makes that value impossible to store, so
// guarding against it here would be defending against a case that cannot
// occur.
export function formatAmount(amountMinor: number): string {
  const whole = Math.trunc(amountMinor / 100);
  const fraction = (amountMinor % 100).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}
