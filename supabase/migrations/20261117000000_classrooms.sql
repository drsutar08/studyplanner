-- Study Planner: classrooms. A teacher shares study materials (files, links, notes) with their own students only.
--   - Anyone can make a classroom. Students join with its 8-letter code, which sends a request; the teacher approves
--     (or declines) each one. Only approved students can see the classroom's materials and files.
--   - Students never see each other: the teacher sees the students' names, students see the teacher's name.
--   - Files are in the private "materials" bucket at materials/<classroom id>/<file>, opened through signed links.
--   - Limits (plan_limit): Free teachers 1 classroom and 200 MB of files, Premium 10 and 5 GB (Premium's while the
--     Free limits switch is off). At most 300 students per classroom, 500 materials, 20 MB per file.
-- Apply after 20261116000000_app_update.sql: SQL Editor -> paste -> Run. Safe to run again.

-- ---------- limits ----------
create or replace function public.plan_limit(uid uuid, what text)
returns int language sql stable security definer set search_path = '' as $$
  select case
    when what = 'ai' then case when public.is_premium(uid) then 30 else 0 end
    when not public.limits_on() or public.is_premium(uid) then
      case what when 'cards' then 1000000 when 'photos' then 2000 when 'groups' then 10
        when 'classrooms' then 10 when 'storage_mb' then 5120 end
    else
      case what when 'cards' then 200 when 'photos' then 50 when 'groups' then 1
        when 'classrooms' then 1 when 'storage_mb' then 200 end
  end;
$$;
revoke all on function public.plan_limit(uuid, text) from public, anon;

-- ---------- join codes: 8 letters and digits that can't be misread (no 0/O, 1/I/L) ----------
create or replace function public.new_classroom_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.classrooms c where c.join_code = code);
  end loop;
  return code;
end;
$$;

-- ---------- tables ----------
create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  subject text not null default '' check (char_length(subject) <= 60),
  teacher_name text not null default '' check (char_length(teacher_name) <= 60),
  join_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists classrooms_owner on public.classrooms (owner);

create table if not exists public.classroom_members (
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_name text not null default '' check (char_length(student_name) <= 60),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  primary key (classroom_id, user_id)
);
create index if not exists classroom_members_user on public.classroom_members (user_id);

create table if not exists public.classroom_materials (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  kind text not null check (kind in ('file', 'link', 'note')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  url text check (url is null or (char_length(url) <= 2000 and url ~* '^https?://')),
  file_path text check (file_path is null or char_length(file_path) <= 300),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  mime_type text check (mime_type is null or char_length(mime_type) <= 150),
  size bigint not null default 0 check (size >= 0),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classroom_materials_file check (kind <> 'file' or (file_path is not null and size > 0)),
  constraint classroom_materials_link check (kind <> 'link' or url is not null),
  constraint classroom_materials_note check (kind <> 'note' or char_length(body) > 0)
);
create index if not exists classroom_materials_classroom on public.classroom_materials (classroom_id, created_at desc);

create table if not exists public.classroom_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  material_id uuid references public.classroom_materials (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

-- ---------- who is who (checked without the policies calling each other) ----------
create or replace function public.is_classroom_owner(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classrooms c where c.id = cid and c.owner = auth.uid());
$$;
create or replace function public.is_classroom_student(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classroom_members m where m.classroom_id = cid and m.user_id = auth.uid() and m.status = 'approved');
$$;
-- the same from a Storage folder name (any text: never fails on a name that isn't an id)
create or replace function public.classroom_folder_owner(folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classrooms c where c.id::text = folder and c.owner = auth.uid());
$$;
create or replace function public.classroom_folder_reader(folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.classrooms c where c.id::text = folder and (c.owner = auth.uid()
      or exists (select 1 from public.classroom_members m where m.classroom_id = c.id and m.user_id = auth.uid() and m.status = 'approved'))
  );
$$;
-- bytes of files a teacher has in the bucket (all their classrooms)
create or replace function public.classroom_bytes_used(uid uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'materials' and (storage.foldername(o.name))[1] in (select c.id::text from public.classrooms c where c.owner = uid);
$$;
create or replace function public.classroom_storage_ok(folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.classroom_folder_owner(folder)
    and public.classroom_bytes_used(auth.uid()) < public.plan_limit(auth.uid(), 'storage_mb')::bigint * 1048576;
$$;

-- ---------- triggers: the server fills in who, when and the code; limits ----------
create or replace function public.classrooms_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.owner := auth.uid();
    new.teacher_name := left(coalesce(auth.jwt() -> 'user_metadata' ->> 'name', ''), 60);
    new.join_code := public.new_classroom_code();
    new.created_at := now();
    if (select count(*) from public.classrooms c where c.owner = new.owner) >= public.plan_limit(new.owner, 'classrooms') then
      raise exception 'classroom_limit' using errcode = 'P0001', hint = 'The plan''s classroom limit is reached';
    end if;
  else
    new.owner := old.owner;
    new.created_at := old.created_at;
    if new.join_code is distinct from old.join_code and current_setting('studyplanner.reset_code', true) is distinct from 'on' then
      new.join_code := old.join_code;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists classrooms_fill on public.classrooms;
create trigger classrooms_fill before insert or update on public.classrooms for each row execute function public.classrooms_fill();

create or replace function public.classroom_members_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- only the status changes after a request; approving stamps the time
  new.classroom_id := old.classroom_id;
  new.user_id := old.user_id;
  new.student_name := old.student_name;
  new.requested_at := old.requested_at;
  new.approved_at := case when new.status = 'approved' then coalesce(old.approved_at, now()) else null end;
  return new;
end;
$$;
drop trigger if exists classroom_members_fill on public.classroom_members;
create trigger classroom_members_fill before update on public.classroom_members for each row execute function public.classroom_members_fill();

create or replace function public.classroom_materials_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_classroom_owner(new.classroom_id) then
      raise exception 'not_teacher' using errcode = 'P0001';
    end if;
    if new.kind = 'file' then
      if new.file_path is null or split_part(new.file_path, '/', 1) <> new.classroom_id::text then
        raise exception 'bad_file' using errcode = 'P0001';
      end if;
    else
      new.file_path := null;
      new.file_name := null;
      new.mime_type := null;
      new.size := 0;
    end if;
    if (select count(*) from public.classroom_materials m where m.classroom_id = new.classroom_id) >= 500 then
      raise exception 'materials_full' using errcode = 'P0001', hint = 'At most 500 materials per classroom';
    end if;
    new.created_at := now();
  else
    new.classroom_id := old.classroom_id;
    new.kind := old.kind;
    new.file_path := old.file_path;
    new.file_name := old.file_name;
    new.mime_type := old.mime_type;
    new.size := old.size;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists classroom_materials_fill on public.classroom_materials;
create trigger classroom_materials_fill before insert or update on public.classroom_materials for each row execute function public.classroom_materials_fill();

-- ---------- row level security ----------
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.classroom_materials enable row level security;
alter table public.classroom_reports enable row level security;

-- classrooms: the teacher only (students read theirs through my_classrooms(), which leaves out the code)
drop policy if exists "classrooms: owner" on public.classrooms;
create policy "classrooms: owner" on public.classrooms for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

-- members: a student sees their own row; the teacher sees, approves and removes their students
drop policy if exists "classroom members: read" on public.classroom_members;
create policy "classroom members: read" on public.classroom_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_classroom_owner(classroom_id));
drop policy if exists "classroom members: approve" on public.classroom_members;
create policy "classroom members: approve" on public.classroom_members for update to authenticated
  using (public.is_classroom_owner(classroom_id)) with check (public.is_classroom_owner(classroom_id));
drop policy if exists "classroom members: leave or remove" on public.classroom_members;
create policy "classroom members: leave or remove" on public.classroom_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_classroom_owner(classroom_id));

-- materials: the teacher writes; approved students read
drop policy if exists "materials: teacher" on public.classroom_materials;
create policy "materials: teacher" on public.classroom_materials for all to authenticated
  using (public.is_classroom_owner(classroom_id)) with check (public.is_classroom_owner(classroom_id));
drop policy if exists "materials: students read" on public.classroom_materials;
create policy "materials: students read" on public.classroom_materials for select to authenticated
  using (public.is_classroom_student(classroom_id));

-- reports: anyone in the classroom can send one; nobody reads them through the app
drop policy if exists "classroom reports: send" on public.classroom_reports;
create policy "classroom reports: send" on public.classroom_reports for insert to authenticated
  with check (reporter = (select auth.uid()) and (public.is_classroom_student(classroom_id) or public.is_classroom_owner(classroom_id)));

revoke all on public.classrooms, public.classroom_members, public.classroom_materials, public.classroom_reports from anon, authenticated;
grant select, insert, delete on public.classrooms to authenticated;
grant update (name, subject) on public.classrooms to authenticated;
grant select, delete on public.classroom_members to authenticated;
grant update (status) on public.classroom_members to authenticated;
grant select, insert, delete on public.classroom_materials to authenticated;
grant update (title, body, url, pinned) on public.classroom_materials to authenticated;
grant insert on public.classroom_reports to authenticated;

-- ---------- functions the app calls ----------
-- Every classroom the caller teaches or has asked to join, newest first. The code only for the teacher.
create or replace function public.my_classrooms()
returns table (id uuid, name text, subject text, teacher_name text, role text, status text, join_code text,
  students int, pending int, materials int, latest timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.subject, c.teacher_name,
    case when c.owner = auth.uid() then 'teacher' else 'student' end,
    case when c.owner = auth.uid() then 'approved' else m.status end,
    case when c.owner = auth.uid() then c.join_code end,
    case when c.owner = auth.uid() then (select count(*)::int from public.classroom_members x where x.classroom_id = c.id and x.status = 'approved') end,
    case when c.owner = auth.uid() then (select count(*)::int from public.classroom_members x where x.classroom_id = c.id and x.status = 'pending') end,
    case when c.owner = auth.uid() or m.status = 'approved' then (select count(*)::int from public.classroom_materials x where x.classroom_id = c.id) end,
    case when c.owner = auth.uid() or m.status = 'approved' then (select max(x.created_at) from public.classroom_materials x where x.classroom_id = c.id) end,
    c.created_at
  from public.classrooms c
  left join public.classroom_members m on m.classroom_id = c.id and m.user_id = auth.uid()
  where c.owner = auth.uid() or m.user_id is not null
  order by c.created_at desc;
$$;

-- Ask to join with a code. Returns the classroom (and 'pending' or 'approved'); nothing when the code is wrong.
create or replace function public.join_classroom(code text)
returns table (id uuid, name text, subject text, teacher_name text, status text)
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  clean text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select c.id into cid from public.classrooms c where c.join_code = clean;
  if cid is null then return; end if;
  if exists (select 1 from public.classrooms c where c.id = cid and c.owner = auth.uid()) then
    raise exception 'own_classroom' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.classroom_members m where m.classroom_id = cid and m.user_id = auth.uid())
     and (select count(*) from public.classroom_members m where m.classroom_id = cid) >= 300 then
    raise exception 'classroom_full' using errcode = 'P0001', hint = 'At most 300 students per classroom';
  end if;
  insert into public.classroom_members (classroom_id, user_id, student_name)
  values (cid, auth.uid(), left(coalesce(auth.jwt() -> 'user_metadata' ->> 'name', ''), 60))
  on conflict do nothing;
  return query select c.id, c.name, c.subject, c.teacher_name, m.status
    from public.classrooms c join public.classroom_members m on m.classroom_id = c.id and m.user_id = auth.uid()
    where c.id = cid;
end;
$$;

-- A new code for a classroom (the old one stops working; students already in stay in). Teacher only.
create or replace function public.reset_classroom_code(cid uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not public.is_classroom_owner(cid) then raise exception 'not_teacher' using errcode = 'P0001'; end if;
  code := public.new_classroom_code();
  perform set_config('studyplanner.reset_code', 'on', true);
  update public.classrooms set join_code = code where id = cid;
  perform set_config('studyplanner.reset_code', 'off', true);
  return code;
end;
$$;

-- How much a teacher may still make: { classrooms, classrooms_limit, bytes, bytes_limit }
create or replace function public.classroom_quota()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'classrooms', (select count(*) from public.classrooms c where c.owner = auth.uid()),
    'classrooms_limit', public.plan_limit(auth.uid(), 'classrooms'),
    'bytes', public.classroom_bytes_used(auth.uid()),
    'bytes_limit', public.plan_limit(auth.uid(), 'storage_mb')::bigint * 1048576
  );
$$;

revoke all on function public.new_classroom_code(), public.is_classroom_owner(uuid), public.is_classroom_student(uuid),
  public.classroom_folder_owner(text), public.classroom_folder_reader(text), public.classroom_bytes_used(uuid),
  public.classroom_storage_ok(text), public.my_classrooms(), public.join_classroom(text),
  public.reset_classroom_code(uuid), public.classroom_quota() from public, anon;
revoke all on function public.new_classroom_code(), public.classroom_bytes_used(uuid) from authenticated;
grant execute on function public.is_classroom_owner(uuid), public.is_classroom_student(uuid),
  public.classroom_folder_owner(text), public.classroom_folder_reader(text), public.classroom_storage_ok(text),
  public.my_classrooms(), public.join_classroom(text), public.reset_classroom_code(uuid), public.classroom_quota()
  to authenticated;

-- ---------- files: the private "materials" bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materials', 'materials', false, 20971520, array[
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "materials: read" on storage.objects;
create policy "materials: read" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and public.classroom_folder_reader((storage.foldername(name))[1]));
drop policy if exists "materials: upload" on storage.objects;
create policy "materials: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and public.classroom_storage_ok((storage.foldername(name))[1]));
drop policy if exists "materials: remove" on storage.objects;
create policy "materials: remove" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and public.classroom_folder_owner((storage.foldername(name))[1]));

-- ---------- live updates (they follow the policies above) ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'classroom_materials') then
    alter publication supabase_realtime add table public.classroom_materials;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'classroom_members') then
    alter publication supabase_realtime add table public.classroom_members;
  end if;
end;
$$;
alter table public.classroom_materials replica identity full;
alter table public.classroom_members replica identity full;
