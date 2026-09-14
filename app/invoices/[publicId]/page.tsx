import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatAmount } from "@/lib/money";

// The naive version, deliberately - same instruction as step 4. See the
// step 5 report for what's measured here and left alone.
export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  // Independent session lookup, same as the list page - the layout above
  // already resolved one to gate this route.
  const user = await requireSession();

  // Both conditions inside the query. A publicId belonging to another user
  // and a publicId that doesn't exist at all both simply fail to match a
  // row here - there is no separate "found it, but it's not yours" branch
  // to keep in sync with this one, because the query never returns the
  // other user's row for this code to look at in the first place.
  const invoice = await prisma.invoice.findFirst({
    where: { publicId, userId: user.id },
  });

  if (!invoice) {
    // Same call, same response, for both cases above - see the report for
    // confirmation they're byte-identical from outside.
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/invoices" className="underline">
        Back to invoices
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{invoice.invoiceNumber}</h1>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="font-medium">Client</dt>
        <dd>{invoice.clientName}</dd>
        <dt className="font-medium">Amount</dt>
        <dd>{formatAmount(invoice.amountMinor)}</dd>
        <dt className="font-medium">Currency</dt>
        <dd>{invoice.currency}</dd>
        <dt className="font-medium">Issue date</dt>
        <dd>{invoice.issueDate.toISOString().slice(0, 10)}</dd>
        <dt className="font-medium">Status</dt>
        <dd>{invoice.status}</dd>
      </dl>
    </main>
  );
}
