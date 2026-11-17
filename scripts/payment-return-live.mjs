// Hosted browser-return contract test. Uses public ECPay stage credentials only.
// Run from repository root: node scripts/payment-return-live.mjs
// Requires authenticated, linked Supabase CLI. Never calls payment-notify or ECPay.
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const user = randomUUID(), order = randomUUID();
const trade = `QA${randomUUID().replaceAll('-', '').slice(0, 18)}`;
const sqlPath = resolve('tmp/payment-return-live.sql');
mkdirSync(resolve('tmp'), { recursive: true });
function query(sql) {
  writeFileSync(sqlPath, sql);
  const npxCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js');
  const output = execFileSync(process.execPath, [npxCli, 'supabase', 'db', 'query', '--linked', '--file', sqlPath, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(output).rows;
}
function signed(fields) {
  const body = Object.keys(fields).sort((a,b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(k => `${k}=${fields[k]}`).join('&');
  const encoded = encodeURIComponent(`HashKey=5294y06JbISpM5x9&${body}&HashIV=v77hoKGq4kWxNNIS`).toLowerCase().replaceAll("'", '%27').replaceAll('~', '%7e').replaceAll('%20', '+');
  return {...fields, CheckMacValue: createHash('sha256').update(encoded).digest('hex').toUpperCase()};
}
function assert(ok, label) { if (!ok) throw new Error(label); }
const results = [];
const endpoint = 'https://dznzipfuqtpkvklmlywt.supabase.co/functions/v1/payment-result';
async function post(fields) {
  return fetch(endpoint, { method:'POST', body:new URLSearchParams(fields), redirect:'manual' });
}
try {
  query(`begin;
    insert into auth.users(id,email,raw_user_meta_data) values('${user}','${user}@payment-return.invalid','{}');
    insert into public.orders(id,buyer_id,order_no,subtotal,total,status) values('${order}','${user}','${trade}',100,100,'pending');
    insert into public.payment_transactions(order_id,merchant_trade_no,amount) values('${order}','${trade}',100);
    commit; select true as created;`);
  const fields = {MerchantID:'2000132', MerchantTradeNo:trade, TradeAmt:'100', RtnCode:'1', RtnMsg:'Succeeded', SimulatePaid:'1'};
  const valid = await post(signed(fields));
  assert(valid.status === 303, `Valid signature expected 303, got ${valid.status}: ${await valid.text()}`);
  const destination = new URL(valid.headers.get('location'));
  assert(destination.pathname === `/payment/${order}`, 'Redirect must use stored order ID');
  assert(['http:', 'https:'].includes(destination.protocol), 'Invalid return protocol');
  assert(valid.headers.get('cache-control') === 'no-store', 'Return must not be cached');
  results.push({case:'valid stage signature', status:valid.status, returnOrigin:destination.origin, storedOrderPath:true});
  for (const [label, payload] of [
    ['invalid signature', {...signed(fields), CheckMacValue:'0'.repeat(64)}],
    ['signed wrong amount', signed({...fields, TradeAmt:'101'})],
    ['signed unknown transaction', signed({...fields, MerchantTradeNo:`QB${trade.slice(2)}`})],
    ['signed wrong merchant', signed({...fields, MerchantID:'2000133'})],
  ]) {
    const response = await post(payload);
    assert(response.status === 400, `${label}: expected 400, got ${response.status}`);
    assert(!response.headers.get('location'), `${label}: must not redirect`);
    results.push({case:label,status:response.status});
  }
  const get = await fetch(endpoint, {redirect:'manual'});
  assert(get.status === 405, 'GET must be rejected');
  results.push({case:'GET method',status:get.status});
  const [state] = query(`select o.status as order_status,p.status as transaction_status from public.orders o join public.payment_transactions p on p.order_id=o.id where o.id='${order}';`);
  assert(state.order_status === 'pending' && state.transaction_status === 'pending', 'Browser return must not settle an order');
  results.push({case:'return does not settle', ...state});
} finally {
  const [remaining] = query(`begin; delete from public.payment_transactions where order_id='${order}'; delete from public.orders where id='${order}' and buyer_id='${user}'; delete from public.profiles where id='${user}'; delete from auth.users where id='${user}'; commit; select (select count(*) from public.orders where id='${order}')+(select count(*) from auth.users where id='${user}') as remaining;`);
  assert(Number(remaining.remaining) === 0, 'Fixture cleanup incomplete');
  results.push({case:'own fixture cleanup',remaining:Number(remaining.remaining)});
  writeFileSync(resolve('tmp/payment-return-live-result.json'), JSON.stringify({at:new Date().toISOString(),results},null,2));
}
console.log(JSON.stringify(results,null,2));
