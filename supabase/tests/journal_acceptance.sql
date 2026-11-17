-- Real RLS roles, transaction-only fixtures; never leaves published content behind.
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
create temporary table journal_fixture(marketer uuid,buyer uuid,draft uuid,published uuid);
insert into journal_fixture values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on journal_fixture to anon,authenticated;
do $$ declare f journal_fixture%rowtype; begin
 select * into f from journal_fixture;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into auth.users(id,email,raw_user_meta_data) values(f.marketer,f.marketer::text||'@journal-test.invalid','{}'),(f.buyer,f.buyer::text||'@journal-test.invalid','{}');
 insert into public.profiles(id,role) values(f.marketer,'marketing'),(f.buyer,'customer') on conflict(id) do update set role=excluded.role;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',f.marketer)::text,true);
end $$;
set local role authenticated;
insert into public.journal_articles(id,title,body,status) select draft,'Acceptance draft','Private draft body','draft' from journal_fixture;
insert into public.journal_articles(id,title,body,status) select published,'Acceptance published','Public article body','published' from journal_fixture;
select pg_temp.assert_true((select count(*)=2 from public.journal_articles where id in (select draft from journal_fixture union all select published from journal_fixture)),'marketing sees drafts and published');
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select pg_temp.assert_true((select count(*)=1 from public.journal_articles where id in (select draft from journal_fixture union all select published from journal_fixture)),'public only sees published');
select pg_temp.assert_true((select count(*)=0 from public.journal_articles where id=(select draft from journal_fixture)),'draft body is hidden');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(select buyer from journal_fixture))::text,true);
set local role authenticated;
do $$ declare blocked boolean:=false; begin
 begin insert into public.journal_articles(title,body,status) values('Unauthorized','not allowed','published'); exception when insufficient_privilege then blocked:=true; end;
 perform pg_temp.assert_true(blocked,'ordinary member cannot create articles');
end $$;
update public.journal_articles set title='Unauthorized edit' where id=(select published from journal_fixture);
select pg_temp.assert_true((select title='Acceptance published' from public.journal_articles where id=(select published from journal_fixture)),'ordinary member cannot edit');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(select marketer from journal_fixture))::text,true);
set local role authenticated;
update public.journal_articles set status='draft' where id=(select published from journal_fixture);
select pg_temp.assert_true((select published_at is null from public.journal_articles where id=(select published from journal_fixture)),'unpublishing clears publish timestamp');
delete from public.journal_articles where id=(select draft from journal_fixture);
select pg_temp.assert_true((select count(*)=0 from public.journal_articles where id=(select draft from journal_fixture)),'marketing deletes article');
reset role;
select 'PASS: marketing CRUD, public draft privacy, member write rejection, unpublish' as result;
rollback;
