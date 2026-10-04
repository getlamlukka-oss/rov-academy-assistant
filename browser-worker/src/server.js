import express from 'express';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const app = express();
app.use(express.json({ limit: '64kb' }));
const PORT = Number(process.env.PORT || 10000);
const TOKEN = process.env.BROWSER_WORKER_TOKEN || '';
const START_URL = process.env.ROV_ACADEMY_URL || 'https://academy.rov.in.th/';
const sessions = new Map();

app.get('/health', (_req,res)=>res.json({ok:true,service:'rov-browser-worker',sessions:sessions.size}));
app.use((req,res,next)=>{
  if (!TOKEN) return res.status(503).json({error:'BROWSER_WORKER_TOKEN not configured'});
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.status(401).json({error:'Unauthorized'});
  next();
});

async function newBrowser(){
  return chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
}
function getSession(req,res){
  const s=sessions.get(req.params.id);
  if(!s){res.status(404).json({error:'Session not found'});return null;}
  return s;
}
async function snapshot(page){
  const url=page.url();
  const title=await page.title().catch(()=> '');
  return {url,title};
}

app.post('/sessions', async (req,res)=>{
  try{
    const browser=await newBrowser();
    const context=await browser.newContext({viewport:{width:412,height:915}});
    const page=await context.newPage();
    const id=crypto.randomUUID();
    sessions.set(id,{id,browser,context,page,runId:String(req.body?.runId||''),createdAt:Date.now()});
    res.json({sessionId:id,liveUrl:null,state:'CREATED'});
  }catch(e){res.status(500).json({error:String(e.message||e).slice(0,200)});}
});

app.post('/sessions/:id/start', async (req,res)=>{
  const s=getSession(req,res); if(!s)return;
  try{await s.page.goto(START_URL,{waitUntil:'domcontentloaded',timeout:30000});res.json({ok:true,...await snapshot(s.page)});}
  catch(e){res.status(502).json({error:String(e.message||e).slice(0,200)});}
});

app.get('/sessions/:id/live', async (req,res)=>{
  const s=getSession(req,res); if(!s)return;
  try{const png=await s.page.screenshot({type:'png'});res.json({url:s.page.url(),screenshot:`data:image/png;base64,${png.toString('base64')}`,interactive:false});}
  catch(e){res.status(500).json({error:String(e.message||e).slice(0,200)});}
});

app.get('/sessions/:id/login-status', async (req,res)=>{
  const s=getSession(req,res); if(!s)return;
  const url=s.page.url();
  const loggedIn=!/login|signin|account\.garena/i.test(url) && url !== 'about:blank';
  res.json({loggedIn,url});
});

app.get('/sessions/:id/question', async (req,res)=>{
  const s=getSession(req,res); if(!s)return;
  try{
    const data=await s.page.evaluate(()=>{
      const text=(el)=>el?.textContent?.replace(/\s+/g,' ').trim()||'';
      const candidates=[...document.querySelectorAll('h1,h2,h3,[class*=question],[class*=quiz]')].map(text).filter(x=>x.length>8);
      const choiceEls=[...document.querySelectorAll('button,label,[role=radio],[class*=option],[class*=choice]')];
      const choices=[...new Set(choiceEls.map(text).filter(x=>x.length>0&&x.length<300))].slice(0,8);
      return {question:candidates[0]||'',choices};
    });
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    res.json({...data,fingerprint,url:s.page.url()});
  }catch(e){res.status(500).json({error:String(e.message||e).slice(0,200)});}
});

app.post('/sessions/:id/select', async (req,res)=>{
  const s=getSession(req,res); if(!s)return;
  const n=Number(req.body?.choice_number||0);
  if(!Number.isInteger(n)||n<1||n>8)return res.status(400).json({error:'Invalid choice_number'});
  try{
    const els=s.page.locator('button,label,[role=radio],[class*=option],[class*=choice]');
    const count=await els.count();
    if(n>count)return res.status(409).json({error:'Choice not found on current page'});
    await els.nth(n-1).click({timeout:5000});
    res.json({ok:true,choice_number:n,fingerprint:req.body?.fingerprint||null});
  }catch(e){res.status(500).json({error:String(e.message||e).slice(0,200)});}
});

app.post('/sessions/:id/next', async (req,res)=>{
  const s=getSession(req,res); if(!s)return;
  try{
    const next=s.page.getByRole('button',{name:/ถัดไป|ต่อไป|next|ยืนยัน|submit/i}).first();
    await next.click({timeout:5000});
    await s.page.waitForTimeout(600);
    res.json({ok:true,...await snapshot(s.page)});
  }catch(e){res.status(409).json({error:'Next/submit control not found'});}
});

app.post('/sessions/:id/stop', async (req,res)=>{
  const s=getSession(req,res); if(!s)return;
  await s.browser.close().catch(()=>{}); sessions.delete(req.params.id);
  res.json({ok:true,completed:false});
});

setInterval(async()=>{
  const cutoff=Date.now()-30*60*1000;
  for(const [id,s] of sessions){if(s.createdAt<cutoff){await s.browser.close().catch(()=>{});sessions.delete(id);}}
},60000).unref();

app.listen(PORT,'0.0.0.0',()=>console.log(`Browser Worker listening on ${PORT}`));
