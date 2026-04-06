-- ============================================================================
-- CETHOS: PDF Manager Tables
-- Date: April 6, 2026
-- Tables: pdf_folders, pdf_documents, pdf_annotations, pdf_shares
-- ============================================================================

-- 1. Folders for organizing PDFs
CREATE TABLE pdf_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_folder_id UUID REFERENCES pdf_folders(id) ON DELETE CASCADE,
  created_by UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdf_folders_parent ON pdf_folders(parent_folder_id);
CREATE INDEX idx_pdf_folders_created_by ON pdf_folders(created_by);

ALTER TABLE pdf_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage pdf_folders" ON pdf_folders
  FOR ALL USING (true) WITH CHECK (true);

-- 2. PDF documents metadata
CREATE TABLE pdf_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  folder_id UUID REFERENCES pdf_folders(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_latest_version BOOLEAN NOT NULL DEFAULT true,
  parent_version_id UUID REFERENCES pdf_documents(id) ON DELETE SET NULL,
  thumbnail_path TEXT,
  created_by UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdf_documents_folder ON pdf_documents(folder_id);
CREATE INDEX idx_pdf_documents_created_by ON pdf_documents(created_by);
CREATE INDEX idx_pdf_documents_parent_version ON pdf_documents(parent_version_id);
CREATE INDEX idx_pdf_documents_latest ON pdf_documents(is_latest_version) WHERE is_latest_version = true;

ALTER TABLE pdf_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage pdf_documents" ON pdf_documents
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Annotations (comments, highlights, freehand, sticky notes, stamps, shapes)
CREATE TABLE pdf_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES pdf_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('comment', 'highlight', 'freehand', 'sticky_note', 'stamp', 'shape')),
  content TEXT,
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION,
  height DOUBLE PRECISION,
  color TEXT DEFAULT '#FFEB3B',
  svg_path TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdf_annotations_document ON pdf_annotations(document_id);
CREATE INDEX idx_pdf_annotations_page ON pdf_annotations(document_id, page_number);

ALTER TABLE pdf_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage pdf_annotations" ON pdf_annotations
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Share tokens
CREATE TABLE pdf_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES pdf_documents(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'annotate', 'edit')),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdf_shares_token ON pdf_shares(share_token) WHERE is_active = true;
CREATE INDEX idx_pdf_shares_document ON pdf_shares(document_id);

ALTER TABLE pdf_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage pdf_shares" ON pdf_shares
  FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for PDF documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdf-documents',
  'pdf-documents',
  false,
  104857600,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for pdf-documents bucket
CREATE POLICY "Staff can upload pdf documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'pdf-documents');

CREATE POLICY "Staff can read pdf documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'pdf-documents');

CREATE POLICY "Staff can update pdf documents" ON storage.objects
  FOR UPDATE USING (bucket_id = 'pdf-documents');

CREATE POLICY "Staff can delete pdf documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'pdf-documents');
