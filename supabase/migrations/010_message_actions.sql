-- JobMatch 010: Message actions (Edit, Unsend for everyone, Remove for you) for both seekers and employers.

alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists unsent_at timestamptz,
  add column if not exists hidden_by uuid[] not null default '{}';

create or replace function public.edit_message(p_msg uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.messages;
  txt text := trim(coalesce(p_body, ''));
  ts timestamptz := now();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if char_length(txt) < 1 or char_length(txt) > 2000 then
    raise exception 'message must be 1 to 2000 characters';
  end if;
  select * into m from public.messages where id = p_msg;
  if not found then raise exception 'not found'; end if;
  if m.sender_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if m.unsent_at is not null then raise exception 'cannot edit an unsent message'; end if;
  update public.messages
     set body = txt,
         edited_at = ts
   where id = p_msg;
  return jsonb_build_object('ok', true, 'id', p_msg, 'body', txt, 'edited_at', ts);
end $$;

create or replace function public.unsend_message(p_msg uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.messages;
  ts timestamptz := now();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_msg;
  if not found then raise exception 'not found'; end if;
  if m.sender_id <> uid then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.messages
     set body = 'This message was unsent',
         unsent_at = coalesce(unsent_at, ts)
   where id = p_msg;
  return jsonb_build_object('ok', true, 'id', p_msg, 'unsent_at', ts);
end $$;

create or replace function public.remove_message_for_me(p_msg uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.messages;
  c public.conversations;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into m from public.messages where id = p_msg;
  if not found then raise exception 'not found'; end if;
  select * into c from public.conversations where id = m.conversation_id and (seeker_id = uid or employer_id = uid);
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (uid = any(m.hidden_by)) then
    update public.messages
       set hidden_by = array_append(hidden_by, uid)
     where id = p_msg;
  end if;
  return jsonb_build_object('ok', true, 'id', p_msg);
end $$;

create or replace function public.my_conversations() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'job_title', j.title, 'job_id', j.id,
      'other_id', case when c.seeker_id = uid then c.employer_id else c.seeker_id end,
      'other_name', case when c.seeker_id = uid then e.name else sp.full_name end,
      'last_body', case when lm.unsent_at is not null then 'Message unsent' else lm.body end,
      'last_at', coalesce(c.last_message_at, c.created_at),
      'unread', (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> uid and m.read_at is null and not (uid = any(m.hidden_by))),
      'blocked', exists (select 1 from public.blocks b where (b.blocker_id = uid and b.blocked_id = case when c.seeker_id = uid then c.employer_id else c.seeker_id end)
                                                          or (b.blocked_id = uid and b.blocker_id = case when c.seeker_id = uid then c.employer_id else c.seeker_id end)))
      order by coalesce(c.last_message_at, c.created_at) desc)
    from public.conversations c
    join public.jobs j on j.id = c.job_id
    join public.employers e on e.user_id = c.employer_id
    join public.profiles sp on sp.id = c.seeker_id
    left join lateral (
      select m2.body, m2.unsent_at
        from public.messages m2
       where m2.conversation_id = c.id
         and not (uid = any(m2.hidden_by))
       order by m2.created_at desc
       limit 1
    ) lm on true
    where c.seeker_id = uid or c.employer_id = uid), '[]'::jsonb);
end $$;

revoke all on function public.edit_message(uuid, text) from public, anon, authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
revoke all on function public.unsend_message(uuid) from public, anon, authenticated;
grant execute on function public.unsend_message(uuid) to authenticated;
revoke all on function public.remove_message_for_me(uuid) from public, anon, authenticated;
grant execute on function public.remove_message_for_me(uuid) to authenticated;

notify pgrst, 'reload schema';
