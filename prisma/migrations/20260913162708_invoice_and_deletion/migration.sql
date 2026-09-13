-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "clientName" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDeletion" (
    "id" TEXT NOT NULL,
    "invoicePublicId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "clientName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_publicId_key" ON "Invoice"("publicId");

-- CreateIndex
CREATE INDEX "Invoice_userId_createdAt_idx" ON "Invoice"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_userId_invoiceNumber_key" ON "Invoice"("userId", "invoiceNumber");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint
-- A negative invoice amount has no meaning in this domain - there is no
-- credit-note or refund concept in scope - so it is made impossible at the
-- database level rather than left to an application-layer check that a
-- future write path could skip.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amountMinor_nonnegative" CHECK ("amountMinor" >= 0);

-- CheckConstraint
-- Restricts status to the fixed minimal set from application code, not a
-- Postgres ENUM type: this table already needs one CHECK constraint above,
-- and a CHECK is a plain ALTER TABLE to widen later, where a Postgres enum
-- type requires ALTER TYPE ... ADD VALUE and (on older Postgres) cannot run
-- inside a transaction.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_status_allowed_values" CHECK ("status" IN ('draft', 'sent', 'paid'));
