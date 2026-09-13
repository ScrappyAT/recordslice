import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatAmount } from "@/lib/money";

// The naive version, deliberately. This is the "before" the documentation
// needs a real number for - see the step 4 report for what's already
// visible as inefficient here and why it's left alone until step 7.
export default async function InvoicesPage() {
  // The layout above (app/invoices/layout.tsx) already called
  // requireSession() once to gate this route. Calling it again here, just
  // to get the id this query filters on, is a second, independent session
  // lookup for the same request - see the step 4 report.
  const user = await requireSession();

  // Scoped in the query itself: userId is a condition on the fetch, not a
  // filter applied to rows already retrieved.
  const invoices = await prisma.invoice.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  if (invoices.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p>You have no invoices yet.</p>
        <Link href="/invoices/new" className="underline">
          Create your first invoice
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <Link href="/invoices/new" className="underline">
          New invoice
        </Link>
      </div>
      <table className="mt-4 w-full text-left">
        <thead>
          <tr>
            <th scope="col">Invoice number</th>
            <th scope="col">Client</th>
            <th scope="col">Amount</th>
            <th scope="col">Currency</th>
            <th scope="col">Issue date</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            // publicId, not id, both as the key and in the link - the
            // primary key never leaves the server, not even into a React
            // key that ends up attributed to the DOM.
            <tr key={invoice.publicId}>
              <td>
                {/* Points at the route the detail view will occupy - this
                    404s until step 5 builds it. */}
                <Link href={`/invoices/${invoice.publicId}`} className="underline">
                  {invoice.invoiceNumber}
                </Link>
              </td>
              <td>{invoice.clientName}</td>
              <td>{formatAmount(invoice.amountMinor)}</td>
              <td>{invoice.currency}</td>
              <td>{invoice.issueDate.toISOString().slice(0, 10)}</td>
              <td>{invoice.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
