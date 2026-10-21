-- MK Gaming: perfis, horas jogadas e amizades
-- Execute este arquivo no Supabase Dashboard > SQL Editor > New query.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Jogador MK' check (char_length(display_name) between 2 and 32),
  bio text not null default '' check (char_length(bio) <= 280),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_hours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_name text not null check (char_length(game_name) between 1 and 80),
  hours_played numeric(9,1) not null default 0 check (hours_played >= 0 and hours_played <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_name)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists profiles_display_name_search_idx on public.profiles using btree (lower(display_name));
create index if not exists game_hours_user_idx on public.game_hours (user_id);
create index if not exists friendships_addressee_status_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_status_idx on public.friendships (requester_id, status);

alter table public.profiles enable row level security;
alter table public.game_hours enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;

-- Profiles: users may read public profiles or their own private profile; edits only own.
drop policy if exists "profiles select public or own" on public.profiles;
create policy "profiles select public or own" on public.profiles for select to authenticated
using (is_public = true or id = (select auth.uid()));
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert to authenticated
with check (id = (select auth.uid()));
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Game hours are editable only by their owner; public profiles' hours can be read by signed-in users.
drop policy if exists "game hours read public or own" on public.game_hours;
create policy "game hours read public or own" on public.game_hours for select to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = user_id and p.is_public = true));
drop policy if exists "game hours insert own" on public.game_hours;
create policy "game hours insert own" on public.game_hours for insert to authenticated
with check (user_id = (select auth.uid()));
drop policy if exists "game hours update own" on public.game_hours;
create policy "game hours update own" on public.game_hours for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "game hours delete own" on public.game_hours;
create policy "game hours delete own" on public.game_hours for delete to authenticated
using (user_id = (select auth.uid()));

-- Friendship rows are visible only to participants; receiver accepts by updating pending -> accepted.
drop policy if exists "friendships select participant" on public.friendships;
create policy "friendships select participant" on public.friendships for select to authenticated
using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
drop policy if exists "friendships request as self" on public.friendships;
create policy "friendships request as self" on public.friendships for insert to authenticated
with check (requester_id = (select auth.uid()) and requester_id <> addressee_id and status = 'pending'
  and not exists (select 1 from public.user_blocks b where (b.blocker_id = requester_id and b.blocked_id = addressee_id) or (b.blocker_id = addressee_id and b.blocked_id = requester_id)));
drop policy if exists "friendships recipient accepts" on public.friendships;
create policy "friendships recipient accepts" on public.friendships for update to authenticated
using (addressee_id = (select auth.uid()) and status = 'pending')
with check (addressee_id = (select auth.uid()) and status = 'accepted');
drop policy if exists "friendships participants delete" on public.friendships;
create policy "friendships participants delete" on public.friendships for delete to authenticated
using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

-- Blocks are private to the user who created them.
drop policy if exists "blocks read own" on public.user_blocks;
create policy "blocks read own" on public.user_blocks for select to authenticated using (blocker_id = (select auth.uid()));
drop policy if exists "blocks insert own" on public.user_blocks;
create policy "blocks insert own" on public.user_blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
drop policy if exists "blocks delete own" on public.user_blocks;
create policy "blocks delete own" on public.user_blocks for delete to authenticated using (blocker_id = (select auth.uid()));

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.game_hours to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

-- Create a profile row automatically when Supabase Auth creates a user.
create or replace function public.mk_create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'global_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 'Jogador MK'))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists mk_auth_user_profile on auth.users;
create trigger mk_auth_user_profile after insert on auth.users for each row execute procedure public.mk_create_profile_for_new_user();


-- Extensões para perfil padrão (avatar) e contador automático de sessões iniciadas no site.
alter table public.profiles add column if not exists avatar_url text;
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_name text not null check (char_length(game_name) between 1 and 80),
  started_at timestamptz not null default now(),
  last_heartbeat timestamptz not null default now(),
  ended_at timestamptz,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists game_sessions_user_active_idx on public.game_sessions(user_id, is_active);
alter table public.game_sessions enable row level security;
drop policy if exists "game sessions read own" on public.game_sessions;
create policy "game sessions read own" on public.game_sessions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "game sessions insert own" on public.game_sessions;
create policy "game sessions insert own" on public.game_sessions for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "game sessions update own" on public.game_sessions;
create policy "game sessions update own" on public.game_sessions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.game_sessions to authenticated;

-- Public bucket for avatars. Uploads are restricted to a folder named with the authenticated user's UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 3145728, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/png','image/jpeg','image/webp'];
drop policy if exists "Avatar images are public" on storage.objects;
create policy "Avatar images are public" on storage.objects for select using (bucket_id = 'profile-avatars');
drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects for insert to authenticated with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects for update to authenticated using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
