-- Study Planner: a student sees the reports they sent, and whether each is still open or has been resolved (by the
-- teacher or a Studyly admin). Only their own reports, and nothing about who resolved them.
-- Apply after 20261119000000_classroom_reports_fix.sql. Safe to run again.

create or replace function public.my_reports()
returns table (id uuid, classroom_id uuid, classroom_name text, material_id uuid, material_title text, reason text,
  status text, created_at timestamptz, resolved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.classroom_id, c.name, r.material_id, r.material_title, r.reason, r.status, r.created_at, r.resolved_at
  from public.classroom_reports r
  join public.classrooms c on c.id = r.classroom_id
  where r.reporter = auth.uid()
  order by (r.status = 'open') desc, r.created_at desc
  limit 100;
$$;
revoke all on function public.my_reports() from public, anon;
grant execute on function public.my_reports() to authenticated;
