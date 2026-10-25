-- Day 6 thread-integrity hardening: a message whose sender identity was never
-- verified is marked UNVERIFIED so it is never treated as strongly linked.

alter table messages add column if not exists thread_status text not null default 'UNVERIFIED';
comment on column messages.thread_status is 'VERIFIED when the sender identity was checked against the lead, UNVERIFIED when it was not.';
