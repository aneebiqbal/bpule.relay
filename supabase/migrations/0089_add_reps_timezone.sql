-- 0089: Add missing timezone column to reps table
alter table reps add column if not exists timezone text default 'UTC';

-- Update existing rows
update reps set timezone = 'UTC' where timezone is null;
