(async()=>{
  const build='final-20260920';
  const signature=document.createElement('link');
  signature.rel='stylesheet';
  signature.href=`./final.css?v=${build}`;
  document.head.appendChild(signature);

  const badge=document.querySelector('.version');
  if(badge) badge.textContent='FINAL';
  const theme=document.querySelector('meta[name="theme-color"]');
  if(theme) theme.setAttribute('content','#07090d');

  for(const src of ['./app1.js','./app2.js','./app3.js','./app4.js']){
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
  if(t){t.textContent='Ошибка загрузки FINAL. Закрой приложение и открой снова.';t.classList.add('show')}
});