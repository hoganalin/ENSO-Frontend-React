// Requires an authenticated Supabase CLI and linked test project. No credentials are read or printed.
// Runs the REAL cron path; never directly invokes a worker or changes provider configuration.
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const cwd=fileURLToPath(new URL('../',import.meta.url));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const command=process.argv[2];
if(command!=='run' && command!=='cleanup') throw new Error('Usage: node scripts/scheduled-delivery-live.mjs run | cleanup RUN_UUID');
const runId=command==='cleanup' ? process.argv[3] : randomUUID();
if(!uuid.test(runId??'')) throw new Error('Invalid run UUID');
await mkdir(new URL('../tmp/',import.meta.url),{recursive:true});
const manifestPath=new URL(`../tmp/scheduled-delivery-${runId}.json`,import.meta.url);
const sqlRelative=`tmp/scheduled-delivery-${runId}.sql`;
const parseOutput=(output)=>JSON.parse(output.slice(output.indexOf('{')));
const cli=(args)=>execSync(`npx supabase ${args}`,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
const query=async(sql)=>{
  await writeFile(new URL('../'+sqlRelative,import.meta.url),sql);
  return parseOutput(cli(`db query --linked --file ${sqlRelative} --output json`)).rows;
};
let fixture=command==='cleanup' ? JSON.parse(await readFile(manifestPath,'utf8')) : {
  runId,userId:randomUUID(),orderId:randomUUID(),jobId:randomUUID(),orderNo:`QA-CRON-${runId.slice(0,8)}`,
  email:`enso-cron-${runId}@example.invalid`,createdAt:new Date().toISOString(),cleaned:false,
};
for(const key of ['runId','userId','orderId','jobId']) if(!uuid.test(fixture[key]??'')) throw new Error('Invalid fixture manifest');
if(fixture.runId!==runId || fixture.orderNo!==`QA-CRON-${runId.slice(0,8)}` || fixture.email!==`enso-cron-${runId}@example.invalid`) throw new Error('Fixture manifest identity mismatch');
const persist=()=>writeFile(manifestPath,JSON.stringify(fixture,null,2));
const cleanup=async()=>{
  await query(`begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
 if exists(select 1 from auth.users where id='${fixture.userId}' and email<>'${fixture.email}')
 or exists(select 1 from public.orders where id='${fixture.orderId}' and (buyer_id<>'${fixture.userId}' or order_no<>'${fixture.orderNo}'))
 then raise exception 'Fixture ownership mismatch';end if;
 if exists(select 1 from public.delivery_jobs where id='${fixture.jobId}' and status in ('processing','sending') and lease_until>now())
 then raise exception 'Worker still holds fixture lease';end if;
end $$;
delete from public.sms_log where related_order_id='${fixture.orderId}' and delivery_job_id='${fixture.jobId}';
delete from public.delivery_reconciliations where job_id='${fixture.jobId}';
delete from public.delivery_jobs where id='${fixture.jobId}' and order_id='${fixture.orderId}';
delete from public.orders where id='${fixture.orderId}' and buyer_id='${fixture.userId}' and order_no='${fixture.orderNo}';
delete from public.profiles where id='${fixture.userId}';
delete from auth.users where id='${fixture.userId}' and email='${fixture.email}';
commit;
select (not exists(select 1 from public.orders where id='${fixture.orderId}')
 and not exists(select 1 from public.delivery_jobs where id='${fixture.jobId}')
 and not exists(select 1 from auth.users where id='${fixture.userId}')) as cleaned;`);
  fixture.cleaned=true;fixture.cleanedAt=new Date().toISOString();await persist();
  console.log(JSON.stringify({runId,cleanup:'PASS'}));
};
if(command==='cleanup'){await cleanup();process.exit(0);}

let failed=false;
try{
  // CLI returns SHA-256 digests for secret values; compare against known test values without displaying them.
  const project=String(await readFile(new URL('../supabase/.temp/project-ref',import.meta.url),'utf8')).trim();
  if(!/^[a-z0-9]{20}$/.test(project)) throw new Error('Linked project invalid');
  const secrets=JSON.parse(cli(`secrets list --project-ref ${project} --output json`));
  for(const [name,value] of [['MITAKE_MODE','mock'],['MITAKE_MOCK_RESULT','success'],['ECPAY_INVOICE_ENABLED','false']]){
    const digest=createHash('sha256').update(value).digest('hex');
    if(!secrets.some(secret=>secret.name===name && secret.value===digest)) throw new Error('Simulation configuration not verified');
  }
  const ready=await query("select count(*)::integer as count from cron.job where jobname='enso-delivery-retry' and active and schedule='* * * * *';");
  if(ready[0]?.count!==1) throw new Error('Active cron schedule missing');
  await persist();
  await query(`begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id,email,raw_user_meta_data) values('${fixture.userId}','${fixture.email}','{}');
insert into public.profiles(id,role,name) values('${fixture.userId}','customer','QA cron fixture') on conflict(id) do update set name=excluded.name;
insert into public.orders(id,buyer_id,order_no,subtotal,total,status,recipient)
values('${fixture.orderId}','${fixture.userId}','${fixture.orderNo}',1000,1000,'paid','{"name":"QA cron fixture","tel":"0912345678","address":"測試地址不寄送"}');
insert into public.delivery_jobs(id,order_id,kind,status,attempts,next_attempt_at,last_error)
values('${fixture.jobId}','${fixture.orderId}','buyer_sms','failed',1,now()-interval '1 second','QA controlled failure before cron retry');
commit;`);
  console.log(JSON.stringify({runId,jobId:fixture.jobId,state:'waiting_for_natural_cron'}));
  const deadline=Date.now()+180000;
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,10000));
    const rows=await query(`select j.status,j.attempts,
 (select count(*)::integer from public.sms_log s where s.delivery_job_id=j.id and s.related_order_id=j.order_id and s.is_simulated and s.status='sent' and s.to_phone='0912345678' and s.message like '%${fixture.orderNo}%' and s.message like '%1,000%') as matching_logs,
 exists(select 1 from net._http_response h where h.status_code=200 and h.created>=j.created_at and h.content::jsonb @> jsonb_build_object('results',jsonb_build_array(jsonb_build_object('id',j.id::text,'status','succeeded')))) as cron_http_confirmed
 from public.delivery_jobs j where j.id='${fixture.jobId}';`);
    if(rows[0]?.status==='succeeded' && rows[0].attempts>=2 && rows[0].matching_logs===1 && rows[0].cron_http_confirmed){
      fixture.evidence=rows[0];fixture.verifiedAt=new Date().toISOString();await persist();
      console.log(JSON.stringify({runId,result:'PASS',...rows[0]}));break;
    }
    if(rows[0]?.status==='uncertain') throw new Error('Fixture became uncertain');
  }
  if(!fixture.evidence) throw new Error('Cron retry timed out');
}catch{
  failed=true;console.error(JSON.stringify({runId,result:'FAIL',detail:'Cron test or prerequisite failed. No credential details are logged.'}));
}finally{
  try{await cleanup();}catch{failed=true;console.error(JSON.stringify({runId,cleanup:'NEEDS_RETRY',command:`node scripts/scheduled-delivery-live.mjs cleanup ${runId}`}));}
}
if(failed) process.exitCode=1;
