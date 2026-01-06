DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentMethod'
      AND e.enumlabel = 'NET_BANKING'
  ) THEN
    ALTER TYPE "PaymentMethod" ADD VALUE 'NET_BANKING';
  END IF;
END $$;
