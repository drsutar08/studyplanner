-- Study Planner: reports sent before 20261118000000_classroom_reports.sql was applied had no material title or sender
-- name, so the teacher's Reports tab (which looked for a title) skipped them. This fills them in, and the teacher's
-- list and counts now also take any report that names a material. Apply after 20261118. Safe to run again.

-- the material's title and the sender's name, where they're missing
update public.classroom_reports r set material_title = left(m.title, 120)
from public.classroom_materials m
where r.material_id = m.id and r.material_title = '';

update public.classroom_reports r set reporter_name = left(coalesce(u.raw_user_meta_data ->> 'name', ''), 60)
from auth.users u
where r.reporter = u.id and r.reporter_name = '';

-- a material report: it names a material, or did (its title is kept when the material is deleted)
create or replace function public.classroom_reports_for(cid uuid)
returns table (id uuid, material_id uuid, material_title text, reason text, status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.material_id, r.material_title, r.reason, r.status, r.created_at
  from public.classroom_reports r
  where r.classroom_id = cid and (r.material_id is not null or r.material_title <> '') and public.is_classroom_owner(cid)
  order by (r.status = 'open') desc, r.created_at desc
  limit 200;
$$;

create or replace function public.resolve_classroom_report(rid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.classroom_reports r set status = 'resolved', resolved_at = now()
  where r.id = rid and (public.is_report_admin()
    or ((r.material_id is not null or r.material_title <> '') and public.is_classroom_owner(r.classroom_id)));
  if not found then raise exception 'not_allowed' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.my_classrooms()
returns table (id uuid, name text, subject text, teacher_name text, role text, status text, join_code text,
  students int, pending int, materials int, latest timestamptz, created_at timestamptz, reports int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.subject, c.teacher_name,
    case when c.owner = auth.uid() then 'teacher' else 'student' end,
    case when c.owner = auth.uid() then 'approved' else m.status end,
    case when c.owner = auth.uid() then c.join_code end,
    case when c.owner = auth.uid() then (select count(*)::int from public.classroom_members x where x.classroom_id = c.id and x.status = 'approved') end,
    case when c.owner = auth.uid() then (select count(*)::int from public.classroom_members x where x.classroom_id = c.id and x.status = 'pending') end,
    case when c.owner = auth.uid() or m.status = 'approved' then (select count(*)::int from public.classroom_materials x where x.classroom_id = c.id) end,
    case when c.owner = auth.uid() or m.status = 'approved' then (select max(x.created_at) from public.classroom_materials x where x.classroom_id = c.id) end,
    c.created_at,
    case when c.owner = auth.uid() then (select count(*)::int from public.classroom_reports x
      where x.classroom_id = c.id and (x.material_id is not null or x.material_title <> '') and x.status = 'open') end
  from public.classrooms c
  left join public.classroom_members m on m.classroom_id = c.id and m.user_id = auth.uid()
  where c.owner = auth.uid() or m.user_id is not null
  order by c.created_at desc;
$$;

revoke all on function public.classroom_reports_for(uuid), public.resolve_classroom_report(uuid), public.my_classrooms() from public, anon;
grant execute on function public.classroom_reports_for(uuid), public.resolve_classroom_report(uuid), public.my_classrooms() to authenticated;
