/* Runs actual built React UI with synthetic API fixtures; never connects to production. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const out=process.env.FFPRO_VISUAL_OUTPUT||'/tmp/ffpro-visual';fs.mkdirSync(out,{recursive:true});
const fixture={transactions:[{id:'sample-income',type:'income',amount:3200,description:'Sample client payment',category:'Business',institution:'Cash in Hand',date:'2026-10-26'},{id:'sample-expense',type:'expense',amount:120,description:'Sample supplies',category:'Shopping',institution:'Cash in Hand',date:'2026-10-27'}],recurringExpenses:[],recurringIncomes:[],savingGoals:[],investmentGoals:[],categoryBudgets:{},bankConnections:[],investments:[],events:[],calendarItems:[],contacts:[],ideas:[],forecastSettings:{yearsToProject:5,monthlyContribution:500,expectedReturn:8},financialLogs:[],cashOpeningBalance:1500,displayCurrency:'XCD',lastUpdated:'2026-10-27T12:00:00.000Z'};
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve('dist','.'+(rel==='/'?'/index.html':rel));
 if(!file.startsWith(path.resolve('dist')+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
 let bytes=fs.readFileSync(file);
 // External office/font engines are unnecessary for these views and cannot contact a network in QA.
 if(file.endsWith('index.html'))bytes=Buffer.from(bytes.toString().replace(/<script[^>]+src="https:[^"]+"[^>]*><\/script>/g,'').replace(/<link[^>]+(?:href="https:)[^>]*>/g,''));
 res.end(bytes);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const options={headless:true};
 if(process.env.FFPRO_BROWSER_PATH){options.executablePath=process.env.FFPRO_BROWSER_PATH;options.args=['--no-sandbox','--no-zygote','--disable-gpu'];}
 else if(process.env.FFPRO_PORTABLE_BROWSER==='1'){const {default:c}=await import(require.resolve('@sparticuz/chromium'));options.executablePath=await c.executablePath();options.args=['--no-sandbox','--no-zygote','--disable-gpu'];}
 const browser=await chromium.launch(options);const errors=[],unexpected=[],writes=[];let screenshots=0;
 async function open(width=1440,theme='light',failData=false,badBriefing=false){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(({theme})=>{
   if(!localStorage.getItem('ffpro-appearance'))localStorage.setItem('ffpro-appearance',theme);
   window.EventSource=class extends EventTarget{constructor(){super();this.readyState=1;setTimeout(()=>this.dispatchEvent(new Event('open')),0);}close(){this.readyState=2;}};
  },{theme});
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message)});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin){unexpected.push(url.href);return route.abort();}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const p=url.pathname,method=req.method();
   if(!['GET','HEAD'].includes(method)){
    if(p==='/api/notifications/sync-count'&&method==='POST')return route.fulfill({json:{ok:true}});
    // This existing read-only analysis uses POST; fulfill locally without calling an AI provider.
    if(p==='/api/ai/projection-analysis'&&method==='POST')return route.fulfill({json:{analysis:'Synthetic forecast analysis for layout review.',provider:'synthetic',model:'fixture'}});
    writes.push(method+' '+p);return route.fulfill({status:403,json:{error:'Synthetic UI review blocks mutations'}});
   }
   if(p==='/api/auth/me')return route.fulfill({json:{user:{id:'synthetic-ui-user',username:'Sample owner',displayName:'Sample owner',email:'sample@example.test',avatarUrl:null,emailVerified:true}}});
   if(p==='/api/data')return route.fulfill(failData?{status:503,json:{error:'Synthetic saved data unavailable'}}:{json:{data:fixture,version:1,updatedAt:fixture.lastUpdated}});
   const mocks={
    '/api/auth/csrf':{csrfToken:'synthetic-only'},'/api/projects':{projects:[]},
    '/api/ai/market-data':{prices:[],quotaExhausted:true},'/api/calendar/status':{connected:false,hasCalendarScope:false},
    '/api/gmail/dismissed':{dismissedIds:[]},'/api/ai-news':{articles:[],briefing:{summary:'Synthetic empty briefing',takeaways:[],provider:'deterministic',updatedAt:fixture.lastUpdated},fetchedAt:fixture.lastUpdated},
    '/api/funding/opportunities':{opportunities:[]},'/api/funding/research/status':{queue:{}},
    '/api/ai/ollama/status':{available:false,configured:false},'/api/auth/providers':{providers:[]}
   };
   if(p==='/api/ai-news' && badBriefing)return route.fulfill({json:{articles:[]}});
   if(p==='/api/gmail/notifications')return route.fulfill({status:403,json:{error:'Gmail not connected'}});
   if(Object.hasOwn(mocks,p))return route.fulfill({json:mocks[p]});
   unexpected.push(p);return route.fulfill({status:404,json:{error:'Unmapped synthetic route'}});
  });
  await page.goto(origin);await page.locator(failData?'h1':'.ff-topbar').waitFor();
  return {page,context};
 }
 try{
  if (!process.env.FFPRO_VISUAL_INTERACTION_ONLY) for(const width of [1440,900,390])for(const theme of ['light','dark']){
   const {page,context}=await open(width,theme);


   for(const [id,label] of [['dashboard','Money'],['events','Projects'],['calendar','Calendar'],['projections','Forecast'],['funding','Funding']]){
    if(width>=1280)await page.getByRole('navigation',{name:'FFPRO workspace',exact:true}).getByRole('button',{name:label,exact:true}).click();
    else{await page.getByRole('button',{name:'Open workspace menu',exact:true}).click();const menu=page.getByRole('dialog',{name:'FFPRO workspace menu'});await menu.waitFor();await menu.getByRole('button',{name:new RegExp(label,'i')}).first().click();}
    await page.waitForFunction(label=>document.title.includes(label+' |'),label);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width} ${theme} ${id} overflow`);
    await page.screenshot({path:path.join(out,`${width}-${theme}-${id}.png`),fullPage:true});screenshots++;
   }
   if(width===1440 || width===390){
     if(width>=1280)await page.getByRole('navigation',{name:'FFPRO workspace',exact:true}).getByRole('button',{name:'Money',exact:true}).click();
     else await page.getByRole('navigation',{name:'Mobile finance navigation'}).getByRole('button',{name:'Money',exact:true}).click();
     await page.getByRole('button',{name:'Analysis',exact:true}).click();
     await page.screenshot({path:path.join(out,`${width}-${theme}-analysis.png`),fullPage:true});screenshots++;
   }
   await page.getByRole('button',{name:'Open workspace menu',exact:true}).click();
   const menu=page.getByRole('dialog',{name:'FFPRO workspace menu'});await menu.waitFor();
   await page.keyboard.press('Shift+Tab');assert.equal(await menu.evaluate(n=>n.contains(document.activeElement)),true,'Menu traps keyboard focus');
   await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
   await context.close();
  }
  const ui=await open();const page=ui.page;
  await page.getByRole('button',{name:'Hide financial amounts',exact:true}).click();
  const amount=page.locator('.ff-primary-metrics .privacy-sensitive').first();await amount.hover();
  await page.waitForFunction(()=>document.querySelector('.ff-shell')?.classList.contains('privacy-mode-enabled'));
  assert.equal(await amount.evaluate(n=>getComputedStyle(n).filter),'blur(6px)','Hover never unmasks privacy');
  await page.getByRole('button',{name:'Show financial amounts',exact:true}).click();
  assert.equal(await amount.evaluate(n=>getComputedStyle(n).filter),'none');
  await page.getByRole('button',{name:'Switch to dark appearance',exact:true}).click();
  await page.reload();await page.locator('.ff-theme-dark').waitFor();
  await page.getByRole('button',{name:'Add Transaction',exact:true}).first().click();
  await page.getByRole('dialog',{name:'Transaction',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'transaction-dialog.png'),fullPage:true});screenshots++;
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Import Statement',exact:true}).click();
  await page.waitForFunction(()=>{const n=document.querySelector('#ffpro-capture');return !!n && n.getBoundingClientRect().top<innerHeight;});
  await ui.context.close();
  const failed=await open(390,'light',true);await failed.page.getByText('Your saved account could not be loaded',{exact:true}).waitFor();
  assert.equal(await failed.page.locator('.ff-primary-metrics').count(),0,'A failed account fetch never renders false zero balances');
  await failed.page.getByRole('button',{name:'Retry',exact:true}).waitFor();
  await failed.page.screenshot({path:path.join(out,'saved-data-unavailable.png'),fullPage:true});screenshots++;
  await failed.context.close();
  const briefing=await open(1440,'light',false,true);
  await briefing.page.getByText('Briefing data is unavailable. Refresh the briefing to try again.',{exact:true}).waitFor();
  assert.equal(await briefing.page.locator('.ff-primary-metrics').count(),1,'Unavailable news cannot crash the finance overview');
  await briefing.context.close();
  assert.deepEqual(errors,[],'No page errors');assert.deepEqual(unexpected,[],'Only mapped synthetic API and local assets');assert.deepEqual(writes,[],'No financial/provider writes');
  console.log(JSON.stringify({status:'PASS',screenshots,viewports:process.env.FFPRO_VISUAL_INTERACTION_ONLY?[1440,390]:[1440,900,390],themes:['light','dark'],layoutReview:!process.env.FFPRO_VISUAL_INTERACTION_ONLY,sections:process.env.FFPRO_VISUAL_INTERACTION_ONLY?null:5,privacyHover:true,tabletMenu:process.env.FFPRO_VISUAL_INTERACTION_ONLY?'not-run':true,keyboardFocus:process.env.FFPRO_VISUAL_INTERACTION_ONLY?'not-run':true,appearancePersistence:true,failedAccountShowsNoBalances:true,financialWrites:0,scope:'Synthetic React UI only; no real SSO, encryption, ledger or live release acceptance'}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
