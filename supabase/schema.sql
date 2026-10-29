-- =========================================================
-- AX Pumpkin Studio — Supabase 스키마
--   Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (여러 번 실행해도 안전)
--
-- 로그인 없이 쓰는 구조
--   · 각 브라우저가 처음 접속할 때 무작위 UUID(client id)를 만들어 보관한다.
--   · 테이블에는 그 id 의 SHA-256 해시만 저장(owner_hash 등) → 공개돼도 다른 사람 행세 불가
--   · 테이블은 누구나 읽기만 가능(RLS). 쓰기는 아래 함수(RPC)로만 하고,
--     함수가 원래 client id 를 받아 해시를 비교해 '내 작품 / 내 투표 / 내 댓글'을 확인한다.
--
-- 테이블
--   entries   출품작 (1인 1작품, 다시 출품하면 교체 · 사탕 수 likes)
--   votes     사탕 던지기 (1인 1표)
--   comments  출품작 댓글
--   candy_log 사탕 뺏기 기록 (쿨다운 판정용, 비공개)
-- 이미지: Storage 버킷 `pumpkins` (공개 읽기, jpg 1MB 이하 업로드)
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.axp_hash(p_client uuid)
returns text
language sql
immutable
set search_path = public, extensions
as $$ select encode(extensions.digest(p_client::text, 'sha256'), 'hex') $$;

-- ---------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  owner_hash  text not null unique,
  author      text not null check (char_length(author) between 1 and 20),
  title       text not null default '나의 할로윈 호박' check (char_length(title) between 1 and 30),
  image_path  text not null check (char_length(image_path) <= 200),
  likes       integer not null default 0 check (likes >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.votes (
  voter_hash  text primary key,
  entry_id    uuid not null references public.entries(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.entries(id) on delete cascade,
  owner_hash  text not null,
  author      text not null check (char_length(author) between 1 and 12),
  body        text not null check (char_length(body) between 1 and 100),
  created_at  timestamptz not null default now()
);
create index if not exists comments_entry_idx on public.comments (entry_id, created_at);

create table if not exists public.candy_log (
  id          bigserial primary key,
  kind        text not null check (kind in ('steal', 'lose')),
  actor_hash  text not null,
  from_entry  uuid,
  to_entry    uuid,
  created_at  timestamptz not null default now()
);
create index if not exists candy_log_actor_idx on public.candy_log (actor_hash, created_at desc);

-- ---------------------------------------------------------
-- 보안: 누구나 읽기만, 직접 쓰기는 금지 (candy_log 는 읽기도 금지)
-- ---------------------------------------------------------
alter table public.entries   enable row level security;
alter table public.votes     enable row level security;
alter table public.comments  enable row level security;
alter table public.candy_log enable row level security;

drop policy if exists "public read entries"  on public.entries;
drop policy if exists "public read votes"    on public.votes;
drop policy if exists "public read comments" on public.comments;
create policy "public read entries"  on public.entries  for select to anon, authenticated using (true);
create policy "public read votes"    on public.votes    for select to anon, authenticated using (true);
create policy "public read comments" on public.comments for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.entries, public.votes, public.comments to anon, authenticated;
revoke insert, update, delete, truncate on public.entries, public.votes, public.comments, public.candy_log from anon, authenticated;
revoke select on public.candy_log from anon, authenticated;

-- ---------------------------------------------------------
-- 쓰기 함수 (RPC)
-- ---------------------------------------------------------

-- 출품 / 내 작품 교체 (받은 사탕은 유지)
create or replace function public.submit_entry(p_client uuid, p_author text, p_title text, p_image_path text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text := axp_hash(p_client);
  v_id uuid;
  v_updated boolean := false;
begin
  p_author := left(btrim(coalesce(p_author, '')), 20);
  p_title  := left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), '나의 할로윈 호박'), 30);
  if p_author = '' then raise exception '만든 사람(닉네임)을 입력해주세요.'; end if;
  if p_image_path is null or p_image_path !~ ('^' || h || '/[0-9]+\.jpg$') then
    raise exception '이미지 경로가 올바르지 않아요.';
  end if;

  update entries set author = p_author, title = p_title, image_path = p_image_path, updated_at = now()
   where owner_hash = h
   returning id into v_id;
  if found then
    v_updated := true;
  else
    insert into entries (owner_hash, author, title, image_path)
    values (h, p_author, p_title, p_image_path)
    returning id into v_id;
  end if;
  return json_build_object('id', v_id, 'updated', v_updated);
end $$;

-- 사탕 던지기: 같은 작품 다시 누르면 취소, 다른 작품이면 옮기기 (1인 1표)
create or replace function public.cast_vote(p_client uuid, p_entry uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text := axp_hash(p_client);
  v_prev uuid;
begin
  perform 1 from entries where id = p_entry;
  if not found then raise exception '작품을 찾을 수 없어요.'; end if;

  select entry_id into v_prev from votes where voter_hash = h for update;

  if v_prev = p_entry then
    delete from votes where voter_hash = h;
    update entries set likes = greatest(likes - 1, 0) where id = p_entry;
    return 'cancel';
  end if;

  if v_prev is not null then
    update entries set likes = greatest(likes - 1, 0) where id = v_prev;
    update votes set entry_id = p_entry, created_at = now() where voter_hash = h;
    update entries set likes = likes + 1 where id = p_entry;
    return 'move';
  end if;

  insert into votes (voter_hash, entry_id) values (h, p_entry);
  update entries set likes = likes + 1 where id = p_entry;
  return 'vote';
end $$;

-- 사탕 뺏기 결과 반영: 이기면 사탕 가진 다른 참가자 랜덤 1명에게서 1개, 지면 내 1개를 랜덤 참가자에게
create or replace function public.candy_game(p_client uuid, p_win boolean)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text := axp_hash(p_client);
  v_mine uuid;
  v_mine_likes integer;
  v_other_id uuid;
  v_other_author text;
begin
  select id, likes into v_mine, v_mine_likes from entries where owner_hash = h for update;
  if v_mine is null then raise exception '먼저 내 호박을 출품해야 사탕 뺏기에 참여할 수 있어요!'; end if;

  if exists (select 1 from candy_log where actor_hash = h and created_at > now() - interval '12 seconds') then
    raise exception '조금만 쉬었다가 다시 도전해주세요!';
  end if;

  if p_win then
    select id, author into v_other_id, v_other_author
      from entries where id <> v_mine and likes > 0
     order by random() limit 1
       for update skip locked;
    insert into candy_log (kind, actor_hash, from_entry, to_entry) values ('steal', h, v_other_id, v_mine);
    if v_other_id is null then return json_build_object('moved', false); end if;
    update entries set likes = likes - 1 where id = v_other_id;
    update entries set likes = likes + 1 where id = v_mine;
  else
    if v_mine_likes > 0 then
      select id, author into v_other_id, v_other_author
        from entries where id <> v_mine
       order by random() limit 1
         for update skip locked;
    end if;
    insert into candy_log (kind, actor_hash, from_entry, to_entry) values ('lose', h, v_mine, v_other_id);
    if v_other_id is null then return json_build_object('moved', false); end if;
    update entries set likes = likes - 1 where id = v_mine;
    update entries set likes = likes + 1 where id = v_other_id;
  end if;

  return json_build_object('moved', true, 'other_id', v_other_id, 'other_author', v_other_author);
end $$;

-- 사탕 뺏기 · 호박 줄다리기 (1:1 대결) — 이기면 상대에게서 1개, 지면 상대에게 1개
create or replace function public.candy_duel(p_client uuid, p_target uuid, p_win boolean)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text := axp_hash(p_client);
  v_mine uuid;
  v_mine_likes integer;
  v_target_likes integer;
  v_target_author text;
begin
  select id, likes into v_mine, v_mine_likes from entries where owner_hash = h for update;
  if v_mine is null then raise exception '먼저 내 호박을 출품해야 사탕 뺏기에 참여할 수 있어요!'; end if;
  if p_target = v_mine then raise exception '나 자신과는 대결할 수 없어요!'; end if;

  if exists (select 1 from candy_log where actor_hash = h and created_at > now() - interval '12 seconds') then
    raise exception '조금만 쉬었다가 다시 도전해주세요!';
  end if;

  select likes, author into v_target_likes, v_target_author from entries where id = p_target for update;
  if v_target_author is null then raise exception '대결 상대를 찾을 수 없어요.'; end if;

  if p_win then
    insert into candy_log (kind, actor_hash, from_entry, to_entry) values ('steal', h, p_target, v_mine);
    if v_target_likes <= 0 then return json_build_object('moved', false, 'other_id', p_target, 'other_author', v_target_author); end if;
    update entries set likes = likes - 1 where id = p_target;
    update entries set likes = likes + 1 where id = v_mine;
  else
    insert into candy_log (kind, actor_hash, from_entry, to_entry) values ('lose', h, v_mine, p_target);
    if v_mine_likes <= 0 then return json_build_object('moved', false, 'other_id', p_target, 'other_author', v_target_author); end if;
    update entries set likes = likes - 1 where id = v_mine;
    update entries set likes = likes + 1 where id = p_target;
  end if;

  return json_build_object('moved', true, 'other_id', p_target, 'other_author', v_target_author);
end $$;

-- 댓글 쓰기
create or replace function public.add_comment(p_client uuid, p_entry uuid, p_author text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  p_author := left(btrim(coalesce(p_author, '')), 12);
  p_body   := left(btrim(coalesce(p_body, '')), 100);
  if p_author = '' then raise exception '닉네임을 입력해주세요.'; end if;
  if p_body = '' then raise exception '댓글 내용을 입력해주세요.'; end if;
  perform 1 from entries where id = p_entry;
  if not found then raise exception '작품을 찾을 수 없어요.'; end if;
  insert into comments (entry_id, owner_hash, author, body)
  values (p_entry, axp_hash(p_client), p_author, p_body)
  returning id into v_id;
  return v_id;
end $$;

-- 내 댓글 지우기
create or replace function public.delete_comment(p_client uuid, p_comment uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from comments where id = p_comment and owner_hash = axp_hash(p_client);
  if not found then raise exception '내가 쓴 댓글만 지울 수 있어요.'; end if;
end $$;

-- 내 작품 삭제 (투표·댓글은 함께 지워지고, 그 작품에 던진 사탕은 사라짐)
create or replace function public.delete_entry(p_client uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from entries where owner_hash = axp_hash(p_client);
  if not found then raise exception '삭제할 내 작품이 없어요.'; end if;
end $$;

revoke execute on function public.submit_entry(uuid, text, text, text) from public;
revoke execute on function public.cast_vote(uuid, uuid)                from public;
revoke execute on function public.candy_game(uuid, boolean)            from public;
revoke execute on function public.candy_duel(uuid, uuid, boolean)      from public;
revoke execute on function public.add_comment(uuid, uuid, text, text)  from public;
revoke execute on function public.delete_comment(uuid, uuid)           from public;
revoke execute on function public.delete_entry(uuid)                   from public;
grant execute on function public.submit_entry(uuid, text, text, text) to anon, authenticated;
grant execute on function public.cast_vote(uuid, uuid)                to anon, authenticated;
grant execute on function public.candy_game(uuid, boolean)            to anon, authenticated;
grant execute on function public.candy_duel(uuid, uuid, boolean)      to anon, authenticated;
grant execute on function public.add_comment(uuid, uuid, text, text)  to anon, authenticated;
grant execute on function public.delete_comment(uuid, uuid)           to anon, authenticated;
grant execute on function public.delete_entry(uuid)                   to anon, authenticated;

-- ---------------------------------------------------------
-- 실시간: 출품작·투표·댓글이 바뀌면 모든 화면에 즉시 반영
-- ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['entries', 'votes', 'comments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------
-- 이미지 저장소: 공개 읽기, jpg 1MB 이하만 업로드 (폴더 = 내 해시)
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pumpkins', 'pumpkins', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "axp upload pumpkins" on storage.objects;
create policy "axp upload pumpkins" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'pumpkins' and name ~ '^[0-9a-f]{64}/[0-9]+\.jpg$');
