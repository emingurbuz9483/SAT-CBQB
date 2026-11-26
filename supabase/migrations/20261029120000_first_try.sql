-- Accuracy counts only the first try. progress.result is the latest result (it drives the Mistakes list),
-- so a mistake fixed on a second round used to look like "right on first try". first_result keeps the first one.

alter table public.progress
  add column if not exists first_result text check (first_result in ('c', 'i'));

-- Backfill from the earliest logged Check per question; questions answered only once can use result as is.
update public.progress p
set first_result = case when f.correct then 'c' else 'i' end
from (
  select distinct on (user_id, question_id) user_id, question_id, correct
  from public.attempts
  order by user_id, question_id, created_at, id
) f
where f.user_id = p.user_id and f.question_id = p.question_id and p.first_result is null;

update public.progress set first_result = result where first_result is null and attempts = 1;

-- Leaderboard: "right on first try" now means the student's earliest Check on that question was right.
-- (Older rows logged retries as attempt 1 too, so attempt = 1 alone isn't enough.)
create or replace function public.leaderboard(domains text[], since timestamptz default null)
returns table (
  rank     bigint,
  name     text,
  avatar   text,
  answered bigint,
  correct  bigint,
  is_me    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with firsts as (
    select distinct on (a.user_id, a.question_id) a.user_id, a.question_id, a.correct
    from public.attempts a
    order by a.user_id, a.question_id, a.created_at, a.id
  ),
  totals as (
    select a.user_id,
           count(distinct a.question_id) as answered,
           count(distinct a.question_id) filter (where f.correct) as correct
    from public.attempts a
    join firsts f on f.user_id = a.user_id and f.question_id = a.question_id
    where a.domain = any (domains)
      and (since is null or a.created_at >= since)
    group by a.user_id
  ),
  ranked as (
    select t.*, rank() over (order by t.answered desc, t.correct desc) as rnk
    from totals t
  )
  select r.rnk,
         coalesce(
           nullif(
             trim(split_part(n.full, ' ', 1) || ' ' ||
                  case when position(' ' in n.full) > 0
                       then left(regexp_replace(n.full, '^.*\s', ''), 1) || '.'
                       else '' end),
             ''),
           'Student'),
         coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
         r.answered,
         r.correct,
         r.user_id = (select auth.uid())
  from ranked r
  join auth.users u on u.id = r.user_id
  cross join lateral (
    select trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')) as full
  ) n
  where r.rnk <= 50 or r.user_id = (select auth.uid())
  order by r.rnk, r.answered desc
$$;

revoke all on function public.leaderboard(text[], timestamptz) from public, anon;
grant execute on function public.leaderboard(text[], timestamptz) to authenticated;
