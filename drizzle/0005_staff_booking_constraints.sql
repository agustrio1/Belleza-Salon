CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_no_overlap";
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_staff_no_overlap";
--> statement-breakpoint
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (tstzrange("starts_at", "ends_at") WITH &&)
  WHERE ("status" <> 'cancelled' AND "staff_id" IS NULL);
--> statement-breakpoint
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_staff_no_overlap"
  EXCLUDE USING gist ("staff_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&)
  WHERE ("status" <> 'cancelled' AND "staff_id" IS NOT NULL);