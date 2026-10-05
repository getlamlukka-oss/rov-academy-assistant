import express from 'express';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const app=express();app.disable('x-powered-by');app.set('trust proxy',1);app.use(express.json({limit:'1mb'}));
const PORT=Number(process.env.PORT||10000),tokens=[process.env.BROWSER_WORKER_TOKEN,process.env.SITES_WORKER_TOKEN].filter(Boolean);
const START='https://academy.rov.in.th/';const sessions=new Map(),creating=new Map(),failedCreations=new Map(),cancelledCreations=new Set();const MAX=Number(process.env.MAX_BROWSER_SESSIONS||1);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTH_STATE_MAX_BYTES=200000,AUTH_REFRESH_MS=10*60*1000;
const AUTH_KEY=(()=>{const material=process.env.AUTH_STATE_ENCRYPTION_KEY||process.env.BROWSER_WORKER_TOKEN||process.env.SITES_WORKER_TOKEN;if(!material)return null;return crypto.createHash('sha256').update('rov-auth-state:v1\0').update(material).digest();})();
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const hash=q=>crypto.createHash('sha256').update(JSON.stringify([q.question,q.choices])).digest('hex');
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function safeHost(url){try{const u=new URL(url);return u.protocol==='https:'&&['rov.in.th','garena.com','garena.co.th','garena.in.th','garenanow.com','facebook.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}}
function cookieHost(domain){const host=String(domain||'').replace(/^\./,'').toLowerCase();return ['rov.in.th','garena.com','garena.co.th','garena.in.th','garenanow.com'].some(h=>host===h||host.endsWith('.'+h));}
function cleanCookies(cookies){
 const now=Math.floor(Date.now()/1000),out=[];let bytes=0;
 for(const c of Array.isArray(cookies)?cookies:[]){
  if(!cookieHost(c.domain)||typeof c.name!=='string'||typeof c.value!=='string'||!c.name||c.name.length>256||c.value.length>8192||Number(c.expires)>0&&Number(c.expires)<=now)continue;
  const item={name:c.name,value:c.value,domain:String(c.domain),path:typeof c.path==='string'&&c.path.startsWith('/')?c.path:'/',expires:Number.isFinite(Number(c.expires))?Number(c.expires):-1,httpOnly:c.httpOnly===true,secure:c.secure!==false,sameSite:['Strict','Lax','None'].includes(c.sameSite)?c.sameSite:'Lax'};
  bytes+=Buffer.byteLength(JSON.stringify(item));if(bytes>128000||out.length>=80)throw Error('Cookie state exceeds safe limit');out.push(item);
 }
 return out;
}
function authAAD(profileId){return Buffer.from('rov-auth:v1:'+profileId);}
function sealAuth(profileId,cookies){
 if(!AUTH_KEY)throw Error('Encrypted login storage is not configured');
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',AUTH_KEY,iv);cipher.setAAD(authAAD(profileId));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify({v:1,cookies:cleanCookies(cookies),savedAt:Date.now()}),'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
function openAuth(profileId,blob){
 if(!AUTH_KEY||typeof blob!=='string'||Buffer.byteLength(blob)>AUTH_STATE_MAX_BYTES)throw Error('Invalid encrypted login state');
 const parts=blob.split('.');if(parts.length!==4||parts[0]!=='v1')throw Error('Invalid encrypted login state');
 const iv=Buffer.from(parts[1],'base64url'),tag=Buffer.from(parts[2],'base64url'),encrypted=Buffer.from(parts[3],'base64url');if(iv.length!==12||tag.length!==16||!encrypted.length)throw Error('Invalid encrypted login state');
 const decipher=crypto.createDecipheriv('aes-256-gcm',AUTH_KEY,iv);decipher.setAAD(authAAD(profileId));decipher.setAuthTag(tag);
 const payload=JSON.parse(Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8'));if(payload?.v!==1)throw Error('Invalid encrypted login state');
 return {cookies:cleanCookies(payload.cookies),origins:[]};
}
async function exportAuth(s,force=false){
 if(!AUTH_KEY||!s.profileId||!s.loggedIn||!force&&Date.now()-s.authExportedAt<AUTH_REFRESH_MS)return null;
 const state=await s.context.storageState();const cookies=cleanCookies(state.cookies);if(!cookies.length)return null;s.authExportedAt=Date.now();return sealAuth(s.profileId,cookies);
}
function addLog(s,msg){s.logs.push({time:Date.now(),message:msg});s.logs=s.logs.slice(-40);}
async function lock(s,fn){const prev=s.queue;s.queue=new Promise(r=>s.releaseQueue=r);const release=s.releaseQueue;await prev;try{if(s.closed)throw Error('เซสชันปิดแล้ว');return await fn();}finally{release();}}
function find(req){const s=sessions.get(req.params.id);if(!s)throw Error('ไม่พบเซสชัน กรุณาสร้างใหม่');s.used=Date.now();return s;}
const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(409).json({error:e.message?.slice(0,220)||'Worker error'});}};
app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Strict-Transport-Security':'max-age=31536000','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()'});next();});
app.get('/health',(_req,res)=>res.json({ok:true,version:'2.5.0',service:'rov-browser-worker',sessions:sessions.size,starting:creating.size,configured:tokens.length>0&&!!AUTH_KEY,capabilities:{idempotentSessions:true,credentialLogin:true,loginReadiness:true,automaticFlow:true,aiJobs:true,encryptedCookieSessions:!!AUTH_KEY}}));
app.use((req,res,next)=>{if(!tokens.length)return res.status(503).json({error:'Worker token not configured'});if(!tokens.some(t=>equal(req.headers.authorization,'Bearer '+t)))return res.status(401).json({error:'Unauthorized'});next();});
// Check the authenticated profile/logout UI rendered by Academy (mobile menu may be collapsed). Never read login tokens or infer login from URL.
async function loggedIn(s){
 if(new URL(s.page.url()).hostname!=='academy.rov.in.th'){s.loggedIn=false;return false;}
 const authenticated=await s.page.evaluate(()=>{
  const logout=e=>/^(ออกจากระบบ|ล็อกเอาท์|logout|log out)$/i.test((e.textContent||'').trim());
  const navbar=document.querySelector('.navbar--pc');
  const desktopProfile=navbar?.querySelector('.name');
  const drawerProfile=document.querySelector('.menuright .user .name');
  const menus=[...document.querySelectorAll('.navbar--pc button,.navbar--pc span,.menuright span,.menuright [role=button]')];
  return !!(desktopProfile?.textContent?.trim()||drawerProfile?.textContent?.trim())&&menus.some(logout);
 }).catch(()=>false);s.loggedIn=authenticated;return authenticated;
}
// Academy's published OAuth configuration: app 100055, Garena platform 1, its own callback.
const GARENA_LOGIN='https://100055.connect.garena.com/oauth/login?response_type=code&client_id=100055&redirect_uri=https%3A%2F%2Facademy.rov.in.th%2Fauth%2Fcallback%2F&locale=th-TH&platform=1';
function credentialHost(url){try{const u=new URL(url);return u.protocol==='https:'&&['100055.connect.garena.com','sso.garena.com','auth.garena.com','account.garena.com'].includes(u.hostname);}catch{return false;}}
const loginMessages={
 LOGIN_VERIFICATION_REQUIRED:'Garena ต้องการยืนยันเพิ่มเติม จึงเข้าสู่ระบบอัตโนมัติไม่สำเร็จ',
 LOGIN_FORM_UNAVAILABLE:'Garena ไม่แสดงช่องบัญชีและรหัสผ่าน',
 LOGIN_INPUT_NOT_READY:'ช่องล็อกอิน Garena ยังไม่พร้อมกรอก',
 LOGIN_REJECTED:'Garena ปฏิเสธการเข้าสู่ระบบ',
 LOGIN_TIMEOUT:'Garena ยังไม่ยืนยันการเข้าสู่ระบบภายในเวลาที่กำหนด',
 LOGIN_PAGE_UNAVAILABLE:'เปิดหน้าล็อกอิน Garena ไม่สำเร็จ'
};
async function loginSnapshot(page){return page.evaluate(()=>{
 const visible=e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden';};
 const inputs=[...document.querySelectorAll('input')].filter(visible),passwords=inputs.filter(e=>e.type==='password'),form=passwords[0]?.closest('form');
 const usernames=(form?[...form.querySelectorAll('input')]:inputs).filter(e=>visible(e)&&['text','email','tel'].includes(e.type)&&!e.readOnly);
 const verificationRequired=[...document.querySelectorAll('iframe[src*="captcha"],iframe[src*="datadome"],[id*=captcha],[class*=captcha],input[autocomplete=one-time-code]')].some(visible);
 const errors=[...document.querySelectorAll('.field.error,.form-error,[role=alert]')].filter(e=>visible(e)&&e.textContent?.trim()).map(e=>e.textContent.trim().slice(0,500));
 return {host:location.hostname,passwordCount:passwords.length,usernameCount:usernames.length,editable:passwords.length===1&&usernames.length===1&&!passwords[0].disabled&&!passwords[0].readOnly&&!usernames[0].disabled,verificationRequired,errors};
 });}
function loginFailure(s,reason,message){s.state='LOGIN_FAILED';return {loggedIn:false,state:s.state,reason,message:message||loginMessages[reason]};}
function safeLoginMessage(message,credentials){
 let text=String(message||'');for(const value of [credentials.username,credentials.password])if(value)text=text.split(value).join('[ปกปิด]');
 return text.replace(/https?:\/\/\S+/g,'[URL]').slice(0,350);
}
async function prepareLogin(s){
 if(await loggedIn(s))return {loggedIn:true};
 if(!credentialHost(s.page.url())){try{await s.page.goto(GARENA_LOGIN,{waitUntil:'commit',timeout:15000});}catch{return loginFailure(s,'LOGIN_PAGE_UNAVAILABLE');}}
 const until=Date.now()+20000;
 while(Date.now()<until){
  if(await loggedIn(s))return {loggedIn:true};
  if(credentialHost(s.page.url())){
   const v=await loginSnapshot(s.page).catch(()=>null);
   if(v?.verificationRequired)return loginFailure(s,'LOGIN_VERIFICATION_REQUIRED');
   if(v?.editable){s.state='LOGGING_IN';return {ready:true};}
  }
  await sleep(400);
 }
 const v=await loginSnapshot(s.page).catch(()=>null);
 return loginFailure(s,v?.verificationRequired?'LOGIN_VERIFICATION_REQUIRED':v?.passwordCount?'LOGIN_INPUT_NOT_READY':'LOGIN_FORM_UNAVAILABLE');
}
async function enterCredentials(s,b){
 if(s.auto)throw Error('หยุดการตอบคำถามก่อนล็อกอินใหม่');
 let stage='prepare';s.enteringCredentials=true;
 try{
  const prepared=await prepareLogin(s);if(prepared.loggedIn)return {loggedIn:true,state:'LOGGED_IN'};if(!prepared.ready)return prepared;
  stage='recognize-form';const password=s.page.locator('input[type="password"]:visible'),form=password.locator('xpath=ancestor::form[1]'),root=await form.count()===1?form:s.page;
  const username=root.locator('input[type="text"]:visible:not([readonly]),input[type="email"]:visible:not([readonly]),input[type="tel"]:visible:not([readonly])');
  if(!credentialHost(s.page.url())||await password.count()!==1||await username.count()!==1)return loginFailure(s,'LOGIN_FORM_UNAVAILABLE');
  const safeForm=await password.evaluate(e=>{const a=e.closest('form')?.getAttribute('action');if(!a)return true;const u=new URL(a,location.href);return u.protocol==='https:'&&['100055.connect.garena.com','sso.garena.com','auth.garena.com','account.garena.com'].includes(u.hostname);});
  if(!safeForm)return loginFailure(s,'LOGIN_FORM_UNAVAILABLE');
  stage='fill-username';await username.fill(b.username,{timeout:7000});if(!credentialHost(s.page.url()))return loginFailure(s,'LOGIN_FORM_UNAVAILABLE');
  stage='fill-password';await password.fill(b.password,{timeout:7000});
  const button=root.locator('button[type="submit"]:visible,input[type="submit"]:visible');
  if(!credentialHost(s.page.url())||await button.count()!==1)return loginFailure(s,'LOGIN_FORM_UNAVAILABLE');
  stage='submit';await button.click({timeout:7000});
  const until=Date.now()+15000;
  while(Date.now()<until){
   if(await loggedIn(s)){s.state='LOGGED_IN';return {loggedIn:true,state:s.state};}
   const v=credentialHost(s.page.url())?await loginSnapshot(s.page).catch(()=>null):null;
   if(v?.verificationRequired)return loginFailure(s,'LOGIN_VERIFICATION_REQUIRED');
   if(v?.errors?.length)return loginFailure(s,'LOGIN_REJECTED',safeLoginMessage(v.errors.join(' · '),b));
   await sleep(500);
  }
  return loginFailure(s,'LOGIN_TIMEOUT');
 }catch(e){
  console.warn(JSON.stringify({event:'login_flow',stage,reason:'LOGIN_INPUT_NOT_READY'}));
  return loginFailure(s,'LOGIN_INPUT_NOT_READY',loginMessages.LOGIN_INPUT_NOT_READY+' ('+stage+')');
 }finally{
  s.enteringCredentials=false;b.username='';b.password='';
  if(!s.page.isClosed()&&credentialHost(s.page.url())){
   const fields=s.page.locator('input[type="password"],input[type="text"]:not([readonly]),input[type="email"],input[type="tel"]');
   for(const field of await fields.all().catch(()=>[]))await field.fill('',{timeout:1000}).catch(()=>{});
  }
 }
}
async function quiz(s){const data=await s.page.evaluate(({bank,selectors})=>{
 const n=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
 const visible=e=>{const r=e.getBoundingClientRect();const style=getComputedStyle(e);return r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none';};
 const txt=e=>(e?.innerText||e?.textContent||'').replace(/\s+/g,' ').trim();
 const body=document.body.innerText||'';
 const success=[...document.querySelectorAll('img[alt="Congratulations Title"]')].some(visible);
 if(success)return {question:'',choices:[],targets:[],completed:true};
 const modalText=[...document.querySelectorAll('.MuiModal-root,[role=dialog]')].filter(visible).map(txt).join(' ');
 if(/ตอบผิด|ตอบไม่ครบ|ไม่ผ่าน|incorrect|wrongly|need to answer all/i.test(modalText))return {question:'',choices:[],targets:[],error:modalText.slice(0,350),completed:false};
 const blocked=[...document.querySelectorAll('iframe[src*="captcha"],[id*=captcha],[class*=captcha]')].some(visible);
 if(blocked)return {blocked:true,question:'',choices:[],targets:[]};
 let elements=[];const radios=[...document.querySelectorAll('input[type=radio],[role=radio]')].filter(e=>visible(e)||e.labels&&[...e.labels].some(visible));
 if(radios.length>=2&&radios.length<=8)elements=radios.map(e=>e.labels?.[0]||e);
 if(!elements.length){for(const selector of [selectors.choice,'.item:has(.itemchoice)','[class*=choice]','[class*=option]'].filter(Boolean)){const found=[...document.querySelectorAll(selector)].filter(visible).filter(e=>txt(e).length>0&&txt(e).length<600);if(found.length>=2&&found.length<=8){elements=found;break;}}}
 if(elements.length<2)return {question:'',choices:[],targets:[],completed:false};
 const choices=elements.map(txt);let question='';let questionEls=selectors.question?[...document.querySelectorAll(selectors.question)].filter(visible):[];
 if(questionEls.length===1)question=txt(questionEls[0]);
 if(!question){const set=choices.map(n).sort().join('|');const candidates=bank.filter(q=>n(body).includes(n(q.question))&&Array.isArray(q.choices)&&q.choices.map(n).sort().join('|')===set);const unique=[...new Set(candidates.map(q=>q.question))];if(unique.length===1)question=unique[0];}
 if(!question){questionEls=[...document.querySelectorAll('[class*=question],h1,h2,h3')].filter(visible).filter(e=>txt(e).length>8&&txt(e).length<1000);if(questionEls.length===1)question=txt(questionEls[0]);}
 const targets=elements.map((e,i)=>{const id='rov-worker-choice-'+i;e.setAttribute('data-rov-worker-target',id);return id;});return {question,choices,targets,completed:false};
 },{bank:s.bank,selectors:s.selectors});
 return {...data,fingerprint:hash(data)};
}
async function select(s,b){if(!await loggedIn(s))throw Error('ยังไม่พบการล็อกอิน Garena');const q=await quiz(s);if(q.blocked)throw Error('Garena ต้องการยืนยันเพิ่มเติม ระบบหยุดการทำงาน');if(!q.question||q.fingerprint!==b.fingerprint)throw Error('คำถามเปลี่ยนแล้ว ยกเลิกคำตอบเก่า');const i=Number(b.choice_number)-1;if(!Number.isInteger(i)||i<0||i>=q.choices.length)throw Error('Invalid choice');if(s.acted.has(q.fingerprint))throw Error('คำถามนี้เลือกไปแล้ว ไม่ส่งซ้ำ');s.acted.add(q.fingerprint);const target=s.page.locator('[data-rov-worker-target="'+q.targets[i]+'"]');await target.click({timeout:5000});await sleep(200);const checked=await target.evaluate(e=>{const input=e.matches('input[type=radio]')?e:e.querySelector('input[type=radio]');return !!input?.checked||e.getAttribute('aria-checked')==='true'||e.getAttribute('aria-selected')==='true'||e.getAttribute('data-selected')==='true'||/(^|\s)(selected|active|checked)(\s|$)/.test(e.className);});if(!checked)throw Error('ยังยืนยันสถานะเลือกไม่ได้ กรุณาตรวจหน้าจอ');s.selected=q.fingerprint;return {ok:true};}
async function next(s,b){if(!await loggedIn(s))throw Error('หลุดล็อกอิน หยุดการทำงาน');const q=await quiz(s);if(!s.selected||q.fingerprint!==s.selected||b.fingerprint&&b.fingerprint!==q.fingerprint)throw Error('คำถามเปลี่ยนหรือยังไม่ได้เลือก');if(s.submitted.has(q.fingerprint))throw Error('คำถามนี้ส่งไปแล้ว ไม่ส่งซ้ำ');const button=s.page.getByRole('button',{name:/^(ส่งคำตอบ|ยืนยันคำตอบ|ยืนยัน|ตอบ|submit|ถัดไป|ข้อถัดไป|ต่อไป|next)$/i});const visible=[];for(const e of await button.all())if(await e.isVisible()&&await e.isEnabled())visible.push(e);if(visible.length!==1)throw Error('ปุ่มส่งหรือถัดไปไม่ชัดเจน กรุณากดเอง');s.submitted.add(q.fingerprint);await visible[0].click({timeout:5000});s.selected=null;return {ok:true};}
function matching(bank,q){let m=bank.filter(x=>norm(x.question)===norm(q.question));if(m.length>1){const c=q.choices.map(norm).sort().join('|');m=m.filter(x=>x.choices?.map(norm).sort().join('|')===c);}if(m.length!==1||m[0].ambiguous)return null;const indexes=q.choices.map((c,i)=>norm(c)===norm(m[0].answer)?i:-1).filter(i=>i>=0);return indexes.length===1?{record:m[0],choice:indexes[0]+1}:null;}
async function prepareQuiz(s){
 s.state='OPENING_QUIZ';
 if(new URL(s.page.url()).pathname.includes('/auth/'))await s.page.goto(START,{waitUntil:'commit',timeout:20000});
 const until=Date.now()+25000;
 while(Date.now()<until){
  if(!await loggedIn(s))throw Error('ไม่พบการล็อกอิน Garena ในเบราว์เซอร์');
  const q=await quiz(s);if(q.blocked)throw Error('Garena ต้องการยืนยันเพิ่มเติม ระบบหยุดการทำงาน');if(q.error)throw Error(q.error);if(q.completed||q.question&&q.choices.length>=2)return q;
  const path=new URL(s.page.url()).pathname;
  if(/^\/chapter\/\d+$/.test(path)){
   const quizButton=s.page.getByRole('button',{name:/^(แบบทดสอบ|ทำแบบทดสอบ|เริ่มแบบทดสอบ|quiz|start quiz)$/i});
   const candidates=[];for(const e of await quizButton.all())if(await e.isVisible()&&await e.isEnabled())candidates.push(e);
   if(candidates.length===1){await candidates[0].click({timeout:5000});await sleep(400);continue;}
  }else if(path==='/'){
   // Read only rendered chapter cards. Never inspect account tokens or private application state.
   const entry=await s.page.evaluate(()=>{
    const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
    for(const bottom of document.querySelectorAll('.bottom')){
     if(bottom.querySelector('.bottom__completed'))continue;
     const button=[...bottom.querySelectorAll('button')].find(e=>visible(e)&&!e.disabled&&!e.classList.contains('lock')&&/^(start learning|เริ่มเรียน|เริ่มเรียนรู้)$/i.test(e.textContent.trim()));
     if(button){button.setAttribute('data-rov-run-entry','chapter');return {title:bottom.querySelector('h2')?.textContent?.trim()||'บททดสอบ'};}
    }
    return null;
   });
   if(entry){s.chapter=entry.title;addLog(s,'เปิดบท: '+entry.title);await s.page.locator('[data-rov-run-entry="chapter"]').click({timeout:5000});await sleep(400);continue;}
  }
  await sleep(500);
 }
 throw Error('RoV Academy ไม่แสดงบททดสอบที่พร้อมทำ จึงยังเริ่มตอบไม่ได้');
}
async function transition(s,fingerprint,g){
 const until=Date.now()+15000;
 while(Date.now()<until){
  if(!s.auto||s.generation!==g)return null;
  const q=await quiz(s);if(q.error)throw Error(q.error);if(q.blocked)throw Error('Garena ต้องการยืนยันเพิ่มเติม ระบบหยุดการทำงาน');
  if(q.completed||q.question&&q.fingerprint!==fingerprint)return q;
  await sleep(400);
 }
 throw Error('ส่งคำตอบแล้ว แต่ RoV Academy ยังไม่แสดงข้อถัดไปหรือผลสำเร็จ ระบบหยุดเพื่อไม่ส่งซ้ำ');
}
async function loop(s,g){
 try{while(s.auto&&!s.closed&&s.generation===g){
  await lock(s,async()=>{
   if(!s.auto||s.generation!==g)return;
   if(!await loggedIn(s))throw Error('Garena หลุดล็อกอิน ระบบหยุดการทำงาน');
   const q=await quiz(s);
   if(q.error)throw Error(q.error);
   if(q.completed){s.auto=false;s.state='COMPLETED';s.completedAt=Date.now();s.aiJob=null;addLog(s,'เสร็จแล้ว: RoV Academy แสดงผลผ่านบททดสอบ');return;}
   if(!q.question||q.blocked)throw Error('อ่านคำถามจาก RoV Academy ไม่สำเร็จ');
   let answer=s.allowAI?null:matching(s.bank,q);
   if(answer)answer={answer:answer.record.answer,choice_number:answer.choice,source:'bank',evidence:answer.record.evidence||'คลังเฉลย'};
   if(!answer&&s.aiResult?.fingerprint===q.fingerprint){answer=s.aiResult.answer;s.aiResult=null;}
   if(!answer){
    if(!s.allowAI)throw Error('ไม่พบเฉลยที่ตรง และยังไม่ได้ตั้งค่า Gemini');
    if(!s.aiJob||s.aiJob.question.fingerprint!==q.fingerprint)s.aiJob={generation:g,question:{question:q.question,choices:q.choices,fingerprint:q.fingerprint},lease:null};
    s.current={question:q.question,choices:q.choices,answer:null,source:null};s.state='ANALYZING';return;
   }
   s.aiJob=null;s.current={question:q.question,choices:q.choices,answer:answer.answer,choice_number:answer.choice_number,source:answer.source,evidence:answer.evidence,submitted:false};
   s.state='ANSWER_FOUND';addLog(s,'พบคำตอบจาก '+(answer.source==='gemini'?'Gemini':'คลังเฉลย')+': '+answer.answer);
   if(!s.auto||s.generation!==g)return;
   if(s.selected!==q.fingerprint)await select(s,{choice_number:answer.choice_number,fingerprint:q.fingerprint});
   if(!s.auto||s.generation!==g)return;
   s.state='SUBMITTING';await next(s,{fingerprint:q.fingerprint});
   const changed=await transition(s,q.fingerprint,g);if(!changed)return;
   s.answered++;s.current.submitted=true;s.history.push({...s.current,time:Date.now()});s.history=s.history.slice(-30);addLog(s,'ยืนยันการทำข้อที่ '+s.answered+' แล้ว');
   if(changed.completed){s.auto=false;s.state='COMPLETED';s.completedAt=Date.now();addLog(s,'เสร็จแล้ว: RoV Academy แสดงผลผ่านบททดสอบ');}else s.state='RUNNING';
  });
  if(s.auto)await sleep(700);
 }}catch(e){if(s.generation!==g)return;s.auto=false;s.state='PAUSED';s.error=String(e.message||'ตอบคำถามไม่สำเร็จ').slice(0,350);s.aiJob=null;addLog(s,'ระบบหยุดการตอบ โปรดตรวจข้อผิดพลาด');}
}
function status(s){return {loggedIn:s.loggedIn===true,auto:s.auto,state:s.state,answered:s.answered,logs:s.logs,current:s.current||null,history:s.history||[],chapter:s.chapter||null,completedAt:s.completedAt||null,error:s.error||null,generation:s.generation,aiJob:s.aiJob?{generation:s.aiJob.generation,question:s.aiJob.question,claimed:!!s.aiJob.lease&&s.aiJob.lease.expiresAt>Date.now()}:null};}
function connectionView(s){return {sessionId:s.id,pending:false,connected:true,restoredLogin:s.restoredAuth===true};}
async function createBrowser(id,questions,profileId,authState){let browser;try{
 let storageState,authStateInvalid=false;
 if(authState){try{storageState=openAuth(profileId,authState);}catch{authStateInvalid=true;}}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],timeout:45000});
 const context=await browser.newContext({viewport:{width:412,height:820},...(storageState?{storageState}:{})});const page=await context.newPage();
 const s={id,profileId,browser,context,page,used:Date.now(),auto:false,closed:false,generation:0,bank:Array.isArray(questions)?questions.slice(0,1500):[],selectors:{question:process.env.QUESTION_SELECTOR||'.question',choice:process.env.CHOICE_SELECTOR||'.item:has(.itemchoice)'},queue:Promise.resolve(),acted:new Set(),submitted:new Set(),selected:null,logs:[],state:'CREATED',loggedIn:false,answered:0,history:[],aiJob:null,aiResult:null,error:null,allowAI:false,restoredAuth:!!storageState,authStateInvalid,authExportedAt:0,startedAt:0};
 page.setDefaultTimeout(7000);context.on('page',p=>{s.page=p;p.setDefaultTimeout(7000);p.on('close',()=>{const remaining=context.pages().filter(x=>!x.isClosed());if(remaining.length)s.page=remaining[remaining.length-1];});});
 await context.route('**/*',route=>{const r=route.request();if(r.isNavigationRequest()&&r.frame()===s.page.mainFrame()&&(!safeHost(r.url())||s.enteringCredentials&&!credentialHost(r.url())&&new URL(r.url()).hostname!=='academy.rov.in.th'))return route.abort();return route.continue();});
 if(cancelledCreations.has(id)){await browser.close().catch(()=>{});return;}
 sessions.set(id,s);
 }catch(e){if(browser)await browser.close().catch(()=>{});if(!cancelledCreations.has(id)){failedCreations.set(id,'เบราว์เซอร์เริ่มไม่สำเร็จ กรุณาสร้างเซสชันใหม่');setTimeout(()=>failedCreations.delete(id),5*60*1000).unref();console.error('Browser creation failed: '+String(e.message).slice(0,180));}}
 finally{creating.delete(id);cancelledCreations.delete(id);}
}
app.post('/sessions',wrap(async(req,res)=>{
 const id=req.body.requestId||crypto.randomUUID(),profileId=req.body.profileId;if(typeof id!=='string'||!UUID.test(id))throw Error('Invalid requestId');
 if(typeof profileId!=='string'||!UUID.test(profileId))throw Error('Invalid profileId');if(!AUTH_KEY)throw Error('Encrypted login storage is not configured');
 if(req.body.authState!==undefined&&(typeof req.body.authState!=='string'||Buffer.byteLength(req.body.authState)>AUTH_STATE_MAX_BYTES))throw Error('Invalid encrypted login state');
 const existing=sessions.get(id);if(existing){existing.used=Date.now();return res.json(connectionView(existing));}
 if(failedCreations.has(id))throw Error(failedCreations.get(id));
 if(creating.has(id))return res.status(202).json({sessionId:id,pending:true,state:'CREATING'});
 if(sessions.size+creating.size>=MAX)return res.status(429).json({error:'มีเบราว์เซอร์ใช้งานอยู่ กรุณาปิดเซสชันเดิมก่อน'});
 // Reserve capacity synchronously; retries with the same requestId reuse the job.
 creating.set(id,true);void createBrowser(id,req.body.questions,profileId,req.body.authState);
 return res.status(202).json({sessionId:id,pending:true,state:'CREATING'});
}));
app.post('/sessions/:id/start',wrap(async(req,res)=>{const s=find(req);if(s.state!=='CREATED')return res.json({ok:true});if(!s.startPromise)s.startPromise=lock(s,()=>s.page.goto(START,{waitUntil:'commit',timeout:20000})).then(()=>{s.state='WAITING_LOGIN';s.startedAt=Date.now();}).catch(e=>{s.startPromise=null;throw e;});await s.startPromise;res.json({ok:true});}));
app.get('/sessions/:id/login-status',wrap(async(req,res)=>{if(creating.has(req.params.id))return res.status(202).json({loggedIn:false,pending:true,state:'CREATING',auto:false,answered:0});const s=find(req);const ok=await lock(s,()=>loggedIn(s));let authState=null,clearAuthState=false;if(ok)authState=await lock(s,()=>exportAuth(s));else if((s.restoredAuth||s.authStateInvalid)&&s.startedAt&&Date.now()-s.startedAt>20000){clearAuthState=true;s.restoredAuth=false;s.authStateInvalid=false;}res.json({loggedIn:ok,pending:false,...status(s),...(authState?{authState}:{}),...(clearAuthState?{clearAuthState:true}:{})});}));
app.post('/sessions/:id/credentials',async(req,res)=>{
 try{
  if(typeof req.body.username!=='string'||!req.body.username.trim()||req.body.username.length>150||typeof req.body.password!=='string'||!req.body.password||req.body.password.length>1024)return res.status(400).json({error:'กรอกบัญชีและรหัสผ่านให้ครบ'});
  const s=find(req);if(s.auto)return res.status(409).json({error:'หยุดการตอบคำถามก่อนล็อกอินใหม่'});
  const result=await lock(s,()=>enterCredentials(s,req.body));const authState=result.loggedIn?await lock(s,()=>exportAuth(s,true)):null;
  res.status(result.loggedIn?200:401).json({...result,...connectionView(s),...(authState?{authState}:{}),...(result.loggedIn?{}:{clearAuthState:true}),error:result.loggedIn?undefined:result.message});
 }catch{res.status(409).json({error:'ไม่พบเซสชัน กรุณาสร้างใหม่'});}
 finally{if(req.body&&typeof req.body==='object'){req.body.username='';req.body.password='';}}
});
app.get('/sessions/:id/question',wrap(async(req,res)=>{const s=find(req);if(!await lock(s,()=>loggedIn(s)))throw Error('ยังไม่พบล็อกอิน Garena');res.json(await lock(s,()=>quiz(s)));}));
app.post('/sessions/:id/select',wrap(async(req,res)=>{const s=find(req);if(s.auto)throw Error('ออโต้กำลังทำงาน');res.json(await lock(s,()=>select(s,req.body)));}));
app.post('/sessions/:id/next',wrap(async(req,res)=>{const s=find(req);if(s.auto)throw Error('ออโต้กำลังทำงาน');res.json(await lock(s,()=>next(s,req.body)));}));
app.post('/sessions/:id/auto',wrap(async(req,res)=>{
 const s=find(req);
 const started=await lock(s,async()=>{
  if(s.auto)return false;
  if(!Array.isArray(req.body.questions)||req.body.questions.length>1500)throw Error('คลังเฉลยไม่ถูกต้อง');
  s.bank=req.body.questions.filter(x=>typeof x.question==='string'&&typeof x.answer==='string');s.allowAI=req.body.allowAI===true;
  if(!s.bank.length&&!s.allowAI)throw Error('ยังไม่มีคลังเฉลยหรือ Gemini');
  if(!await loggedIn(s))throw Error('ยังไม่พบล็อกอิน Garena');
  const q=await prepareQuiz(s);if(q.completed){s.state='COMPLETED';return false;}
  s.auto=true;s.generation++;s.state='RUNNING';s.error=null;s.aiJob=null;s.aiResult=null;addLog(s,'เริ่มอ่านและตอบคำถามอัตโนมัติ');return true;
 });
 res.json(status(s));if(started)void loop(s,s.generation);
}));
app.post('/sessions/:id/ai-claim',wrap(async(req,res)=>{
 const s=find(req);const job=s.aiJob;
 if(!s.auto||!job||job.generation!==req.body.generation||job.question.fingerprint!==req.body.fingerprint||job.lease&&job.lease.expiresAt>Date.now())return res.json({claimed:false});
 job.lease={id:crypto.randomUUID(),expiresAt:Date.now()+90000};res.json({claimed:true,lease:job.lease.id,generation:job.generation,question:job.question});
}));
app.post('/sessions/:id/ai-answer',wrap(async(req,res)=>{
 const s=find(req),job=s.aiJob,b=req.body;
 if(!s.auto||!job||s.generation!==b.generation||job.generation!==b.generation||job.lease?.id!==b.lease||job.lease.expiresAt<Date.now())return res.json({accepted:false});
 if(b.error){s.auto=false;s.state='PAUSED';s.error=String(b.error).slice(0,350);s.aiJob=null;addLog(s,'AI วิเคราะห์ไม่สำเร็จ ระบบหยุดการตอบ');return res.json({accepted:false});}
 const q=await lock(s,()=>quiz(s));if(!s.auto||s.generation!==b.generation||s.aiJob!==job)return res.json({accepted:false});if(q.fingerprint!==job.question.fingerprint){s.aiJob=null;return res.json({accepted:false});}
 const a=b.answer;
 if(!Number.isInteger(a?.choice_number)||a.choice_number<1||a.choice_number>q.choices.length||norm(a.answer)!==norm(q.choices[a.choice_number-1])||!['bank','gemini'].includes(a.source))throw Error('ผล AI ไม่ตรงกับตัวเลือก');
 s.aiResult={fingerprint:q.fingerprint,answer:{answer:q.choices[a.choice_number-1],choice_number:a.choice_number,source:a.source,evidence:String(a.evidence||'').slice(0,500)}};s.aiJob=null;res.json({accepted:true});
}));
app.get('/sessions/:id/auto',wrap(async(req,res)=>res.json(status(find(req)))));
app.post('/sessions/:id/pause',wrap(async(req,res)=>{const s=find(req);s.auto=false;s.generation++;s.state='PAUSED';s.aiJob=null;s.aiResult=null;addLog(s,'หยุดตามคำขอ');res.json(status(s));}));
app.post('/sessions/:id/stop',wrap(async(req,res)=>{if(creating.has(req.params.id)){cancelledCreations.add(req.params.id);return res.json({ok:true,clearAuthState:true});}const s=find(req);s.auto=false;s.generation++;s.closed=true;sessions.delete(s.id);await s.browser.close().catch(()=>{});res.json({ok:true,clearAuthState:true});}));
app.post('/diagnostics',wrap(async(req,res)=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{const page=await browser.newPage();await page.setContent('<h2>Which answer?</h2><label><input type="radio" name="q">A</label><label><input type="radio" name="q">B</label>');const s={page,bank:[{question:'Which answer?',choices:['A','B'],answer:'B'}],selectors:{}};const q=await quiz(s);if(q.question!=='Which answer?'||q.choices.join('|')!=='A|B')throw Error('Parser fixture failed');if(matching(s.bank,q)?.choice!==2)throw Error('Choice mapping failed');if(matching([{...s.bank[0],ambiguous:true}],q)!==null)throw Error('Ambiguous guard failed');if(await loggedIn(s))throw Error('Login guard failed');res.json({ok:true,checks:['chromium-launch','quiz-parser','choice-mapping','ambiguous-stop','login-not-inferred-from-url'],liveGarenaTested:false});}finally{await browser.close();}}));
setInterval(()=>{for(const [id,s]of sessions)if(Date.now()-s.used>30*60*1000){s.auto=false;s.closed=true;sessions.delete(id);void s.browser.close().catch(()=>{});}},60000).unref();
process.on('SIGTERM',()=>{for(const s of sessions.values()){s.auto=false;void s.browser.close();}setTimeout(()=>process.exit(),1000).unref();});
app.listen(PORT,'0.0.0.0',()=>console.log('Browser Worker v2.5 listening on '+PORT));
