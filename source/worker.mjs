const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const field=(s,n)=>typeof s==="string" && s.length<=n;
async function hashPassword(value,salt){
 const encoder=new TextEncoder();
 const key=await crypto.subtle.importKey("raw",encoder.encode(value),"PBKDF2",false,["deriveBits"]);
 const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:encoder.encode(salt),iterations:100000,hash:"SHA-256"},key,256);
 return Array.from(new Uint8Array(bits),n=>n.toString(16).padStart(2,"0")).join("");
}
async function credential(req,env,role){
 const header=req.headers.get(role==="admin"?"X-Admin-Password":"X-Catalog-Password");
 if(!header)return null;
 let password;
 try{password=decodeURIComponent(header);}catch{return null;}
 if(password.length>128)return null;
 const record=await env.DB.prepare("SELECT salt,digest FROM role_passwords WHERE role=?").bind(role).first();
 if(record)return await hashPassword(password,record.salt)===record.digest?record:null;
 const initial=role==="admin"?env.ADMIN_PASSWORD:env.CATALOG_PASSWORD;
 return initial && password===initial?{}:null;
}
const tokenHash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,"0")).join("");
async function sessionResponse(db,user,version){
 const token=crypto.randomUUID();
 await db.prepare("DELETE FROM admin_sessions WHERE expires<=?").bind(Date.now()).run();
 await db.prepare("INSERT INTO admin_sessions VALUES(?,?,?,?)").bind(await tokenHash(token),user,version,Date.now()+86400000).run();
 return Response.json({},{headers:{"Cache-Control":"no-store","Set-Cookie":"__Host-hy_admin="+token+"; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400"}});
}
const priceOK=p=>p===""||(typeof p==="string"&&/^\d{1,10}$/.test(p));
const quantityOK=q=>typeof q==="string"&&q.length<=32&&(/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(q)?Number(q)>0:/^[1-9]\d*\/[1-9]\d*$/.test(q));
function packageOK(r){
 const size=r.size??"",pack=r.pack??"";
 return typeof size==="string"&&size.length<=32&&(!size||(/^\d+(?:\.\d+)?\s*(kg|g|ml|l)$/i.test(size)&&parseFloat(size)>0))&&typeof pack==="string"&&(!pack||/^[1-9]\d{0,6}$/.test(pack));
}
export default {async fetch(req,env){
 const path=new URL(req.url).pathname, url=new URL(req.url);
 const signedIn=req.headers.get("oai-authenticated-user-id");
 let token=(req.headers.get("Cookie")||"").match(/(?:^|; *)__Host-hy_device=([a-f0-9]{64})(?:;|$)/)?.[1];
 const page=req.method==="GET"&&["/","/admin","/catalog"].includes(path);
 if(page){
  const headers={"content-type":"text/html;charset=utf-8","cache-control":"private,no-store"};
  const cookies=req.headers.get("Cookie")||"";
  const hasAdmin=/(?:^|; *)__Host-hy_admin=[a-f0-9-]{36}(?:;|$)/.test(cookies);
  const managerMode=/(?:^|; *)hy_view=manager(?:;|$)/.test(cookies);
  if(path==="/"&&url.searchParams.get("view")==="manager"){
   return new Response(null,{status:302,headers:{...headers,Location:"/","Set-Cookie":"hy_view=manager; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400"}});
  }
  if(path==="/"&&hasAdmin&&!managerMode)return new Response(null,{status:302,headers:{...headers,Location:"/admin"}});
  if(path==="/admin"&&managerMode)headers["Set-Cookie"]="hy_view=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0";
  if(!token&&!signedIn){
   token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join("");
   headers["Set-Cookie"]="__Host-hy_device="+token+"; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax";
  }
  return new Response(path==="/catalog"?EDITOR:PAGE,{headers});
 }
 if(!signedIn&&!token)return json({},401);
 const user=signedIn||"device-"+Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))),v=>v.toString(16).padStart(2,"0")).join("");
 const db=env.DB;
 let admin=await credential(req,env,"admin");
 const session=(req.headers.get("Cookie")||"").match(/(?:^|; *)__Host-hy_admin=([a-f0-9-]{36})(?:;|$)/)?.[1];
 if(!admin && session && path!=="/api/admin/login"){
  const row=await db.prepare("SELECT p.digest FROM admin_sessions s LEFT JOIN role_passwords p ON p.role='admin' WHERE s.token=? AND s.owner=? AND s.expires>? AND s.version=COALESCE(p.salt,'initial')").bind(await tokenHash(session),user,Date.now()).first();
  if(row)admin=row;
 }
 if((path==="/api/complete" || (path==="/api/state" && url.searchParams.get("all")==="1")) && !admin)return json({},403);
 if(req.method==="GET"&&path==="/api/state"){
  const query=admin&&url.searchParams.get("all")==="1"?db.prepare("SELECT * FROM orders ORDER BY done,created DESC"):db.prepare("SELECT * FROM orders WHERE owner=? ORDER BY created DESC").bind(user);
  const [catalog,orders]=await Promise.all([db.prepare("SELECT data,revision FROM catalogs ORDER BY rowid LIMIT 1").first(),query.all()]);
  return json({user,admin:!!admin,catalog:catalog?JSON.parse(catalog.data):null,revision:catalog?.revision||0,orders:orders.results.map(({owner,...o})=>({...o,items:JSON.parse(o.items)}))});
 }
 if(req.method!=="POST"||req.headers.get("origin")!==url.origin||!req.headers.get("content-type")?.startsWith("application/json"))return json({},403);
 const b=await req.json().catch(()=>null);
 if(!b||typeof b!=="object")return json({},400);
 if(path==="/api/admin/login")return admin?sessionResponse(db,user,admin.salt||"initial"):json({},403);
 if(path==="/api/admin/logout"){
  if(session)await db.prepare("DELETE FROM admin_sessions WHERE token=?").bind(await tokenHash(session)).run();
  return Response.json({},{headers:{"Set-Cookie":"__Host-hy_admin=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0"}});
 }
 if(path==="/api/password/admin" || path==="/api/password/catalog"){
  const role=path.endsWith("/admin")?"admin":"catalog";
  const old=role==="admin"?admin:await credential(req,env,role);
  if(!old)return json({},403);
  if(!field(b.password,128)||b.password.trim().length<4)return json({},400);
  const salt=crypto.randomUUID(), digest=await hashPassword(b.password,salt);
  const result=old.digest
    ?await db.prepare("UPDATE role_passwords SET salt=?,digest=? WHERE role=? AND digest=?").bind(salt,digest,role,old.digest).run()
    :await db.prepare("INSERT OR IGNORE INTO role_passwords VALUES(?,?,?)").bind(role,salt,digest).run();
  if(result.meta.changes && role==="admin")return sessionResponse(db,user,salt);
  return json({},result.meta.changes?200:409);
 }
 if(path==="/api/catalog" || path==="/api/catalog/unlock"){
  if(!await credential(req,env,"catalog"))return json({},403);
  if(path==="/api/catalog/unlock")return json({});

  let names=b.names, catalog=names;
  if(b.sections){
   const valid=s=>field(s,70)&&s.trim()===s&&!!s&&!s.includes("|");
   if(!Array.isArray(b.sections)||b.sections.length>200||!b.sections.every(g=>g&&valid(g.title)&&Array.isArray(g.items))||new Set(b.sections.map(g=>g.title)).size!==b.sections.length)return json({},400);
   names=b.sections.flatMap(g=>g.items);catalog={sections:b.sections};
  }
  if(!Array.isArray(names)||!names.length||names.length>1000||!names.every(n=>field(n,70)&&n.trim()===n&&n&&!n.includes("|"))||new Set(names).size!==names.length)return json({},400);
  if(b.pricing!==undefined){
   const allowed=new Set(names);
   if(!b.sections||!Array.isArray(b.pricing)||b.pricing.length>names.length||!b.pricing.every(r=>r&&allowed.has(r.name)&&packageOK(r)&&quantityOK(r.quantity)&&priceOK(r.price))||new Set(b.pricing.map(r=>r.name)).size!==b.pricing.length)return json({},400);
   catalog.pricing=b.pricing.map(({name,quantity,price,size="",pack=""})=>({name,quantity,price,size,pack}));
  }
  const data=JSON.stringify(catalog);
  const result=b.revision===0?await db.prepare("INSERT OR IGNORE INTO catalogs SELECT ?,?,1 WHERE NOT EXISTS(SELECT 1 FROM catalogs)").bind("shared",data).run():await db.prepare("UPDATE catalogs SET data=?,revision=revision+1 WHERE rowid=(SELECT MIN(rowid) FROM catalogs) AND revision=?").bind(data,b.revision).run();
  return json({},result.meta.changes?200:409);
 }
 if(path==="/api/orders"){
  if(!field(b.id,50)||!b.id||!["시청점","인제점","노형점"].includes(b.branch)||!/^\d{4}-\d\d-\d\d$/.test(b.day)||!Array.isArray(b.items)||!b.items.length||b.items.length>1000||!b.items.every(i=>i&&packageOK(i)&&field(i.name,70)&&i.name.trim()&&field(i.quantity,32)&&i.quantity.trim()&&field(i.unit,32)&&field(i.note,150)&&(i.price===undefined||priceOK(i.price))&&(!i.price||quantityOK(i.quantity))))return json({},400);
  const items=JSON.stringify(b.items);
  await db.prepare("INSERT OR IGNORE INTO orders (id,owner,branch,day,items,created,done) VALUES(?,?,?,?,?,?,0)").bind(b.id,user,b.branch,b.day,items,Date.now()).run();
  const saved=await db.prepare("SELECT owner,items,branch,day FROM orders WHERE id=?").bind(b.id).first();
  if(saved.owner!==user||saved.items!==items||saved.branch!==b.branch||saved.day!==b.day)return json({},409);
  return json({itemCount:new Set(JSON.parse(saved.items).map(item=>item.name)).size});
 }
 if(path==="/api/complete" && field(b.id,50)){
  if(!Number.isInteger(b.days)||b.days<0||b.days>7)return json({},400);
  const order=await db.prepare("SELECT items,held,done,item_eta,delivery_day FROM orders WHERE id=?").bind(b.id).first();
  if(!order)return json({},404);
  if(order.done)return json({});
  const previous=order.held===null?null:JSON.parse(order.held);
  const held=b.held??[];
  const size=JSON.parse(order.items).length;
  if(!Array.isArray(held)||held.length>size||new Set(held).size!==held.length||!held.every(i=>Number.isInteger(i)&&i>=0&&i<size))return json({},400);
  if(JSON.stringify(previous)!==JSON.stringify(b.previous??null)||previous&&held.some(i=>!previous.includes(i)))return json({},409);
  const eta=order.item_eta?JSON.parse(order.item_eta):Array.from({length:size},(_,i)=>previous&&!previous.includes(i)?order.delivery_day:null);
  const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const periods=b.periods??{};
  for(let i=0;i<size;i++){
   if(held.includes(i)||(previous&&!previous.includes(i)))continue;
   const days=b.periods===undefined?b.days:periods[i];
   if(!Number.isInteger(days)||days<0||days>7)return json({},400);
   eta[i]=new Date(Date.parse(today+"T00:00:00Z")+days*86400000).toISOString().slice(0,10);
  }
  const result=await db.prepare("UPDATE orders SET held=?,done=?,item_eta=?,delivery_days=NULL,delivery_day=NULL WHERE id=? AND done=0 AND held IS ?").bind(JSON.stringify(held.sort((a,b)=>a-b)),held.length?0:1,JSON.stringify(eta),b.id,order.held).run();
  return json({},result.meta.changes?200:409);
 }
 return json({},404);
}};
