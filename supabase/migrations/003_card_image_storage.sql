-- ============================================================
-- Card image storage bucket for editor uploads + shared sets
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-images',
  'card-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Card images are publicly readable'
  ) THEN
    CREATE POLICY "Card images are publicly readable"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'card-images');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload their card images'
  ) THEN
    CREATE POLICY "Authenticated users can upload their card images"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'card-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can update their card images'
  ) THEN
    CREATE POLICY "Authenticated users can update their card images"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'card-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'card-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete their card images'
  ) THEN
    CREATE POLICY "Authenticated users can delete their card images"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'card-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
