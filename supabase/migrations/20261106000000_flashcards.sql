-- Study Planner: flashcards (and achievements, coming next) are records of their own kinds.
-- The records table only accepts the kinds it knows; this adds 'card' and 'achievement'.
-- Apply after 20261105000000_group_board.sql: SQL Editor -> paste -> Run. Safe to run again.

alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check
  check (kind in ('subject', 'task', 'session', 'exam', 'recurring', 'class', 'vacation', 'group', 'archive', 'card', 'achievement', 'singleton'));
