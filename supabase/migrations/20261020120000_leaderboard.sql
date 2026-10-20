-- Leaderboard: students ranked by how many distinct questions they've answered.
-- attempts stays private (row-level security); this function returns only totals and a short display name
-- (first name + last initial), and only to signed-in students.

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
  with totals as (
    select a.user_id,
           count(distinct a.question_id) as answered,
           count(distinct a.question_id) filter (where a.correct and a.attempt = 1) as correct
    from public.attempts a
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
