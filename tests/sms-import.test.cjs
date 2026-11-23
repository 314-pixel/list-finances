const {readFileSync}=require('node:fs');
const vm=require('node:vm'),assert=require('node:assert/strict');
const events={};let removed=false;
const ctx={
 window:{addEventListener:(k,cb)=>events[k]=cb},
 document:{addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null,createElement:()=>({setAttribute(){}})},
 location:{hash:'',pathname:'/list-finances/',search:''},
 history:{replaceState(){removed=true}},navigator:{},
 db:{categories:[],accounts:[],transactions:[]},
 localDate:()=> '2026-11-23',
 isValidDate:s=>/^20\\d{2}-\\d{2}-\\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s)),
 toast:()=>{},modal:()=>{},transactionForm:()=>{},syncTransactionFields:()=>{},esc:s=>s,
 console,Date,Number,Math,String,Array,RegExp,Error,Promise,URL
};
vm.createContext(ctx);
vm.runInContext(readFileSync(__dirname+'/../sms-import.js','utf8'),ctx);
const parse=ctx.window.parseSms900;
let passes=0;
function test(name,fn){fn();console.log('PASS',name);passes++}
test('Purchase total distinct from balance',()=>{const x=parse('VISA1234 22.11.26 16:33 Покупка 1 250,40р МАГНИТ Баланс: 100 000р');assert.equal(x.amount,1250.4);assert.equal(x.note,'МАГНИТ');assert.equal(x.cardLast4,'1234');assert.equal(x.date,'2026-11-22')});
test('Salary is an income',()=>{const x=parse('МИР4321 23.11.26 Зачисление 45 000р Зарплата Доступно 50 500р');assert.equal(x.type,'income');assert.equal(x.amount,45000)});
test('Outgoing transfer is flagged as ambiguous',()=>{const x=parse('Перевод 4 800р Получатель Иван');assert.equal(x.type,'expense');assert.equal(x.ambiguous,true)});
test('Rejected transactions are excluded',()=>{assert.match(parse('Операция Покупка 150р отклонена').error,/отклон/)});
test('SMS containing one-time code is excluded',()=>{assert.match(parse('Код подтверждения 123456. Никому не сообщайте').error,/кодом/)});
test('Balance alone is not transaction',()=>{assert.ok(parse('Баланс: 51 000р').error)});
test('Merchant content is data',()=>{assert.equal(parse('Покупка 100р <img src=x onerror=alert(1)>').note,'<img src=x onerror=alert(1)>')});
test('Incoming URL hash is removed',()=>{ctx.location.hash='#sms='+encodeURIComponent('Баланс: 50р');events.hashchange();assert.equal(removed,true)});
console.log(passes+' tests passed');