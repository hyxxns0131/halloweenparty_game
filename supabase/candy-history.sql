begin;

-- 앞으로 실제 이동한 사탕만 기록. 기존 데이터는 변경하거나 가져오지 않는다.
create table if not exists public.candy_transfers (
  id bigserial primary key,
  from_entry uuid not null,
  to_entry uuid not null,
  from_hash text not null,
  to_hash text not null,
  from_author text not null,
  to_author text not null,
  created_at timestamptz not null default now()
);
create index if not exists candy_transfers_from_idx on public.candy_transfers(from_hash, id desc);
create index if not exists candy_transfers_to_idx on public.candy_transfers(to_hash, id desc);
alter table public.candy_transfers enable row level security;
revoke all on public.candy_transfers from anon, authenticated;

create or replace function public.my_candy_history(p_client uuid, p_before bigint default null)
returns table(id bigint, direction text, other_author text, created_at timestamptz)
language sql security definer set search_path = public, extensions
as $$
  select t.id, case when t.to_hash = axp_hash(p_client) then 'gained' else 'lost' end,
    case when t.to_hash = axp_hash(p_client) then t.from_author else t.to_author end,
    t.created_at
  from candy_transfers t
  where (t.from_hash = axp_hash(p_client) or t.to_hash = axp_hash(p_client))
    and (p_before is null or t.id < p_before)
  order by t.id desc limit 100
$$;
revoke execute on function public.my_candy_history(uuid, bigint) from public;
grant execute on function public.my_candy_history(uuid, bigint) to anon, authenticated;

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
    insert into candy_transfers(from_entry, to_entry, from_hash, to_hash, from_author, to_author)
      select f.id, t.id, f.owner_hash, t.owner_hash, f.author, t.author
      from entries f cross join entries t where f.id = v_other_id and t.id = v_mine;
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
    insert into candy_transfers(from_entry, to_entry, from_hash, to_hash, from_author, to_author)
      select f.id, t.id, f.owner_hash, t.owner_hash, f.author, t.author
      from entries f cross join entries t where f.id = v_mine and t.id = v_other_id;
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
    insert into candy_transfers(from_entry, to_entry, from_hash, to_hash, from_author, to_author)
      select f.id, t.id, f.owner_hash, t.owner_hash, f.author, t.author
      from entries f cross join entries t where f.id = p_target and t.id = v_mine;
  else
    insert into candy_log (kind, actor_hash, from_entry, to_entry) values ('lose', h, v_mine, p_target);
    if v_mine_likes <= 0 then return json_build_object('moved', false, 'other_id', p_target, 'other_author', v_target_author); end if;
    update entries set likes = likes - 1 where id = v_mine;
    update entries set likes = likes + 1 where id = p_target;
    insert into candy_transfers(from_entry, to_entry, from_hash, to_hash, from_author, to_author)
      select f.id, t.id, f.owner_hash, t.owner_hash, f.author, t.author
      from entries f cross join entries t where f.id = v_mine and t.id = p_target;
  end if;

  return json_build_object('moved', true, 'other_id', p_target, 'other_author', v_target_author);
end $$;


commit;
