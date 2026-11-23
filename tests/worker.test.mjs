import assert from 'node:assert/strict';
import proxy from '../worker/ai-proxy.js';
const origin='https://314-pixel.github.io',token='a-random-secret-access-token-with-32-chars';
const env={OPENAI_API_KEY:'test-only',ACCESS_TOKEN:token,OPENAI_MODEL:'gpt-4.1-mini'};
const summary={version:1,period:'2026-11',currency:'RUB',income:100,expense:80,previousExpense:90,availableBalances:500,totalAssets:500,recurringDue:20,categories:[{name:'Food',spent:80}],budgets:[{category:'Food',limit:100,spent:80}],savings:[{balance:500,apr:10}],goals:[{target:1000,saved:200}]};
function req(o=origin,auth='Bearer '+token,body={consent:true,summary}){return new Request('https://list-test.workers.dev/',{method:'POST',headers:{Origin:o,Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(body)})}
let r=await proxy.fetch(req('https://another-site.example'),env);assert.equal(r.status,403);console.log('PASS 1 origin');
r=await proxy.fetch(req(origin,'Bearer invalid'),env);assert.equal(r.status,401);console.log('PASS 2 authentication');
r=await proxy.fetch(req(origin,'Bearer '+token,{consent:false,summary}),env);assert.equal(r.status,400);console.log('PASS 3 consent');
r=await proxy.fetch(req(origin,'Bearer '+token,{consent:true,summary:{...summary,income:'not-a-number'}}),env);assert.equal(r.status,400);console.log('PASS 4 validation');
let called=false;globalThis.fetch=async(url,opts)=>{called=true;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(opts.body);assert.equal(body.store,false);return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'Проверьте месячный бюджет.'}]}]}),{status:200})};
r=await proxy.fetch(req(),env);assert.equal(r.status,200);assert.equal(called,true);assert.match((await r.json()).advice,/Проверьте/);console.log('PASS 5 mocked AI response');