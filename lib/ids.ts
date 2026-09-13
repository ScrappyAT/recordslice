import { randomBytes } from "crypto";

// The only invoice identifier a client ever sees. Generated here, in
// application code, once at creation - never a database default, never
// regenerated. 16 random bytes hex-encoded: 128 bits of entropy (the same
// order of magnitude as a UUIDv4), in an alphabet ([0-9a-f]) that can never
// produce a leading "-" - unlike base64url, which can, and which curl (and
// most shells) would read as a flag. Step 10 of this project's build order
// is entirely curl against URLs built from this value.
export function generatePublicId(): string {
  return randomBytes(16).toString("hex");
}
