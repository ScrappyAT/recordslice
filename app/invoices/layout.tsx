import type { ReactNode } from "react";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";
import { requireSession, destroySession } from "@/lib/auth/session";

// The signed-in shell. Every route under /invoices renders through here
// first, so the gate is structural - a route added later under this
// segment is protected by construction, not because whoever wrote it
// remembered to call requireSession() themselves.
export default async function InvoicesLayout({ children }: { children: ReactNode }) {
  // 401 case: no valid session. requireSession() redirects to /signin
  // before anything below it runs - see lib/auth/session.ts for why this
  // has to be a database-backed check here rather than in middleware.
  const user = await requireSession();

  // 403 case: a valid session, but the email on it is unverified. Under the
  // current sign-in/verify flow this state can't actually be reached (see
  // the amended Status codes section of AGENTS.MD) - the check stays
  // anyway, because the shell should not depend on an invariant that lives
  // in a different file.
  if (!user.emailVerifiedAt) {
    forbidden();
  }

  async function signOutAction() {
    "use server";
    await destroySession();
    redirect("/signin");
  }

  return (
    <>
      <nav>
        <Link href="/invoices">Invoices</Link>
        <span>{user.name}</span>
        <form action={signOutAction}>
          <button type="submit">Sign out</button>
        </form>
      </nav>
      {children}
    </>
  );
}
