(() => {
'use strict';
const $=id=>document.getElementById(id);
let language='en',data=null,request=0,loadedAt=0;
try{if(localStorage.getItem('artimex-language')==='es')language='es';}catch{}
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(en,es)=>language==='es'?es:en;
const groups={start:['Getting started','Primeros pasos'],operations:['Daily operations','Operaciones diarias'],administration:['Administration & oversight','Administración y control'],support:['Reference & support','Referencia y soporte']};
const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function notice(message=''){$('guideNotice').className='guide-global-notice';$('guideNotice').textContent=message;}
function copyLabels(){
 document.documentElement.lang=language;document.title=t('Artimex — User Guide','Artimex — Guía de usuario');$('guideLanguage').value=language;
 document.querySelector('.guide-brand span').textContent=t('Help center','Centro de ayuda');document.querySelector('.skip-link').textContent=t('Skip to guide','Ir a la guía');
 $('backToPortal').textContent=t('Back to portal ↗','Volver al portal ↗');$('guideEyebrow').textContent=t('ARTIMEX · KNOWLEDGE & SUPPORT','ARTIMEX · CONOCIMIENTO Y SOPORTE');
 $('guideTitle').textContent=t('Your portal, explained.','Su portal, paso a paso.');$('guideIntro').textContent=t('Practical instructions for confident, accurate submissions and account administration.','Instrucciones claras para enviar archivos correctamente y administrar los accesos.');
 $('printGuide').textContent=t('Print / save PDF','Imprimir / guardar PDF');$('guideSearchLabel').textContent=t('Find an answer','Encuentre una respuesta');$('guideSearch').placeholder=t('Search your guide…','Busque en su guía…');
 $('guideNavigation').setAttribute('aria-label',t('Guide chapters','Capítulos de la guía'));$('guideArticle').setAttribute('aria-label',t('User guide','Guía de usuario'));$('guideSupportTitle').textContent=t('Need assistance?','¿Necesita ayuda?');$('guideSupportText').textContent=t('Your IT administrator can help with accounts and access.','Su administrador de TI puede ayudarle con cuentas y accesos.');
 $('guideFooterLabel').textContent=t('User guide','Guía de usuario');$('guideFooterVersion').textContent=t('Edition 1.0 · October 2026','Edición 1.0 · Octubre de 2026');
}
function roleName(){return data?.role==='superuser'?t('Administrator edition','Edición para administradores'):data?.role==='manager'?t('General Manager edition','Edición para gerentes'):t('Access & first sign-in','Acceso y primer ingreso');}
function renderNavigation(active){$('guideContentsToggle').textContent=t('Browse chapters','Ver capítulos')+' · '+data.articles.length;$('guideNavigation').innerHTML=Object.entries(groups).map(([group,label])=>{
 const articles=data.articles.filter(a=>a.category===group);if(!articles.length)return '';
 return `<section class="guide-nav-group"><h2>${h(t(...label))}</h2><div class="guide-nav-group-links">${articles.map(a=>`<a href="#${a.id}" ${a.id===active?'aria-current="page"':''}><span>${String(data.articles.indexOf(a)+1).padStart(2,'0')}</span>${h(a.title)}</a>`).join('')}</div></section>`;
 }).join('');}
function renderBlocks(blocks,print=false){return blocks.map(b=>{
 if(b.type==='steps')return `<ol class="guide-steps">${b.items.map(([title,text])=>`<li><div><h3>${h(title)}</h3><p>${h(text)}</p></div></li>`).join('')}</ol>`;
 if(b.type==='note')return `<aside class="guide-note ${b.kind==='warning'?'warning':''}"><h3>${h(b.title)}</h3><p>${h(b.text)}</p></aside>`;
 if(b.type==='table')return `<div class="guide-reference-wrap"><table class="guide-reference"><thead><tr>${b.headers.map(c=>`<th scope="col">${h(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(row=>`<tr>${row.map((c,i)=>i===0?`<th scope="row">${h(c)}</th>`:`<td>${h(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 if(b.type==='faq')return `<div class="guide-faq">${b.items.map(([q,a])=>print?`<div><h3>${h(q)}</h3><p>${h(a)}</p></div>`:`<details><summary>${h(q)}</summary><p>${h(a)}</p></details>`).join('')}</div>`;
 return '';
 }).join('');}
function renderPrint(){
 $('guidePrintContent').innerHTML=`<header><h1>Artimex · ${h(t('User guide','Guía de usuario'))}</h1><p>${h(roleName())} · ${h(t('Edition','Edición'))} ${h(data.version)} · ${h(data.updated)}</p><ol class="guide-print-index">${data.articles.map(a=>`<li>${h(a.title)}</li>`).join('')}</ol></header>${data.articles.map((a,i)=>`<section class="guide-print-chapter"><p>${String(i+1).padStart(2,'0')} · ${h(t(...groups[a.category]))}</p><h2>${h(a.title)}</h2><p class="guide-summary">${h(a.summary)}</p>${renderBlocks(a.blocks,true)}</section>`).join('')}`;
}
function articleView(){if(!data)return;
 const query=$('guideSearch').value.trim();if(query){searchView(query);return;}
 const id=location.hash.slice(1)||'start',article=data.articles.find(a=>a.id===id)||data.articles[0],index=data.articles.indexOf(article);
 notice(id!==article.id?t('This chapter is not available to your current profile. Showing your guide’s starting page.','Este capítulo no está disponible para su perfil. Se muestra el inicio de su guía.'):data.role==='guest'?t('You are viewing access instructions. Sign in to the portal, then reopen or refresh this guide for your role-specific procedures.','Está viendo las instrucciones de acceso. Inicie sesión en el portal y vuelva a abrir o actualizar esta guía para ver los procedimientos de su perfil.'):'');
 renderNavigation(article.id);
 const words=JSON.stringify(article.blocks).split(/\s+/).length,minutes=Math.max(1,Math.ceil(words/220));
 const prev=data.articles[index-1],next=data.articles[index+1];
 $('guideArticle').innerHTML=`<header class="guide-article-header"><div class="guide-article-meta"><span>${String(index+1).padStart(2,'0')} / ${data.articles.length}</span><span>·</span><span>${h(t(...groups[article.category]))}</span><span>· ${minutes} ${h(t('min read','min de lectura'))}</span>${article.adminOnly?`<span class="guide-tag">${h(t('Administrator','Administrador'))}</span>`:''}</div><h2>${h(article.title)}</h2><p class="guide-summary">${h(article.summary)}</p></header>${renderBlocks(article.blocks)}<nav class="guide-chapter-nav" aria-label="${h(t('Chapter navigation','Navegación de capítulos'))}">${prev?`<a href="#${prev.id}"><small>← ${h(t('Previous chapter','Capítulo anterior'))}</small>${h(prev.title)}</a>`:''}${next?`<a href="#${next.id}" class="next"><small>${h(t('Next chapter','Siguiente capítulo'))} →</small>${h(next.title)}</a>`:''}</nav>`;
}
function searchView(query){const terms=normalize(query).split(/\s+/).filter(Boolean),matches=data.articles.filter(a=>{const text=normalize(JSON.stringify(a));return terms.every(term=>text.includes(term));});
 renderNavigation(null);notice();
 $('guideArticle').innerHTML=`<div class="guide-article-meta">${h(t('SEARCH YOUR GUIDE','BUSQUE EN SU GUÍA'))}</div><h2>${h(t('Find your next step','Encuentre su siguiente paso'))}</h2><p class="guide-summary">${matches.length} ${h(t('chapters match','capítulos coinciden con'))} “${h(query)}”</p><div class="guide-search-results">${matches.length?matches.map(a=>`<a class="guide-search-result" href="#${a.id}" data-search-result><strong>${h(a.title)}</strong><p>${h(a.summary)}</p></a>`).join(''):`<div class="guide-note"><h3>${h(t('No matching chapters','No se encontraron capítulos'))}</h3><p>${h(t('Try a shorter term such as password, upload, CSV or restaurant. Search uses your selected language and the chapters available to your profile.','Pruebe un término corto como contraseña, carga, CSV o restaurante. La búsqueda usa el idioma seleccionado y los capítulos disponibles para su perfil.'))}</p></div>`}</div>`;
}
async function load(){const id=++request;copyLabels();$('printGuide').disabled=true;
 try{const response=await fetch('/api/guide?lang='+language,{cache:'no-store'});if(!response.ok)throw Error('unavailable');const result=await response.json();if(id!==request)return;data=result;loadedAt=Date.now();$('guideRole').textContent=roleName();$('guideUpdated').textContent=t('Reviewed October 25, 2026','Revisada el 25 de octubre de 2026')+' · '+data.articles.length+' '+t('chapters','capítulos');$('printGuide').disabled=false;articleView();renderPrint();}
 catch{if(id!==request)return;$('guideRole').textContent=t('Guide unavailable','Guía no disponible');$('guideArticle').innerHTML=`<h2>${h(t('We could not load your guide','No se pudo cargar su guía'))}</h2><p class="guide-summary">${h(t('Please try again. You can return to the portal without changing your account or upload.','Inténtelo de nuevo. Puede volver al portal sin modificar su cuenta ni su carga.'))}</p><button class="guide-button guide-retry" id="guideRetry">${h(t('Try again','Reintentar'))}</button>`;$('guideRetry').addEventListener('click',load);}
}
$('guideContentsToggle').addEventListener('click',()=>{const expanded=$('guideContentsToggle').getAttribute('aria-expanded')==='true';$('guideContentsToggle').setAttribute('aria-expanded',String(!expanded));});
$('guideLanguage').addEventListener('change',event=>{language=event.target.value==='es'?'es':'en';try{localStorage.setItem('artimex-language',language);}catch{}load();});
$('guideNavigation').addEventListener('click',event=>{if(event.target.closest('a')){$('guideContentsToggle').setAttribute('aria-expanded','false');$('guideSearch').value='';setTimeout(articleView,0);}});
$('guideSearch').addEventListener('input',()=>{if(data)articleView();});
$('guideArticle').addEventListener('click',event=>{if(event.target.closest('[data-search-result]')){$('guideSearch').value='';setTimeout(articleView,0);}});
window.addEventListener('hashchange',()=>{if(!data)return;$('guideSearch').value='';articleView();requestAnimationFrame(()=>{const top=$('guideArticle').getBoundingClientRect().top+window.scrollY-110;window.scrollTo({top:Math.max(0,top),behavior:'auto'});$('guideArticle').focus({preventScroll:true});});});
$('printGuide').addEventListener('click',()=>{if(data){renderPrint();window.print();}});
window.addEventListener('storage',event=>{if(event.key==='artimex-language'&&['en','es'].includes(event.newValue)&&event.newValue!==language){language=event.newValue;load();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-loadedAt>30000)load();});
load();
})();
