-- Fix: source_kind constraint was missing 'idea' value used by generate-draft route
alter table content_drafts drop constraint if exists content_drafts_source_kind_check;
alter table content_drafts add constraint content_drafts_source_kind_check
  check (source_kind = any (array['answer'::text, 'conviction'::text, 'field_update'::text, 'idea'::text]));
