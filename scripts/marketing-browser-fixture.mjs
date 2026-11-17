// Dedicated marketing UI fixture. Secrets are supplied through environment only.
// create: ENSO_UI_PASSWORD required. cleanup defaults to read-only; add --apply.
import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const fixturePath = new URL('../tmp/marketing-browser-fixture.json', import.meta.url);
const client = createClient(process.env.ENSO_TEST_URL, process.env.ENSO_TEST_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const checked = ({data,error}) => { if(error) throw error; return data; };
const readManifest = async () => {
  try { return JSON.parse(await readFile(fixturePath,'utf8')); }
  catch(error) { if(error.code==='ENOENT') return null; throw error; }
};
const existing = await readManifest();
const action = process.argv[2];
if(action==='create') {
  if(existing && !existing.cleanedAt) throw new Error('Existing marketing fixture must be cleaned before creating another');
  if(!process.env.ENSO_UI_PASSWORD || process.env.ENSO_UI_PASSWORD.length<12) throw new Error('Supply ENSO_UI_PASSWORD (at least 12 characters)');
  const suffix = Date.now().toString(36);
  const email = `enso-qa-marketing-${suffix}@example.invalid`;
  await mkdir(new URL('../tmp/',import.meta.url),{recursive:true});
  const {user} = checked(await client.auth.admin.createUser({email,password:process.env.ENSO_UI_PASSWORD,email_confirm:true}));
  const fixture = {id:user.id,email,role:'marketing',articlePrefix:`QA-marketing-${suffix}`,createdAt:new Date().toISOString()};
  await writeFile(fixturePath,JSON.stringify(fixture,null,2));
  checked(await client.from('profiles').update({role:'marketing',name:'QA 行銷驗收'}).eq('id',user.id).select('id').single());
  console.log(JSON.stringify(fixture));
} else if(action==='cleanup') {
  const fixture=existing;
  if(!fixture || !/^[0-9a-f-]{36}$/i.test(fixture.id) || !/^enso-qa-marketing-[a-z0-9]+@example\.invalid$/.test(fixture.email) || fixture.role!=='marketing') throw new Error('Invalid marketing fixture identity');
  if(fixture.cleanedAt) {console.log('Marketing fixture already cleaned');process.exit(0);}
  if(fixture.articlePrefix!==fixture.email.replace('enso-qa-','QA-').replace('@example.invalid','')) throw new Error('Invalid article scope');
  const auth=await client.auth.admin.getUserById(fixture.id);
  if(auth.error && auth.error.status!==404) throw auth.error;
  if(auth.data?.user && auth.data.user.email!==fixture.email) throw new Error('Auth identity mismatch');
  const profile=checked(await client.from('profiles').select('role').eq('id',fixture.id).maybeSingle());
  if(profile && profile.role!=='marketing') throw new Error('Profile role mismatch');
  for(const [table,column] of [['orders','buyer_id'],['marketing_campaigns','created_by'],['inventory_logs','operator_id']]) {
    if(checked(await client.from(table).select('id').eq(column,fixture.id).limit(1)).length) throw new Error(`Unexpected ${table}; inspect separately`);
  }
  const articles=checked(await client.from('journal_articles').select('id,title,status').eq('created_by',fixture.id));
  if(articles.some(row=>row.status!=='draft' || !row.title.startsWith(fixture.articlePrefix))) throw new Error('Only prefixed QA drafts may be cleaned');
  const logs=checked(await client.from('operation_logs').select('id,action,details,order_id').eq('actor_id',fixture.id));
  const articleIds=new Set(articles.map(row=>row.id));
  // Deleted drafts retain audit records. Verify they no longer reference live content.
  for(const log of logs) {
    if(!['article_insert','article_update','article_delete'].includes(log.action) || log.order_id || !log.details?.article_id) throw new Error('Unexpected QA operations; inspect separately');
    if(!articleIds.has(log.details.article_id)) {
      const article=checked(await client.from('journal_articles').select('id').eq('id',log.details.article_id).maybeSingle());
      if(article) throw new Error('QA logs reference an article outside cleanup scope');
      articleIds.add(log.details.article_id);
    }
  }
  console.log(JSON.stringify({action:'cleanup-plan',userId:fixture.id,articleIds:[...articleIds],operationLogCount:logs.length}));
  if(!process.argv.includes('--apply')) process.exit(0);
  if(articles.length) checked(await client.from('journal_articles').delete().in('id',articles.map(row=>row.id)));
  for(const id of articleIds) checked(await client.from('operation_logs').delete().in('action',['article_insert','article_update','article_delete']).contains('details',{article_id:id}));
  checked(await client.from('member_messages').delete().eq('member_id',fixture.id));
  if(auth.data?.user) checked(await client.auth.admin.deleteUser(fixture.id));
  await writeFile(fixturePath,JSON.stringify({...fixture,cleanedAt:new Date().toISOString()},null,2));
  console.log('Marketing fixture cleaned');
} else throw new Error('Use create or cleanup [--apply]');
