import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";

// Only DELETE is exported here. A GET, POST, or anything else to this same
// path never reaches this file's logic at all - Next.js answers with 405
// Method Not Allowed before any application code runs, so there is no
// mutating code path a GET could accidentally trigger.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { publicId } = await params;

  // One transaction: the read that supplies the audit row's values, the
  // delete, and the audit insert. If the delete fails, nothing after it
  // runs and nothing before it is kept. If the audit insert fails, the
  // delete is rolled back with it - Prisma's interactive transaction
  // commits only if the whole callback returns without throwing.
  const result = await prisma.$transaction(async (tx) => {
    // Scoped exactly like every other invoice read in this codebase - both
    // conditions in the where clause. This is also where the audit row's
    // values come from: the invoice's own row, read here, inside the
    // transaction - never the request body (this request has none) and
    // never the raw publicId path segment taken on faith.
    const invoice = await tx.invoice.findFirst({
      where: { publicId, userId: session.user.id },
    });

    if (!invoice) {
      return null;
    }

    // Scoped again, the same way, rather than deleting by the row's own
    // id just because the read above already checked ownership a moment
    // earlier - the ownership condition stays textually present in the
    // call that actually mutates data. deleteMany() (not delete()) because
    // { publicId, userId } isn't a declared unique constraint, only
    // publicId alone is - deleteMany() accepts any where clause and
    // reports how many rows it actually removed.
    const { count } = await tx.invoice.deleteMany({
      where: { publicId, userId: session.user.id },
    });

    if (count === 0) {
      // Deleted by a different, concurrent request between the read above
      // and here - the row this transaction saw a moment ago is already
      // gone. No audit row for a delete this transaction didn't perform.
      return null;
    }

    await tx.invoiceDeletion.create({
      data: {
        invoicePublicId: invoice.publicId,
        invoiceNumber: invoice.invoiceNumber,
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        clientName: invoice.clientName,
        userId: session.user.id,
      },
    });

    return invoice;
  });

  if (!result) {
    // Another user's invoice, an invoice that never existed, and an
    // invoice already deleted all collapse to this same branch - the
    // scoped read above cannot distinguish them, on purpose, the same
    // rule as the detail view.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ message: "Deleted." }, { status: 200 });
}
