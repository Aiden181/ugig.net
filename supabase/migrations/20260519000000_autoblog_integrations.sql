-- /admin gate + autoblog webhook receivers.
--
-- profiles.is_admin gates the /admin route and the integrations
-- server actions (same convention as CoinPayPortal / Crawlproof /
-- ThreatCrush). Bootstrap flips anthony@profullstack.com so the
-- page is usable as soon as this migration lands.
--
-- autoblog_integrations stores per-source bearer tokens; the bearer
-- doubles as the HMAC secret consumed by @profullstack/autoblog's
-- verifyAndParse(). blog_posts dedup on (source, source_id) so
-- retried deliveries are idempotent. Network-gate columns are
-- defaulted generously — admins tighten per integration as needed.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists profiles_is_admin_idx
  on public.profiles(is_admin)
  where is_admin = true;

-- Bootstrap admin. profiles.id = auth.users.id, so resolve via auth.users.
update public.profiles p
  set is_admin = true
  from auth.users u
 where p.id = u.id
   and lower(u.email) = lower('anthony@profullstack.com');

create table if not exists public.autoblog_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'outrank'
    check (kind in ('outrank', 'crawlproof')),
  access_token text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  request_count integer not null default 0,
  allowed_niches text[] not null default '{}',
  min_word_count integer default 500,
  max_link_density numeric(5,2) default 1.0,
  banned_terms text[] not null default '{}',
  min_quality_score smallint
);

create index if not exists autoblog_integrations_token_idx
  on public.autoblog_integrations (access_token);
create index if not exists autoblog_integrations_kind_idx
  on public.autoblog_integrations (kind);

alter table public.autoblog_integrations enable row level security;

create policy "autoblog_integrations service role all"
  on public.autoblog_integrations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'outrank',
  source_id text,
  slug text not null,
  title text not null,
  content_markdown text,
  content_html text,
  meta_description text,
  image_url text,
  tags text[] not null default '{}',
  source_created_at timestamptz,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create unique index if not exists blog_posts_slug_idx on public.blog_posts (slug);
create index if not exists blog_posts_published_at_idx on public.blog_posts (published_at desc);
create index if not exists blog_posts_tags_idx on public.blog_posts using gin (tags);

alter table public.blog_posts enable row level security;

create policy "blog_posts public read"
  on public.blog_posts for select
  using (true);

create policy "blog_posts service role write"
  on public.blog_posts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.bump_autoblog_integration(integration_id uuid)
returns void
language sql
security definer
as $$
  update public.autoblog_integrations
     set last_used_at = now(),
         request_count = request_count + 1
   where id = integration_id;
$$;
revoke all on function public.bump_autoblog_integration(uuid) from public;
grant execute on function public.bump_autoblog_integration(uuid) to service_role;
