const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const js=html.split('<script>')[1].split('</script>')[0],elements={},storage=new Map();
function el(key){return elements[key] ||= {innerHTML:'',textContent:'',classList:{add(){},remove(){}},style:{}}}
const context={
 console,Date,Math,Intl,JSON,Number,String,Array,Map,Set,URL,Error,Promise,Object,RegExp,Boolean,
 setTimeout:()=>0,clearTimeout:()=>{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 document:{documentElement:{dataset:{}},body:{style:{}},getElementById:el,querySelector:()=>null,addEventListener:()=>{}},
 window:{addEventListener:()=>{},scrollTo:()=>{}},navigator:{onLine:true},location:{protocol:'file:',href:'file:///index.html'},
 confirm:()=>true,prompt:(_prompt,def)=>def||'test-token-private',
 FormData:class{constructor(f){this.f=f}*[Symbol.iterator](){yield*Object.entries(this.f.fields)}}};
vm.createContext(context);vm.runInContext(js,context);
const ev=s=>vm.runInContext(s,context);
const form=(kind,fields,id='')=>({dataset:{kind,id},fields});
let count=0;function test(label,callback){callback();console.log('PASS '+label);count++}
const today=ev('localDate()'),start=ev('localDate(new Date(Date.now()-10*86400000))');
test('1. Empty diary renders',()=>{assert.equal(ev('db.transactions.length'),0);assert.match(el('main').innerHTML,/Финансы под контролем/)});
test('2. Old JSON schema migration',()=>{const old=JSON.parse(JSON.stringify(ev('defaults()')));delete old.settings.aiEndpoint;const migrated=ev('validateDb')(old);assert.equal(migrated.accounts[0].interestRate,0);assert.equal(migrated.settings.aiEndpoint,'')});
test('3. Savings rate and date',()=>{ev('formSubmit')(form('account',{name:'Накопительный',type:'savings',initial:'36500',color:'#8c8af1',interestRate:'10',interestStart:start}));assert.equal(ev('estimateInterest(db.accounts[1])'),100)});
test('4. Daily balance after debit',()=>{const aid=ev('db.accounts[1].id');ev('formSubmit')(form('transaction',{type:'expense',amount:'3650',date:ev('plusDay')(start),accountId:aid,categoryId:'c-groceries'}));assert.equal(ev('estimateInterest(db.accounts[1])'),91)});
test('5. Interest booked exactly once',()=>{ev('bookInterest')(ev('db.accounts[1].id'));assert.equal(ev('monthStats().income'),91);assert.equal(ev('estimateInterest(db.accounts[1])'),0);ev('bookInterest')(ev('db.accounts[1].id'));assert.equal(ev('db.transactions.filter(t=>t.interestRecord).length'),1)});
test('6. Interest rollback restores calculation period',()=>{const id=ev('db.transactions.find(t=>t.interestRecord).id');ev('confirmDelete')('transaction',id);assert.equal(ev('estimateInterest(db.accounts[1])'),91)});
test('7. Monthly budget overrides, default, reset',()=>{ev('formSubmit')(form('budget',{categoryId:'c-groceries',limit:'12000',scope:'all'}));const id=ev('db.budgets[0].id');ev('formSubmit')(form('budget',{categoryId:'c-groceries',limit:'8900',scope:'month'},id));assert.equal(ev('budgetLimit(db.budgets[0])'),8900);assert.equal(ev('budgetLimit(db.budgets[0],months(ui.month,-1))'),12000);ev('handleAction')({dataset:{action:'reset-month-budget',id}});assert.equal(ev('budgetLimit(db.budgets[0])'),12000)});
test('8. Transfer does not change financial flow or wealth',()=>{const before=ev('JSON.stringify({stats:monthStats(),asset:totalAssets()})');ev('formSubmit')(form('transaction',{type:'transfer',amount:'500',date:today,accountId:'acc-cash',toAccountId:ev('db.accounts[1].id')}));assert.equal(ev('JSON.stringify({stats:monthStats(),asset:totalAssets()})'),before)});
test('9. Strict date parsing',()=>{assert.equal(ev('isValidDate("2026-02-31")'),false);const n=ev('db.transactions.length');ev('formSubmit')(form('transaction',{type:'expense',amount:'1',date:'2026-02-31',accountId:'acc-cash',categoryId:'c-groceries'}));assert.equal(ev('db.transactions.length'),n)});
test('10. XSS label escaping',()=>{ev('formSubmit')(form('category',{name:'<img src=x onerror=alert(1)>',type:'expense',emoji:'🛒',color:'#8c8af1'}));ev('goTab("settings")');assert.match(el('main').innerHTML,/&lt;img/);assert.doesNotMatch(el('main').innerHTML,/<img src=x/)});
test('11. AI privacy and JSON roundtrip',()=>{assert.equal(ev('validAiUrl("http://evil.test/")'),false);assert.equal(ev('validAiUrl("https://list-test.workers.dev/")'),true);const summary=ev('aiSnapshot()');assert.equal(Object.hasOwn(summary,'transactions'),false);assert.equal(Object.hasOwn(summary,'notes'),false);const migrated=ev('validateDb')(JSON.parse(JSON.stringify(ev('db'))));assert.equal(migrated.version,1);assert.equal(migrated.accounts[1].interestRate,10)});
console.log(count+' logic tests passed');