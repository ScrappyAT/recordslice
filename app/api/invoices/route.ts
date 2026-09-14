import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth/api";
import { invoiceCreateSchema } from "@/lib/validation/schemas";
import { toMinorUnits } from "@/lib/money";
import { generatePublicId } from "@/lib/ids";

// Only POST is exported here - same 405-with-empty-body default as
// app/api/invoices/[publicId]/route.ts for any other method, left for the
// same reason documented there.
export async function POST(request: Request) {
  // requireApiUser(), not requireSession(): this is a Route Handler, not a
  // page. requireSession() redirects, which is right for a browser
  // navigating the shell (app/invoices/layout.tsx) but wrong for a JSON
  // API - a Route Handler is not wrapped by that layout at all, so this is
  // the only place this route is gated. Covers both 401 (no session) and
  // 403 (unverified email) - see lib/auth/api.ts for why this exists as
  // its own function rather than the check being written out here again.
  const auth = await requireApiUser();
  if (auth.response) {
    return auth.response;
  }
  const { session } = auth;

  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = invoiceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { invoiceNumber, clientName, amount, currency, issueDate, status } = parsed.data;

  try {
    const invoice = await prisma.invoice.create({
      data: {
        publicId: generatePublicId(),
        // The session read above, server-side - never the request body,
        // a hidden field, or anything else the client sent, even though
        // this same value would look identical either way.
        userId: session.user.id,
        invoiceNumber,
        clientName,
        amountMinor: toMinorUnits(amount),
        currency,
        issueDate: new Date(issueDate),
        status,
      },
    });

    return NextResponse.json({ publicId: invoice.publicId }, { status: 201 });
  } catch (error) {
    // P2002 = unique constraint violation - here, (userId, invoiceNumber).
    // Caught rather than queried for first: checking "does this number
    // already exist for this user" before inserting is a race two
    // concurrent requests can both pass, the same reasoning already
    // applied to User.email in the signup route. The database's
    // constraint is what actually stops the second one.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "You already have an invoice with this number." },
        { status: 409 },
      );
    }
    throw error;
  }
}
