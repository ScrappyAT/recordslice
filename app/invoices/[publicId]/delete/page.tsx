import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatAmount } from "@/lib/money";
import DeleteConfirmButton from "./DeleteConfirmButton";

// Read-only. This page writes nothing - it names the invoice so nobody
// confirms blind, and the confirm button below is what actually deletes,
// via a DELETE request to /api/invoices/:publicId.
export default async function DeleteConfirmationPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  const user = await requireSession();

  // Same scoped lookup as the detail view - another user's publicId and
  // one that doesn't exist both simply fail to match here.
  const invoice = await prisma.invoice.findFirst({
    where: { publicId, userId: user.id },
  });

  if (!invoice) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href={`/invoices/${invoice.publicId}`} className="underline">
        Back to invoice
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Delete this invoice?</h1>
      <p className="mt-2">
        Invoice <strong>{invoice.invoiceNumber}</strong> for{" "}
        <strong>{invoice.clientName}</strong>, {formatAmount(invoice.amountMinor)}{" "}
        {invoice.currency}. This cannot be undone.
      </p>
      <div className="mt-4">
        <DeleteConfirmButton publicId={invoice.publicId} />
      </div>
    </main>
  );
}
