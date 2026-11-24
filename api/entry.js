import {createClient} from '@libsql/client';
import worker from '../source/dist/server/index.js';
const client = () => createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
let connection;
function prepare(sql,args=[]){
 const execute=()=>connection.execute({sql,args});
 return {bind:(...values)=>prepare(sql,values),first:async()=>(await execute()).rows[0],all:async()=>({results:(await execute()).rows}),run:async()=>({meta:{changes:(await execute()).rowsAffected}})};
}
export default async function handler(req,res){
 try{
  connection??=client();
  const headers=new Headers(req.headers);
  headers.delete('oai-authenticated-user-id');
  const body=req.method==='POST'?(typeof req.body==='string'?req.body:JSON.stringify(req.body)):undefined;
  const response=await worker.fetch(new Request(new URL(req.url,'https://'+req.headers.host),{method:req.method,headers,body}),{DB:{prepare},ADMIN_PASSWORD:process.env.ADMIN_PASSWORD,CATALOG_PASSWORD:process.env.CATALOG_PASSWORD});
  for(const [name,value] of response.headers)res.setHeader(name,value);
  res.status(response.status).end(await response.text());
 }catch{res.status(503).end('서비스 연결을 확인하세요.');}
}
