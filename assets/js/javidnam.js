/* ════════════════════════════════════════════════════════════════
   جاویدنام‌های راه آزادی ایران — منطق صفحهٔ یادبود (نسخهٔ ارتقایافته)
   بارگذاری دیتاست کامل، رندر چهره‌ها، مودال جزئیات، فیلتر/مرتب‌سازی
   پیشرفته، اسکرول بی‌نهایت + پرش به فوتر، و پلیر آهنگ با پخش خودکار
   ════════════════════════════════════════════════════════════════ */

let ALL = [];
let EVENTS = {};
let META = {};
let filterEvent = 'all';
let filterVerif = 'all';
let filterPhoto = true;    // پیش‌فرض: فقط دارای چهره
let filterNotable = false; // فقط چهره‌های سرشناس
let filterProvince = 'all'; // فیلتر استان
let filterGender = 'all';   // فیلتر جنسیت
let filterAge = 'all';      // فیلتر رده سنی
let sortBy = 'relevance';   // مرتب‌سازی فعال
let searchQ = '';
let shown = 0;
let footerLock = false; // وقتی کاربر «پرش به فوتر» می‌زند، لود خودکار موقتاً قفل می‌شود
const PAGE = 48;

const FA = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
function toFa(n){ return String(n).replace(/[0-9]/g, d => FA[d]); }

/* ───────────────── قفلِ اسکرولِ مرجع‌شمار (Scroll Lock) ─────────────────
   چند مودال ممکن است هم‌زمان باز/بسته شوند (مثلاً فرمِ گزارش روی مودالِ شخص).
   با شمارشِ مرجع، اسکرولِ صفحه فقط وقتی آزاد می‌شود که هیچ مودالی باز نباشد؛
   این از باگِ «گیرکردنِ صفحه روی حالتِ قفل» جلوگیری می‌کند. */
window.JV = window.JV || {};
window.JV._lock = 0;
window.JV.lockScroll = function(){
  window.JV._lock++;
  document.body.style.overflow = 'hidden';
};
window.JV.unlockScroll = function(force){
  if(force){ window.JV._lock = 0; }
  else { window.JV._lock = Math.max(0, window.JV._lock - 1); }
  if(window.JV._lock === 0) document.body.style.overflow = '';
};
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// نقشهٔ رنگ ثابت برای هر رویداد
const EVENT_COLORS = {
  kuye_daneshgah_78: '#fbbf24', green_88: '#34d399', dey_96: '#fb923c',
  darvish_96: '#2dd4bf', mordad_97: '#facc15', kazerun_97: '#a3e635',
  aban_98: '#f87171', khuzestan_1400: '#22d3ee', khizesh_1401: '#e879f9',
  khizesh_1404: '#fb7185', executions: '#c084fc', deaths_in_custody: '#94a3b8',
  chain_murders_77: '#9ca3af', dey_1402: '#60a5fa', dey_1403: '#818cf8',
  needs_review: '#64748b'
};
function evColor(e){ return EVENT_COLORS[e] || '#9ca3af'; }
function hexA(hex, a){
  const h = hex.replace('#',''); const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ───────────────────────── بارگذاری داده ───────────────────────── */
async function init(){
  // پلیر را همان ابتدا (پیش از داده) آماده کن تا پخش خودکار سریع‌تر شروع شود
  initAudio();

  const statusEl = document.getElementById('load-status');
  try {
    const res = await fetch('assets/data/javidnam.full.json', { cache: 'force-cache' });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    META = data.meta; EVENTS = data.events; ALL = data.people;
    // مرتب‌سازی پیش‌فرض (relevance): ابتدا سرشناس، سپس دارای عکس
    ALL.sort((a,b)=>{
      const sa = (a.nt?2:0) + (a.ph?1:0);
      const sb = (b.nt?2:0) + (b.ph?1:0);
      return sb - sa;
    });
    if(statusEl) statusEl.style.display = 'none';
    renderStats();
    renderEventFilters();
    renderProvinceOptions();
    applyAndRender(true);
    wireEvents();
    initInfiniteScroll();
    initReveal();
    initFooterJump();
    // اگر از صفحهٔ دیگری با #donate آمده‌ایم، مودال حمایت را باز کن
    if(location.hash === '#donate'){ setTimeout(openDonate, 300); }
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

/* استان‌های استاندارد و معتبر برای منوی فیلتر (مرتب بر اساس تعداد) */
function renderProvinceOptions(){
  const sel = document.getElementById('jv-province');
  if(!sel) return;
  const counts = {};
  ALL.forEach(p=>{
    const pr = (p.pr||'').trim();
    // فقط استان‌های فارسی استاندارد و کوتاه (حذف داده‌های خراب/انگلیسی)
    if(pr && pr.length < 25 && /[\u0600-\u06FF]/.test(pr)) counts[pr] = (counts[pr]||0)+1;
  });
  const list = Object.entries(counts)
    .filter(([k,v])=>v >= 5) // فقط استان‌های با حداقل ۵ نام
    .sort((a,b)=>b[1]-a[1]);
  let html = '<option value="all">همهٔ استان‌ها</option>';
  for(const [pr,c] of list){
    html += `<option value="${escapeHtml(pr)}">${escapeHtml(pr)} (${toFa(c)})</option>`;
  }
  sel.innerHTML = html;
}

/* ───────────────────────── فیلتر، مرتب‌سازی و رندر ───────────────────────── */
function ageInRange(a, range){
  if(a==null) return false;
  switch(range){
    case 'child': return a <= 17;
    case 'youth': return a >= 18 && a <= 30;
    case 'adult': return a >= 31 && a <= 50;
    case 'senior': return a >= 51;
    default: return true;
  }
}

function getFiltered(){
  let arr = ALL.filter(p=>{
    if(filterEvent !== 'all' && p.e !== filterEvent) return false;
    if(filterVerif !== 'all' && p.v !== filterVerif) return false;
    if(filterPhoto && !p.ph) return false;
    if(filterNotable && !p.nt) return false;
    if(filterProvince !== 'all' && (p.pr||'').trim() !== filterProvince) return false;
    if(filterGender !== 'all' && p.g !== filterGender) return false;
    if(filterAge !== 'all' && !ageInRange(p.a, filterAge)) return false;
    if(searchQ){
      const hay = (p.n+' '+(p.ne||'')+' '+(p.c||'')+' '+(p.pr||'')+' '+(p.ca||'')+' '+(p.oc||'')+' '+(p.s||'')).toLowerCase();
      if(!hay.includes(searchQ)) return false;
    }
    return true;
  });
  return sortFiltered(arr);
}

/* مرتب‌سازی پیشرفته */
function sortFiltered(arr){
  const collator = new Intl.Collator('fa');
  switch(sortBy){
    case 'age_asc':
      return arr.sort((a,b)=> (a.a==null?1:0) - (b.a==null?1:0) || (a.a||0) - (b.a||0));
    case 'age_desc':
      return arr.sort((a,b)=> (a.a==null?1:0) - (b.a==null?1:0) || (b.a||0) - (a.a||0));
    case 'date_desc': // تازه‌ترین جان‌باختن نخست
      return arr.sort((a,b)=> (a.dg?0:1) - (b.dg?0:1) || (b.dg||'').localeCompare(a.dg||''));
    case 'date_asc': // قدیمی‌ترین نخست
      return arr.sort((a,b)=> (a.dg?0:1) - (b.dg?0:1) || (a.dg||'').localeCompare(b.dg||''));
    case 'name_asc':
      return arr.sort((a,b)=> collator.compare(a.n||'', b.n||''));
    case 'name_desc':
      return arr.sort((a,b)=> collator.compare(b.n||'', a.n||''));
    case 'event': // بر اساس ترتیب زمانی رویداد
      return arr.sort((a,b)=>{
        const oa = (EVENTS[a.e]?.order)||99, ob = (EVENTS[b.e]?.order)||99;
        return oa - ob;
      });
    case 'relevance':
    default:
      return arr.sort((a,b)=>{
        const sa = (a.nt?2:0) + (a.ph?1:0);
        const sb = (b.nt?2:0) + (b.ph?1:0);
        return sb - sa;
      });
  }
}

let filteredCache = [];
function applyAndRender(reset){
  const grid = document.getElementById('jv-grid');
  if(reset){
    filteredCache = getFiltered(); shown = 0; grid.innerHTML='';
    footerLock = false; // با هر فیلتر/جستجوی جدید، قفل فوتر آزاد می‌شود
    const txt = document.querySelector('#jv-loader .jv-loader-text');
    if(txt) txt.textContent = 'در حال بارگذاری نام‌های بیشتر…';
  }
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
  updateActiveFiltersUI();

  const empty = document.getElementById('jv-empty');
  if(empty) empty.style.display = filteredCache.length === 0 ? 'block' : 'none';
  lazyObserveNew();
}

/* خلاصهٔ فیلترهای فعال + دکمهٔ پاک‌سازی */
function updateActiveFiltersUI(){
  const box = document.getElementById('jv-active-filters');
  if(!box) return;
  const chips = [];
  if(filterEvent !== 'all') chips.push({k:'event', label: (EVENTS[filterEvent]?.title)||filterEvent});
  if(filterVerif !== 'all') chips.push({k:'verif', label: filterVerif==='documented'?'مستند':'گزارش‌شده'});
  if(filterProvince !== 'all') chips.push({k:'province', label: 'استان: '+filterProvince});
  if(filterGender !== 'all') chips.push({k:'gender', label: filterGender});
  if(filterAge !== 'all'){
    const ageLabels = {child:'کودک/نوجوان (≤۱۷)', youth:'جوان (۱۸–۳۰)', adult:'میانسال (۳۱–۵۰)', senior:'سالمند (۵۱+)'};
    chips.push({k:'age', label: ageLabels[filterAge]});
  }
  if(filterNotable) chips.push({k:'notable', label:'سرشناس'});
  if(searchQ) chips.push({k:'search', label:'«'+searchQ+'»'});

  if(chips.length === 0){ box.innerHTML=''; box.style.display='none'; return; }
  box.style.display='flex';
  box.innerHTML = chips.map(ch=>
    `<button class="jv-chip" data-clear="${ch.k}"><span>${escapeHtml(ch.label)}</span><i class="fa-solid fa-xmark"></i></button>`
  ).join('') + `<button class="jv-chip jv-chip-reset" data-clear="all"><i class="fa-solid fa-broom ml-1"></i>پاک‌کردن همه</button>`;
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
    if(endNote)  endNote.style.display = (filteredCache.length > 0) ? 'flex' : 'none';
  }
  // نمایش/پنهان‌سازی دکمهٔ پرش به فوتر (وقتی هنوز نام‌های زیادی مانده)
  const jumpBtn = document.getElementById('jv-footer-jump');
  if(jumpBtn){
    jumpBtn.style.display = (filteredCache.length > PAGE) ? 'flex' : 'none';
  }
}

/* مشاهده‌گر سنتینل برای لود خودکار هنگام اسکرول */
let scrollObserver = null;
function initInfiniteScroll(){
  const sentinel = document.getElementById('jv-sentinel');
  if(!sentinel) return;
  if(!('IntersectionObserver' in window)){
    window.addEventListener('scroll', ()=>{
      if(!footerLock && shown < filteredCache.length &&
         (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 600){
        applyAndRender(false);
      }
    }, { passive:true });
    return;
  }
  scrollObserver = new IntersectionObserver((entries)=>{
    entries.forEach(en=>{
      if(en.isIntersecting && !footerLock && shown < filteredCache.length){
        applyAndRender(false);
      }
    });
  }, { rootMargin: '600px 0px' });
  scrollObserver.observe(sentinel);
}

/* ───────── دکمهٔ هوشمند پرش به فوتر / بازگشت به بالا ───────── */
function initFooterJump(){
  const jumpBtn = document.getElementById('jv-footer-jump');
  const topBtn  = document.getElementById('jv-back-top');
  if(jumpBtn){
    jumpBtn.addEventListener('click', ()=>{
      // مهم: برای دسترسی به فوتر، باید لود خودکار را موقتاً متوقف کنیم تا
      // اسکرول به پایین باعث افزودن نام‌های بیشتر و دورتر شدن فوتر نشود.
      footerLock = true;
      const sentinel = document.getElementById('jv-sentinel');
      const loader   = document.getElementById('jv-loader');
      if(sentinel) sentinel.style.display = 'none';
      if(loader)   loader.style.display = 'none';
      const footer = document.querySelector('footer');
      if(footer) footer.scrollIntoView({ behavior:'smooth', block:'start' });
      // پس از رسیدن، اگر هنوز نام‌هایی مانده، نشانگر «هنوز نام‌های بیشتری هست» را نشان بده
      setTimeout(()=>{
        if(shown < filteredCache.length){
          if(loader){
            loader.style.display = 'flex';
            const txt = loader.querySelector('.jv-loader-text');
            if(txt) txt.textContent = 'برای دیدن نام‌های بیشتر، به بالا برگردید و اسکرول کنید';
          }
        }
      }, 900);
    });
  }
  if(topBtn){
    topBtn.addEventListener('click', ()=>{
      // آزادکردن قفل فوتر تا اسکرول دوباره نام‌های بیشتر را لود کند
      footerLock = false;
      updateScrollUI(filteredCache.length - shown);
      const txt = document.querySelector('#jv-loader .jv-loader-text');
      if(txt) txt.textContent = 'در حال بارگذاری نام‌های بیشتر…';
      window.scrollTo({ top:0, behavior:'smooth' });
    });
    // فقط پس از کمی اسکرول نمایش بده
    let ticking=false;
    window.addEventListener('scroll', ()=>{
      if(!ticking){
        window.requestAnimationFrame(()=>{
          topBtn.classList.toggle('show', window.scrollY > 800);
          ticking=false;
        });
        ticking=true;
      }
    }, { passive:true });
  }
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
  let photo;
  if(p.ph){
    photo = `<img data-src="${escapeHtml(p.ph)}" alt="${escapeHtml(p.n)}" class="jv-photo lazy" loading="lazy" referrerpolicy="no-referrer"
      onerror="this.parentElement.innerHTML='<div class=\\'jv-photo-ph\\'><i class=\\'fa-solid fa-dove\\'></i></div>'">`;
  } else {
    photo = `<div class="jv-photo-ph"><i class="fa-solid fa-dove"></i></div>`;
  }
  const notableClass = p.nt ? 'jv-notable' : '';
  return `<article class="jv-card ${notableClass} group rounded-2xl p-2.5 border border-white/10 bg-white/[0.025] hover:bg-white/[0.06] transition cursor-pointer" style="animation-delay:${(idx%PAGE)*0.015}s" onclick="openPerson('${p.id}')" tabindex="0" role="button" aria-label="جزئیات ${escapeHtml(p.n)}">
    <div class="relative overflow-hidden rounded-xl mb-2.5">
      ${photo}
      <span class="absolute top-2 right-2">${verifBadge}</span>
      <span class="absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full" style="background:${hexA(c,0.85)};color:#0a0e1a;font-weight:700">${escapeHtml(ev)}</span>
      <div class="jv-hover-hint" aria-hidden="true">
        <i class="fa-solid fa-circle-info"></i>
        <span>برای اطلاعات بیشتر و یادبود کلیک کنید</span>
      </div>
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
  const c = evColor(p.e);

  const rows = [];
  if(p.a!=null) rows.push(['سن', toFa(p.a)+' سال', 'fa-cake-candles']);
  if(p.g) rows.push(['جنسیت', p.g, p.g==='زن'?'fa-venus':'fa-mars']);
  if(p.dj) rows.push(['تاریخ جان‌باختن', toFa(p.dj), 'fa-calendar']);
  if(p.c) rows.push(['شهر', p.c, 'fa-city']);
  if(p.pr) rows.push(['استان', p.pr, 'fa-map']);
  if(p.oc) rows.push(['شغل', p.oc, 'fa-briefcase']);
  if(p.ca) rows.push(['شرح جان‌باختن', p.ca, 'fa-heart-crack']);

  let hero;
  if(p.ph){
    hero = `<div class="jv-modal-photo-wrap"><img src="${escapeHtml(p.ph)}" alt="${escapeHtml(p.n)}" class="jv-modal-photo" referrerpolicy="no-referrer"
      onerror="this.parentElement.innerHTML='<div class=\\'jv-modal-ph\\' style=\\'color:${c}\\'><i class=\\'fa-solid fa-dove\\'></i></div>'"></div>`;
  } else {
    hero = `<div class="jv-modal-photo-wrap"><div class="jv-modal-ph" style="color:${c}"><i class="fa-solid fa-dove"></i></div></div>`;
  }

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
    ${(window.Community ? window.Community.renderPersonWidgets(p) : '')}
    <div class="memorial-quote text-center text-sm mt-6 pt-5 border-t border-white/10">
      «نامت جاودان، یادت گرامی» — جان‌باخته در راه آزادی ایران
    </div>
  `;
  modal.style.display = 'flex';
  window.JV.lockScroll();
  box.parentElement.scrollTop = 0;
  // اتصالِ ویجت‌های مشارکت (کامنت/گزارش/پیشنهادِ عکس)
  if (window.Community) window.Community.wirePersonWidgets(p);
}
function closePerson(){
  const jm = document.getElementById('jv-modal');
  if(jm.style.display === 'none') return; // پیش‌تر بسته شده؛ از کاهشِ اشتباهِ شمارنده جلوگیری کن
  jm.style.display='none';
  window.JV.unlockScroll();
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
  const togglePhoto = document.getElementById('toggle-photo');
  if(togglePhoto){
    togglePhoto.classList.toggle('active', filterPhoto);
    togglePhoto.addEventListener('click', ()=>{ filterPhoto=!filterPhoto; togglePhoto.classList.toggle('active',filterPhoto); applyAndRender(true); });
  }
  const toggleNotable = document.getElementById('toggle-notable');
  if(toggleNotable) toggleNotable.addEventListener('click', ()=>{ filterNotable=!filterNotable; toggleNotable.classList.toggle('active',filterNotable); applyAndRender(true); });

  // مرتب‌سازی
  const sortSel = document.getElementById('jv-sort');
  if(sortSel) sortSel.addEventListener('change', e=>{ sortBy = e.target.value; applyAndRender(true); });

  // فیلتر استان / جنسیت / رده سنی
  const provSel = document.getElementById('jv-province');
  if(provSel) provSel.addEventListener('change', e=>{ filterProvince = e.target.value; applyAndRender(true); });
  const genderSel = document.getElementById('jv-gender');
  if(genderSel) genderSel.addEventListener('change', e=>{ filterGender = e.target.value; applyAndRender(true); });
  const ageSel = document.getElementById('jv-age');
  if(ageSel) ageSel.addEventListener('change', e=>{ filterAge = e.target.value; applyAndRender(true); });

  // چیپ‌های فیلتر فعال (پاک‌سازی)
  const activeBox = document.getElementById('jv-active-filters');
  if(activeBox) activeBox.addEventListener('click', e=>{
    const btn = e.target.closest('[data-clear]'); if(!btn) return;
    clearFilter(btn.dataset.clear);
  });

  let t;
  const search = document.getElementById('jv-search');
  if(search) search.addEventListener('input', e=>{
    clearTimeout(t);
    t = setTimeout(()=>{ searchQ = e.target.value.trim().toLowerCase(); applyAndRender(true); }, 200);
  });
  // دکمهٔ پاک‌کردن سریع جستجو
  const searchClear = document.getElementById('jv-search-clear');
  if(searchClear && search){
    search.addEventListener('input', ()=>{ searchClear.style.display = search.value ? 'flex' : 'none'; });
    searchClear.addEventListener('click', ()=>{ search.value=''; searchQ=''; searchClear.style.display='none'; applyAndRender(true); search.focus(); });
  }

  const modal = document.getElementById('jv-modal');
  if(modal) modal.addEventListener('click', e=>{ if(e.target.id==='jv-modal') closePerson(); });
  document.addEventListener('keydown', e=>{
    if(e.key!=='Escape') return;
    // اگر فرمِ مشارکت (cm-modal) باز است، Escape را به آن واگذار کن (هندلرِ خودش می‌بندد)
    const cm = document.getElementById('cm-modal');
    if(cm && cm.classList.contains('show')) return;
    closePerson(); closeMusicNote(); closeDonate();
  });

  // کلیک/Enter روی کارت با کیبورد
  const grid = document.getElementById('jv-grid');
  if(grid) grid.addEventListener('keydown', e=>{
    if((e.key==='Enter'||e.key===' ') && e.target.classList.contains('jv-card')){
      e.preventDefault(); e.target.click();
    }
  });

  // پشتیبانی از ?q= در URL
  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  if(q && search){ search.value=q; searchQ=q.toLowerCase(); if(searchClear) searchClear.style.display='flex'; applyAndRender(true); }
}

function clearFilter(which){
  switch(which){
    case 'event': filterEvent='all'; document.querySelectorAll('.ev-btn').forEach(b=>b.classList.toggle('active', b.dataset.ev==='all')); break;
    case 'verif': filterVerif='all'; document.querySelectorAll('.verif-btn').forEach(b=>b.classList.toggle('active', b.dataset.v==='all')); break;
    case 'province': filterProvince='all'; { const s=document.getElementById('jv-province'); if(s) s.value='all'; } break;
    case 'gender': filterGender='all'; { const s=document.getElementById('jv-gender'); if(s) s.value='all'; } break;
    case 'age': filterAge='all'; { const s=document.getElementById('jv-age'); if(s) s.value='all'; } break;
    case 'notable': filterNotable=false; { const b=document.getElementById('toggle-notable'); if(b) b.classList.remove('active'); } break;
    case 'search': searchQ=''; { const s=document.getElementById('jv-search'); if(s) s.value=''; const c=document.getElementById('jv-search-clear'); if(c) c.style.display='none'; } break;
    case 'all':
      filterEvent='all'; filterVerif='all'; filterProvince='all'; filterGender='all'; filterAge='all'; filterNotable=false; searchQ='';
      document.querySelectorAll('.ev-btn').forEach(b=>b.classList.toggle('active', b.dataset.ev==='all'));
      document.querySelectorAll('.verif-btn').forEach(b=>b.classList.toggle('active', b.dataset.v==='all'));
      ['jv-province','jv-gender','jv-age'].forEach(id=>{ const s=document.getElementById(id); if(s) s.value='all'; });
      { const b=document.getElementById('toggle-notable'); if(b) b.classList.remove('active'); }
      { const s=document.getElementById('jv-search'); if(s) s.value=''; const c=document.getElementById('jv-search-clear'); if(c) c.style.display='none'; }
      break;
  }
  applyAndRender(true);
}

/* ════════════════════════════════════════════════════════════════
   پلیر آهنگ شناور — پخش خودکار هوشمند، قابل توقف و قابل بستن
   ════════════════════════════════════════════════════════════════ */
let audio = null;
let audioStarted = false;

/* ════════════════════════════════════════════════════════════════
   سیستم پخش موسیقیِ یادبود — معماریِ قوی و چندلایه برای پخش خودکار
   ----------------------------------------------------------------
   چالش: مرورگرها پخشِ خودکارِ صدادار را بدون «اشارهٔ کاربر» مسدود می‌کنند.
   راهبرد:
     ۱) تلاش فوری برای پخش صدادار (موفق در مرورگرهایی با MEI بالا/تعامل قبلی)
     ۲) اگر رد شد → بلافاصله شنونده‌های تعامل (کلیک/لمس/اسکرول/کلید/حرکت موس)
        را روی کلِ سند مسلح می‌کنیم؛ نخستین تعاملِ کاربر صدا را روشن می‌کند.
        این شنونده‌ها «همیشه و بی‌قید» مسلح می‌شوند (باگِ قبلی همین بود).
     ۳) پشتیبان: canplay/loadeddata و بازگشت به تب (visibilitychange).
   ════════════════════════════════════════════════════════════════ */
function initAudio(){
  audio = document.getElementById('memorial-audio');
  const dock = document.getElementById('audio-dock');
  const revive = document.getElementById('audio-revive');
  if(!audio || !dock) return;

  const TARGET_VOL = 0.55;
  audio.loop = true;
  audio.volume = TARGET_VOL;      // حجم پیش‌فرض (هنگام unmute شنیده می‌شود)
  try{ audio.load(); }catch(e){}

  const btn = document.getElementById('ad-toggle');
  const closeBtn = document.getElementById('ad-close');
  const infoBtn = document.getElementById('ad-info');
  const hintBar = document.getElementById('audio-hint');

  let interactionArmed = false;   // آیا شنونده‌های تعامل مسلح‌اند؟
  let userClosed = false;         // کاربر پلیر را بسته است؟
  let userPaused = false;         // کاربر دستی متوقف کرده است؟

  const pref = (()=>{ try{ return localStorage.getItem('jv_audio'); }catch(e){ return null; } })();

  /* ---------- UI ---------- */
  function setPlayingUI(playing){
    dock.classList.toggle('paused', !playing);
    if(btn){
      btn.innerHTML = playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
      btn.setAttribute('aria-label', playing ? 'توقف موسیقی' : 'پخش موسیقی');
    }
  }
  function showSoundHint(){ if(hintBar) hintBar.classList.add('show'); }
  function hideSoundHint(){ if(hintBar) hintBar.classList.remove('show'); }

  function fadeTo(target, ms){
    const steps = 24; const start = audio.volume; const diff = target - start;
    let i=0; clearInterval(audio._fade);
    audio._fade = setInterval(()=>{
      i++; audio.volume = Math.min(1, Math.max(0, start + diff*(i/steps)));
      if(i>=steps){ clearInterval(audio._fade); audio.volume = Math.max(0,Math.min(1,target)); }
    }, ms/steps);
  }

  /* ---------- موفقیتِ شنیداری ---------- */
  function onAudible(){
    audioStarted = true;
    userPaused = false;
    audio.muted = false;
    setPlayingUI(true);
    hideSoundHint();
    if(audio.volume < 0.05){ audio.volume = 0; fadeTo(TARGET_VOL, 1200); }
    try{ localStorage.setItem('jv_audio','playing'); }catch(e){}
  }

  /* ---------- پخش صدادار (با Promise) ---------- */
  function playAudible(){
    audio.muted = false;
    const p = audio.play();
    if(p && typeof p.then === 'function'){
      return p.then(onAudible);
    }
    onAudible();
    return Promise.resolve();
  }

  function pause(){
    userPaused = true;
    fadeTo(0, 450);
    setTimeout(()=>{ if(userPaused) audio.pause(); }, 470);
    setPlayingUI(false);
    try{ localStorage.setItem('jv_audio','paused'); }catch(e){}
  }

  /* ---------- مسلح‌کردنِ تعامل (هستهٔ رفعِ باگ) ----------
     روی کلِ سند، هر نوع تعاملِ کاربر صدا را روشن می‌کند.
     listenerها فقط یک‌بار اجرا و سپس پاک می‌شوند. */
  const INTERACTION_EVENTS = ['pointerdown','mousedown','touchstart','keydown','click','scroll','wheel','mousemove'];
  function armInteraction(){
    if(interactionArmed) return;
    interactionArmed = true;
    const onFirst = ()=>{
      disarm();
      if(userClosed || userPaused) return;       // اگر کاربر بسته/متوقف کرده، احترام بگذار
      playAudible().catch(()=>{ /* اگر باز هم رد شد، راهنما را نشان بده */ showSoundHint(); });
    };
    function disarm(){
      INTERACTION_EVENTS.forEach(ev=> document.removeEventListener(ev, onFirst, true));
      interactionArmed = false;
    }
    // از capture=true استفاده می‌کنیم تا قبل از stopPropagation سایر هندلرها اجرا شود
    INTERACTION_EVENTS.forEach(ev=> document.addEventListener(ev, onFirst, true));
  }

  /* ---------- تلاشِ پخشِ خودکار ---------- */
  function attemptAutoplay(){
    if(audioStarted || userClosed || userPaused) return;
    playAudible().then(()=>{
      hideSoundHint();           // پخشِ صدادار موفق شد
    }).catch(()=>{
      // مرورگر مسدود کرد → راهنما + مسلح‌کردنِ تعامل (همیشه)
      showSoundHint();
      armInteraction();
    });
  }

  /* ---------- کنترل‌های UI ---------- */
  if(btn) btn.addEventListener('click', ()=>{
    if(audio.paused || audio.muted){ userPaused=false; playAudible().catch(showSoundHint); }
    else pause();
  });

  if(closeBtn) closeBtn.addEventListener('click', ()=>{
    userClosed = true;
    pause();
    dock.style.transform = 'translateY(120%)';
    dock.style.opacity = '0';
    setTimeout(()=>{ dock.style.display='none'; if(revive) revive.style.display='flex'; }, 350);
    try{ localStorage.setItem('jv_audio','closed'); }catch(e){}
  });

  if(revive) revive.addEventListener('click', ()=>{
    userClosed = false;
    revive.style.display='none';
    dock.style.display='flex';
    requestAnimationFrame(()=>{
      dock.style.transform='';
      dock.style.opacity='1';
      dock.classList.add('active');
      setTimeout(()=>{ dock.style.opacity=''; dock.classList.remove('active'); }, 1600);
    });
    userPaused=false; playAudible().catch(showSoundHint);
  });

  dock.addEventListener('touchstart', ()=>{
    dock.classList.add('active');
    clearTimeout(dock._touchT);
    dock._touchT = setTimeout(()=>dock.classList.remove('active'), 2600);
  }, { passive:true });

  if(infoBtn) infoBtn.addEventListener('click', openMusicNote);

  if(hintBar) hintBar.addEventListener('click', ()=>{
    userPaused=false; playAudible().then(hideSoundHint).catch(hideSoundHint);
  });

  /* ---------- راه‌اندازیِ اولیه بر اساس ترجیحِ ذخیره‌شده ---------- */
  setPlayingUI(false);

  if(pref === 'closed'){
    userClosed = true;
    dock.style.display='none'; if(revive) revive.style.display='flex';
    return;
  }
  if(pref === 'paused'){
    userPaused = true;
    setPlayingUI(false);
    return;
  }

  /* ---------- استراتژیِ پخشِ خودکار (لایه‌به‌لایه) ---------- */
  // لایهٔ ۱: تلاشِ فوری
  attemptAutoplay();
  // مهم: شنونده‌های تعامل را همین حالا و بی‌قیدوشرط مسلح کن (باگِ اصلی اینجا بود)
  armInteraction();

  // لایهٔ ۲: وقتی فایل آمادهٔ پخش شد، دوباره تلاش کن
  ['canplay','canplaythrough','loadeddata'].forEach(ev=>{
    audio.addEventListener(ev, ()=>{
      if(!audioStarted && !userClosed && !userPaused) attemptAutoplay();
    }, { once:true });
  });

  // لایهٔ ۳: بازگشت به تب (وقتی کاربر از تب دیگر برمی‌گردد)
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden && !audioStarted && !userClosed && !userPaused){
      attemptAutoplay();
      armInteraction();
    }
  });

  // لایهٔ ۴: تلاشِ مجددِ کوتاه‌مدت (برخی مرورگرها با کمی تأخیر اجازه می‌دهند)
  let retries = 0;
  const retryTimer = setInterval(()=>{
    retries++;
    if(audioStarted || userClosed || userPaused || retries > 6){ clearInterval(retryTimer); return; }
    attemptAutoplay();
  }, 1500);
}

function openMusicNote(){
  const m = document.getElementById('music-note-modal');
  if(m && m.style.display!=='flex'){ m.style.display='flex'; window.JV.lockScroll(); }
}
function closeMusicNote(){
  const m = document.getElementById('music-note-modal');
  if(m && m.style.display==='flex'){ m.style.display='none'; window.JV.unlockScroll(); }
}

/* ───────────────── مودال حمایت (Donate) ───────────────── */
function openDonate(){
  const m = document.getElementById('donate-modal');
  if(m && m.style.display!=='flex'){ m.style.display='flex'; window.JV.lockScroll(); }
}
function closeDonate(){
  const m = document.getElementById('donate-modal');
  if(m && m.style.display==='flex'){ m.style.display='none'; window.JV.unlockScroll(); }
}
function copyWallet(addr, btn){
  const done = ()=>{
    if(!btn) return;
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> کپی شد';
    btn.classList.add('copied');
    setTimeout(()=>{ btn.innerHTML = old; btn.classList.remove('copied'); }, 1800);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(addr).then(done).catch(()=>fallbackCopy(addr, done));
  } else { fallbackCopy(addr, done); }
}
function fallbackCopy(text, cb){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); }catch(e){}
  document.body.removeChild(ta);
  if(cb) cb();
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
window.openDonate = openDonate;
window.closeDonate = closeDonate;
window.copyWallet = copyWallet;
document.addEventListener('DOMContentLoaded', init);
