(async()=>{
  const build='jarvis-v7-20260920-fix2';
  for(const href of ['./final.css','./smart.css','./jarvis.css']){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=`${href}?v=${build}`;
    document.head.appendChild(link);
  }

  const badge=document.querySelector('.version');
  if(badge) badge.textContent='JARVIS · V7';
  const theme=document.querySelector('meta[name="theme-color"]');
  if(theme) theme.setAttribute('content','#07090d');

  for(const src of ['./app1.js','./app2.js','./app3.js','./app4.js','./app5.js','./app6.js','./app7.js']){
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=`${src}?v=${build}`;
      s.async=false;
      s.onload=resolve;
      s.onerror=reject;
      document.body.appendChild(s);
    });
    if(src==='./app5.js') await window.valentinMemoryReady;
  }
})().catch(e=>{
  console.error('VALENTIN OS boot error',e);
  const t=document.getElementById('toast');
  if(t){t.textContent='Ошибка загрузки JARVIS V7. Закрой приложение и открой снова.';t.classList.add('show')}
});
