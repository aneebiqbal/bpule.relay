-- RELAY V6.3.1 — provider telemetry operation vocabulary.
--
-- The V6.3 telemetry used SEARCH for Snov OAuth token acquisition and FIND for
-- both the finder and the verifier result poll. That made business spend noisy
-- and indistinguishable. The explicit operations below keep SEARCH/ENRICH for
-- Prospeo, FIND_EMAIL/VERIFY_EMAIL for the Snov fallback, and AUTH for token
-- acquisition (which is never a business credit).
--
-- FIND and VERIFY remain allowed so historical rows stay valid.

alter table provider_telemetry drop constraint if exists provider_telemetry_operation_check;
alter table provider_telemetry add constraint provider_telemetry_operation_check
  check (operation in (
    'SEARCH',
    'ENRICH',
    'REVEAL',
    'FIND',
    'VERIFY',
    'FIND_EMAIL',
    'VERIFY_EMAIL',
    'AUTH'
  ));

comment on constraint provider_telemetry_operation_check on provider_telemetry is
  'FIND_EMAIL/VERIFY_EMAIL are the explicit Snov fallback operations; AUTH is token acquisition and never a business credit.';
