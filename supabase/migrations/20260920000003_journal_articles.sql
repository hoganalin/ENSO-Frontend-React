begin;
create table if not exists public.journal_articles (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 150),
 kicker text not null default '香誌' check(length(kicker)<=80),
 excerpt text not null default '' check(length(excerpt)<=500),
 body text not null check(length(trim(body)) between 1 and 50000),
 author text not null default 'ENSO 編輯室' check(length(author) between 1 and 80),
 kanji text not null default '香' check(length(kanji) between 1 and 2),
 cover text check(cover is null or cover ~ '^https://' or (cover ~ '^/images/' and cover !~ '^//')),
 read_minutes integer not null default 3 check(read_minutes between 1 and 120),
 status text not null default 'draft' check(status in ('draft','published')),
 published_at timestamptz,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.journal_articles enable row level security;
revoke all on public.journal_articles from anon,authenticated;
grant select on public.journal_articles to anon,authenticated;
grant insert,update,delete on public.journal_articles to authenticated;
grant all on public.journal_articles to service_role;
drop policy if exists journal_public_read on public.journal_articles;
create policy journal_public_read on public.journal_articles for select
 using(status='published' and published_at<=now());
drop policy if exists journal_staff_manage on public.journal_articles;
create policy journal_staff_manage on public.journal_articles for all to authenticated
 using(public.current_role() in ('marketing','admin')) with check(public.current_role() in ('marketing','admin'));

create or replace function public.stamp_journal_article() returns trigger
language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then new.created_by:=auth.uid();new.created_at:=now();
 else new.created_by:=old.created_by;new.created_at:=old.created_at; end if;
 new.updated_at:=now();
 if new.status='draft' then new.published_at:=null;
 elsif tg_op='INSERT' then new.published_at:=now();
 elsif old.status<>'published' then new.published_at:=now();
 else new.published_at:=old.published_at; end if;
 return new;
end $$;
drop trigger if exists stamp_journal_article on public.journal_articles;
create trigger stamp_journal_article before insert or update on public.journal_articles
 for each row execute function public.stamp_journal_article();
create or replace function public.audit_journal_article() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.operation_logs(actor_id,action,details) values(auth.uid(),'article_'||lower(tg_op),
 jsonb_build_object('article_id',case when tg_op='DELETE' then old.id else new.id end));
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
drop trigger if exists audit_journal_article on public.journal_articles;
create trigger audit_journal_article after insert or update or delete on public.journal_articles
 for each row execute function public.audit_journal_article();
commit;
