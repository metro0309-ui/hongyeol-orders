import {createClient} from '@libsql/client';
import worker from '../source/dist/server/index.js';
const client = () => createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
let connection;
let ready;
// 처음 한 번, 필요한 표와 칸이 없으면 자동으로 만들어 줍니다. (이미 있으면 아무것도 바꾸지 않습니다.)
async function ensureSchema(db){
 await db.execute("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, owner TEXT NOT NULL, branch TEXT NOT NULL, day TEXT NOT NULL, items TEXT NOT NULL, created INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, delivery_days INTEGER, delivery_day TEXT, held TEXT, item_eta TEXT)");
 await db.execute("CREATE TABLE IF NOT EXISTS catalogs (owner TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL)");
 await db.execute("CREATE TABLE IF NOT EXISTS role_passwords (role TEXT PRIMARY KEY, salt TEXT NOT NULL, digest TEXT NOT NULL)");
 await db.execute("CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL, version TEXT NOT NULL, expires INTEGER NOT NULL)");
 const have=new Set((await db.execute("PRAGMA table_info(orders)")).rows.map(r=>r.name));
 for(const [name,type] of [["delivery_days","INTEGER"],["delivery_day","TEXT"],["held","TEXT"],["item_eta","TEXT"]])
  if(!have.has(name)) await db.execute("ALTER TABLE orders ADD COLUMN "+name+" "+type);
}
function prepare(sql,args=[]){
 const execute=()=>connection.execute({sql,args});
 return {bind:(...values)=>prepare(sql,values),first:async()=>(await execute()).rows[0],all:async()=>({results:(await execute()).rows}),run:async()=>({meta:{changes:(await execute()).rowsAffected}})};
}
export default async function handler(req,res){
 try{
  connection??=client();
  ready??=ensureSchema(connection).catch(e=>{ready=undefined;throw e;});
  await ready;
  const headers=new Headers(req.headers);
  headers.delete('oai-authenticated-user-id');
  const body=req.method==='POST'?(typeof req.body==='string'?req.body:JSON.stringify(req.body)):undefined;
  const response=await worker.fetch(new Request(new URL(req.url,'https://'+req.headers.host),{method:req.method,headers,body}),{DB:{prepare},ADMIN_PASSWORD:process.env.ADMIN_PASSWORD,CATALOG_PASSWORD:process.env.CATALOG_PASSWORD});
  for(const [name,value] of response.headers)res.setHeader(name,value);
  res.status(response.status).end(await response.text());
 }catch(e){console.error('entry error:',e&&e.message);res.status(503).end('서비스 연결을 확인하세요.');}
}
