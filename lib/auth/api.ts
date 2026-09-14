import { NextResponse } from "next/server";
import { getSession } from "./session";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

type ApiSessionResult = { session: Session; response?: undefined } | { session?: undefined; response: NextResponse };

// The Route Handler equivalent of the shell layout's gate. A layout only
// wraps page rendering - app/api/* Route Handlers are never nested inside
// app/invoices/layout.tsx, so before this, an API route only ever enforced
// 401 (no session) and had no equivalent of the layout's 403 (unverified
// email) check at all. One place for both checks, called from every
// invoice API route, so the check lives once rather than being
// re-implemented per handler.
export async function requireApiUser(): Promise<ApiSessionResult> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  }

  if (!session.user.emailVerifiedAt) {
    return { response: NextResponse.json({ error: "Email verification required" }, { status: 403 }) };
  }

  return { session };
}
