import express from 'express';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const app=express();app.disable('x-powered-by');app.set('trust proxy',1);app.use(express.json({limit:'1mb'}));
const PORT=Number(process.env.PORT||10000),tokens=[process.env.BROWSER_WORKER_TOKEN,process.env.SITES_WORKER_TOKEN].filter(Boolean);
const START='https://academy.rov.in.th/';const sessions=new Map(),creating=new Map(),failedCreations=new Map(),cancelledCreations=new Set();const MAX=Number(process.env.MAX_BROWSER_SESSIONS||1);
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const hash=q=>crypto.createHash('sha256').update(JSON.stringify([q.question,q.choices])).digest('hex');
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function safeHost(url){try{const u=new URL(url);return u.protocol==='https:'&&['rov.in.th','garena.com','garena.co.th','garena.in.th','garenanow.com','facebook.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}}
function addLog(s,msg){s.logs.push({time:Date.now(),message:msg});s.logs=s.logs.slice(-40);}
async function lock(s,fn){const prev=s.queue;s.queue=new Promise(r=>s.releaseQueue=r);const release=s.releaseQueue;await prev;try{if(s.closed)throw Error('เซสชันปิดแล้ว');return await fn();}finally{release();}}
function find(req){const s=sessions.get(req.params.id);if(!s)throw Error('ไม่พบเซสชัน กรุณาสร้างใหม่');s.used=Date.now();return s;}
const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(409).json({error:e.message?.slice(0,220)||'Worker error'});}};
app.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});next();});
app.get('/health',(_req,res)=>res.json({ok:true,version:'2.2.0',service:'rov-browser-worker',sessions:sessions.size,starting:creating.size,configured:tokens.length>0,capabilities:{idempotentSessions:true,credentialLogin:true}}));
// A session-specific view capability is exchanged for an HttpOnly cookie. It never exposes the service token.
app.get('/live/:id',wrap(async(req,res)=>{find(req);res.type('html').send(LIVE_HTML);}));
app.post('/live/:id/auth',wrap(async(req,res)=>{const s=find(req);if(!equal(req.body.key,s.viewKey))return res.status(401).json({error:'ลิงก์หมดอายุหรือไม่ถูกต้อง'});const name='view_'+s.id.replaceAll('-','');res.cookie(name,s.viewKey,{httpOnly:true,secure:process.env.NODE_ENV!=='test',sameSite:'strict',path:'/live/'+s.id,maxAge:30*60*1000});res.json({ok:true});}));
function liveAuth(req,res,next){const s=sessions.get(req.params.id);const name='view_'+String(req.params.id).replaceAll('-','');const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);if(!s||!equal(cookie,s.viewKey))return res.status(401).json({error:'เปิดลิงก์ล็อกอินใหม่จากเว็บผู้ช่วย'});if(req.method!=='GET'&&req.headers.origin!==new URL(process.env.PUBLIC_WORKER_URL||'https://'+req.headers.host).origin)return res.status(403).json({error:'Invalid origin'});s.used=Date.now();next();}
app.get('/live/:id/screen',liveAuth,wrap(async(req,res)=>{const s=find(req);const jpeg=await lock(s,()=>s.page.screenshot({type:'jpeg',quality:65,timeout:8000}));res.type('jpeg').send(jpeg);}));
app.post('/live/:id/input',liveAuth,wrap(async(req,res)=>{const s=find(req);if(s.auto)return res.status(409).json({error:'หยุดออโต้ก่อนควบคุมหน้าจอ'});const b=req.body;await lock(s,async()=>{if(b.kind==='click'){if(!Number.isFinite(b.x)||!Number.isFinite(b.y)||b.x<0||b.x>412||b.y<0||b.y>820)throw Error('Invalid position');await s.page.mouse.click(b.x,b.y);}else if(b.kind==='text'){await s.page.keyboard.insertText(String(b.text||'').slice(0,1000));}else if(b.kind==='key'){if(!['Enter','Tab','Backspace','Escape','Control+A'].includes(b.key))throw Error('Invalid key');await s.page.keyboard.press(b.key);}else if(b.kind==='scroll'){await s.page.mouse.wheel(0,Number(b.delta)>0?500:-500);}else throw Error('Invalid input');});res.json({ok:true});}));
app.post('/live/:id/pause',liveAuth,wrap(async(req,res)=>{const s=find(req);s.auto=false;s.generation++;addLog(s,'หยุดออโต้จากหน้าล็อกอิน');res.json({ok:true});}));
app.use((req,res,next)=>{if(!tokens.length)return res.status(503).json({error:'Worker token not configured'});if(!tokens.some(t=>equal(req.headers.authorization,'Bearer '+t)))return res.status(401).json({error:'Unauthorized'});next();});
// Check the authenticated profile/logout UI rendered by Academy (mobile menu may be collapsed). Never read login tokens or infer login from URL.
async function loggedIn(s){if(new URL(s.page.url()).hostname!=='academy.rov.in.th')return false;return s.page.evaluate(()=>{const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};const els=[...document.querySelectorAll('button,a,[role=button]')].filter(visible);const logout=e=>/^(ออกจากระบบ|ล็อกเอาท์|logout|log out)$/i.test((e.textContent||'').trim());const profile=document.querySelector('.menuright .user .name');const menuLabels=[...document.querySelectorAll('.menuright span,.menuright [role=button]')];return els.some(logout)||!!profile?.textContent?.trim()&&menuLabels.some(logout);});}
// Academy's published OAuth configuration: app 100055, Garena platform 1, its own callback.
const GARENA_LOGIN='https://100055.connect.garena.com/oauth/login?response_type=code&client_id=100055&redirect_uri=https%3A%2F%2Facademy.rov.in.th%2Fauth%2Fcallback%2F&locale=th-TH&platform=1';
function credentialHost(url){try{const u=new URL(url);return u.protocol==='https:'&&['100055.connect.garena.com','sso.garena.com','auth.garena.com','account.garena.com'].includes(u.hostname);}catch{return false;}}
async function enterCredentials(s,b){
 if(s.auto)throw Error('Pause first');
 if(await loggedIn(s))return {loggedIn:true,submitted:false};
 let submitted=false;
 s.enteringCredentials=true;
 try{
  if(!credentialHost(s.page.url()))await s.page.goto(GARENA_LOGIN,{waitUntil:'domcontentloaded',timeout:15000});
  // Never fill on Academy, Facebook, a CAPTCHA frame or an unrecognized host.
  const password=s.page.locator('input[type="password"]:visible');
  await password.first().waitFor({state:'visible',timeout:8000});
  const username=s.page.locator('input[type="text"]:visible,input[type="email"]:visible,input[type="tel"]:visible');
  if(!credentialHost(s.page.url())||await password.count()!==1||await username.count()!==1)throw Error('Unrecognized login form');
  const safeForm=await password.evaluate(e=>{const f=e.closest('form');const a=f?.getAttribute('action');if(!a)return true;const u=new URL(a,location.href);return u.protocol==='https:'&&['100055.connect.garena.com','sso.garena.com','auth.garena.com','account.garena.com'].includes(u.hostname);});
  if(!safeForm)throw Error('Invalid form target');
  await username.fill(b.username,{timeout:3000});
  if(!credentialHost(s.page.url()))throw Error('Login page changed');
  await password.fill(b.password,{timeout:3000});
  b.username='';b.password='';
  const button=s.page.locator('button[type="submit"]:visible,input[type="submit"]:visible');
  if(!credentialHost(s.page.url())||await button.count()!==1)throw Error('Unrecognized submit button');
  await button.click({timeout:3000});submitted=true;
  const until=Date.now()+6000;
  while(Date.now()<until){if(await loggedIn(s))return {loggedIn:true,submitted:true};await sleep(500);}
  return {loggedIn:false,submitted:true,needsInteraction:true};
 }finally{
  s.enteringCredentials=false;b.username='';b.password='';
  // Clear failed preparation. An official submitted form may need its password to finish CAPTCHA.
  if(!submitted&&!s.page.isClosed()&&credentialHost(s.page.url()))await s.page.locator('input[type="password"]').fill('',{timeout:1000}).catch(()=>{});
 }
}
async function quiz(s){const data=await s.page.evaluate(({bank,selectors})=>{
 const n=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
 const visible=e=>{const r=e.getBoundingClientRect();const style=getComputedStyle(e);return r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none';};
 const txt=e=>(e?.innerText||e?.textContent||'').replace(/\s+/g,' ').trim();
 const body=document.body.innerText||'';const blocked=!!document.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"]')&&/captcha|ยืนยัน.*มนุษย์/i.test(body);
 if(blocked)return {blocked:true,question:'',choices:[],targets:[]};
 let elements=[];const radios=[...document.querySelectorAll('input[type=radio],[role=radio]')].filter(e=>visible(e)||e.labels&&[...e.labels].some(visible));
 if(radios.length>=2&&radios.length<=8)elements=radios.map(e=>e.labels?.[0]||e);
 if(!elements.length){for(const selector of [selectors.choice,'.item:has(.itemchoice)','[class*=choice]','[class*=option]'].filter(Boolean)){const found=[...document.querySelectorAll(selector)].filter(visible).filter(e=>txt(e).length>0&&txt(e).length<600);if(found.length>=2&&found.length<=8){elements=found;break;}}}
 if(elements.length<2)return {question:'',choices:[],targets:[],completed:/ทำแบบทดสอบเสร็จ|จบแบบทดสอบ|ผลการทดสอบ|quiz completed/i.test(body)};
 const choices=elements.map(txt);let question='';let questionEls=selectors.question?[...document.querySelectorAll(selectors.question)].filter(visible):[];
 if(questionEls.length===1)question=txt(questionEls[0]);
 if(!question){const set=choices.map(n).sort().join('|');const candidates=bank.filter(q=>n(body).includes(n(q.question))&&Array.isArray(q.choices)&&q.choices.map(n).sort().join('|')===set);const unique=[...new Set(candidates.map(q=>q.question))];if(unique.length===1)question=unique[0];}
 if(!question){questionEls=[...document.querySelectorAll('[class*=question],h1,h2,h3')].filter(visible).filter(e=>txt(e).length>8&&txt(e).length<1000);if(questionEls.length===1)question=txt(questionEls[0]);}
 const targets=elements.map((e,i)=>{const id='rov-worker-choice-'+i;e.setAttribute('data-rov-worker-target',id);return id;});return {question,choices,targets,completed:false};
 },{bank:s.bank,selectors:s.selectors});
 return {...data,fingerprint:hash(data)};
}
async function select(s,b){if(!await loggedIn(s))throw Error('ยังไม่พบการล็อกอิน Garena');const q=await quiz(s);if(q.blocked)throw Error('พบ CAPTCHA ให้ผู้ใช้ดำเนินการเอง');if(!q.question||q.fingerprint!==b.fingerprint)throw Error('คำถามเปลี่ยนแล้ว ยกเลิกคำตอบเก่า');const i=Number(b.choice_number)-1;if(!Number.isInteger(i)||i<0||i>=q.choices.length)throw Error('Invalid choice');if(s.acted.has(q.fingerprint))throw Error('คำถามนี้เลือกไปแล้ว ไม่ส่งซ้ำ');s.acted.add(q.fingerprint);const target=s.page.locator('[data-rov-worker-target="'+q.targets[i]+'"]');await target.click({timeout:5000});await sleep(200);const checked=await target.evaluate(e=>{const input=e.matches('input[type=radio]')?e:e.querySelector('input[type=radio]');return !!input?.checked||e.getAttribute('aria-checked')==='true'||e.getAttribute('aria-selected')==='true'||e.getAttribute('data-selected')==='true'||/(^|\s)(selected|active|checked)(\s|$)/.test(e.className);});if(!checked)throw Error('ยังยืนยันสถานะเลือกไม่ได้ กรุณาตรวจหน้าจอ');s.selected=q.fingerprint;return {ok:true};}
async function next(s,b){if(!await loggedIn(s))throw Error('หลุดล็อกอิน หยุดการทำงาน');const q=await quiz(s);if(!s.selected||q.fingerprint!==s.selected||b.fingerprint&&b.fingerprint!==q.fingerprint)throw Error('คำถามเปลี่ยนหรือยังไม่ได้เลือก');if(s.submitted.has(q.fingerprint))throw Error('คำถามนี้ส่งไปแล้ว ไม่ส่งซ้ำ');const button=s.page.getByRole('button',{name:/^(ส่งคำตอบ|ยืนยันคำตอบ|ยืนยัน|ตอบ|submit|ถัดไป|ข้อถัดไป|ต่อไป|next)$/i});const visible=[];for(const e of await button.all())if(await e.isVisible()&&await e.isEnabled())visible.push(e);if(visible.length!==1)throw Error('ปุ่มส่งหรือถัดไปไม่ชัดเจน กรุณากดเอง');s.submitted.add(q.fingerprint);await visible[0].click({timeout:5000});s.selected=null;return {ok:true};}
function matching(bank,q){let m=bank.filter(x=>norm(x.question)===norm(q.question));if(m.length>1){const c=q.choices.map(norm).sort().join('|');m=m.filter(x=>x.choices?.map(norm).sort().join('|')===c);}if(m.length!==1||m[0].ambiguous)return null;const indexes=q.choices.map((c,i)=>norm(c)===norm(m[0].answer)?i:-1).filter(i=>i>=0);return indexes.length===1?{record:m[0],choice:indexes[0]+1}:null;}
async function loop(s,g){try{while(s.auto&&!s.closed&&s.generation===g){await lock(s,async()=>{if(!s.auto||s.generation!==g)return;if(!await loggedIn(s))throw Error('ยังไม่พบล็อกอิน / หลุดล็อกอิน');const q=await quiz(s);if(q.completed){s.auto=false;s.state='COMPLETED';addLog(s,'จบบททดสอบที่เปิดอยู่');return;}if(!q.question||q.blocked)throw Error('ไม่พบคำถามชัดเจน หรือมี CAPTCHA');const answer=matching(s.bank,q);if(!answer)throw Error('ไม่พบเฉลยชัดเจน หรือข้อนี้กำกวม');s.current={question:q.question,answer:answer.record.answer};s.state='ANSWER_FOUND';addLog(s,'พบเฉลย: '+answer.record.answer);await sleep(900);if(!s.auto||s.generation!==g)return;await select(s,{choice_number:answer.choice,fingerprint:q.fingerprint});if(!s.auto||s.generation!==g)return;await next(s,{fingerprint:q.fingerprint});s.answered++;s.state='NEXT_QUESTION';addLog(s,'ส่งคำสั่งแล้ว '+s.answered+' ข้อ');});await sleep(1800);if(s.auto&&s.selected===null){const q=await lock(s,()=>quiz(s));if(s.acted.has(q.fingerprint)){s.auto=false;s.state='PAUSED';addLog(s,'หน้าจอยังเป็นข้อเดิม กรุณาตรวจผลหรือกดถัดไปในหน้าล็อกอิน');}}}}catch(e){s.auto=false;s.state='PAUSED';addLog(s,e.message);} }
function status(s){return {auto:s.auto,state:s.state,answered:s.answered,logs:s.logs,current:s.current||null};}
function liveView(s,req){return {sessionId:s.id,pending:false,liveUrl:(process.env.PUBLIC_WORKER_URL||'https://'+req.headers.host)+'/live/'+s.id+'#'+s.viewKey,interactive:true};}
async function createBrowser(id,questions){let browser;try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],timeout:45000});
 const context=await browser.newContext({viewport:{width:412,height:820}});const page=await context.newPage();
 const s={id,browser,context,page,viewKey:crypto.randomBytes(32).toString('base64url'),used:Date.now(),auto:false,closed:false,generation:0,bank:Array.isArray(questions)?questions.slice(0,1500):[],selectors:{question:process.env.QUESTION_SELECTOR||'.question',choice:process.env.CHOICE_SELECTOR||'.item:has(.itemchoice)'},queue:Promise.resolve(),acted:new Set(),submitted:new Set(),selected:null,logs:[],state:'CREATED',answered:0};
 page.setDefaultTimeout(7000);context.on('page',p=>{s.page=p;p.setDefaultTimeout(7000);p.on('close',()=>{const remaining=context.pages().filter(x=>!x.isClosed());if(remaining.length)s.page=remaining[remaining.length-1];});});
 await context.route('**/*',route=>{const r=route.request();if(r.isNavigationRequest()&&r.frame()===s.page.mainFrame()&&(!safeHost(r.url())||s.enteringCredentials&&!credentialHost(r.url())&&new URL(r.url()).hostname!=='academy.rov.in.th'))return route.abort();return route.continue();});
 if(cancelledCreations.has(id)){await browser.close().catch(()=>{});return;}
 sessions.set(id,s);
 }catch(e){if(browser)await browser.close().catch(()=>{});if(!cancelledCreations.has(id)){failedCreations.set(id,'เบราว์เซอร์เริ่มไม่สำเร็จ กรุณาสร้างเซสชันใหม่');setTimeout(()=>failedCreations.delete(id),5*60*1000).unref();console.error('Browser creation failed: '+String(e.message).slice(0,180));}}
 finally{creating.delete(id);cancelledCreations.delete(id);}
}
app.post('/sessions',wrap(async(req,res)=>{
 const id=req.body.requestId||crypto.randomUUID();if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid requestId');
 const existing=sessions.get(id);if(existing){existing.used=Date.now();return res.json(liveView(existing,req));}
 if(failedCreations.has(id))throw Error(failedCreations.get(id));
 if(creating.has(id))return res.status(202).json({sessionId:id,pending:true,state:'CREATING'});
 if(sessions.size+creating.size>=MAX)return res.status(429).json({error:'มีเบราว์เซอร์ใช้งานอยู่ กรุณาปิดเซสชันเดิมก่อน'});
 // Reserve capacity synchronously; retries with the same requestId reuse the job.
 creating.set(id,true);void createBrowser(id,req.body.questions);
 return res.status(202).json({sessionId:id,pending:true,state:'CREATING'});
}));
app.post('/sessions/:id/start',wrap(async(req,res)=>{const s=find(req);if(s.state!=='CREATED')return res.json({ok:true});if(!s.startPromise)s.startPromise=lock(s,()=>s.page.goto(START,{waitUntil:'commit',timeout:20000})).then(()=>{s.state='WAITING_LOGIN';}).catch(e=>{s.startPromise=null;throw e;});await s.startPromise;res.json({ok:true});}));
app.get('/sessions/:id/live',wrap(async(req,res)=>{if(creating.has(req.params.id))return res.status(202).json({pending:true,state:'CREATING'});if(failedCreations.has(req.params.id))throw Error(failedCreations.get(req.params.id));res.json(liveView(find(req),req));}));
app.get('/sessions/:id/login-status',wrap(async(req,res)=>{if(creating.has(req.params.id))return res.status(202).json({loggedIn:false,pending:true,state:'CREATING',auto:false,answered:0});const s=find(req);res.json({loggedIn:await lock(s,()=>loggedIn(s)),pending:false,...status(s)});}));
app.post('/sessions/:id/credentials',async(req,res)=>{
 try{
  if(typeof req.body.username!=='string'||!req.body.username.trim()||req.body.username.length>150||typeof req.body.password!=='string'||!req.body.password||req.body.password.length>1024)return res.status(400).json({error:'กรอกบัญชีและรหัสผ่านให้ครบ'});
  const s=find(req);if(s.auto)return res.status(409).json({error:'หยุดออโต้ก่อนล็อกอิน'});
  res.json(await lock(s,()=>enterCredentials(s,req.body)));
 }catch{res.status(409).json({error:'กรอกบัญชีในหน้า Garena ไม่สำเร็จ กรุณาเปิดหน้าจอเพื่อตรวจ CAPTCHA / OTP หรือรูปแบบหน้าล็อกอิน'});}
 finally{req.body.username='';req.body.password='';}
});
app.get('/sessions/:id/question',wrap(async(req,res)=>{const s=find(req);if(!await lock(s,()=>loggedIn(s)))throw Error('ยังไม่พบล็อกอิน Garena');res.json(await lock(s,()=>quiz(s)));}));
app.post('/sessions/:id/select',wrap(async(req,res)=>{const s=find(req);if(s.auto)throw Error('ออโต้กำลังทำงาน');res.json(await lock(s,()=>select(s,req.body)));}));
app.post('/sessions/:id/next',wrap(async(req,res)=>{const s=find(req);if(s.auto)throw Error('ออโต้กำลังทำงาน');res.json(await lock(s,()=>next(s,req.body)));}));
app.post('/sessions/:id/auto',wrap(async(req,res)=>{const s=find(req);if(s.auto)return res.json(status(s));if(!Array.isArray(req.body.questions)||req.body.questions.length>1500)throw Error('คลังเฉลยไม่ถูกต้อง');s.bank=req.body.questions.filter(x=>typeof x.question==='string'&&typeof x.answer==='string');if(!s.bank.length)throw Error('ไม่มีเฉลย');if(!await lock(s,()=>loggedIn(s)))throw Error('ยังไม่พบล็อกอิน Garena');s.auto=true;s.generation++;s.state='RUNNING';addLog(s,'เริ่มออโต้จากคลังเฉลย');res.json(status(s));void loop(s,s.generation);}));
app.get('/sessions/:id/auto',wrap(async(req,res)=>res.json(status(find(req)))));
app.post('/sessions/:id/pause',wrap(async(req,res)=>{const s=find(req);s.auto=false;s.generation++;s.state='PAUSED';addLog(s,'หยุดออโต้ตามคำขอ');res.json(status(s));}));
app.post('/sessions/:id/stop',wrap(async(req,res)=>{if(creating.has(req.params.id)){cancelledCreations.add(req.params.id);return res.json({ok:true});}const s=find(req);s.auto=false;s.generation++;s.closed=true;sessions.delete(s.id);await s.browser.close().catch(()=>{});res.json({ok:true});}));
app.post('/diagnostics',wrap(async(req,res)=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{const page=await browser.newPage();await page.setContent('<h2>Which answer?</h2><label><input type="radio" name="q">A</label><label><input type="radio" name="q">B</label>');const s={page,bank:[{question:'Which answer?',choices:['A','B'],answer:'B'}],selectors:{}};const q=await quiz(s);if(q.question!=='Which answer?'||q.choices.join('|')!=='A|B')throw Error('Parser fixture failed');if(matching(s.bank,q)?.choice!==2)throw Error('Choice mapping failed');if(matching([{...s.bank[0],ambiguous:true}],q)!==null)throw Error('Ambiguous guard failed');if(await loggedIn(s))throw Error('Login guard failed');res.json({ok:true,checks:['chromium-launch','quiz-parser','choice-mapping','ambiguous-stop','login-not-inferred-from-url'],liveGarenaTested:false});}finally{await browser.close();}}));
setInterval(()=>{for(const [id,s]of sessions)if(Date.now()-s.used>30*60*1000){s.auto=false;s.closed=true;sessions.delete(id);void s.browser.close().catch(()=>{});}},60000).unref();
process.on('SIGTERM',()=>{for(const s of sessions.values()){s.auto=false;void s.browser.close();}setTimeout(()=>process.exit(),1000).unref();});
const LIVE_HTML=`<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ล็อกอิน Garena · Browser Worker</title><style>body{margin:0;background:#f2f5ed;font:14px Arial;color:#244638}header{padding:15px;background:#fff;position:sticky;top:0}h1{font-size:18px;margin:0 0 8px}button,input{font:inherit;padding:11px;border:1px solid #ced9c7;border-radius:9px}button{background:#245b49;color:white;cursor:pointer}#screen{display:block;width:100%;max-width:412px;margin:auto;touch-action:manipulation}#controls{padding:12px;display:flex;gap:7px;flex-wrap:wrap;max-width:412px;margin:auto}input{width:190px}#msg{font-size:12px}p{line-height:1.5}</style><header><h1>ล็อกอิน Garena ด้วยตัวเอง</h1><div id="msg">กำลังเชื่อมหน้าจอ…</div><p>แตะช่องบนภาพ → พิมพ์ข้อความในช่องด้านล่าง → กดส่งข้อความ<br>ทำ CAPTCHA / OTP เอง แล้วเปิดบททดสอบ กลับเว็บผู้ช่วยเพื่อเริ่มออโต้</p><button id="pause">หยุดออโต้</button></header><img id="screen" alt="หน้าจอเบราว์เซอร์ Garena"><div id="controls"><input id="text" type="password" autocomplete="off" placeholder="ข้อความส่งไปช่องที่แตะ"><button id="send">ส่งข้อความ</button><button data-key="Tab">Tab</button><button data-key="Enter">Enter</button><button data-key="Control+A">เลือกทั้งหมด</button><button data-key="Backspace">ลบ</button><button data-delta="-500">เลื่อนขึ้น</button><button data-delta="500">เลื่อนลง</button></div><script>
const base=location.pathname,key=location.hash.slice(1),screen=document.getElementById('screen'),msg=document.getElementById('msg');history.replaceState(null,'',base);let running=true,loading=false,url=null;
async function send(path,data){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error||'เชื่อมต่อไม่สำเร็จ');return d;}
async function act(data){try{await send('/input',data);msg.textContent='ส่งคำสั่งแล้ว';}catch(e){msg.textContent=e.message;}}
screen.onclick=e=>{const r=screen.getBoundingClientRect();act({kind:'click',x:Math.round((e.clientX-r.left)*412/r.width),y:Math.round((e.clientY-r.top)*820/r.height)});};
document.getElementById('send').onclick=()=>{const t=document.getElementById('text');const text=t.value;t.value='';act({kind:'text',text});};document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>act({kind:'key',key:b.dataset.key}));document.querySelectorAll('[data-delta]').forEach(b=>b.onclick=()=>act({kind:'scroll',delta:Number(b.dataset.delta)}));document.getElementById('pause').onclick=()=>send('/pause',{}).then(()=>msg.textContent='หยุดออโต้แล้ว').catch(e=>msg.textContent=e.message);
async function refresh(){if(!running||loading)return;loading=true;try{const r=await fetch(base+'/screen');if(!r.ok){const d=await r.json();throw Error(d.error);}const next=URL.createObjectURL(await r.blob());screen.src=next;if(url)URL.revokeObjectURL(url);url=next;}catch(e){msg.textContent=e.message;}finally{loading=false;}}
send('/auth',{key}).then(()=>{msg.textContent='เชื่อมต่อแล้ว แตะหน้าจอเพื่อล็อกอิน';refresh();setInterval(refresh,1600);}).catch(e=>msg.textContent=e.message);addEventListener('pagehide',()=>{running=false;if(url)URL.revokeObjectURL(url);});
</script></html>`;
app.listen(PORT,'0.0.0.0',()=>console.log('Browser Worker v2.1 listening on '+PORT));
