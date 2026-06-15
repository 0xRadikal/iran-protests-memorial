/* ════════════════════════════════════════════════════════════════
   جاویدنام‌های راه آزادی ایران — منطق صفحهٔ یادبود
   بارگذاری دیتاست کامل، رندر چهره‌ها، مودال جزئیات و پلیر آهنگ
   ════════════════════════════════════════════════════════════════ */

let ALL = [];
let EVENTS = {};
let META = {};
let filterEvent = 'all';
let filterVerif = 'all';
let filterPhoto = true;    // پیش‌فرض: فقط دارای چهره (طبق خواستهٔ کاربر)
let filterNotable = false; // فقط چهره‌های سرشناس
let searchQ = '';
let shown = 0;
const PAGE = 48;

const FA = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
function toFa(n){ return String(n).replace(/[0-9]/g, d => FA[d]); }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// نقشهٔ رنگ ثابت برای هر رویداد (رنگ واقعی به‌جای کلاس پویای Tailwind)
const EVENT_COLORS = {
  kuye_daneshgah_78: '#fbbf24', green_88: '#34d399', dey_96: '#fb923c',
  darvish_96: '#2dd4bf', mordad_97: '#facc15', kazerun_97: '#a3e635',
  aban_98: '#f87171', khuzestan_1400: '#22d3ee', khizesh_1401: '#e879f9',
  khizesh_1404: '#fb7185', executions: '#c084fc', deaths_in_custody: '#94a3b8'
};
function evColor(e){ return EVENT_COLORS[e] || '#9ca3af'; }
function hexA(hex, a){
  const h = hex.replace('#',''); const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ───────────────────────── بارگذاری داده ───────────────────────── */
async function init(){
  const statusEl = document.getElementById('load-status');
  try {
    const res = await fetch('assets/data/javidnam.full.json', { cache: 'force-cache' });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    META = data.meta; EVENTS = data.events; ALL = data.people;
    // مرتب‌سازی: ابتدا چهره‌های سرشناس، سپس دارای عکس، سپس بقیه
    ALL.sort((a,b)=>{
      const sa = (a.nt?2:0) + (a.ph?1:0);
      const sb = (b.nt?2:0) + (b.ph?1:0);
      return sb - sa;
    });
    if(statusEl) statusEl.style.display = 'none';
    renderStats();
    renderEventFilters();
    applyAndRender(true);
    wireEvents();
    initInfiniteScroll();
    initAudio();
    initReveal();
  } catch(err){
    if(statusEl){ statusEl.innerHTML = '<span class="text-rose-400"><i class="fa-solid fa-triangle-exclamation"></i> خطا در بارگذاری داده‌ها. صفحه را دوباره بارگذاری کنید.</span>'; }
    console.error(err);
  }
}

function renderStats(){
  const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set('jv-total', toFa(META.total));
  set('jv-notable', toFa(META.notable));
  const evCount = Object.keys(META.by_event || {}).length;
  set('jv-events', toFa(evCount));
  const withPhoto = ALL.filter(p=>p.ph).length;
  set('jv-photos', toFa(withPhoto));
}

function renderEventFilters(){
  const wrap = document.getElementById('event-filters');
  if(!wrap) return;
  const order = Object.entries(EVENTS).sort((a,b)=>(a[1].order||0)-(b[1].order||0));
  let html = `<button data-ev="all" class="ev-btn active px-3 py-1.5 rounded-full text-sm border border-white/15 transition">همه (${toFa(META.total)})</button>`;
  for(const [key,ev] of order){
    const c = META.by_event[key] || 0;
    if(!c) continue;
    const col = evColor(key);
    html += `<button data-ev="${key}" class="ev-btn px-3 py-1.5 rounded-full text-sm border border-white/15 transition" style="--ev:${col}"><span class="inline-block w-2 h-2 rounded-full ml-1.5 align-middle" style="background:${col}"></span>${escapeHtml(ev.title)} (${toFa(c)})</button>`;
  }
  wrap.innerHTML = html;
}

/* ───────────────────────── فیلتر و رندر ───────────────────────── */
function getFiltered(){
  return ALL.filter(p=>{
    if(filterEvent !== 'all' && p.e !== filterEvent) return false;
    if(filterVerif !== 'all' && p.v !== filterVerif) return false;
    if(filterPhoto && !p.ph) return false;
    if(filterNotable && !p.nt) return false;
    if(searchQ){
      const hay = (p.n+' '+(p.ne||'')+' '+(p.c||'')+' '+(p.pr||'')+' '+(p.ca||'')+' '+(p.oc||'')+' '+(p.s||'')).toLowerCase();
      if(!hay.includes(searchQ)) return false;
    }
    return true;
  });
}

let filteredCache = [];
function applyAndRender(reset){
  const grid = document.getElementById('jv-grid');
  if(reset){ filteredCache = getFiltered(); shown = 0; grid.innerHTML=''; }
  const slice = filteredCache.slice(shown, shown + PAGE);
  const frag = document.createDocumentFragment();
  slice.forEach((p,i)=>{
    const el = document.createElement('div');
    el.innerHTML = cardHTML(p, shown+i);
    const node = el.firstElementChild;
    frag.appendChild(node);
  });
  grid.appendChild(frag);
  shown += slice.length;
  document.getElementById('jv-count').textContent = toFa(filteredCache.length);

  const remaining = filteredCache.length - shown;
  updateScrollUI(remaining);

  const empty = document.getElementById('jv-empty');
  if(empty) empty.style.display = filteredCache.length === 0 ? 'block' : 'none';
  // لود کسل عکس‌های اضافه‌شده
  lazyObserveNew();
}

/* ───────── مدیریت نشانگر لود خودکار (اسکرول بی‌نهایت) ───────── */
function updateScrollUI(remaining){
  const sentinel = document.getElementById('jv-sentinel');
  const loader   = document.getElementById('jv-loader');
  const endNote  = document.getElementById('jv-end');
  if(remaining > 0){
    if(sentinel) sentinel.style.display = 'block';
    if(loader)   loader.style.display = 'flex';
    if(endNote)  endNote.style.display = 'none';
  } else {
    if(sentinel) sentinel.style.display = 'none';
    if(loader)   loader.style.display = 'none';
    // فقط وقتی واقعاً چیزی نمایش داده شده باشد، پیام پایان را نشان بده
    if(endNote)  endNote.style.display = (filteredCache.length > 0) ? 'flex' : 'none';
  }
}

/* مشاهده‌گر سنتینل برای لود خودکار هنگام اسکرول */
let scrollObserver = null;
function initInfiniteScroll(){
  const sentinel = document.getElementById('jv-sentinel');
  if(!sentinel) return;
  if(!('IntersectionObserver' in window)){
    // مرورگر قدیمی: لود همه به‌صورت یک‌جا غیرعملی است؛ بازگشت به اسکرول دستی
    window.addEventListener('scroll', ()=>{
      if(shown < filteredCache.length &&
         (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 600){
        applyAndRender(false);
      }
    }, { passive:true });
    return;
  }
  // rootMargin مثبت پایین: کمی پیش از رسیدن کاربر به سنتینل، صفحهٔ بعد را لود می‌کند
  // اما نه آن‌قدر زود که فوتر هرگز در دسترس قرار نگیرد.
  scrollObserver = new IntersectionObserver((entries)=>{
    entries.forEach(en=>{
      if(en.isIntersecting && shown < filteredCache.length){
        applyAndRender(false);
      }
    });
  }, { rootMargin: '600px 0px' });
  scrollObserver.observe(sentinel);
}

function cardHTML(p, idx){
  const c = evColor(p.e);
  const ev = EVENTS[p.e] ? EVENTS[p.e].title : p.e;
  const meta = [];
  if(p.a!=null) meta.push(toFa(p.a)+' ساله');
  if(p.c) meta.push(p.c);
  const verifBadge = p.v==='documented'
    ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"><i class="fa-solid fa-circle-check"></i> مستند</span>'
    : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/20"><i class="fa-regular fa-circle"></i> گزارش‌شده</span>';
  const star = p.nt ? '<i class="fa-solid fa-star text-amber-400 text-xs ml-1" title="چهرهٔ سرشناس"></i>' : '';
  // بخش تصویر
  let photo;
  if(p.ph){
    photo = `<img data-src="${escapeHtml(p.ph)}" alt="${escapeHtml(p.n)}" class="jv-photo lazy" loading="lazy" referrerpolicy="no-referrer"
      onerror="this.parentElement.innerHTML='<div class=\\'jv-photo-ph\\'><i class=\\'fa-solid fa-dove\\'></i></div>'">`;
  } else {
    photo = `<div class="jv-photo-ph"><i class="fa-solid fa-dove"></i></div>`;
  }
  const notableClass = p.nt ? 'jv-notable' : '';
  return `<article class="jv-card ${notableClass} group rounded-2xl p-2.5 border border-white/10 bg-white/[0.025] hover:bg-white/[0.06] transition cursor-pointer" style="animation-delay:${(idx%PAGE)*0.015}s" onclick="openPerson('${p.id}')">
    <div class="relative overflow-hidden rounded-xl mb-2.5">
      ${photo}
      <span class="absolute top-2 right-2">${verifBadge}</span>
      <span class="absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full" style="background:${hexA(c,0.85)};color:#0a0e1a;font-weight:700">${escapeHtml(ev)}</span>
    </div>
    <h3 class="font-bold text-[14.5px] leading-snug px-1 line-clamp-1">${star}${escapeHtml(p.n)}</h3>
    <div class="text-xs text-gray-400 px-1 mt-0.5 line-clamp-1">${meta.length?'<i class="fa-solid fa-location-dot ml-1 opacity-60"></i>'+meta.map(escapeHtml).join(' · '):'&nbsp;'}</div>
  </article>`;
}

/* ───────────────── lazy loading عکس‌ها ───────────────── */
let imgObserver = null;
function lazyObserveNew(){
  if(!('IntersectionObserver' in window)){
    document.querySelectorAll('img.lazy').forEach(img=>{ img.src=img.dataset.src; img.classList.remove('lazy'); });
    return;
  }
  if(!imgObserver){
    imgObserver = new IntersectionObserver((entries)=>{
      entries.forEach(en=>{
        if(en.isIntersecting){
          const img = en.target;
          img.src = img.dataset.src;
          img.classList.remove('lazy');
          imgObserver.unobserve(img);
        }
      });
    }, { rootMargin: '300px' });
  }
  document.querySelectorAll('img.lazy').forEach(img=>imgObserver.observe(img));
}

/* ───────────────────────── مودال جزئیات ───────────────────────── */
async function openPerson(id){
  const p = ALL.find(x=>x.id===id);
  if(!p) return;
  const modal = document.getElementById('jv-modal');
  const box = document.getElementById('jv-modal-content');
  const ev = EVENTS[p.e] ? EVENTS[p.e].title : p.e;
  const evEn = EVENTS[p.e] ? EVENTS[p.e].title_en : '';
  const c = evColor(p.e);

  // ردیف‌های جزئیات
  const rows = [];
  if(p.a!=null) rows.push(['سن', toFa(p.a)+' سال', 'fa-cake-candles']);
  if(p.g) rows.push(['جنسیت', p.g, p.g==='زن'?'fa-venus':'fa-mars']);
  if(p.dj) rows.push(['تاریخ جان‌باختن', toFa(p.dj), 'fa-calendar']);
  if(p.c) rows.push(['شهر', p.c, 'fa-city']);
  if(p.pr) rows.push(['استان', p.pr, 'fa-map']);
  if(p.oc) rows.push(['شغل', p.oc, 'fa-briefcase']);
  if(p.ca) rows.push(['شرح جان‌باختن', p.ca, 'fa-heart-crack']);

  // بخش تصویر بزرگ
  let hero;
  if(p.ph){
    hero = `<div class="jv-modal-photo-wrap"><img src="${escapeHtml(p.ph)}" alt="${escapeHtml(p.n)}" class="jv-modal-photo" referrerpolicy="no-referrer"
      onerror="this.parentElement.innerHTML='<div class=\\'jv-modal-ph\\' style=\\'color:${c}\\'><i class=\\'fa-solid fa-dove\\'></i></div>'"></div>`;
  } else {
    hero = `<div class="jv-modal-photo-wrap"><div class="jv-modal-ph" style="color:${c}"><i class="fa-solid fa-dove"></i></div></div>`;
  }

  // لینک‌های یادبود
  let mlHtml = '';
  if(Array.isArray(p.ml) && p.ml.length){
    const links = p.ml.slice(0,6).map(u=>{
      let host=''; try{ host = new URL(u).hostname.replace('www.',''); }catch(e){ host='منبع'; }
      let icon='fa-link';
      if(/x\.com|twitter/.test(host)) icon='fa-x-twitter';
      else if(/instagram/.test(host)) icon='fa-instagram';
      else if(/youtube|youtu\.be/.test(host)) icon='fa-youtube';
      else if(/wikipedia/.test(host)) icon='fa-wikipedia-w';
      const brandFa = icon.startsWith('fa-x')||icon==='fa-instagram'||icon==='fa-youtube'||icon==='fa-wikipedia-w' ? 'fa-brands' : 'fa-solid';
      return `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer nofollow" class="mem-link"><i class="${brandFa} ${icon}"></i>${escapeHtml(host)}</a>`;
    }).join('');
    mlHtml = `<div class="mt-5"><div class="text-xs text-gray-500 mb-2"><i class="fa-solid fa-share-nodes ml-1"></i> یاد و نشان (منابع و یادبودها)</div><div class="flex flex-wrap gap-2">${links}</div></div>`;
  }

  // داستان فارسی + انگلیسی
  let storyHtml = '';
  if(p.s){
    storyHtml += `<div class="bg-white/[0.03] rounded-xl p-4 text-sm leading-8 text-gray-200 mt-4" style="border-right:3px solid ${hexA(c,0.5)}">${escapeHtml(p.s)}</div>`;
  }
  if(p.se && p.se !== p.s){
    storyHtml += `<div class="bg-white/[0.02] rounded-xl p-4 text-sm leading-7 text-gray-400 mt-3" dir="ltr" style="border-left:3px solid ${hexA(c,0.4)}">${escapeHtml(p.se)}</div>`;
  }

  box.innerHTML = `
    <div class="text-center mb-5">
      ${hero}
      <h2 class="text-2xl font-extrabold mt-4">${p.nt?'<i class="fa-solid fa-star text-amber-400 text-lg ml-1.5"></i>':''}${escapeHtml(p.n)}</h2>
      ${p.ne?`<div class="text-sm text-gray-400 mt-1" dir="ltr">${escapeHtml(p.ne)}</div>`:''}
      <div class="inline-flex items-center gap-1.5 mt-3 text-sm px-3.5 py-1.5 rounded-full" style="color:${c};background:${hexA(c,0.12)};border:1px solid ${hexA(c,0.28)}">
        <span class="w-2 h-2 rounded-full" style="background:${c}"></span>${escapeHtml(ev)}
      </div>
      <div class="mt-3 text-xs">
        ${p.v==='documented'
          ? '<span class="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"><i class="fa-solid fa-circle-check ml-1"></i>مستند (تأییدشده)</span>'
          : '<span class="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25"><i class="fa-regular fa-circle ml-1"></i>گزارش‌شده</span>'}
      </div>
    </div>
    ${rows.length?`<div class="grid grid-cols-2 gap-2 text-sm">
      ${rows.map(([k,v,ic])=>`<div class="bg-white/[0.04] rounded-xl p-3 ${k==='شرح جان‌باختن'?'col-span-2':''}"><div class="text-gray-500 text-xs mb-1"><i class="fa-solid ${ic} ml-1 opacity-70"></i>${k}</div><div class="font-medium">${escapeHtml(v)}</div></div>`).join('')}
    </div>`:''}
    ${storyHtml}
    ${mlHtml}
    <div class="memorial-quote text-center text-sm mt-6 pt-5 border-t border-white/10">
      «نامت جاودان، یادت گرامی» — جان‌باخته در راه آزادی ایران
    </div>
  `;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  box.parentElement.scrollTop = 0;
}
function closePerson(){
  document.getElementById('jv-modal').style.display='none';
  document.body.style.overflow='';
}

/* ───────────────────────── رویدادها ───────────────────────── */
function wireEvents(){
  const evf = document.getElementById('event-filters');
  if(evf) evf.addEventListener('click', e=>{
    const btn = e.target.closest('.ev-btn'); if(!btn) return;
    filterEvent = btn.dataset.ev;
    document.querySelectorAll('.ev-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    applyAndRender(true);
  });
  document.querySelectorAll('.verif-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      filterVerif = b.dataset.v;
      document.querySelectorAll('.verif-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      applyAndRender(true);
    });
  });
  // تاگل عکس‌دار / سرشناس
  const togglePhoto = document.getElementById('toggle-photo');
  if(togglePhoto){
    togglePhoto.classList.toggle('active', filterPhoto); // همگام‌سازی با حالت پیش‌فرض
    togglePhoto.addEventListener('click', ()=>{ filterPhoto=!filterPhoto; togglePhoto.classList.toggle('active',filterPhoto); applyAndRender(true); });
  }
  const toggleNotable = document.getElementById('toggle-notable');
  if(toggleNotable) toggleNotable.addEventListener('click', ()=>{ filterNotable=!filterNotable; toggleNotable.classList.toggle('active',filterNotable); applyAndRender(true); });

  let t;
  const search = document.getElementById('jv-search');
  if(search) search.addEventListener('input', e=>{
    clearTimeout(t);
    t = setTimeout(()=>{ searchQ = e.target.value.trim().toLowerCase(); applyAndRender(true); }, 200);
  });
  const modal = document.getElementById('jv-modal');
  if(modal) modal.addEventListener('click', e=>{ if(e.target.id==='jv-modal') closePerson(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closePerson(); closeMusicNote(); } });

  // پشتیبانی از ?q= در URL (از SearchAction)
  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  if(q && search){ search.value=q; searchQ=q.toLowerCase(); applyAndRender(true); }
}

/* ════════════════════════════════════════════════════════════════
   پلیر آهنگ شناور — غیرمزاحم، قابل توقف و قابل بستن
   ════════════════════════════════════════════════════════════════ */
let audio = null;
let audioStarted = false;

function initAudio(){
  audio = document.getElementById('memorial-audio');
  const dock = document.getElementById('audio-dock');
  const revive = document.getElementById('audio-revive');
  if(!audio || !dock) return;

  audio.volume = 0.0; // شروع آرام، fade-in نرم
  audio.loop = true;

  const btn = document.getElementById('ad-toggle');
  const closeBtn = document.getElementById('ad-close');
  const infoBtn = document.getElementById('ad-info');

  function setPlayingUI(playing){
    dock.classList.toggle('paused', !playing);
    btn.innerHTML = playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    btn.setAttribute('aria-label', playing ? 'توقف موسیقی' : 'پخش موسیقی');
  }

  function fadeTo(target, ms){
    const steps = 24; const start = audio.volume; const diff = target - start;
    let i=0; clearInterval(audio._fade);
    audio._fade = setInterval(()=>{
      i++; audio.volume = Math.min(1, Math.max(0, start + diff*(i/steps)));
      if(i>=steps){ clearInterval(audio._fade); audio.volume = Math.max(0,Math.min(1,target)); }
    }, ms/steps);
  }

  function play(){
    audio.play().then(()=>{
      audioStarted = true;
      setPlayingUI(true);
      fadeTo(0.55, 1200);
      try{ localStorage.setItem('jv_audio','playing'); }catch(e){}
    }).catch(()=>{ setPlayingUI(false); });
  }
  function pause(){
    fadeTo(0, 500);
    setTimeout(()=>audio.pause(), 520);
    setPlayingUI(false);
    try{ localStorage.setItem('jv_audio','paused'); }catch(e){}
  }

  btn.addEventListener('click', ()=>{ audio.paused ? play() : pause(); });

  // بستن کامل پلیر (آهنگ متوقف، دکمهٔ احیا نمایش داده می‌شود)
  closeBtn.addEventListener('click', ()=>{
    pause();
    dock.style.transform = 'translateY(120%)';
    dock.style.opacity = '0';
    setTimeout(()=>{ dock.style.display='none'; revive.style.display='flex'; }, 350);
    try{ localStorage.setItem('jv_audio','closed'); }catch(e){}
  });

  // احیای پلیر
  revive.addEventListener('click', ()=>{
    revive.style.display='none';
    dock.style.display='flex';
    requestAnimationFrame(()=>{
      dock.style.transform='';
      dock.style.opacity='1';
      dock.classList.add('active'); // فوکوس موقت تا کاربر متوجه شود
      // پس از پایان ترنزیشن، استایل اینلاین را پاک کن تا opacity پیش‌فرض CSS اعمال شود
      setTimeout(()=>{ dock.style.opacity=''; dock.classList.remove('active'); }, 1600);
    });
    play();
  });

  // فوکوس لمسی روی موبایل: با لمس داک، به‌صورت موقت کاملاً مات می‌شود
  dock.addEventListener('touchstart', ()=>{
    dock.classList.add('active');
    clearTimeout(dock._touchT);
    dock._touchT = setTimeout(()=>dock.classList.remove('active'), 2600);
  }, { passive:true });

  infoBtn.addEventListener('click', openMusicNote);

  setPlayingUI(false);

  /* ─── پخش خودکار در حالت پیش‌فرض ───
     کاربر می‌خواهد آهنگ به‌محض باز شدن صفحه پخش شود. سیاست مرورگرها اجازهٔ
     پخش خودکار صدادار را بدون تعامل کاربر نمی‌دهد، پس از این راهکار استفاده می‌کنیم:
     ۱) تلاش برای پخش فوری (در برخی مرورگرها/پس از تعامل قبلی موفق می‌شود).
     ۲) اگر مرورگر رد کرد، تلاش برای پخش بی‌صدا (muted) که معمولاً مجاز است،
        سپس با نخستین تعامل کاربر صدا را به‌نرمی باز می‌کنیم.
     ۳) به‌عنوان آخرین راه، با نخستین تعامل به‌صورت کامل پخش می‌شود. */
  const pref = (()=>{ try{ return localStorage.getItem('jv_audio'); }catch(e){ return null; } })();

  function unmuteOnInteraction(){
    const onFirst = ()=>{
      if(audio.muted){
        audio.muted = false;
        if(audio.paused){ play(); }
        else { audioStarted = true; setPlayingUI(true); fadeTo(0.55, 1200); try{ localStorage.setItem('jv_audio','playing'); }catch(e){} }
      } else if(!audioStarted){ play(); }
      window.removeEventListener('pointerdown', onFirst);
      window.removeEventListener('keydown', onFirst);
      window.removeEventListener('touchstart', onFirst);
      window.removeEventListener('scroll', onFirst);
    };
    window.addEventListener('pointerdown', onFirst, { once:false });
    window.addEventListener('keydown', onFirst, { once:false });
    window.addEventListener('touchstart', onFirst, { once:false, passive:true });
    window.addEventListener('scroll', onFirst, { once:false, passive:true });
  }

  if(pref === 'closed'){
    dock.style.display='none'; revive.style.display='flex';
  } else if(pref === 'paused'){
    // کاربر قبلاً عمداً متوقف کرده — به انتخاب او احترام می‌گذاریم
    setPlayingUI(false);
  } else {
    // تلاش برای پخش خودکار فوری
    audio.muted = false;
    const p = audio.play();
    if(p && typeof p.then === 'function'){
      p.then(()=>{
        audioStarted = true; setPlayingUI(true); fadeTo(0.55, 1200);
        try{ localStorage.setItem('jv_audio','playing'); }catch(e){}
      }).catch(()=>{
        // مرورگر پخش صدادار را رد کرد → تلاش برای پخش بی‌صدا و سپس باز کردن صدا با تعامل
        audio.muted = true; audio.volume = 0.55;
        const pm = audio.play();
        if(pm && typeof pm.then === 'function'){
          pm.then(()=>{ setPlayingUI(true); }).catch(()=>{ setPlayingUI(false); });
        }
        unmuteOnInteraction();
      });
    } else {
      unmuteOnInteraction();
    }
  }
}

function openMusicNote(){
  const m = document.getElementById('music-note-modal');
  if(m){ m.style.display='flex'; document.body.style.overflow='hidden'; }
}
function closeMusicNote(){
  const m = document.getElementById('music-note-modal');
  if(m){ m.style.display='none'; document.body.style.overflow=''; }
}

/* ───────────────── انیمیشن ظاهرشدن با اسکرول ───────────────── */
function initReveal(){
  const els = document.querySelectorAll('.reveal');
  if(!('IntersectionObserver' in window)){ els.forEach(e=>e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold:0.12 });
  els.forEach(e=>io.observe(e));
}

/* ───────────────── در دسترس قراردادن توابع ───────────────── */
window.openPerson = openPerson;
window.closePerson = closePerson;
window.openMusicNote = openMusicNote;
window.closeMusicNote = closeMusicNote;
document.addEventListener('DOMContentLoaded', init);
