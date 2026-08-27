import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SALES_APP_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SALES_APP_SUPABASE_ANON_KEY=(.*)/)[1].trim();

async function run() {
  const r = await fetch(url + '/rest/v1/ng_customer_dim?select=customer_id,area,salesman_area,channel', {
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key
    }
  });
  console.log('STATUS:', r.status);
  const data = await r.json();
  console.log(data.length ? data.slice(0, 2) : data);
}
run().catch(console.error);
