"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";
import { invoiceCreateSchema } from "@/lib/validation/schemas";

function firstMessages(fieldErrors: Record<string, string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) {
      result[field] = messages[0];
    }
  }
  return result;
}

const STATUSES = ["draft", "sent", "paid"] as const;

export default function NewInvoicePage() {
  const router = useRouter();
  const statusId = useId();
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("draft");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const input = { invoiceNumber, clientName, amount, currency, issueDate, status };

    // Same schema the server parses with - see lib/validation/schemas.ts.
    // A rejection here is exactly what the server would also reject, shown
    // instantly, with no round trip.
    const parsed = invoiceCreateSchema.safeParse(input);
    if (!parsed.success) {
      setFieldErrors(firstMessages(parsed.error.flatten().fieldErrors));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(responseBody?.error ?? "Something went wrong. Please try again.");
        if (responseBody?.fieldErrors) {
          setFieldErrors(firstMessages(responseBody.fieldErrors));
        }
        return;
      }

      // The detail view doesn't exist yet (step 5) - there is nowhere to
      // address by publicId yet, so this goes to the list instead, per
      // instruction, until that route exists.
      router.push("/invoices");
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">New invoice</h1>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Invoice number"
          name="invoiceNumber"
          type="text"
          value={invoiceNumber}
          onChange={(event) => setInvoiceNumber(event.target.value)}
          error={fieldErrors.invoiceNumber}
        />
        <Field
          label="Client name"
          name="clientName"
          type="text"
          value={clientName}
          onChange={(event) => setClientName(event.target.value)}
          error={fieldErrors.clientName}
        />
        <Field
          label="Amount"
          name="amount"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={fieldErrors.amount}
        />
        <Field
          label="Currency"
          name="currency"
          type="text"
          placeholder="USD"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          error={fieldErrors.currency}
        />
        <Field
          label="Issue date"
          name="issueDate"
          type="date"
          value={issueDate}
          onChange={(event) => setIssueDate(event.target.value)}
          error={fieldErrors.issueDate}
        />
        <div>
          <label htmlFor={statusId} className="block text-sm font-medium">
            Status
          </label>
          <select
            id={statusId}
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as (typeof STATUSES)[number])}
            className="mt-1 w-full rounded-md border border-gray-400 px-3 py-2"
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          {fieldErrors.status ? (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {fieldErrors.status}
            </p>
          ) : null}
        </div>
        {formError ? (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create invoice"}
        </button>
      </form>
    </main>
  );
}
