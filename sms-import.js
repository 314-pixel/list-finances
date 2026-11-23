/* Лист: локальный импорт SMS 900 — всегда только черновик. */
(function(){
'use strict';
const MAX=3500;
const AMOUNT=/((?:\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d{1,10})(?:[.,]\d{1,2})?)\s*(?:₽|р(?:уб(?:лей|ля|ль)?)?\.?|RUB\b)/iu;
const ACTION=/(покупка|оплата|списан(?:ие|о|ы)|расход|снятие|перевод|плат[её]ж|зачислен(?:ие|о)|пополнен(?:ие|о)|поступлен(?:ие|о)|возврат|заработная плата|зарплата)/iu;
const SECRET=/(?:код\s*(?:подтверждения|для\s*входа|операции|доступа|из\s*смс)|одноразов(?:ый|ого)\s*парол|никому\s*не\s*сообщайт|password|otp|verification\s*code|войти\s*в\s*сбербанк)/iu;
function parseSms900(raw){
  const text=String(raw||'').replace(/[\u00a0\u202f]/g,' ').trim();
  if(!text||text.length>MAX)return {error:'Вставьте одно SMS длиной до 3500 символов.'};
  if(SECRET.test(text))return {error:'Похоже на сообщение с кодом подтверждения. Такие SMS не импортируются.'};
  if(/(?:отменен[аоы]?|отклонен[аоы]?|не\s+выполнен[аоы]?|ошибка\s+операции|недостаточно\s+средств)/iu.test(text))return {error:'Это похоже на отклонённую операцию, а не на платёж.'};
  const relevant=text.split(/(?:^|[\s,;])(?:баланс\s*[:=]?|доступно\s*[:=]?|остаток\s*[:=]?|balance\s*[:=]?)/iu)[0];
  const verb=ACTION.exec(relevant);
  if(!verb)return {error:'Не обнаружена финансовая операция. Проверьте SMS и при необходимости введите операцию вручную.'};
  const after=relevant.slice(verb.index+verb[0].length);
  const found=AMOUNT.exec(after.slice(0,170));
  if(!found)return {error:'Не найдена сумма операции с обозначением ₽, р. или RUB.'};
  const amount=Number(found[1].replace(/\s/g,'').replace(',','.'));
  if(!Number.isFinite(amount)||amount<=0||amount>1e10)return {error:'Некорректная сумма платежа.'};
  const verbText=verb[1].toLocaleLowerCase('ru');
  const incoming=/(зачисл|пополн|поступл|возврат|зарплат|заработная)/iu.test(verbText)||(/^перевод/iu.test(verbText)&&/(?:^|\s)(?:от\s+[^.,\n]+|вам|входящ)/iu.test(after.slice(0,60)));
  const ambiguous=/перевод/iu.test(verbText)&&!incoming;
  const type=incoming?'income':'expense';
  const dateMatch=/(?:^|\D)(\d{2})[.\/](\d{2})[.\/](\d{2}|\d{4})(?!\d)/u.exec(relevant);
  let date=localDate(),dateUncertain=!dateMatch;
  if(dateMatch){
    let yy=+dateMatch[3];if(yy<100)yy+=2000;
    const proposed=String(yy).padStart(4,'0')+'-'+dateMatch[2]+'-'+dateMatch[1];
    if(isValidDate(proposed)&&proposed<=localDate()){date=proposed;dateUncertain=false}
  }
  const cardLast4=/(?:карта|visa|mastercard|maestro|мир|card)\s*[:#*•xX-]*\s*(\d{4})\b/iu.exec(relevant)?.[1]||'';
  let note=after.slice(found.index+found[0].length).replace(/^[\s,.:;\-–]+/u,'')
    .split(/(?:^|[\s,;])(?:баланс|доступно|остаток|справка|комиссия|долг|available)(?=[:\s,;]|$)/iu)[0]
    .replace(/\bMCC\s*\d{4}\b/giu,'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim().slice(0,95);
  if(!note||/^(?:\d{2}:\d{2}|\d{4})$/u.test(note))note=incoming?'Поступление из SMS 900':ambiguous?'Перевод из SMS 900':'Оплата из SMS 900';
  return {type,amount,date,note,cardLast4,ambiguous,dateUncertain};
}
function suggestCategory(p){
 const n=p.note.toLocaleLowerCase('ru');
 const rules=p.type==='income'?[['i-salary',/зарплат|аванс|работодатель|salary/u],['i-gift',/подар|gift/u]]:
 [['c-groceries',/пят[её]роч|pyater|магнит|magnit|перекр[её]ст|лента|продукт|супермаркет|дикси|вкусвилл|окей/u],
 ['c-transport',/такси|taxi|яндекс\s*(?:go|такси)|метро|автобус|проезд|бензин|азс|лукойл/u],
 ['c-home',/аренда|жкх|квартплата/u],['c-bills',/мтс|мегафон|билайн|телефон|интернет|коммунал|связь/u],
 ['c-health',/аптека|аптек|клиник|медиц/u],['c-leisure',/кино|театр|музей/u],['c-shopping',/маркет|озон|ozon|wildberries|wb\b|одежд/u]];
 for(const [id,re] of rules)if(re.test(n)&&db.categories.some(c=>c.id===id&&c.type===p.type))return id;
 const match=db.categories.find(c=>c.type===p.type&&!/^(другое|прочие доходы)$/iu.test(c.name)&&n.includes(c.name.toLocaleLowerCase('ru')));
 return match?.id||db.categories.find(c=>c.type===p.type&&/другое|прочие/i.test(c.name))?.id||db.categories.find(c=>c.type===p.type)?.id||'';
}
function suggestAccount(p){
 if(!p.cardLast4)return '';
 return db.accounts.find(a=>new RegExp('(?:^|\\D)'+p.cardLast4+'(?:\\D|$)').test(a.name))?.id||'';
}
function smsOpenModal(raw=''){
 modal('Импорт SMS от 900','smsImport',
 '<p class="note">Вставьте SMS об операции. Разбор выполняется на устройстве; коды подтверждения не импортируются. Сохранение только после проверки.</p>'+
 '<label class="field" for="sms-content"><span>Текст SMS</span><textarea id="sms-content" maxlength="3500" rows="6" placeholder="VISA1234 23.11.26 Покупка 1 250р МАГНИТ Баланс: 5 000р">'+esc(raw)+'</textarea></label>'+
 '<div class="multi-buttons"><button type="button" class="button soft sm" data-sms-action="paste">Из буфера обмена</button>'+
 '<button type="button" class="button primary sm" data-sms-action="parse">Распознать</button></div>'+
 '<p class="note">Источник SMS проверяют «Команды» по отправителю. Сам сайт не может проверить номер отправителя.</p>'+
 '<div class="sheet-actions"><button type="button" class="button soft" data-action="close-modal">Отмена</button></div>');
 document.getElementById('sms-content')?.focus({preventScroll:true});
}
function smsOpenDraft(p){
 transactionForm('',p.type);
 const f=document.getElementById('edit-form');if(!f)return;
 f.elements.type.value=p.type;syncTransactionFields();
 f.elements.amount.value=String(p.amount);f.elements.date.value=p.date;f.elements.note.value=p.note;
 const category=suggestCategory(p);if(category)f.elements.categoryId.value=category;
 const account=suggestAccount(p);if(account)f.elements.accountId.value=account;
 const duplicated=db.transactions.some(t=>t.type===p.type&&t.date===p.date&&Math.abs(t.amount-p.amount)<0.001&&(account?t.accountId===account:true)&&String(t.note||'').toLocaleLowerCase('ru')===p.note.toLocaleLowerCase('ru'));
 const notes=[];
 if(duplicated)notes.push('Похожая операция уже есть — проверьте дубликат.');
 if(p.ambiguous)notes.push('Направление перевода не определено: проверьте доход, расход или перевод между своими счетами.');
 if(p.dateUncertain)notes.push('Дата не распознана — поставлена сегодняшняя.');
 if(p.cardLast4&&!account)notes.push('Карта ••'+p.cardLast4+' не привязана к счёту. Выберите правильный счёт.');
 if(!p.cardLast4)notes.push('Проверьте счёт вручную.');
 const banner=document.createElement('div');banner.className='sms-review';banner.setAttribute('role','status');
 banner.innerHTML='<strong>Черновик из SMS 900 · не сохранён</strong><p>Проверьте сумму, дату, категорию, счёт и направление операции, затем нажмите «Сохранить».</p>'+notes.map(x=>'<p class="sms-warning">'+esc(x)+'</p>').join('');
 f.prepend(banner);
 document.querySelector('#edit-form input[name="amount"]')?.focus({preventScroll:true});
}
function smsProcess(text){
 const p=parseSms900(text);
 if(p.error){smsOpenModal(String(text||'').slice(0,MAX));toast(p.error);return false}
 smsOpenDraft(p);return true;
}
async function smsPaste(){
 try{if(!navigator.clipboard?.readText)throw Error('unsupported');
 const text=await navigator.clipboard.readText();if(!text)throw Error('empty');
 const field=document.getElementById('sms-content');if(field){field.value=text.slice(0,MAX);field.focus()}}
 catch{toast('Нажмите и удерживайте поле SMS, затем выберите «Вставить».')}
}
function smsRoute(){
 const hash=location.hash||'';if(!hash.startsWith('#sms='))return;
 // Удаляем фрагмент из видимой ссылки до обработки текста.
 history.replaceState?.(null,'',location.pathname+location.search);
 const payload=hash.slice(5);
 if(payload.length>12000){toast('SMS слишком длинное. Вставьте вручную.');return}
 try{smsProcess(decodeURIComponent(payload))}
 catch{toast('Ошибка чтения ссылки. Вставьте SMS вручную.');smsOpenModal()}
}
document.addEventListener('click',event=>{
 const btn=event.target.closest('[data-sms-action]');if(!btn)return;
 const action=btn.dataset.smsAction;
 if(action==='open')smsOpenModal();
 else if(action==='paste')smsPaste();
 else if(action==='parse')smsProcess(document.getElementById('sms-content')?.value||'');
});
window.addEventListener('hashchange',smsRoute);
smsRoute();
window.parseSms900=parseSms900;
})();