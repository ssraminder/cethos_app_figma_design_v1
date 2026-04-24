-- Storage bucket for the PDF → Word (OCR) admin tool.
-- Input PDFs live under input/, generated DOCX files under output/.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdf-to-word',
  'pdf-to-word',
  false,
  104857600,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — mirrors the pdf-documents bucket convention.
CREATE POLICY "Staff can upload pdf-to-word"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'pdf-to-word');

CREATE POLICY "Staff can read pdf-to-word"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'pdf-to-word');

CREATE POLICY "Staff can update pdf-to-word"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'pdf-to-word');

CREATE POLICY "Staff can delete pdf-to-word"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'pdf-to-word');
