-- 0090: Add missing columns to organizations table
alter table organizations add column if not exists timezone text default 'UTC';
alter table organizations add column if not exists working_days integer[] default array[1,2,3,4,5];
alter table organizations add column if not exists holidays jsonb default '[]'::jsonb;

-- Update existing rows
update organizations set timezone = 'UTC' where timezone is null;
update organizations set working_days = array[1,2,3,4,5] where working_days is null;
update organizations set holidays = '[]'::jsonb where holidays is null;
