-- Add new trend source types (reddit, lobsters, producthunt) to check constraint
alter table trend_sources drop constraint trend_sources_source_type_check;
alter table trend_sources add constraint trend_sources_source_type_check
  check (source_type in ('hackernews', 'devto', 'github', 'reddit', 'lobsters', 'producthunt', 'stackoverflow', 'rss', 'arxiv'));

-- Register new trend source adapters
insert into trend_sources (source_key, source_type, display_name, base_url, fetch_interval_minutes) values
  ('reddit-programming', 'reddit', 'Reddit r/programming+ML+DevOps', 'https://reddit.com', 120),
  ('reddit-technews', 'reddit', 'Reddit r/technology+Futurology', 'https://reddit.com', 120),
  ('lobsters-hot', 'lobsters', 'Lobste.rs Hot', 'https://lobste.rs', 180),
  ('lobsters-newest', 'lobsters', 'Lobste.rs Newest', 'https://lobste.rs', 180),
  ('producthunt-today', 'producthunt', 'Product Hunt Today', 'https://producthunt.com', 360)
on conflict (source_key) do nothing;
