-- The demo sells in baht.
--
-- Changing the column default only decides what the next row gets, so the rows
-- already in the database are moved too. Both statements are narrowed to 'USD'
-- rather than written over every row: a merchant that genuinely sold in another
-- currency would not want this migration to flatten it, and the guard costs
-- nothing here where every row is a seeded one.
--
-- The amounts themselves are not converted. They are minor units either way —
-- satang instead of cents, both hundredths — and the numbers in this database
-- are invented, so a fictional 2499 re-read as ฿24.99 is no less true than it
-- was as $24.99. The seed mints realistic baht prices from now on; `pnpm
-- db:reset` is what makes the demo look right, not an exchange rate in here.

ALTER TABLE "Variant" ALTER COLUMN "currency" SET DEFAULT 'THB';
ALTER TABLE "Order" ALTER COLUMN "currency" SET DEFAULT 'THB';

UPDATE "Variant" SET "currency" = 'THB' WHERE "currency" = 'USD';
UPDATE "Order" SET "currency" = 'THB' WHERE "currency" = 'USD';
