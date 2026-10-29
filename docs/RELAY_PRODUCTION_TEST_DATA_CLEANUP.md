# Relay - Secure Production Test-Data Cleanup

**Status: APPLIED - production mutation completed.**
**Generated:** 2026-10-28T15:45:30.789Z
**Environment:** production Supabase project https://fhnkanwvgamitrcuzpem.supabase.co (org bpulse / 11111111-1111-1111-1111-111111111111)

## Phase 0 - Freeze + Read-Only Inventory

- Production confirmed: Supabase project fhnkanwvgamitrcuzpem, single real org bpulse.
- **No active QA generation detected**: newest E2E lead is >3h old; production ingestion is live (real leads arriving every few minutes).
- Backup: Supabase automated nightly backups + restorable snapshot (user-confirmed).

## Before Counts

| Table | Count |
|---|---:|
| leads | 757 |
| captured_prospects | 1,199 |
| intelligence_samples | 723 |
| intelligence_sample_events | 2,163 |
| messages | 1,036 |
| conversation_states | 696 |
| conversation_facts | 0 |
| outcomes | 69 |
| action_events | 4,687 |
| relay_runs | 898 |
| ai_traces | 5,171 |
| scoring_feedback | 22 |
| scoring_labels | 0 |
| scoring_pairwise_labels | 0 |
| scoring_shadow_decisions | 5,600 |
| sales_memory | 1,204 |
| signal_events | 0 |
| facts | 19 |
| notifications | 0 |
| email_messages | 0 |
| golden_set | 0 |

## Classification

| Table | CONFIRMED_REAL | CONFIRMED_TEST | AMBIGUOUS_KEEP |
|---|---:|---:|---:|
| leads | 640 | 117 | 0 |
| captured_prospects | 996 | 4 | 0 |
| intelligence_samples | 719 | 4 | 0 |

CONFIRMED_TEST requires explicit provenance only: is_test = true or source_kind in {E2E,TEST,DEMO,QA,SYNTHETIC}.
CONFIRMED_REAL requires is_test = false AND source_kind = PRODUCTION.

## Phase 5 - Real-Child Protection

47 E2E leads are **AMBIGUOUS_KEEP** because they own a child carrying an explicit REAL marker
(is_test = false, source_kind = PRODUCTION, human labeler, or outcome history). A test-looking parent is not
enough to delete a real-looking child. These are **not** deleted.

| Blocker | Leads |
|---|---:|
| scoring_shadow_decisions:is_test=false | 4 |
| intelligence_samples:is_test=false | 43 |

Similarly 4 E2E captured prospects are AMBIGUOUS_KEEP (shadow decisions marked is_test=false).

## Confirmed Test Rows (deletable)

### leads (70)

| id | company | owner | is_test | source_kind | created_at | children |
|---|---|---|---|---|---|---:|
| c9a10a0b-a2f7-4bff-874e-51b6bfd8fd31 | Bug004 Co 1793141390707 | Hassan | true | E2E | 2026-10-27T22:49:53.311358+00:00 | 4 |
| c926b490-4c76-4a3d-a529-9e4f40c6deec | Bug004 Dup 1793141425454 | Hassan | true | E2E | 2026-10-27T22:50:27.483195+00:00 | 4 |
| 58167da0-ec60-4718-b4db-dcb439340bd2 | Bug004 Chat 1793141460908 | Hassan | true | E2E | 2026-10-27T22:51:03.690339+00:00 | 4 |
| 04bec34c-53cf-4f2e-98b1-6ddeb0ac982f | Bug004 Rel 1793141499078 | Hassan | true | E2E | 2026-10-27T22:51:41.740148+00:00 | 4 |
| 1b482b3f-e55b-4a1c-b682-1a5b590ea123 | Bug004 Today 1793141630343 | Hassan | true | E2E | 2026-10-27T22:53:56.677412+00:00 | 4 |
| c45866ae-c065-416e-a89a-012841dbe212 | Bug004 Surf 1793141539017 | Hassan | true | E2E | 2026-10-27T22:52:21.602596+00:00 | 4 |
| 7eb7dee9-60fc-43c9-8c7a-bcb454bbd3bf | Bug004 Arch 1793141576094 | Hassan | true | E2E | 2026-10-27T22:52:58.947717+00:00 | 4 |
| 7ba75275-9e23-4241-84b5-e95848b2a4e6 | Bug004 Co 1793142036962 | Hassan | true | E2E | 2026-10-27T23:00:39.214359+00:00 | 4 |
| 9b76c51e-5e95-4f36-8404-db6af3ef1585 | Bug004 Dup 1793142072009 | Hassan | true | E2E | 2026-10-27T23:01:14.282679+00:00 | 4 |
| 5ee8c8e7-a66a-497e-9b94-0caae8eec49f | Bug004 Chat 1793142113156 | Hassan | true | E2E | 2026-10-27T23:02:01.567668+00:00 | 4 |
| bb092343-2b77-4731-a9a3-228c50b8b5cd | Bug004 Rel 1793142164434 | Hassan | true | E2E | 2026-10-27T23:02:46.576027+00:00 | 4 |
| a4681019-1ff4-4907-99fe-7d377cc4932f | Bug004 Today 1793142267913 | Madiha | true | E2E | 2026-10-27T23:04:29.309379+00:00 | 4 |
| dbb12df2-2ca6-4a46-9386-87b0743b9cd8 | Bug004 Surf 1793142204947 | Hassan | true | E2E | 2026-10-27T23:03:28.662499+00:00 | 4 |
| 0a9b112a-7551-43fb-9102-200373da60f2 | Bug004 Arch 1793142245390 | Hassan | true | E2E | 2026-10-27T23:04:08.57752+00:00 | 4 |
| 0334cc6a-4878-43de-9ca4-7285152dad55 | Bug004 Co 1793142503612 | Hassan | true | E2E | 2026-10-27T23:08:25.938823+00:00 | 4 |
| a4938010-4814-4a15-872b-d1f317e54a89 | Bug004 Dup 1793142540371 | Hassan | true | E2E | 2026-10-27T23:09:03.341511+00:00 | 4 |
| 33941642-6648-4f59-97b5-63381c61e029 | Bug004 Chat 1793142577304 | Hassan | true | E2E | 2026-10-27T23:09:40.426488+00:00 | 4 |
| 09790775-b252-4b42-b654-b63dcb95f282 | Bug004 Rel 1793142621117 | Hassan | true | E2E | 2026-10-27T23:10:23.232816+00:00 | 4 |
| 48c82ce2-1835-4d80-bd7d-e86cf9b8ca1d | Bug004 Surf 1793142658900 | Hassan | true | E2E | 2026-10-27T23:11:02.639152+00:00 | 4 |
| 728e16a7-9461-49b1-a1e4-ed67f627dd06 | Bug004 Arch 1793142688203 | Hassan | true | E2E | 2026-10-27T23:11:31.084936+00:00 | 4 |
| 0c72cae3-7d14-4309-bcb2-a8287b6cc56d | Bug004 Today 1793142713837 | Madiha | true | E2E | 2026-10-27T23:11:55.186072+00:00 | 4 |
| bda10274-e801-4b0a-ae7e-01082ed006c4 | Bug004 Today 1793142785533 | Madiha | true | E2E | 2026-10-27T23:13:06.976539+00:00 | 4 |
| b59996e0-ef02-4f1e-978a-b5d66426f092 | Bug004 Surf 1793185902928 | Hassan | true | E2E | 2026-10-28T11:11:45.520006+00:00 | 4 |
| 6457eba4-cdfd-49eb-9c7d-6af386301d62 | Bug004 Rel 1793186997481 | Hassan | true | E2E | 2026-10-28T11:29:59.908666+00:00 | 4 |
| 15fec111-30ba-4bb0-863a-bfea72f42454 | Bug004 Rel 1793143360124 | Hassan | true | E2E | 2026-10-27T23:22:42.654668+00:00 | 4 |
| 5132d419-f963-493b-ae79-23415f72dd55 | Bug004 Co 1793143280085 | Hassan | true | E2E | 2026-10-27T23:21:22.252335+00:00 | 4 |
| 7f1f9d17-c844-4125-b982-5c0a1723552c | Bug004 Dup 1793143299906 | Hassan | true | E2E | 2026-10-27T23:21:42.237684+00:00 | 4 |
| 9d10f422-12d0-4798-be41-e77bffeff8eb | Bug004 Chat 1793143325983 | Hassan | true | E2E | 2026-10-27T23:22:11.922501+00:00 | 4 |
| f12ab4dd-1351-46b1-a373-8185005104bb | Bug004 Surf 1793143380874 | Hassan | true | E2E | 2026-10-27T23:23:03.010162+00:00 | 4 |
| a2a56f1a-51e3-45c2-a125-208a6eccd74d | Bug004 Arch 1793143400569 | Hassan | true | E2E | 2026-10-27T23:23:22.999346+00:00 | 4 |
| 8e31db4a-0c6c-4646-b75d-d660c3e37c31 | Bug004 Today 1793143426493 | Madiha | true | E2E | 2026-10-27T23:23:47.899327+00:00 | 4 |
| f19eabca-588b-45aa-a12a-71cd43350281 | Bug004 Co 1793143530047 | Hassan | true | E2E | 2026-10-27T23:25:32.204097+00:00 | 4 |
| 68e345df-8bbc-479d-8d64-90d51c5a3d02 | Bug004 Dup 1793143548438 | Hassan | true | E2E | 2026-10-27T23:25:50.644527+00:00 | 4 |
| 0765b250-1324-4875-a895-46d363d54d0d | Bug004 Arch 1793143633009 | Hassan | true | E2E | 2026-10-27T23:27:15.115384+00:00 | 4 |
| dc8697c2-26b1-44e5-bbea-7e447cb1a444 | Bug004 Chat 1793143568671 | Hassan | true | E2E | 2026-10-27T23:26:10.846966+00:00 | 4 |
| b4e97856-83e2-4552-8769-a5f6eb689ad0 | Bug004 Rel 1793143593441 | Hassan | true | E2E | 2026-10-27T23:26:35.426742+00:00 | 4 |
| 1bdf16a6-3525-4945-827d-1d12eccc1dc3 | Bug004 Surf 1793143612479 | Hassan | true | E2E | 2026-10-27T23:26:54.709827+00:00 | 4 |
| 4a516de5-4c30-4a85-80c2-e2a26116375d | Bug004 Today 1793143656151 | Madiha | true | E2E | 2026-10-27T23:27:37.551231+00:00 | 4 |
| 413ae46b-d220-451c-a1a9-335df3be5f22 | Bug004 Rel 1793144293212 | Hassan | true | E2E | 2026-10-27T23:38:15.676417+00:00 | 4 |
| fc8bddc0-83ef-4cd2-9698-386be23f4219 | Bug004 Arch 1793144334522 | Hassan | true | E2E | 2026-10-27T23:38:56.922437+00:00 | 4 |
| 2543075b-045c-44fb-adff-d9ce4249c49d | Bug004 Co 1793144221558 | Hassan | true | E2E | 2026-10-27T23:37:03.723651+00:00 | 4 |
| 5277fa9e-253a-4689-a742-2b5086e31284 | Bug004 Dup 1793144240456 | Hassan | true | E2E | 2026-10-27T23:37:22.754509+00:00 | 4 |
| b8f4ed23-7508-4de1-98de-8d272b3b05e5 | Bug004 Chat 1793144261458 | Hassan | true | E2E | 2026-10-27T23:37:44.171055+00:00 | 4 |
| 13994aeb-0b13-40bb-8dbd-81c651bed506 | Bug004 Surf 1793144313736 | Hassan | true | E2E | 2026-10-27T23:38:36.050557+00:00 | 4 |
| 8d6c82fc-7223-4ae9-af42-c5c695e024ee | Bug004 Today 1793144356804 | Madiha | true | E2E | 2026-10-27T23:39:18.217356+00:00 | 4 |
| f5cb6472-fb55-4437-9d9b-f599f9c3d07a | Bug004 Today 1793187363859 | Madiha | true | E2E | 2026-10-28T11:36:06.236062+00:00 | 4 |
| abb067d7-b3b6-475b-9065-d6209b7a8120 | Bug004 Chat 1793188133504 | Hassan | true | E2E | 2026-10-28T11:48:58.206071+00:00 | 4 |
| 7bc00eba-518b-4141-ac7b-f131a256b3e2 | Bug004 Rel 1793188171150 | Hassan | true | E2E | 2026-10-28T11:49:34.337811+00:00 | 4 |
| 36f6e4fb-3f8e-43b8-956a-9c400ed3e17d | Bug004 Today 1793188254424 | Madiha | true | E2E | 2026-10-28T11:50:56.105215+00:00 | 4 |
| 390a941e-b846-4a5f-940c-3fc1cde96969 | Bug004 Co 1793139569527 | Hassan | true | E2E | 2026-10-27T22:19:32.585986+00:00 | 4 |
| cd005f6f-3f82-4113-8a8f-2082ced78015 | Bug004 Chat 1793139706689 | Hassan | true | E2E | 2026-10-27T22:21:49.170116+00:00 | 4 |
| 3966acb8-1294-4a70-9699-997e97fd27a2 | Bug004 Dup 1793139606898 | Hassan | true | E2E | 2026-10-27T22:20:10.437109+00:00 | 4 |
| 755450b2-c836-468e-8de0-e2b28b695047 | Bug004 Rel 1793139744088 | Hassan | true | E2E | 2026-10-27T22:22:26.154764+00:00 | 4 |
| a76ef990-e994-44e5-a5ba-68d0afa2ea73 | Bug004 Surf 1793139840934 | Hassan | true | E2E | 2026-10-27T22:24:04.052042+00:00 | 4 |
| 5f3568aa-8da4-4925-83eb-31706811e7b3 | Bug004 Arch 1793139882573 | Hassan | true | E2E | 2026-10-27T22:24:44.615843+00:00 | 4 |
| 296b6544-f94c-46c5-ac20-24c4cf476b7a | Bug004 Today 1793139920638 | Hassan | true | E2E | 2026-10-27T22:25:24.101729+00:00 | 4 |
| 1e8e5bde-7da4-4b1f-91a9-c403d30b8696 | Probe Inbound 1793140154847 | Hassan | true | E2E | 2026-10-27T22:29:17.622065+00:00 | 4 |
| 3baf8bdd-b1d9-4f93-9eb5-88cbac9cb4f6 | Probe Vis 1793140938645 | Hassan | true | E2E | 2026-10-27T22:42:20.974316+00:00 | 4 |
| 5ebf4635-2cb8-4d54-93b5-0d17ed4d5549 | Probe Vis2 1793141045984 | Hassan | true | E2E | 2026-10-27T22:44:08.589022+00:00 | 4 |
| e4f21b84-dfcd-432b-8717-381b9845b910 | Bug004 Co 1793186902486 | Hassan | true | E2E | 2026-10-28T11:28:25.08451+00:00 | 4 |
| 3564b8e2-294e-47f4-afd8-54490f198564 | Bug004 Surf 1793188197874 | Hassan | true | E2E | 2026-10-28T11:50:01.485142+00:00 | 4 |
| 662a22bf-66c9-4a9d-98e8-6fb764465348 | Bug004 Arch 1793188225020 | Hassan | true | E2E | 2026-10-28T11:50:27.945366+00:00 | 4 |
| 5b9e8f67-4f7c-4692-85af-837b9c76be72 | Bug004 Chat 1793186961383 | Hassan | true | E2E | 2026-10-28T11:29:24.312883+00:00 | 4 |
| 460546cd-6db9-408e-b8fe-8c0cfb19e6d8 | Bug004 Surf 1793187025142 | Hassan | true | E2E | 2026-10-28T11:30:27.723938+00:00 | 4 |
| f761c74e-1b6c-42a9-9937-7a9beccd638e | Bug004 Today 1793185967537 | Madiha | true | E2E | 2026-10-28T11:12:50.968352+00:00 | 4 |
| 5c611167-5b4f-4d51-b622-e85dbaa150cb | Bug004 Arch 1793187462914 | Hassan | true | E2E | 2026-10-28T11:37:45.613002+00:00 | 4 |
| 4e3d3fed-9eae-43ab-8216-4619ba986a96 | Bug004 Dup 1793186935255 | Hassan | true | E2E | 2026-10-28T11:28:57.361171+00:00 | 4 |
| ee16b05e-66bf-44e8-b6c6-fec937fa61db | Bug004 Co 1793188070130 | Hassan | true | E2E | 2026-10-28T11:47:53.032669+00:00 | 4 |
| 371e1c0d-cc52-4571-a3a8-36110b610b65 | Bug004 Arch 1793185937401 | Hassan | true | E2E | 2026-10-28T11:12:20.116558+00:00 | 4 |
| dd3b95ec-74dd-407f-a85d-bac7588819b6 | Bug004 Dup 1793188096807 | Hassan | true | E2E | 2026-10-28T11:48:20.871139+00:00 | 4 |

### captured_prospects (0)

### intelligence_samples (4)

| id | lead_id | is_test | source_kind | created_at |
|---|---|---|---|---|
| a0b48068-da39-413a-8183-8e1eb22ec4c8 | 48a0707f-e44a-4ac5-a406-98794eaca6c0 | true | E2E | 2026-10-21T21:26:13.574912+00:00 |
| fe04281f-6055-4f26-82fe-4fb8136b62b0 | 840349eb-b562-4f90-85b4-ddb9c70197a7 | true | E2E | 2026-10-21T19:50:30.847562+00:00 |
| f9152663-ef89-403c-97b8-6937535bf9a2 | 8fb58663-35be-4c07-9c86-b0873dac9539 | true | E2E | 2026-10-21T20:01:39.383288+00:00 |
| 836e42cd-2301-4a91-bc83-d07cddc0dc44 | 6be49432-80a5-41df-9784-a652d4ae9dc1 | true | E2E | 2026-10-21T20:31:47.747344+00:00 |

## Ambiguous Rows Kept (manual review)

| id | company | owner | is_test | source_kind | created_at | blocker |
|---|---|---|---|---|---|---|
| 840349eb-b562-4f90-85b4-ddb9c70197a7 | NorthPeak 1792612205346 | Madiha | true | E2E | 2026-10-21T19:50:26.576432+00:00 | scoring_shadow_decisions:is_test=false |
| f049c748-bca8-4c38-8a69-ffd75e524d21 | QA No Thread 1793143166098 | Hassan | true | E2E | 2026-10-27T23:19:29.581548+00:00 | intelligence_samples:is_test=false |
| bbe69860-68fc-45fa-8bf6-50924ccf1843 | QA Terminal 1793143186933 | Hassan | true | E2E | 2026-10-27T23:19:49.472998+00:00 | intelligence_samples:is_test=false |
| 50df0909-f61c-472c-8994-233cb8c0c0ec | QA No Thread 1793130662279 | Hassan | true | E2E | 2026-10-27T19:51:06.345017+00:00 | intelligence_samples:is_test=false |
| a7b162e1-b5e4-43fa-a1fc-a5aac5362e67 | QA Inbound 1793143226606 | Hassan | true | E2E | 2026-10-27T23:20:30.455843+00:00 | intelligence_samples:is_test=false |
| 8fb58663-35be-4c07-9c86-b0873dac9539 | NorthPeak 1792612872316 | Madiha | true | E2E | 2026-10-21T20:01:35.626685+00:00 | scoring_shadow_decisions:is_test=false |
| 6be49432-80a5-41df-9784-a652d4ae9dc1 | NorthPeak 1792614687959 | Madiha | true | E2E | 2026-10-21T20:31:43.930411+00:00 | scoring_shadow_decisions:is_test=false |
| 48a0707f-e44a-4ac5-a406-98794eaca6c0 | NorthPeak 1792617952874 | Madiha | true | E2E | 2026-10-21T21:26:09.973547+00:00 | scoring_shadow_decisions:is_test=false |
| 500041fd-a968-4b99-bd5a-5620f4fa51a8 | QA No Thread 1793130699888 | Hassan | true | E2E | 2026-10-27T19:51:42.618289+00:00 | intelligence_samples:is_test=false |
| 956970a0-65b2-4a16-a65d-1145fc97908f | QA Terminal 1793130738065 | Hassan | true | E2E | 2026-10-27T19:52:20.813006+00:00 | intelligence_samples:is_test=false |
| de06fd0f-b2ae-4ad5-8397-02749e431f84 | QA Score Parity 1793143260516 | Hassan | true | E2E | 2026-10-27T23:21:03.242071+00:00 | intelligence_samples:is_test=false |
| 1f05d992-37e9-4331-a623-38fdf79ffef6 | QA No Thread 1793131202954 | Hassan | true | E2E | 2026-10-27T20:00:09.350303+00:00 | intelligence_samples:is_test=false |
| 088de187-e384-4e47-a9ac-575e5e6f1587 | QA Terminal 1793131440460 | Hassan | true | E2E | 2026-10-27T20:04:19.29364+00:00 | intelligence_samples:is_test=false |
| c855d130-9afd-41ef-b2d8-753a2d1aba71 | QA No Thread 1793131272392 | Hassan | true | E2E | 2026-10-27T20:01:54.415012+00:00 | intelligence_samples:is_test=false |
| 58cf0d99-db7f-4362-a227-baf05a76cdac | QA Terminal 1793131357501 | Hassan | true | E2E | 2026-10-27T20:03:48.652819+00:00 | intelligence_samples:is_test=false |
| 326089a6-727e-448f-a444-d2b59af1d5aa | QA Inbound 1793131566637 | Hassan | true | E2E | 2026-10-27T20:06:12.140176+00:00 | intelligence_samples:is_test=false |
| c5e46b98-bc7b-497b-acde-76a157e74ea9 | QA Terminal 1793144128161 | Hassan | true | E2E | 2026-10-27T23:35:33.921929+00:00 | intelligence_samples:is_test=false |
| 6564bb12-dbea-4f73-8ca2-24f38246e98f | QA Inbound 1793131684847 | Hassan | true | E2E | 2026-10-27T20:08:07.453394+00:00 | intelligence_samples:is_test=false |
| 66b58843-51ad-463d-8be5-16dbe6bfda1b | QA Score Parity 1793131823194 | Hassan | true | E2E | 2026-10-27T20:10:25.728875+00:00 | intelligence_samples:is_test=false |
| b20ec421-d5ff-449d-bc4a-74ed43d13ad2 | QA No Thread 1793144106285 | Hassan | true | E2E | 2026-10-27T23:35:09.286272+00:00 | intelligence_samples:is_test=false |
| f6546431-5421-4362-be3f-538e416fef39 | QA Score Parity 1793131881435 | Hassan | true | E2E | 2026-10-27T20:11:59.134122+00:00 | intelligence_samples:is_test=false |
| 26361dc0-14f4-4d35-aad0-7965c8c33a07 | QA No Thread 1793132060382 | Hassan | true | E2E | 2026-10-27T20:14:25.114945+00:00 | intelligence_samples:is_test=false |
| 10834179-82c3-444c-8528-86ae8f84a44a | QA Terminal 1793132136169 | Hassan | true | E2E | 2026-10-27T20:15:38.844347+00:00 | intelligence_samples:is_test=false |
| 4a850824-6830-4985-851b-54db21448a8b | QA Inbound 1793132213601 | Hassan | true | E2E | 2026-10-27T20:17:00.666574+00:00 | intelligence_samples:is_test=false |
| 2f2e732a-f156-471f-b313-db8d195a2cef | QA Inbound 1793144173129 | Hassan | true | E2E | 2026-10-27T23:36:16.053195+00:00 | intelligence_samples:is_test=false |
| a62dbc01-620d-4f45-8556-f292bbc7896d | QA Score Parity 1793132294968 | Hassan | true | E2E | 2026-10-27T20:18:18.885983+00:00 | intelligence_samples:is_test=false |
| e95f0be8-613f-4381-84ba-0aa39e259229 | QA Score Parity 1793144201966 | Hassan | true | E2E | 2026-10-27T23:36:44.363566+00:00 | intelligence_samples:is_test=false |
| e3e6c506-5049-4a05-9583-f1d0f11c0ba6 | QA Score Parity 1793132348500 | Hassan | true | E2E | 2026-10-27T20:19:12.856472+00:00 | intelligence_samples:is_test=false |
| c6582533-01cd-408e-9de6-cfee96245984 | QA No Thread 1793133631303 | Hassan | true | E2E | 2026-10-27T20:40:35.0462+00:00 | intelligence_samples:is_test=false |
| 9ded4852-f140-4103-b916-b3394a4158c4 | QA Terminal 1793133670387 | Hassan | true | E2E | 2026-10-27T20:41:14.72817+00:00 | intelligence_samples:is_test=false |
| 04eed3f8-f87e-473f-b23e-eba4c390e846 | QA Inbound 1793133732977 | Hassan | true | E2E | 2026-10-27T20:42:15.586307+00:00 | intelligence_samples:is_test=false |
| 33e50fba-7e09-41db-a228-5ccd4cbac73d | QA No Thread 1793186741589 | Hassan | true | E2E | 2026-10-28T11:25:45.603274+00:00 | intelligence_samples:is_test=false |
| c84c9b7d-9ef7-4832-a8e3-0bf5c090ba4c | QA Score Parity 1793133784227 | Hassan | true | E2E | 2026-10-27T20:43:08.550018+00:00 | intelligence_samples:is_test=false |
| 29e9a757-c00a-4e63-8c0d-bf050f66aa5a | QA Terminal 1793186768793 | Hassan | true | E2E | 2026-10-28T11:26:12.681825+00:00 | intelligence_samples:is_test=false |
| 9ea199cd-7339-46a7-8e3d-da3db5305e36 | QA No Thread 1793134751772 | Hassan | true | E2E | 2026-10-27T20:59:27.735924+00:00 | intelligence_samples:is_test=false |
| d733fb55-9047-4118-b3ec-45e2f9d4d8bf | QA Inbound 1793186831254 | Hassan | true | E2E | 2026-10-28T11:27:14.704039+00:00 | intelligence_samples:is_test=false |
| 2e790780-2af8-4bb7-bb36-a4569af33166 | QA Terminal 1793134826662 | Hassan | true | E2E | 2026-10-27T21:00:29.714576+00:00 | intelligence_samples:is_test=false |
| c93d6434-9e75-4759-b5d0-28ab50d6df8d | QA Inbound 1793134986362 | Hassan | true | E2E | 2026-10-27T21:03:23.871626+00:00 | intelligence_samples:is_test=false |
| 3601da8b-3b3d-4957-b458-5fd58be20644 | QA No Thread 1793187912981 | Hassan | true | E2E | 2026-10-28T11:45:19.267345+00:00 | intelligence_samples:is_test=false |
| 13ba2c45-3116-43fc-87ed-2e45c4d8eac9 | QA No Thread 1793139385199 | Hassan | true | E2E | 2026-10-27T22:16:28.107695+00:00 | intelligence_samples:is_test=false |
| ff8335ac-be79-4e69-923d-568e54fb80d1 | QA Terminal 1793139420953 | Hassan | true | E2E | 2026-10-27T22:17:05.418259+00:00 | intelligence_samples:is_test=false |
| 5fe130cd-30bc-432f-b2e1-cb82e3cbfc92 | QA Inbound 1793139485527 | Hassan | true | E2E | 2026-10-27T22:18:09.464069+00:00 | intelligence_samples:is_test=false |
| 4769a6e1-57a9-4d21-887f-05ce2b757c5b | QA Score Parity 1793139532409 | Hassan | true | E2E | 2026-10-27T22:18:55.78049+00:00 | intelligence_samples:is_test=false |
| 9d0d1fde-e47e-414a-bbba-591d2131c757 | QA Terminal 1793187951947 | Hassan | true | E2E | 2026-10-28T11:45:54.761081+00:00 | intelligence_samples:is_test=false |
| eb98b8d8-c2f1-4057-be7e-8b959d3738aa | QA Score Parity 1793186875646 | Hassan | true | E2E | 2026-10-28T11:28:00.142704+00:00 | intelligence_samples:is_test=false |
| c246ea28-5f64-4112-b266-8ddd1ae5c021 | QA Score Parity 1793188042309 | Hassan | true | E2E | 2026-10-28T11:47:26.298596+00:00 | intelligence_samples:is_test=false |
| 732b5b4c-b5a9-492b-b15c-6c374f6b431b | QA Inbound 1793188000442 | Hassan | true | E2E | 2026-10-28T11:46:47.379292+00:00 | intelligence_samples:is_test=false |

## Dependencies To Delete

| Table | Rows |
|---|---:|
| action_events | 70 |
| conversation_states | 70 |
| messages | 70 |
| relay_runs | 70 |
| leads (parents) | 70 |
| intelligence_samples (parents) | 4 |
| captured_prospects (parents) | 0 |

## Rows That Will Remain

- 640 production leads (is_test=false/PRODUCTION) - untouched.
- 47 E2E leads with real-marked children - AMBIGUOUS_KEEP.
- 996 production captured prospects - untouched.
- 719 production samples - untouched.
- 966 messages (all real + ambiguous-parent children).
- 69 outcomes - untouched.
- 22 scoring feedback - untouched.
- 5,600 shadow decisions - untouched.

## After Projected Counts

| Table | Before | After | Delta |
|---|---:|---:|---:|
| leads | 757 | 687 | -70 |
| captured_prospects | 1,199 | 1,199 | 0 |
| intelligence_samples | 723 | 719 | -4 |
| intelligence_sample_events | 2,163 | 2,152 | -11 |
| messages | 1,036 | 966 | -70 |
| conversation_states | 696 | 626 | -70 |
| action_events | 4,687 | 4,617 | -70 |
| relay_runs | 898 | 828 | -70 |
| outcomes | 69 | 69 | 0 |
| scoring_feedback | 22 | 22 | 0 |
| scoring_shadow_decisions | 5,600 | 5,600 | 0 |
| ai_traces | 5,171 | 5,171 | 0 |

> Counts are a snapshot; production ingestion continues to add real leads during the operation.

## Hard Dry-Run Gate

| Condition | Value | Pass |
|---|---:|---|
| CONFIRMED_REAL rows to delete | 0 | PASS |
| AMBIGUOUS_KEEP rows to delete | 0 | PASS |
| Cross-org deletes | 0 | PASS |
| production is_test=false deletions | 0 | PASS |

## Apply Plan

1. Snapshot/backup the database (restorable).
2. node scripts/qa/qa-cleanup.mjs --manifest qa-artifacts/relay-cleanup/manifest-2026-10-28.json --apply
3. Delete children first (see delete_order), then parents, scoped to manifest IDs only.
4. Re-run relay-test-inventory.mjs + relay-test-manifest.mjs: expect 0 additional CONFIRMED_TEST.

## Immutable Manifest

- File: qa-artifacts/relay-cleanup/manifest-2026-10-28.json
- sha256 (file): c0112099c9111e88b2ec815fbdcea044473f669b30b095c33194b6139b220ea9
- sha256 (confirmed_test payload): 03e57a6f9b33c86f7a5d60370f4d40595576f66d00a116c3b19ca43cdbbc8c5f
- Inventory snapshot: qa-artifacts/relay-cleanup/inventory-2026-10-28.json

## Post-Apply Verification

| Check | Result |
|---|---|
| Deletable CONFIRMED_TEST remaining (post manifest) | 0 |
| E2E records still present (all AMBIGUOUS_KEEP) | 51 |
| AMBIGUOUS_KEEP retained (leads + prospects) | 51 |
| Production leads (is_test=false/PRODUCTION) | 652 |
| Inconsistent rows (is_test=true+PRODUCTION or is_test=false+E2E) | 0 |
| Orphan messages / conversation_states | 0 |
| Cross-org changes | 0 |

### After Counts

| Table | Count |
|---|---:|
| leads | 706 |
| captured_prospects | 1,223 |
| intelligence_samples | 738 |
| intelligence_sample_events | 2,209 |
| messages | 985 |
| conversation_states | 645 |
| conversation_facts | 0 |
| outcomes | 69 |
| action_events | 4,670 |
| relay_runs | 847 |
| ai_traces | 5,247 |
| scoring_feedback | 22 |
| scoring_labels | 0 |
| scoring_pairwise_labels | 0 |
| scoring_shadow_decisions | 5,760 |
| sales_memory | 1,223 |
| signal_events | 0 |
| facts | 19 |
| notifications | 0 |
| email_messages | 0 |
| golden_set | 0 |

Idempotency: a second manifest run produced 0 additional CONFIRMED_TEST rows; a second apply deletes 0 rows.

## Audit Trail

- **Who:** automated cleanup agent (opencode), acting on explicit user approval.
- **When:** dry-run 2026-10-28T15:45:30.789Z; apply completed 2026-10-28.
- **Organization:** bpulse (11111111-1111-1111-1111-111111111111) - single production org.
- **Manifest:** qa-artifacts/relay-cleanup/manifest-2026-10-28.json
- **Manifest sha256 (file):** c0112099c9111e88b2ec815fbdcea044473f669b30b095c33194b6139b220ea9
- **Manifest sha256 (confirmed_test payload):** 03e57a6f9b33c86f7a5d60370f4d40595576f66d00a116c3b19ca43cdbbc8c5f
- **Tables affected:** intelligence_sample_events, action_events, conversation_states, messages, relay_runs, intelligence_samples, leads.
- **Rows deleted:** 365 (70 leads + 4 samples + 70 messages + 70 conversation_states + 70 action_events + 70 relay_runs + 11 sample events).
- **Before counts:** see table above. **After counts:** see Post-Apply Verification.
- **Backup reference:** Supabase automated nightly backups + restorable snapshot (user-confirmed).
- **Verification result:** PASS - 0 deletable test rows remain, 0 orphans, 0 cross-org changes, 0 inconsistent rows.

## Files

- scripts/qa/relay-test-inventory.mjs - read-only inventory + classification
- scripts/qa/relay-test-manifest.mjs - Phase 5 + immutable CONFIRMED_TEST manifest
- scripts/qa/relay-test-report.mjs - this report
- scripts/qa/qa-cleanup.mjs - hardened apply tool
