// Rendered whenever forbidden() is called in a Server Component beneath
// this segment. Next.js sets the response status to 403 for this render;
// see app/invoices/layout.tsx for the one call site.
export default function Forbidden() {
  return <p>Verify your email to continue.</p>;
}
