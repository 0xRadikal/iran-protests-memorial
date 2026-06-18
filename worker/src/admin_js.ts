// ============================================================================
//  منطقِ پنلِ ادمین (سمتِ کلاینت) — سرو از /admin-app.js
//  بدونِ هیچ فریم‌ورک؛ Vanilla JS. توکن در localStorage نگه داشته می‌شود.
// ============================================================================
export const ADMIN_JS = /* js */ `
const TOKEN_KEY = 'jvn_admin_token';
const EVENTS_FA = {
  kuye_daneshgah_78:'کوی دانشگاه ۷۸', green_88:'جنبش سبز ۸۸', dey_96:'دی ۹۶',
  darvish_96:'درویش ۹۶', mordad_97:'مرداد ۹۷', kazerun_97:'کازرون ۹۷',
  aban_98:'آبان ۹۸', khuzestan_1400:'خوزستان ۱۴۰۰', khizesh_1401:'خیزش ۱۴۰۱',
  khizesh_1404:'خیزش ۱۴۰۴', executions:'اعدام‌ها', deaths_in_custody:'مرگ در بازداشت',
  chain_murders_77:'قتل‌های زنجیره‌ای ۷۷', dey_1402:'دی ۱۴۰۲', dey_1403:'دی ۱۴۰۳',
  needs_review:'نیازمند بازبینی'
};
const RTYPE_FA = { duplicate:'تکراری', wrong_info:'اطلاعات غلط', inappropriate:'نامناسب', other:'سایر' };

const App = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  admin: null,
  tab: 'dashboard',

  // --- ابزارها ---
  esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); },
  attr(s){ return this.esc(s); },
  toast(msg, type='ok'){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl text-white text-sm shadow-lg ' + (type==='err'?'bg-red-600':'bg-emerald-600');
    t.classList.remove('hidden');
    clearTimeout(this._tt); this._tt = setTimeout(()=>t.classList.add('hidden'), 2800);
  },
  closeModal(){ document.getElementById('modal').classList.add('hidden'); },
  showModal(html){ document.getElementById('modalBody').innerHTML = html; document.getElementById('modal').classList.remove('hidden'); },

  async api(path, opts={}){
    const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
    if(this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const res = await fetch('/api' + path, Object.assign({}, opts, { headers }));
    let data = {};
    try{ data = await res.json(); }catch(e){}
    if(res.status === 401){ this.forceLogout(); throw new Error('نشست منقضی شده'); }
    if(!res.ok || data.success === false) throw new Error(data.error || ('خطا '+res.status));
    return data.data;
  },

  // --- ورود/خروج ---
  async login(u, p){
    const d = await this.api('/admin/login', { method:'POST', body: JSON.stringify({username:u,password:p}) });
    this.token = d.token; this.admin = d.admin;
    localStorage.setItem(TOKEN_KEY, d.token);
    this.enterApp();
  },
  async logout(){ try{ await this.api('/admin/logout', {method:'POST'}); }catch(e){} this.forceLogout(); },
  forceLogout(){ this.token=''; localStorage.removeItem(TOKEN_KEY); document.getElementById('appView').classList.add('hidden'); document.getElementById('loginView').classList.remove('hidden'); },

  async enterApp(){
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('appView').classList.remove('hidden');
    try{ const me = await this.api('/admin/me'); document.getElementById('whoami').textContent = '👤 ' + (this.admin?.display_name || me.username) + ' · ' + me.role; }catch(e){}
    this.switchTab('dashboard');
    this.refreshBadges();
  },

  switchTab(tab){
    this.tab = tab;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
    const map = { dashboard:this.viewDashboard, comments:this.viewComments, reports:this.viewReports, photos:this.viewPhotos, submissions:this.viewSubmissions, settings:this.viewSettings };
    (map[tab]||this.viewDashboard).call(this);
  },

  setContent(html){ document.getElementById('content').innerHTML = html; },
  loading(){ this.setContent('<div class="text-center py-20 text-gray-500"><i class="fa-solid fa-spinner spin text-2xl"></i></div>'); },

  async refreshBadges(){
    try{
      const d = await this.api('/admin/dashboard');
      const s = d.stats;
      const set = (id,n)=>{ const el=document.getElementById(id); if(!el)return; if(n>0){el.textContent=this.faNum(n);el.classList.remove('hidden');}else el.classList.add('hidden'); };
      set('b-comments', s.comments_pending + s.comments_reported);
      set('b-reports', s.reports_open);
      set('b-photos', s.photos_pending);
      set('b-submissions', s.submissions_pending);
    }catch(e){}
  },
  faNum(n){ return String(n).replace(/[0-9]/g, d=>'۰۱۲۳۴۵۶۷۸۹'[d]); },

  // --- داشبورد ---
  async viewDashboard(){
    this.loading();
    const d = await this.api('/admin/dashboard');
    const s = d.stats;
    const cards = [
      ['کامنت در انتظار', s.comments_pending, 'fa-comments', 'amber'],
      ['کامنت گزارش‌شده', s.comments_reported, 'fa-triangle-exclamation', 'red'],
      ['گزارش‌های باز', s.reports_open, 'fa-flag', 'red'],
      ['گزارش تکراری', s.reports_duplicate, 'fa-clone', 'orange'],
      ['پیشنهاد عکس', s.photos_pending, 'fa-image', 'blue'],
      ['افزودن جاویدنام', s.submissions_pending, 'fa-user-plus', 'purple'],
      ['کامنت تأییدشده', s.comments_approved, 'fa-check', 'emerald'],
      ['کل جاویدنام‌ها', s.people_total, 'fa-users', 'gray'],
    ];
    const grid = cards.map(([t,n,ic,col])=>\`
      <div class="card p-5">
        <div class="flex items-center justify-between">
          <div><div class="text-3xl font-bold">\${this.faNum(n)}</div><div class="text-sm text-gray-400 mt-1">\${t}</div></div>
          <i class="fa-solid \${ic} text-2xl text-\${col}-400/70"></i>
        </div>
      </div>\`).join('');
    const log = (d.recent||[]).map(r=>\`
      <div class="flex items-center gap-3 py-2 border-b border-[var(--line)] text-sm">
        <span class="pill bg-emerald-400"></span>
        <span class="text-gray-300">\${this.esc(r.action)}</span>
        <span class="text-gray-500">\${this.esc(r.entity_type||'')} #\${this.esc(r.entity_id||'')}</span>
        <span class="text-gray-600 mr-auto text-xs">\${this.esc(r.created_at)}</span>
      </div>\`).join('') || '<p class="text-gray-500 text-sm py-4">فعالیتی ثبت نشده</p>';
    this.setContent(\`
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">\${grid}</div>
      <div class="card p-5">
        <h3 class="font-bold mb-3"><i class="fa-solid fa-clock-rotate-left ml-1 text-gray-400"></i> آخرین فعالیت‌ها</h3>
        <div class="scroll max-h-80 overflow-auto">\${log}</div>
      </div>\`);
  },

  // --- کامنت‌ها ---
  async viewComments(){
    this.loading();
    const filter = this._cf || 'pending';
    const reported = filter === 'reported';
    const q = reported ? '?reported=1' : ('?status=' + filter);
    const d = await this.api('/admin/comments' + q);
    const tabs = [['pending','در انتظار'],['reported','گزارش‌شده'],['approved','تأییدشده'],['rejected','ردشده'],['spam','اسپم'],['all','همه']];
    const filterBar = tabs.map(([k,l])=>\`<button data-action="cfilter" data-k="\${k}" class="btn px-3 py-1.5 text-sm \${filter===k?'bg-emerald-600 text-white':'bg-white/5'}">\${l}</button>\`).join('');
    const rows = (d.comments||[]).map(c=>\`
      <div class="card p-4 row-enter">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="font-bold">\${this.esc(c.author_name)}</span>
              <span class="badge bg-white/10 text-gray-300">\${this.esc(c.person_name||c.person_id)}</span>
              \${c.report_count>0?\`<span class="badge bg-red-500/20 text-red-300"><i class="fa-solid fa-flag"></i> \${this.faNum(c.report_count)} گزارش</span>\`:''}
              <span class="badge \${this.statusColor(c.status)}">\${this.statusFa(c.status)}</span>
            </div>
            <p class="text-sm text-gray-200 leading-7 whitespace-pre-wrap">\${this.esc(c.body)}</p>
            <div class="text-xs text-gray-500 mt-1">\${this.esc(c.created_at)} · \${this.esc(c.country||'')} \${this.esc(c.ip||'')}</div>
          </div>
        </div>
        <div class="flex gap-2 mt-3 flex-wrap">
          \${c.status!=='approved'?\`<button data-action="comment" data-id="\${c.id}" data-act="approve" class="btn px-3 py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-600 text-white"><i class="fa-solid fa-check"></i> تأیید</button>\`:''}
          \${c.status!=='rejected'?\`<button data-action="comment" data-id="\${c.id}" data-act="reject" class="btn px-3 py-1.5 text-sm bg-amber-600/80 hover:bg-amber-600 text-white"><i class="fa-solid fa-eye-slash"></i> رد</button>\`:''}
          <button data-action="comment" data-id="\${c.id}" data-act="spam" class="btn px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10"><i class="fa-solid fa-ban"></i> اسپم</button>
          <button data-action="comment" data-id="\${c.id}" data-act="delete" data-confirm="1" class="btn px-3 py-1.5 text-sm bg-red-600/80 hover:bg-red-600 text-white"><i class="fa-solid fa-trash"></i> حذف</button>
        </div>
      </div>\`).join('') || '<p class="text-gray-500 text-center py-16">موردی نیست</p>';
    this.setContent(\`<div class="flex gap-2 mb-4 flex-wrap">\${filterBar}</div><div class="space-y-3">\${rows}</div>\`);
  },
  async commentAction(id, action, confirmFirst){
    if(confirmFirst && !confirm('این کامنت برای همیشه حذف شود؟')) return;
    try{ await this.api('/admin/comments/'+id+'/'+action, {method:'POST', body:'{}'}); this.toast('انجام شد'); this.viewComments(); this.refreshBadges(); }
    catch(e){ this.toast(e.message,'err'); }
  },

  // --- گزارش‌ها ---
  async viewReports(){
    this.loading();
    const filter = this._rf || 'open';
    const d = await this.api('/admin/reports?status=' + filter);
    const tabs = [['open','باز'],['resolved','رسیدگی‌شده'],['dismissed','ردشده'],['all','همه']];
    const filterBar = tabs.map(([k,l])=>\`<button data-action="rfilter" data-k="\${k}" class="btn px-3 py-1.5 text-sm \${filter===k?'bg-emerald-600 text-white':'bg-white/5'}">\${l}</button>\`).join('');
    const rows = (d.reports||[]).map(r=>\`
      <div class="card p-4 row-enter">
        <div class="flex items-center gap-2 flex-wrap mb-2">
          <span class="badge bg-red-500/20 text-red-300">\${RTYPE_FA[r.report_type]||r.report_type}</span>
          <span class="font-bold">\${this.esc(r.person_name||r.person_id)}</span>
          <span class="badge \${this.statusColor(r.status)}">\${this.statusFa(r.status)}</span>
          \${r.duplicate_of?\`<span class="badge bg-orange-500/20 text-orange-300">تکراری با: \${this.esc(r.duplicate_name||r.duplicate_of)}</span>\`:''}
        </div>
        \${r.description?\`<p class="text-sm text-gray-200 leading-7">\${this.esc(r.description)}</p>\`:''}
        <div class="text-xs text-gray-500 mt-1">\${this.esc(r.created_at)} · \${this.esc(r.reporter_name||'ناشناس')} · \${this.esc(r.country||'')}</div>
        \${r.admin_note?\`<div class="text-xs text-emerald-400/80 mt-1"><i class="fa-solid fa-pen"></i> \${this.esc(r.admin_note)}</div>\`:''}
        \${r.status==='open'?\`<div class="flex gap-2 mt-3 flex-wrap">
          \${r.report_type==='duplicate'&&r.duplicate_of?\`<button data-action="open-merge" data-keep="\${this.attr(r.person_id)}" data-dup="\${this.attr(r.duplicate_of)}" data-keepname="\${this.attr(r.person_name||'')}" data-dupname="\${this.attr(r.duplicate_name||'')}" class="btn px-3 py-1.5 text-sm bg-orange-600/80 hover:bg-orange-600 text-white"><i class="fa-solid fa-code-merge"></i> ادغام تکراری‌ها</button>\`:''}
          <button data-action="report" data-id="\${r.id}" data-act="resolve" class="btn px-3 py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-600 text-white"><i class="fa-solid fa-check"></i> رسیدگی شد</button>
          <button data-action="report" data-id="\${r.id}" data-act="dismiss" class="btn px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10"><i class="fa-solid fa-xmark"></i> رد گزارش</button>
        </div>\`:''}
      </div>\`).join('') || '<p class="text-gray-500 text-center py-16">موردی نیست</p>';
    this.setContent(\`<div class="flex gap-2 mb-4 flex-wrap">\${filterBar}</div><div class="space-y-3">\${rows}</div>\`);
  },
  async reportAction(id, action){
    const note = prompt('یادداشتِ ادمین (اختیاری):') || '';
    try{ await this.api('/admin/reports/'+id+'/'+action, {method:'POST', body: JSON.stringify({admin_note:note})}); this.toast('انجام شد'); this.viewReports(); this.refreshBadges(); }
    catch(e){ this.toast(e.message,'err'); }
  },
  openMerge(keepId, dupId, keepName, dupName){
    this.showModal(\`
      <h3 class="font-bold text-lg mb-3"><i class="fa-solid fa-code-merge text-orange-400 ml-1"></i> ادغام جاویدنام‌های تکراری</h3>
      <p class="text-sm text-gray-300 leading-7">رکوردِ <b>«\${this.esc(dupName||dupId)}»</b> حذف و کامنت‌هایش به رکوردِ مرجع <b>«\${this.esc(keepName||keepId)}»</b> منتقل می‌شود.</p>
      <div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 my-3 text-xs text-amber-300"><i class="fa-solid fa-triangle-exclamation"></i> این عمل برگشت‌ناپذیر است. مطمئن شوید کدام رکورد باید بماند.</div>
      <div class="flex flex-col gap-2">
        <label class="text-sm flex items-center gap-2"><input type="radio" name="keep" value="\${keepId}" checked> نگه‌داری: \${this.esc(keepName||keepId)}</label>
        <label class="text-sm flex items-center gap-2"><input type="radio" name="keep" value="\${dupId}"> نگه‌داری: \${this.esc(dupName||dupId)}</label>
      </div>
      <div class="flex gap-2 mt-4">
        <button data-action="do-merge" data-a="\${this.attr(keepId)}" data-b="\${this.attr(dupId)}" class="btn flex-1 py-2 bg-orange-600 hover:bg-orange-500 text-white">تأیید ادغام</button>
        <button data-action="close-modal" class="btn px-4 py-2 bg-white/5">انصراف</button>
      </div>\`);
  },
  async doMerge(idA, idB){
    const keep = document.querySelector('input[name=keep]:checked').value;
    const dup = keep === idA ? idB : idA;
    try{ await this.api('/admin/people/merge', {method:'POST', body: JSON.stringify({keep_id:keep, duplicate_id:dup})}); this.toast('ادغام شد'); this.closeModal(); this.viewReports(); this.refreshBadges(); }
    catch(e){ this.toast(e.message,'err'); }
  },

  // --- پیشنهاد عکس ---
  async viewPhotos(){
    this.loading();
    const filter = this._pf || 'pending';
    const d = await this.api('/admin/photo-suggestions?status=' + filter);
    const tabs = [['pending','در انتظار'],['approved','تأییدشده'],['rejected','ردشده'],['all','همه']];
    const filterBar = tabs.map(([k,l])=>\`<button data-action="pfilter" data-k="\${k}" class="btn px-3 py-1.5 text-sm \${filter===k?'bg-emerald-600 text-white':'bg-white/5'}">\${l}</button>\`).join('');
    const rows = (d.suggestions||[]).map(s=>\`
      <div class="card p-4 row-enter flex gap-4">
        <div class="flex-shrink-0">
          <img src="\${this.esc(s.photo_url)}" referrerpolicy="no-referrer" class="w-24 h-28 object-cover rounded-lg bg-white/5" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="w-24 h-28 rounded-lg bg-white/5 hidden items-center justify-center text-gray-600"><i class="fa-solid fa-image-slash text-2xl"></i></div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-bold mb-1">\${this.esc(s.person_name||s.person_id)} <span class="badge \${this.statusColor(s.status)}">\${this.statusFa(s.status)}</span></div>
          <a href="\${this.esc(s.photo_url)}" target="_blank" class="text-xs text-blue-400 break-all hover:underline">\${this.esc(s.photo_url)}</a>
          \${s.source_note?\`<p class="text-sm text-gray-300 mt-1">منبع: \${this.esc(s.source_note)}</p>\`:''}
          \${s.current_photo?\`<p class="text-xs text-amber-400 mt-1"><i class="fa-solid fa-triangle-exclamation"></i> این جاویدنام عکس فعلی دارد (با تأیید جایگزین می‌شود)</p>\`:''}
          <div class="text-xs text-gray-500 mt-1">\${this.esc(s.created_at)} · \${this.esc(s.suggester_name||'ناشناس')}</div>
          \${s.status==='pending'?\`<div class="flex gap-2 mt-3">
            <button data-action="photo" data-id="\${s.id}" data-act="approve" class="btn px-3 py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-600 text-white"><i class="fa-solid fa-check"></i> تأیید و اعمال</button>
            <button data-action="photo" data-id="\${s.id}" data-act="reject" class="btn px-3 py-1.5 text-sm bg-red-600/80 hover:bg-red-600 text-white"><i class="fa-solid fa-xmark"></i> رد</button>
          </div>\`:''}
        </div>
      </div>\`).join('') || '<p class="text-gray-500 text-center py-16">موردی نیست</p>';
    this.setContent(\`<div class="flex gap-2 mb-4 flex-wrap">\${filterBar}</div><div class="space-y-3">\${rows}</div>\`);
  },
  async photoAction(id, action){
    let note = '';
    if(action==='reject') note = prompt('دلیل رد (اختیاری):') || '';
    try{ const r = await this.api('/admin/photo-suggestions/'+id+'/'+action, {method:'POST', body: JSON.stringify({admin_note:note})}); this.toast(action==='approve'?'عکس اعمال شد':'رد شد'); this.viewPhotos(); this.refreshBadges(); }
    catch(e){ this.toast(e.message,'err'); }
  },

  // --- افزودن جاویدنام ---
  async viewSubmissions(){
    this.loading();
    const filter = this._sf || 'pending';
    const d = await this.api('/admin/submissions?status=' + filter);
    const tabs = [['pending','در انتظار'],['approved','تأییدشده'],['rejected','ردشده'],['all','همه']];
    const filterBar = tabs.map(([k,l])=>\`<button data-action="sfilter" data-k="\${k}" class="btn px-3 py-1.5 text-sm \${filter===k?'bg-emerald-600 text-white':'bg-white/5'}">\${l}</button>\`).join('');
    const rows = (d.submissions||[]).map(s=>\`
      <div class="card p-4 row-enter">
        <div class="flex items-center gap-2 flex-wrap mb-2">
          <span class="font-bold text-lg">\${this.esc(s.name)}</span>
          \${s.name_en?\`<span class="text-gray-400 text-sm" dir="ltr">\${this.esc(s.name_en)}</span>\`:''}
          <span class="badge \${this.statusColor(s.status)}">\${this.statusFa(s.status)}</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-300">
          \${s.age?\`<div><span class="text-gray-500">سن:</span> \${this.faNum(s.age)}</div>\`:''}
          \${s.gender?\`<div><span class="text-gray-500">جنسیت:</span> \${this.esc(s.gender)}</div>\`:''}
          \${s.event?\`<div><span class="text-gray-500">رویداد:</span> \${EVENTS_FA[s.event]||this.esc(s.event)}</div>\`:''}
          \${s.city?\`<div><span class="text-gray-500">شهر:</span> \${this.esc(s.city)}</div>\`:''}
          \${s.province?\`<div><span class="text-gray-500">استان:</span> \${this.esc(s.province)}</div>\`:''}
          \${s.date_jalali?\`<div><span class="text-gray-500">تاریخ:</span> \${this.esc(s.date_jalali)}</div>\`:''}
          \${s.occupation?\`<div><span class="text-gray-500">شغل:</span> \${this.esc(s.occupation)}</div>\`:''}
          \${s.cause?\`<div><span class="text-gray-500">علت:</span> \${this.esc(s.cause)}</div>\`:''}
        </div>
        \${s.story?\`<div class="bg-white/[.03] rounded-lg p-3 mt-2 text-sm leading-7 text-gray-200">\${this.esc(s.story)}</div>\`:''}
        \${s.photo_url?\`<div class="mt-2 flex items-center gap-2"><img src="\${this.esc(s.photo_url)}" referrerpolicy="no-referrer" class="w-16 h-20 object-cover rounded" onerror="this.style.display='none'"><a href="\${this.esc(s.photo_url)}" target="_blank" class="text-xs text-blue-400 break-all">\${this.esc(s.photo_url)}</a></div>\`:''}
        \${s.sources?\`<div class="text-xs text-gray-400 mt-2"><i class="fa-solid fa-link"></i> منابع: <span class="text-blue-400 break-all">\${this.esc(s.sources)}</span></div>\`:''}
        <div class="text-xs text-gray-500 mt-2">\${this.esc(s.created_at)} · ثبت‌کننده: \${this.esc(s.submitter_name||'ناشناس')} \${s.submitter_contact?'· '+this.esc(s.submitter_contact):''}</div>
        \${s.approved_person_id?\`<div class="text-xs text-emerald-400 mt-1"><i class="fa-solid fa-check"></i> ایجادشده: \${this.esc(s.approved_person_id)}</div>\`:''}
        \${s.admin_note?\`<div class="text-xs text-amber-400 mt-1"><i class="fa-solid fa-pen"></i> \${this.esc(s.admin_note)}</div>\`:''}
        \${s.status==='pending'?\`<div class="flex gap-2 mt-3">
          <button data-action="sub" data-id="\${s.id}" data-act="approve" class="btn px-3 py-1.5 text-sm bg-emerald-600/80 hover:bg-emerald-600 text-white"><i class="fa-solid fa-check"></i> صحت‌سنجی و افزودن</button>
          <button data-action="sub" data-id="\${s.id}" data-act="reject" class="btn px-3 py-1.5 text-sm bg-red-600/80 hover:bg-red-600 text-white"><i class="fa-solid fa-xmark"></i> رد</button>
        </div>\`:''}
      </div>\`).join('') || '<p class="text-gray-500 text-center py-16">موردی نیست</p>';
    this.setContent(\`<div class="flex gap-2 mb-4 flex-wrap">\${filterBar}</div><div class="space-y-3">\${rows}</div>\`);
  },
  async subAction(id, action){
    let note = '';
    if(action==='approve'){ if(!confirm('این جاویدنام پس از صحت‌سنجی به پایگاه‌داده افزوده شود؟')) return; }
    else { note = prompt('دلیل رد (اختیاری):') || ''; }
    try{ const r = await this.api('/admin/submissions/'+id+'/'+action, {method:'POST', body: JSON.stringify({admin_note:note})}); this.toast(action==='approve'?('افزوده شد: '+r.person_id):'رد شد'); this.viewSubmissions(); this.refreshBadges(); }
    catch(e){ this.toast(e.message,'err'); }
  },

  // --- تنظیمات ---
  async viewSettings(){
    this.loading();
    const d = await this.api('/admin/settings');
    const s = {}; (d.settings||[]).forEach(x=>s[x.key]=x.value);
    const toggle = (key,label,desc)=>\`
      <label class="flex items-center justify-between card p-4 cursor-pointer">
        <div><div class="font-semibold">\${label}</div><div class="text-xs text-gray-500 mt-0.5">\${desc}</div></div>
        <input type="checkbox" data-key="\${key}" \${s[key]==='1'?'checked':''} class="w-5 h-5 accent-emerald-500">
      </label>\`;
    this.setContent(\`
      <div class="space-y-3 max-w-2xl">
        \${toggle('comments_enabled','کامنت‌ها فعال','کاربران می‌توانند کامنت بگذارند')}
        \${toggle('reports_enabled','گزارش‌ها فعال','کاربران می‌توانند جاویدنام را گزارش دهند')}
        \${toggle('photo_sug_enabled','پیشنهاد عکس فعال','کاربران می‌توانند لینک عکس پیشنهاد دهند')}
        \${toggle('submissions_enabled','افزودن جاویدنام فعال','کاربران می‌توانند جاویدنام جدید پیشنهاد دهند')}
        <div class="card p-4">
          <div class="font-semibold mb-2">شیوهٔ نمایش کامنت</div>
          <select id="setMod" class="w-full px-3 py-2">
            <option value="post_then_review" \${s.comment_moderation==='post_then_review'?'selected':''}>آزاد — نمایش فوری، حذفِ بعدیِ بد (پیش‌فرض)</option>
            <option value="pre_approve" \${s.comment_moderation==='pre_approve'?'selected':''}>تأیید پیش از نمایش — همه ابتدا در انتظار</option>
          </select>
          <div class="text-xs text-gray-500 mt-2">آستانهٔ مخفی‌سازیِ خودکار: کامنت با این تعداد گزارش، خودکار به «در انتظار» می‌رود</div>
          <input id="setThresh" type="number" min="1" value="\${s.auto_hide_threshold||'3'}" class="w-24 px-3 py-2 mt-1">
        </div>
        <button data-action="save-settings" class="btn py-2.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white"><i class="fa-solid fa-floppy-disk ml-1"></i> ذخیره تنظیمات</button>
      </div>\`);
  },
  async saveSettings(){
    const body = {};
    document.querySelectorAll('input[data-key]').forEach(el=>{ body[el.dataset.key] = el.checked?'1':'0'; });
    body.comment_moderation = document.getElementById('setMod').value;
    body.auto_hide_threshold = document.getElementById('setThresh').value || '3';
    try{ await this.api('/admin/settings', {method:'POST', body: JSON.stringify(body)}); this.toast('تنظیمات ذخیره شد'); }
    catch(e){ this.toast(e.message,'err'); }
  },

  // --- مدیریتِ رویدادها (event delegation) — بدونِ inline onclick تا تزریقِ JS ممکن نباشد ---
  handleClick(e){
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const a = btn.dataset.action;
    const d = btn.dataset;
    switch(a){
      case 'cfilter': this._cf = d.k; this.viewComments(); break;
      case 'rfilter': this._rf = d.k; this.viewReports(); break;
      case 'pfilter': this._pf = d.k; this.viewPhotos(); break;
      case 'sfilter': this._sf = d.k; this.viewSubmissions(); break;
      case 'comment': this.commentAction(d.id, d.act, d.confirm==='1'); break;
      case 'report': this.reportAction(d.id, d.act); break;
      case 'photo': this.photoAction(d.id, d.act); break;
      case 'sub': this.subAction(d.id, d.act); break;
      case 'open-merge': this.openMerge(d.keep, d.dup, d.keepname, d.dupname); break;
      case 'do-merge': this.doMerge(d.a, d.b); break;
      case 'close-modal': this.closeModal(); break;
      case 'save-settings': this.saveSettings(); break;
    }
  },

  // --- رنگ/متنِ وضعیت ---
  statusFa(s){ return {pending:'در انتظار',approved:'تأییدشده',rejected:'ردشده',spam:'اسپم',open:'باز',resolved:'رسیدگی‌شده',dismissed:'ردشده'}[s]||s; },
  statusColor(s){ return {pending:'bg-amber-500/20 text-amber-300',approved:'bg-emerald-500/20 text-emerald-300',rejected:'bg-gray-500/20 text-gray-400',spam:'bg-red-500/20 text-red-300',open:'bg-amber-500/20 text-amber-300',resolved:'bg-emerald-500/20 text-emerald-300',dismissed:'bg-gray-500/20 text-gray-400'}[s]||'bg-white/10 text-gray-300'; },
};

// --- راه‌اندازی ---
document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const err = document.getElementById('loginErr'); err.classList.add('hidden');
  try{ await App.login(document.getElementById('lUser').value, document.getElementById('lPass').value); }
  catch(ex){ err.textContent = ex.message; err.classList.remove('hidden'); }
});
document.querySelectorAll('.tab').forEach(b=> b.addEventListener('click', ()=>App.switchTab(b.dataset.tab)));
['content','modalBody'].forEach(id=>{ const el = document.getElementById(id); if(el) el.addEventListener('click', (e)=>App.handleClick(e)); });
if(App.token){ App.enterApp().catch(()=>App.forceLogout()); }
window.App = App;
`;
