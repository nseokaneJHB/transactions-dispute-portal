select setseed(0.42);
insert into "user"(name,email,email_verified) select 'User '||g, 'user'||g||'@perf.local', true from generate_series(1,50000) g;
insert into "user"(name,email,email_verified) values ('Heavy Account','heavy@perf.local',true);
create temp table u as select id, row_number() over (order by email) rn from "user" where email <> 'heavy@perf.local';
insert into transaction(amount_cents, merchant_name, transacted_at, user_id)
 select (random()*500000)::bigint, 'Merchant '||(g%5000), now() - (random()*730||' days')::interval, u.id
 from generate_series(1,2000000) g join u on u.rn = (g % 50000)+1;
insert into transaction(amount_cents, merchant_name, transacted_at, user_id)
 select (random()*500000)::bigint, 'Merchant '||(g%5000), now() - (random()*730||' days')::interval, (select id from "user" where email='heavy@perf.local')
 from generate_series(1,200000) g;
insert into dispute(description,status,reason,created_at,user_id,transaction_id)
 select 'Dispute text '||rn, (case when r<0.05 then 'SUBMITTED' when r<0.10 then 'UNDER_REVIEW' when r<0.6 then 'RESOLVED' when r<0.85 then 'REJECTED' else 'WITHDRAWN' end)::"disputeStatus", 'OTHER', transacted_at + interval '1 day', user_id, id
 from (select t.*, random() r, row_number() over (order by t.id) rn from transaction t join "user" x on x.id=t.user_id and x.email<>'heavy@perf.local' order by t.id limit 1000000) s;
insert into dispute(description,status,reason,created_at,user_id,transaction_id)
 select 'Heavy dispute '||rn, 'RESOLVED', 'OTHER', transacted_at + interval '1 day', user_id, id
 from (select t.*, row_number() over (order by t.id) rn from transaction t join "user" x on x.id=t.user_id and x.email='heavy@perf.local' order by t.id limit 50000) s;
vacuum analyze;
create table people as select (select id from "user" where email='user1@perf.local') normal_id, (select id from "user" where email='heavy@perf.local') heavy_id;
create table sample_ids as select id from dispute order by random() limit 20000;
