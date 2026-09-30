-- 0091: Profile Intelligence V2 — CSV/XLSX support
--
-- Adds spreadsheet MIME types to the profile-sources bucket
-- and creates the spreadsheet-specific parsing logic.

-- Update storage bucket to accept spreadsheet types
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]
where id = 'profile-sources';
