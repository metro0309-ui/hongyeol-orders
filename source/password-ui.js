function passwordMenu(role,getKey,setKey){
 const panel=document.createElement("details");
 panel.className="panel footer";
 panel.innerHTML='<summary>비밀번호 변경</summary><form><label>새 비밀번호 (4자 이상)<input type="password" required minlength="4" maxlength="128" autocomplete="new-password"></label><label>새 비밀번호 확인<input type="password" required autocomplete="new-password"></label><button>변경 저장</button><p role="status"></p></form>';
 const form=panel.querySelector("form"),[first,again]=form.querySelectorAll("input"),message=form.querySelector("p");
 form.onsubmit=async event=>{
  event.preventDefault();
  if(first.value!==again.value){message.textContent="두 비밀번호가 일치하지 않습니다.";return;}
  const value=first.value,header=role==="admin"?"X-Admin-Password":"X-Catalog-Password";
  form.inert=true;
  try{
   const result=await fetch("/api/password/"+role,{method:"POST",headers:{"Content-Type":"application/json",[header]:encodeURIComponent(getKey())},body:JSON.stringify({password:value})});
   if(!result.ok){message.textContent=result.status===403?"다시 로그인해 주세요.":"변경하지 못했습니다. 비밀번호와 연결을 확인하세요.";return;}
   setKey(value);form.reset();message.textContent="비밀번호를 변경했습니다.";
  }catch{message.textContent="연결을 확인하고 다시 시도하세요.";}finally{form.inert=false;}
 };
 return panel;
}
