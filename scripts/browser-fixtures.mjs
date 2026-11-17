import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const client = createClient(process.env.ENSO_TEST_URL, process.env.ENSO_TEST_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const fixturePath = new URL('../tmp/browser-fixtures.json', import.meta.url);
const check = (result) => { if (result.error) throw result.error; return result.data; };
if (process.argv[2] === 'cleanup') {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const roles = ['customer','distributor','support','warehouse','finance','admin'];
  if (!Array.isArray(fixture.users) || fixture.users.length !== 6 || !Array.isArray(fixture.orders) || fixture.orders.length !== 1) throw new Error('Unexpected fixture manifest shape');
  const suffixes = new Set();
  for (const user of fixture.users) {
    const match = user.email?.match(/^enso-qa-(customer|distributor|support|warehouse|finance|admin)-([a-z0-9]+)@example\.invalid$/);
    if (!uuid.test(user.id) || !match || match[1] !== user.role) throw new Error('Invalid QA user identity');
    suffixes.add(match[2]);
  }
  if (new Set(fixture.users.map(user => user.id)).size !== 6 || new Set(fixture.users.map(user => user.role)).size !== roles.length || suffixes.size !== 1 || fixture.orders.some(id => !uuid.test(id))) throw new Error('Duplicate or mixed QA fixture identities');
  const userIds = fixture.users.map(user => user.id);
  const suffix = [...suffixes][0];
  // Complete identity/ownership checks before the first mutation. Never infer extra
  // orders from an email prefix or delete all records made by a staff test user.
  for (const user of fixture.users) {
    const result = await client.auth.admin.getUserById(user.id);
    if (result.error && result.error.status !== 404) throw result.error;
    if (result.data?.user && result.data.user.email !== user.email) throw new Error('QA auth identity mismatch');
    const profile = check(await client.from('profiles').select('id,role').eq('id',user.id).maybeSingle());
    if (profile && profile.role !== user.role) throw new Error('QA profile role mismatch');
  }
  const buyer = fixture.users.find(user => user.role === 'customer');
  const orders = check(await client.from('orders').select('id,buyer_id,order_no').in('buyer_id',userIds));
  if (orders.some(order => !fixture.orders.includes(order.id) || order.buyer_id !== buyer.id || order.order_no !== `QA-${suffix}`)) throw new Error('Unlisted or mismatched QA order; inspect before cleanup');
  for (const id of fixture.orders) {
    const order = check(await client.from('orders').select('id,buyer_id,order_no').eq('id',id).maybeSingle());
    if (order && (order.buyer_id !== buyer.id || order.order_no !== `QA-${suffix}`)) throw new Error('Manifest order ownership mismatch');
  }
  // Stock changes require explicit reconciliation; deleting audit rows cannot
  // restore inventory. Leave the entire fixture untouched in that case.
  const inventory = check(await client.from('inventory_logs').select('id').in('operator_id',userIds).limit(1));
  if (inventory.length) throw new Error('QA inventory operations exist; reconcile stock before cleanup');
  const jobs = check(await client.from('delivery_jobs').select('id,status').in('order_id',fixture.orders));
  if (jobs.some(job => job.status === 'processing')) throw new Error('QA delivery worker still processing; retry later');
  const jobIds = jobs.map(job => job.id);
  const references = [
    ['profiles','referrer_id','id',userIds], ['orders','referrer_id','id',fixture.orders],
    ['operation_logs','actor_id','order_id',fixture.orders],
    ['order_notes','actor_id','order_id',fixture.orders], ['order_picking','actor_id','order_id',fixture.orders],
    ['refund_requests','requested_by','order_id',fixture.orders], ['refund_requests','reviewed_by','order_id',fixture.orders],
    ['return_receipts','received_by','order_id',fixture.orders], ['exchange_shipments','shipped_by','order_id',fixture.orders],
    ['delivery_reconciliations','actor_id','job_id',jobIds],
    ['subscription_changes','actor_id','profile_id',userIds], ['credit_reconciliations','actor_id','member_id',userIds],
    ['sms_log','to_profile_id','related_order_id',fixture.orders],
    ['store_credit_ledger','member_id','order_id',fixture.orders],
    ['referral_reward_snapshots','referrer_id','order_id',fixture.orders],
  ];
  for (const [table,actor,scope,allowed] of references) {
    const rows = check(await client.from(table).select(scope).in(actor,userIds));
    if (rows.some(row => !allowed.includes(row[scope]))) throw new Error(`QA identity referenced outside manifest in ${table}; review separately`);
  }
  for (const [table,column] of [['marketing_campaigns','created_by'],['journal_articles','created_by']]) {
    if (check(await client.from(table).select('id').in(column,userIds).limit(1)).length) throw new Error(`QA authored ${table} exists; review separately`);
  }
  console.log(JSON.stringify({ action:'cleanup-plan', userIds, orderIds:fixture.orders, deliveryJobIds:jobs.map(job => job.id) }));
  if (!process.argv.includes('--apply')) {
    console.log('Read-only preflight passed. Add --apply only after browser acceptance is finished.');
    process.exit(0);
  }
  if (jobs.length) {
    check(await client.from('delivery_reconciliations').delete().in('job_id',jobs.map(job => job.id)));
    check(await client.from('sms_log').delete().in('delivery_job_id',jobs.map(job => job.id)));
  }
  for (const orderId of fixture.orders) {
    for (const [table, column] of [['exchange_shipments','order_id'],['return_receipts','order_id'],['order_notes','order_id'],['order_picking','order_id'],['order_gifts','order_id'],['referral_reward_snapshots','order_id'],['referrer_snapshot_audit','order_id'],['sms_log','related_order_id'],['delivery_jobs','order_id'],['operation_logs','order_id'],['invoices','order_id'],['payment_transactions','order_id'],['refund_requests','order_id'],['store_credit_ledger','order_id'],['order_items','order_id'],['orders','id']]) {
      check(await client.from(table).delete().eq(column,orderId));
    }
  }
  for (const [table,column] of [['member_messages','member_id'],['credit_reconciliations','member_id'],['subscription_changes','profile_id']]) check(await client.from(table).delete().in(column,userIds));
  for (const user of fixture.users) check(await client.auth.admin.deleteUser(user.id));
  console.log('Browser test fixtures removed');
} else {
  const suffix = Date.now().toString(36);
  const fixture = { users: [], orders: [] };
  await mkdir(new URL('../tmp/', import.meta.url), { recursive: true });
  const persist = () => writeFile(fixturePath, JSON.stringify(fixture,null,2));
  for (const role of ['customer','distributor','support','warehouse','finance','admin']) {
    const email = `enso-qa-${role}-${suffix}@example.invalid`;
    const { user } = check(await client.auth.admin.createUser({ email, password: process.env.ENSO_UI_PASSWORD, email_confirm: true }));
    fixture.users.push({ id:user.id,email,role }); await persist();
    check(await client.from('profiles').update({role,name:`QA ${role}`}).eq('id',user.id));
  }
  const product = check(await client.from('products').select('id,title,price').eq('is_enabled',true).limit(1).single());
  const buyer = fixture.users.find(user => user.role === 'customer');
  const order = check(await client.from('orders').insert({ buyer_id:buyer.id,order_no:`QA-${suffix}`,subtotal:product.price,total:product.price,status:'paid',recipient:{name:'QA 驗收',tel:'0912345678',email:buyer.email,address:'測試用地址（不寄送）'} }).select('id').single());
  fixture.orders.push(order.id); await persist();
  check(await client.from('order_items').insert({order_id:order.id,product_id:product.id,title:product.title,unit_price:product.price,qty:1}));
  console.log(JSON.stringify({users:fixture.users.map(({email,role})=>({email,role})),orderId:order.id}));
}
