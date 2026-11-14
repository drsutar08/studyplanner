-- Study Planner: classroom reports become visible.
--   - The teacher sees reports about their classroom's materials, without who sent them, and can mark them resolved.
--   - Studyly admins (emails in app_config.report_admins) see every report, with the reporter's name, and can resolve
--     them, remove a material or delete a classroom.
--   - my_classrooms() also returns how many open reports a teacher has.
-- Apply after 20261117000000_classrooms.sql: SQL Editor -> paste -> Run. Safe to run again.
--
-- Add another admin:
--   update public.app_config set value = value || '["someone@example.com"]'::jsonb where key = 'report_admins';

insert into public.app_config (key, value) values ('report_admins', '["drsutar08@gmail.com"]'::jsonb) on conflict (key) do nothing;

alter table public.classroom_reports add column if not exists material_title text not null default '' check (char_length(material_title) <= 120);
alter table public.classroom_reports add column if not exists reporter_name text not null default '' check (char_length(reporter_name) <= 60);
alter table public.classroom_reports add column if not exists status text not null default 'open' check (status in ('open', 'resolved'));
alter table public.classroom_reports add column if not exists resolved_at timestamptz;
create index if not exists classroom_reports_classroom on public.classroom_reports (classroom_id, status);

-- the server fills in who sent it and what the material was called (kept if the material is deleted)
create or replace function public.classroom_reports_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.reporter := auth.uid();
  new.reporter_name := left(coalesce(auth.jwt() -> 'user_metadata' ->> 'name', ''), 60);
  new.status := 'open';
  new.resolved_at := null;
  new.created_at := now();
  if new.material_id is not null then
    select left(m.title, 120) into new.material_title from public.classroom_materials m
      where m.id = new.material_id and m.classroom_id = new.classroom_id;
    if new.material_title is null then raise exception 'no_material' using errcode = 'P0001'; end if;
  else
    new.material_title := '';
  end if;
  if (select count(*) from public.classroom_reports r where r.reporter = auth.uid() and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_reports' using errcode = 'P0001', hint = 'At most 20 reports a day';
  end if;
  return new;
end;
$$;
drop trigger if exists classroom_reports_fill on public.classroom_reports;
create trigger classroom_reports_fill before insert on public.classroom_reports for each row execute function public.classroom_reports_fill();

create or replace function public.is_report_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_config c
    where c.key = 'report_admins' and c.value ? lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- the teacher: reports about their materials (never who sent them) ----------
create or replace function public.classroom_reports_for(cid uuid)
returns table (id uuid, material_id uuid, material_title text, reason text, status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.material_id, r.material_title, r.reason, r.status, r.created_at
  from public.classroom_reports r
  where r.classroom_id = cid and r.material_title <> '' and public.is_classroom_owner(cid)
  order by (r.status = 'open') desc, r.created_at desc
  limit 200;
$$;

-- ---------- admins: every report ----------
create or replace function public.admin_reports()
returns table (id uuid, classroom_id uuid, classroom_name text, teacher_name text, teacher_email text,
  material_id uuid, material_title text, reason text, reporter_name text, reporter_email text,
  status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.classroom_id, c.name, c.teacher_name, tu.email::text, r.material_id, r.material_title, r.reason,
    r.reporter_name, ru.email::text, r.status, r.created_at
  from public.classroom_reports r
  join public.classrooms c on c.id = r.classroom_id
  left join auth.users tu on tu.id = c.owner
  left join auth.users ru on ru.id = r.reporter
  where public.is_report_admin()
  order by (r.status = 'open') desc, r.created_at desc
  limit 300;
$$;

-- resolve: the teacher (for a material report in their classroom) or an admin
create or replace function public.resolve_classroom_report(rid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.classroom_reports r set status = 'resolved', resolved_at = now()
  where r.id = rid and (public.is_report_admin() or (r.material_title <> '' and public.is_classroom_owner(r.classroom_id)));
  if not found then raise exception 'not_allowed' using errcode = 'P0001'; end if;
end;
$$;

-- ---------- admins can take down a material or a classroom ----------
drop policy if exists "materials: admin removes" on public.classroom_materials;
create policy "materials: admin removes" on public.classroom_materials for delete to authenticated using (public.is_report_admin());
drop policy if exists "classrooms: admin removes" on public.classrooms;
create policy "classrooms: admin removes" on public.classrooms for delete to authenticated using (public.is_report_admin());
drop policy if exists "materials: admin reads files" on storage.objects;
create policy "materials: admin reads files" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and public.is_report_admin());
drop policy if exists "materials: admin removes files" on storage.objects;
create policy "materials: admin removes files" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and public.is_report_admin());
-- an admin opens a reported file to check it
drop policy if exists "materials: admin reads" on public.classroom_materials;
create policy "materials: admin reads" on public.classroom_materials for select to authenticated using (public.is_report_admin());

-- ---------- my_classrooms(): plus open reports for the teacher ----------
drop function if exists public.my_classrooms();
create function public.my_classrooms()
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
    case when c.owner = auth.uid() then (select count(*)::int from public.classroom_reports x where x.classroom_id = c.id and x.material_title <> '' and x.status = 'open') end
  from public.classrooms c
  left join public.classroom_members m on m.classroom_id = c.id and m.user_id = auth.uid()
  where c.owner = auth.uid() or m.user_id is not null
  order by c.created_at desc;
$$;

revoke all on function public.is_report_admin(), public.classroom_reports_for(uuid), public.admin_reports(),
  public.resolve_classroom_report(uuid), public.my_classrooms() from public, anon;
grant execute on function public.is_report_admin(), public.classroom_reports_for(uuid), public.admin_reports(),
  public.resolve_classroom_report(uuid), public.my_classrooms() to authenticated;

-- deleting a material settles its reports (they stay, with the material's title, for the record)
create or replace function public.classroom_materials_settle_reports()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.classroom_reports set status = 'resolved', resolved_at = now() where material_id = old.id and status = 'open';
  return old;
end;
$$;
drop trigger if exists classroom_materials_settle_reports on public.classroom_materials;
create trigger classroom_materials_settle_reports before delete on public.classroom_materials for each row execute function public.classroom_materials_settle_reports();
