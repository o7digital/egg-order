(() => {
'use strict';
const $=id=>document.getElementById(id),archive=document.body.dataset.archive==='true';
let language=document.documentElement.lang==='es'?'es':'en';
if(!archive){try{const query=new URL(location.href).searchParams.get('lang');language=query==='en'||query==='es'?query:localStorage.getItem('artimex-language')==='es'?'es':'en';}catch{}}
function update(){
 document.documentElement.lang=language;$('policyLanguage').value=language;
 document.querySelectorAll('.policy-copy').forEach(a=>{a.hidden=a.dataset.language!==language;});
 const article=document.querySelector(`.policy-copy[data-language="${language}"]`);if(!article)return;
 document.title='Artimex — '+article.querySelector('h1').textContent;
 $('policyHeaderLabel').textContent=language==='es'?'Aviso de privacidad':'Privacy notice';$('policyPrint').textContent=language==='es'?'Imprimir':'Print';$('policyBack').textContent=language==='es'?'Volver al portal ↗':'Back to portal ↗';
 $('policyContents').setAttribute('aria-label',language==='es'?'Contenido del aviso':'Notice contents');
 const links=$('policyContents').querySelectorAll('a');article.querySelectorAll('[data-section]').forEach((s,i)=>{links[i].textContent=s.querySelector('h2').textContent;});
 const source=article.querySelector('.policy-reference>a')||article.querySelector('.policy-reference p>a');links[links.length-1].href=source.href;links[links.length-1].textContent=language==='es'?'Aviso principal ↗':'Main privacy notice ↗';
 document.querySelector('.policy-skip').textContent=language==='es'?'Ir al aviso':'Skip to notice';document.querySelector('footer>a').textContent=language==='es'?'Guía de usuario ↗':'User guide ↗';
}
function navigate(){const id=location.hash.slice(1);if(!id)return;const section=document.getElementById(language+'-'+id);if(section)section.scrollIntoView({block:'start'});}
$('policyLanguage').addEventListener('change',event=>{language=event.target.value==='es'?'es':'en';if(archive){location.href=`/privacy/${document.body.dataset.version}.${language}.html${location.hash}`;return;}try{localStorage.setItem('artimex-language',language);}catch{}update();navigate();});
$('policyPrint').addEventListener('click',()=>print());window.addEventListener('hashchange',navigate);update();requestAnimationFrame(navigate);
})();
