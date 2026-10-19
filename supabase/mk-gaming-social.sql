
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
