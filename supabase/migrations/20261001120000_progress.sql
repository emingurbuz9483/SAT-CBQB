-- Per-student practice progress for CBQB Practice.
-- Every row belongs to the signed-in user; row-level security keeps students' data private.

-- Latest result per question (what the app reads back to show progress and the New / Mistakes filters)
create table if not exists public.progress (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text        not null check (question_id ~ '^[0-9a-f]{8}$'),
  result      text        not null check (result in ('c', 'i')),   -- c = right on first try, i = not
  attempts    integer     not null default 1 check (attempts > 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

-- Every press of "Check" (append-only history)
create table if not exists public.attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text        not null check (question_id ~ '^[0-9a-f]{8}$'),
  domain      text        not null,
  skill       text        not null,
  difficulty  text        not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  choice      text        not null check (choice in ('A', 'B', 'C', 'D')),
  correct     boolean     not null,
  attempt     integer     not null check (attempt > 0),
  seconds     integer     not null check (seconds >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists attempts_user_created_idx on public.attempts (user_id, created_at desc);

alter table public.progress enable row level security;
alter table public.attempts enable row level security;

-- progress: a student can read and change only their own rows
create policy "progress: select own" on public.progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "progress: insert own" on public.progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "progress: update own" on public.progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "progress: delete own" on public.progress for delete to authenticated using ((select auth.uid()) = user_id);

-- attempts: a student can add to and read only their own history (no edits, so the log stays honest)
create policy "attempts: select own" on public.attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy "attempts: insert own" on public.attempts for insert to authenticated with check ((select auth.uid()) = user_id);
