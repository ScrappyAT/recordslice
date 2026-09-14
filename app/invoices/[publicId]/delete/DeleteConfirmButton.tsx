"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The one thing on the confirmation page that writes anything - a DELETE
// request, sent only when this button is clicked, never on page load.
export default function DeleteConfirmButton({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/invoices/${publicId}`, { method: "DELETE" });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }

      router.push("/invoices");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={submitting}
        className="rounded-md bg-red-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "Deleting…" : "Confirm delete"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
