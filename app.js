const form=document.querySelector('#askForm');
const input=document.querySelector('#question');
const send=document.querySelector('#send');
const chat=document.querySelector('#chat');
const quick=[...document.querySelectorAll('[data-q]')];

function linkify(text){
  const escaped=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return escaped.replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g,'<br>');
}
function addMessage(role,text,source=''){
  const el=document.createElement('article'); el.className=`message ${role}`;
  const bubble=document.createElement('div'); bubble.className='bubble';
  const hasArabic=/[\u0600-\u06FF]/.test(text); if(hasArabic) bubble.dir='auto';
  bubble.innerHTML=linkify(text);
  if(source){const s=document.createElement('span');s.className='source';s.textContent=source;bubble.appendChild(s)}
  el.appendChild(bubble);chat.appendChild(el);el.scrollIntoView({behavior:'smooth',block:'end'});return el;
}
function addTyping(){const el=document.createElement('article');el.className='message assistant';el.innerHTML='<div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>';chat.appendChild(el);el.scrollIntoView({behavior:'smooth',block:'end'});return el}
async function ask(q){q=q.trim();if(!q)return;addMessage('user',q);input.value='';send.disabled=true;const t=addTyping();try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:q})});const data=await r.json();t.remove();if(!r.ok)throw new Error(data.error||'Request failed');addMessage('assistant',data.answer,data.source||'')}catch(e){t.remove();addMessage('assistant',`Sorry, I couldn't answer that right now.\nعذراً، تعذر الحصول على الإجابة حالياً.\n\n${e.message}`)}finally{send.disabled=false;input.focus()}}
form.addEventListener('submit',e=>{e.preventDefault();ask(input.value)});
quick.forEach(b=>b.addEventListener('click',()=>ask(b.dataset.q)));
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,130)+'px'});