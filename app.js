(async()=>{
  const build='smart-v6-20260920b';
  for(const href of ['./final.css','./smart.css']){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=`${href}?v=${build}`;
    document.head.appendChild(link);
  }

  const badge=document.querySelector('.version');
  if(badge) badge.textContent='SMART · V6';
  const theme=document.querySelector('meta[name="theme-color"]');
  if(theme) theme.setAttribute('content','#07090d');

  for(const src of ['./app1.js','./app2.js','./app3.js','./app4.js','./app5.js','./app6.js']){
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=`${src}?v=${build}`;
      s.async=false;
      s.onload=resolve;
      s.onerror=reject;
      document.body.appendChild(s);
    });
  }
})().catch(e=>{
  console.error('VALENTIN OS boot error',e);
  const t=document.getElementById('toast');
  if(t){t.textContent='Ошибка загрузки V6. Закрой приложение и открой снова.';t.classList.add('show')}
});