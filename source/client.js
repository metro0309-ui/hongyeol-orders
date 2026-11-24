let pricing=new Map();
const originals = {...groups};
const defaults = Object.values(groups).flatMap(names => names.split("|"));
const adminPage = location.pathname === "/admin";
let currentUser, revision, latestCatalog, busy = false;

const layout = document.querySelector(".layout");
layout.inert = true;
function identifyPage(){
 const theme=adminPage?"사모님":branch.value;
 document.body.dataset.theme=theme;
 document.querySelector(".header-label").textContent=adminPage?"사모님 · 발주 처리":theme+" · 점장";
 document.querySelector("h1").textContent=adminPage?"사모님 발주 처리":theme+" 발주";
 if(!adminPage)element("send").textContent=theme+" 발주하기";
}
identifyPage();
branch.addEventListener("change",identifyPage);

async function api(path, body, extraHeaders={}) {
  const headers={};
  const response = await fetch("/api/"+path, body ? {method:"POST",headers:{...headers,...extraHeaders,"Content-Type":"application/json"},body:JSON.stringify(body)} : {headers});
  if(response.status===403&&adminPage&&currentUser&&path==="state?all=1"){location.reload();throw Error("다시 로그인해 주세요.");}
  if (!response.ok) throw Error(response.status===409?"다른 기기에서 변경되었습니다. 새로고침 후 확인하세요.":"저장 또는 조회에 실패했습니다. 연결과 권한을 확인하세요.");
  return response.json();
}
function applyCatalog(names) {
  pricing=new Map((names.pricing||[]).map(r=>[r.name,r]));
  for(const key of Object.keys(groups)) delete groups[key];
  if(!Array.isArray(names)){
    for(const section of names.sections)if(section.items.length)Object.defineProperty(groups,section.title,{value:section.items.join("|"),configurable:true,enumerable:true,writable:true});
    renderCatalog();return;
  }
  const remaining = new Set(names);
  for(const [group,items] of Object.entries(originals)){
    const kept = items.split("|").filter(n=>remaining.delete(n));
    if(kept.length) groups[group]=kept.join("|");
  }
  if(remaining.size) groups["내 품목"]=[...remaining].join("|");
  renderCatalog();
}

const holdDrafts=new Map();
function ticketItems(ticket){
 const items=ticket.items;
 const dates=ticket.item_eta?JSON.parse(ticket.item_eta):null;
 const held=ticket.held==null?null:JSON.parse(ticket.held);
 let draft=holdDrafts.get(ticket.id);
 if(!draft||draft.version!==ticket.held){
   draft={version:ticket.held,selected:new Set(held||[]),periods:{}};
   if(adminPage&&!ticket.done)holdDrafts.set(ticket.id,draft);
 }
 const wrap=make("div","ticket-scroll");
 const table=make("table","ticket-items");
 table.setAttribute("aria-label","발주 품목");
 const specs=items.some(item=>item.size||item.pack);
 const head=table.createTHead().insertRow();
 const labels=["품목",...(specs?["규격"]:[]),"포장가","발주량"];
 const showStatus=adminPage||ticket.done||held!==null;
 if(showStatus)labels.push("발주 상태");
 for(const label of labels){
   const th=make("th","",label);th.scope="col";head.append(th);
 }
 const body=table.createTBody();
 for(const [index,item] of items.entries()){
   const line=body.insertRow();
   const name=make("th","",item.name);name.scope="row";line.append(name);
   if(specs)line.insertCell().textContent=[item.size,item.pack?item.pack+"개입":""].filter(Boolean).join(" · ")||"—";
   line.insertCell().textContent=item.price!==undefined && item.price!=="" && item.price!==null?Number(item.price).toLocaleString("ko-KR")+"원":"—";
   line.insertCell().textContent=[item.quantity,item.unit].filter(Boolean).join(" ");
   if(showStatus){
     const cell=line.insertCell();
     const pending=held?.includes(index);
     if(ticket.done||(held!==null&&!pending)){
       cell.append(make("span","mark-done","O 발주"));
       const eta=dates?dates[index]:ticket.delivery_day;
       if(eta)cell.append(make("small","item-eta","입고 "+eta));

     }
     if(!ticket.done&&((adminPage&&held===null)||pending)){
       const label=make("label","hold-choice");
       const box=make("input");box.type="checkbox";box.disabled=!adminPage;box.checked=draft.selected.has(index);
       box.setAttribute("aria-label",item.name+" 보류");

       label.append(box,document.createTextNode("보류"));cell.append(label);
       if(adminPage){
         const period=make("select");
         period.setAttribute("aria-label",item.name+" 입고 기간");
         period.append(new Option("입고 기간",""));
         for(let d=0;d<=7;d++)period.append(new Option(d?d+"일 후":"당일",String(d)));
         period.value=draft.periods[index]??"";period.hidden=box.checked;
         period.onchange=()=>{if(period.value==="")delete draft.periods[index];else draft.periods[index]=Number(period.value);};
         box.onchange=()=>{if(box.checked){draft.selected.add(index);delete draft.periods[index];period.value="";}else draft.selected.delete(index);period.hidden=box.checked;};
         cell.append(period);
       }
     }
   }
   if(item.note){const cell=body.insertRow().insertCell();cell.colSpan=labels.length;cell.textContent=item.note;cell.className="ticket-note";}
 }
 wrap.append(table);return wrap;
}
let recentOrders=[];
let refreshNumber=0;
async function refresh(){
 const number=++refreshNumber;
 const data=await api("state"+(adminPage?"?all=1":""));
 if(number!==refreshNumber)return;
 if(!currentUser){
   currentUser=data.user;
   revision=data.revision;
   latestCatalog=data.catalog||defaults;

   applyCatalog(latestCatalog);
   changeOrder();
   layout.inert=false;

 }
 if(data.revision>revision){revision=data.revision;applyCatalog(data.catalog||defaults);}
 recentOrders=data.orders;
 renderHistory();
}
function renderHistory(){
 const scope=adminPage?"전체 지점":branch.value;
 const tickets=adminPage?recentOrders:recentOrders.filter(ticket=>ticket.branch===scope);
 if(!adminPage)element("history-heading").textContent=scope+" 발주 요청";
 const history=element("history");
 const wasOpen=history.dataset.scope===scope && history.querySelector("details")?.open;
 history.dataset.scope=scope;
 history.replaceChildren();
 const count=tickets.filter(ticket=>ticket.done).length;
 const completed=make("details");
 completed.open=Boolean(wasOpen);
 completed.append(make("summary","","완료 내역 ("+count+"건)"));
 if(!count)completed.append(make("p","empty","완료된 발주서가 없습니다."));
 if(count===tickets.length)history.append(make("p","empty","처리 중인 발주서가 없습니다."));
 for(const ticket of tickets){
   const row=make("article","line ticket");
   row.dataset.theme=ticket.branch;
   row.append(make("strong","branch-badge",ticket.branch),make("strong","",ticket.day+" · "+(ticket.done?"발주완료":ticket.held!=null?"보류 있음":"처리중")+" · "+countLabel(ticket.items)));
   row.append(ticketItems(ticket));
   row.append(make("strong","",totalText(ticket.items)));
   if(ticket.done){
     holdDrafts.delete(ticket.id);
   }
   if(adminPage&&!ticket.done){
     const btn=make("button","primary","발주완료 체크");
     btn.onclick=async()=>{
       const draft=holdDrafts.get(ticket.id);
       const previous=ticket.held==null?null:JSON.parse(ticket.held);
       const active=previous??ticket.items.map((_,i)=>i);
       const missing=active.find(i=>!draft.selected.has(i)&&draft.periods[i]===undefined);
       if(missing!==undefined){alert(ticket.items[missing].name+" 입고 기간을 선택하세요.");return;}
       btn.disabled=true;
       try{await api("complete",{id:ticket.id,days:0,periods:draft.periods,held:[...draft.selected],previous});await refresh();}
       catch(e){alert(e.message);btn.disabled=false;}
     };
     row.append(btn);
   }
   (ticket.done?completed:history).append(row);
 }
 history.append(completed);
}
element("send").onclick=async()=>{
 if(busy)return;
 if(!order.length||order.some(i=>!i.quantity.trim())){status.textContent="품목을 담고 수량을 입력하세요.";return;}
 const key=storageKey+"/submission";
 const payload={branch:branch.value,day:date.value,items:order};
 const fingerprint=JSON.stringify(payload);
 busy=true;layout.inert=true;document.querySelector(".filters").inert=true;
 try{
   const old=JSON.parse(localStorage.getItem(key)||"null");
   const id=old?.fingerprint===fingerprint?old.id:crypto.randomUUID();
   localStorage.setItem(key,JSON.stringify({id,fingerprint}));
   const receipt=await api("orders",{id,...payload});
   order=[];save();localStorage.removeItem(key);render();status.textContent="발주목록 "+receipt.itemCount+"개가 접수됐습니다. 처리중입니다.";await refresh();
 }catch(e){status.textContent=e.message;}finally{busy=false;layout.inert=false;document.querySelector(".filters").inert=false;}
};
if(adminPage){
 layout.style.display="none";document.querySelector(".filters").style.display="none";
 document.querySelector(".eyebrow").textContent="전체 지점";
 document.querySelector(".hero p").textContent="거래처 주문을 마친 뒤 발주완료를 체크하세요.";
 element("history-heading").textContent="지점별 발주서";
}
async function sync(){try{await refresh();}catch(e){element("history").textContent=e.message;}}
if(adminPage){
 const link=element("admin-link");link.href="/?view=manager";link.textContent="점장 화면으로";
 const gate=make("form","panel");gate.style.padding="20px";
 const label=make("label","","관리자 비밀번호");
 const input=make("input");input.type="password";input.autocomplete="current-password";input.required=true;
 const enter=make("button","primary","관리자로 들어가기");
 const message=make("p","status");message.setAttribute("role","status");
 label.append(input);gate.append(label,enter,message);element("history").before(gate);
 function showControls(){
   const menu=passwordMenu("admin",()=>"",()=>{});
   const logout=make("button","","로그아웃");
   logout.onclick=async()=>{try{await api("admin/logout",{});location.reload();}catch(e){alert(e.message);}};
   gate.replaceWith(menu,logout);
 }
 gate.onsubmit=async e=>{e.preventDefault();enter.disabled=true;
 try{await api("admin/login",{},{"X-Admin-Password":encodeURIComponent(input.value)});input.value="";await refresh();showControls();}
 catch{message.textContent="접속하지 못했습니다. 비밀번호와 연결을 확인하세요.";}
 finally{enter.disabled=false;}};
 gate.hidden=true;
 refresh().then(showControls).catch(()=>{gate.hidden=false;});
}else {
 branch.addEventListener("change",renderHistory);
 sync();
}
setInterval(()=>{if(!document.hidden&&(!adminPage||currentUser))sync();},10000);window.addEventListener("focus",()=>{if(!adminPage||currentUser)sync();});

window.addEventListener("pageshow",event=>{if(event.persisted&&!adminPage)location.reload();});
