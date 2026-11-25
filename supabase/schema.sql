-- Haushalt-App: Datenbankschema für Supabase.
-- Im Supabase-Dashboard unter "SQL Editor" einmal komplett ausführen.

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 12)),
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  ics_url text,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  title text not null,
  assignee_id uuid references members on delete set null,
  interval_days int,
  due_date date not null,
  effort int not null default 2,
  created_at timestamptz not null default now()
);

create table completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  task_id uuid,
  title text not null,
  member_id uuid not null references members on delete cascade,
  effort int not null default 2,
  created_at timestamptz not null default now()
);

create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  name text not null,
  checked boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table dishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  name text not null,
  ingredients text not null default '',
  servings int not null default 2,
  minutes int,
  effort int,
  kcal int,
  protein int,
  carbs int,
  fat int,
  last_cooked date,
  created_at timestamptz not null default now()
);

create table capacity (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  member_id uuid not null references members on delete cascade,
  day date not null,
  level int not null,
  created_at timestamptz not null default now(),
  unique (member_id, day)
);

-- Zugriff: jede:r sieht nur Daten des eigenen Haushalts.
create function my_households() returns setof uuid
language sql security definer stable set search_path = public as $$
  select household_id from members where user_id = auth.uid()
$$;

alter table households enable row level security;
alter table members enable row level security;

create policy households_select on households for select using (id in (select my_households()));
create policy households_update on households for update using (id in (select my_households()));
create policy members_select on members for select using (household_id in (select my_households()));
create policy members_update on members for update using (user_id = auth.uid()) with check (user_id = auth.uid() and household_id in (select my_households()));

do $$
declare t text;
begin
  foreach t in array array['tasks', 'completions', 'shopping_items', 'dishes', 'capacity'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (household_id in (select my_households())) with check (household_id in (select my_households()))',
      t || '_all', t);
  end loop;
end $$;

-- Haushalt anlegen bzw. per Einladungscode beitreten.
create function create_household(household_name text, member_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  insert into households (name) values (household_name) returning id into hid;
  insert into members (household_id, user_id, name) values (hid, auth.uid(), member_name);
  return hid;
end $$;

create function join_household(code text, member_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select id into hid from households where invite_code = upper(trim(code));
  if hid is null then raise exception 'Einladungscode nicht gefunden'; end if;
  insert into members (household_id, user_id, name) values (hid, auth.uid(), member_name);
  return hid;
end $$;

revoke execute on function create_household(text, text), join_household(text, text) from public, anon;
grant execute on function create_household(text, text), join_household(text, text) to authenticated;

-- Live-Synchronisation zwischen den Geräten.
alter publication supabase_realtime add table members, tasks, completions, shopping_items, dishes, capacity;
