-- Study Planner: a welcome email for each new account.
-- When an account is ready (signed up with "Confirm email" off, or its email just confirmed), the database calls
-- the welcome-email Edge Function with the user's id; the function sends the email through Gmail, once.
-- Apply after deploying the function (see docs/welcome-email.md): SQL Editor -> paste -> Run.

-- pg_net makes HTTP calls from the database (in the background, without slowing the sign-up)
create extension if not exists pg_net with schema extensions;

create or replace function public.welcome_new_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.email_confirmed_at is not null)
     or (tg_op = 'UPDATE' and old.email_confirmed_at is null and new.email_confirmed_at is not null) then
    perform net.http_post(
      url := 'https://xlqnkglftspdowyucioc.supabase.co/functions/v1/welcome-email',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('user_id', new.id)
    );
  end if;
  return new;
exception when others then
  -- a problem with the email must never stop an account being created
  raise warning 'welcome email not queued: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists welcome_new_account on auth.users;
create trigger welcome_new_account
after insert or update of email_confirmed_at on auth.users
for each row execute function public.welcome_new_account();
