-- Math adds student-produced responses (grid-ins): the attempt log stores the typed answer, not just A–D.
-- A grid-in entry is at most 6 characters (5, plus a minus sign), e.g. "-49/150" is entered as "-.3266".
alter table public.attempts drop constraint if exists attempts_choice_check;
alter table public.attempts add constraint attempts_choice_check
  check (choice in ('A', 'B', 'C', 'D') or choice ~ '^-?[0-9./]{1,5}$');
