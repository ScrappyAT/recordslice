import { z } from "zod";

// The single source of validation truth. Every API route parses request
// bodies with these schemas; every form imports the same objects for
// inline client-side feedback. Nothing else in the codebase should
// hand-roll a validation rule.

// Normalised once, here, so every schema that takes an email applies the
// same transform before the value can reach the database's unique
// constraint on User.email. Order matters: trim and lowercase run as
// transforms first, then `.email()` checks the *normalised* value, so
// " Test@Example.com " both normalises and validates correctly.
const email = z.string().trim().toLowerCase().email();

// bcrypt only hashes the first 72 bytes of its input; anything past that
// is silently ignored. Rather than let a user believe an 80-character
// password protects them when only the first 72 bytes do, the max here
// makes that boundary an explicit, visible validation error instead of a
// silent truncation.
const newPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

export const signupSchema = z.object({
  email,
  password: newPassword,
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
});

export const signinSchema = z.object({
  email,
  // Deliberately not the same rule as newPassword: this is checked against
  // an existing bcrypt hash, not used to set one. A min/max complexity
  // rule here would only ever reject the correct password for an account
  // whose password predates a policy change; the length cap is kept only
  // to stop a pathologically large payload from being handed to
  // bcrypt.compare().
  password: z.string().min(1, "Password is required").max(72, "Password must be at most 72 characters"),
});

export const resetRequestSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  // The token is the raw 32 random bytes from the emailed link. Its shape
  // is an implementation detail of lib/auth/tokens.ts (not built yet), so
  // this only requires non-empty rather than pinning an exact length or
  // encoding the token schema would then have to stay in lockstep with.
  token: z.string().min(1, "Reset token is required"),
  password: newPassword,
});

export const verifyCodeSchema = z.object({
  // No session exists yet at this point in the flow (session creation is
  // step 6, after verification), so the email is what identifies which
  // user's code is being checked.
  email,
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const resendCodeSchema = z.object({
  email,
});

// amount is entered in major units ("12.34") as a string, not a number -
// the input never becomes a float at any point before lib/money.ts converts
// it with string/integer arithmetic. The regex itself is what rejects "not
// a number" and "negative" (no minus sign is in the alphabet it accepts),
// so there is no separate numeric range check needed here.
const amount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 12.34, with up to two decimal places");

// Uppercased before the shape check, same normalise-then-validate order as
// the email schema above - "usd" and "USD" should not be different inputs
// to the same currency.
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code, e.g. USD");

export const invoiceCreateSchema = z.object({
  invoiceNumber: z
    .string()
    .trim()
    .min(1, "Invoice number is required")
    .max(50, "Invoice number must be at most 50 characters"),
  clientName: z
    .string()
    .trim()
    .min(1, "Client name is required")
    .max(200, "Client name must be at most 200 characters"),
  amount,
  currency,
  // A calendar date from an <input type="date">, always "YYYY-MM-DD" - kept
  // as a validated string here rather than z.coerce.date(), which would
  // accept far more than the one format the form actually sends.
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  // The exact three values the migration's CHECK constraint allows - this
  // schema and that constraint have to be kept in step by hand, since a
  // raw SQL CHECK and a zod enum share no single source of truth.
  status: z.enum(["draft", "sent", "paid"], { message: "Choose a status" }),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type SigninInput = z.infer<typeof signinSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
export type ResendCodeInput = z.infer<typeof resendCodeSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
