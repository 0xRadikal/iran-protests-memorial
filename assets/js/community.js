/* ════════════════════════════════════════════════════════════════
   جاویدنام‌ها — لایهٔ مشارکتِ مردمی (Community Layer)
   ----------------------------------------------------------------
   این فایل، ویجت‌های سمتِ کاربر را به صفحهٔ یادبود می‌افزاید و آن‌ها را
   به Cloudflare Worker (منطق + پایگاه‌داده) متصل می‌کند:
     • کامنت‌گذاری برای هر جاویدنام  + گزارشِ کامنتِ نامناسب
     • گزارشِ جاویدنام (تکراری / اطلاعاتِ نادرست / …)
     • پیشنهادِ عکس برای جاویدنامِ بدونِ تصویر
     • پیشنهادِ افزودنِ جاویدنامِ تازه
   GitHub Pages فقط ظاهرِ public است؛ همهٔ منطق در Worker اجرا می‌شود.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────── پیکربندی ───────────── */
  // نشانیِ Worker مستقر روی Cloudflare. در صورت تغییرِ نام، همین یک خط را عوض کنید.
  const API_BASE = 'https://javidnaman-admin.radikalradikal1.workers.dev/api';

  // اگر Turnstile فعال شد، این کلیدِ سایت را پر کنید (sitekey عمومی است، نه secret).
  // خالی بماند → ویجت‌ها بدونِ کپچا کار می‌کنند (Worter هم در نبودِ secret عبور می‌دهد).
  const TURNSTILE_SITEKEY = '';

  /* ───────────── ابزارهای کمکی ───────────── */
  const FAD = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const faNum = (n) => String(n).replace(/[0-9]/g, (d) => FAD[d]);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  function timeAgo(iso) {
    try {
      const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
      const s = Math.floor((Date.now() - d.getTime()) / 1000);
      if (s < 60) return 'لحظاتی پیش';
      if (s < 3600) return faNum(Math.floor(s / 60)) + ' دقیقه پیش';
      if (s < 86400) return faNum(Math.floor(s / 3600)) + ' ساعت پیش';
      if (s < 2592000) return faNum(Math.floor(s / 86400)) + ' روز پیش';
      return faNum(Math.floor(s / 2592000)) + ' ماه پیش';
    } catch (e) {
      return '';
    }
  }

  // درخواستِ API با مدیریتِ خطای یکدست
  async function api(path, opts) {
    opts = opts || {};
    const res = await fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let json = {};
    try {
      json = await res.json();
    } catch (e) {
      /* ignore */
    }
    if (!res.ok || !json.success) {
      const msg = (json && json.error) || 'خطا در ارتباط با سرور';
      throw new Error(msg);
    }
    return json.data;
  }

  /* ───────────── سیستمِ پیام (Toast) ───────────── */
  function toast(msg, type) {
    let t = document.getElementById('cm-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cm-toast';
      document.body.appendChild(t);
    }
    const color = type === 'error' ? '#f43f5e' : type === 'info' ? '#60a5fa' : '#34d399';
    t.innerHTML =
      '<i class="fa-solid ' +
      (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check') +
      '" style="color:' +
      color +
      '"></i><span>' +
      esc(msg) +
      '</span>';
    t.style.borderColor = color;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 4200);
  }

  /* ───────────── مودالِ عمومی (برای فرم‌ها) ───────────── */
  function openModal(title, innerHTML) {
    let m = document.getElementById('cm-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'cm-modal';
      m.className = 'cm-modal';
      m.innerHTML =
        '<div class="cm-modal-box"><button class="cm-modal-x" type="button" aria-label="بستن"><i class="fa-solid fa-xmark"></i></button>' +
        '<h3 class="cm-modal-title" id="cm-modal-title"></h3><div id="cm-modal-body"></div></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => {
        if (e.target.id === 'cm-modal' || e.target.closest('.cm-modal-x')) closeModal();
      });
    }
    document.getElementById('cm-modal-title').innerHTML = title;
    document.getElementById('cm-modal-body').innerHTML = innerHTML;
    const wasOpen = m.classList.contains('show');
    m.classList.add('show');
    // قفلِ اسکرولِ مشترک (مرجع‌شمار) تا با مودالِ شخص تداخل نکند
    if (!wasOpen) {
      if (window.JV && window.JV.lockScroll) window.JV.lockScroll();
      else document.body.style.overflow = 'hidden';
    }
    return m;
  }
  function closeModal() {
    const m = document.getElementById('cm-modal');
    if (!m || !m.classList.contains('show')) return;
    m.classList.remove('show');
    if (window.JV && window.JV.unlockScroll) window.JV.unlockScroll();
    else {
      // fallback: اگر مودالِ جزئیاتِ شخص باز است، اسکرول را آزاد نکن
      const jv = document.getElementById('jv-modal');
      if (!jv || jv.style.display === 'none') document.body.style.overflow = '';
    }
  }

  /* ───────────── Turnstile (در صورت پیکربندی) ───────────── */
  let turnstileLoaded = false;
  function loadTurnstile() {
    if (!TURNSTILE_SITEKEY || turnstileLoaded) return;
    turnstileLoaded = true;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }
  function turnstileWidget(id) {
    if (!TURNSTILE_SITEKEY) return '';
    return '<div class="cf-turnstile cm-ts" id="' + id + '" data-sitekey="' + TURNSTILE_SITEKEY + '" data-theme="dark"></div>';
  }
  function turnstileToken(scopeEl) {
    if (!TURNSTILE_SITEKEY) return '';
    const inp = scopeEl.querySelector('input[name="cf-turnstile-response"]');
    return inp ? inp.value : '';
  }
  function renderTurnstile() {
    if (TURNSTILE_SITEKEY && window.turnstile) {
      document.querySelectorAll('.cm-ts:not([data-rendered])').forEach((el) => {
        try {
          window.turnstile.render(el);
          el.setAttribute('data-rendered', '1');
        } catch (e) {}
      });
    }
  }

  /* ════════════════════════════════════════════════════════
     ۱) کامنت‌ها — نمایش + ثبت + گزارش
     ════════════════════════════════════════════════════════ */
  async function loadComments(personId) {
    const wrap = document.getElementById('cm-list');
    if (!wrap) return;
    wrap.innerHTML = '<div class="cm-loading"><i class="fa-solid fa-spinner fa-spin"></i> در حال بارگذاری یادبودها…</div>';
    try {
      const data = await api('/comments/' + encodeURIComponent(personId));
      const list = data.comments || [];
      if (!list.length) {
        wrap.innerHTML = '<div class="cm-empty">هنوز یادبودی ثبت نشده است. نخستین نفر باشید 🤍</div>';
        return;
      }
      wrap.innerHTML = list
        .map(
          (c) =>
            '<div class="cm-item">' +
            '<div class="cm-item-head"><span class="cm-author"><i class="fa-solid fa-user-pen"></i> ' +
            esc(c.author_name || 'ناشناس') +
            '</span><span class="cm-time">' +
            timeAgo(c.created_at) +
            '</span></div>' +
            '<div class="cm-body">' +
            esc(c.body) +
            '</div>' +
            '<button class="cm-report-btn" type="button" data-cid="' +
            c.id +
            '"><i class="fa-regular fa-flag"></i> گزارش</button>' +
            '</div>'
        )
        .join('');
    } catch (e) {
      wrap.innerHTML = '<div class="cm-empty cm-err">بخش یادبود موقتاً در دسترس نیست.</div>';
    }
  }

  async function submitComment(personId, formEl) {
    const author = formEl.querySelector('[name="author"]').value.trim();
    const bodyText = formEl.querySelector('[name="body"]').value.trim();
    if (bodyText.length < 2) {
      toast('متنِ یادبود کوتاه است.', 'error');
      return;
    }
    const btn = formEl.querySelector('button[type="submit"]');
    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> در حال ثبت…';
    try {
      const data = await api('/comments', {
        method: 'POST',
        body: {
          person_id: personId,
          author_name: author || 'ناشناس',
          body: bodyText,
          turnstile_token: turnstileToken(formEl),
        },
      });
      formEl.reset();
      if (data.status === 'approved') {
        toast('یادبود شما ثبت شد. سپاسگزاریم 🤍');
        loadComments(personId);
      } else {
        toast('یادبود شما ثبت شد و پس از بازبینی نمایش داده می‌شود.', 'info');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }

  function openReportComment(commentId) {
    openModal(
      '<i class="fa-regular fa-flag"></i> گزارشِ کامنت',
      '<form id="cm-rc-form" class="cm-form">' +
        '<p class="cm-hint">اگر این کامنت توهین‌آمیز، نامرتبط یا اسپم است، آن را گزارش کنید. مدیر بررسی خواهد کرد.</p>' +
        '<textarea name="reason" class="cm-input" rows="3" placeholder="دلیلِ گزارش (اختیاری)…"></textarea>' +
        turnstileWidget('ts-rc') +
        '<button type="submit" class="cm-btn cm-btn-warn"><i class="fa-solid fa-flag"></i> ارسالِ گزارش</button>' +
        '</form>'
    );
    renderTurnstile();
    const f = document.getElementById('cm-rc-form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api('/comments/' + commentId + '/report', {
          method: 'POST',
          body: { reason: f.querySelector('[name="reason"]').value.trim(), turnstile_token: turnstileToken(f) },
        });
        closeModal();
        toast('گزارشِ شما ثبت شد. سپاسگزاریم.');
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     ۲) گزارشِ جاویدنام (تکراری / نادرست / …)
     ════════════════════════════════════════════════════════ */
  function openReportPerson(person) {
    openModal(
      '<i class="fa-solid fa-triangle-exclamation"></i> گزارشِ این جاویدنام',
      '<form id="cm-rp-form" class="cm-form">' +
        '<p class="cm-hint">برای «' +
        esc(person.n) +
        '» مشکلی می‌بینید؟ به ما خبر دهید تا بررسی کنیم.</p>' +
        '<label class="cm-label">نوعِ گزارش</label>' +
        '<select name="report_type" class="cm-input">' +
        '<option value="duplicate">رکوردِ تکراری است</option>' +
        '<option value="wrong_info">اطلاعات نادرست است</option>' +
        '<option value="inappropriate">محتوای نامناسب</option>' +
        '<option value="other" selected>سایر موارد</option>' +
        '</select>' +
        '<label class="cm-label">توضیحات</label>' +
        '<textarea name="description" class="cm-input" rows="3" placeholder="توضیحِ مشکل…"></textarea>' +
        '<input name="reporter_name" class="cm-input" placeholder="نام شما (اختیاری)" maxlength="60">' +
        turnstileWidget('ts-rp') +
        '<button type="submit" class="cm-btn cm-btn-warn"><i class="fa-solid fa-paper-plane"></i> ارسالِ گزارش</button>' +
        '</form>'
    );
    renderTurnstile();
    const f = document.getElementById('cm-rp-form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api('/reports', {
          method: 'POST',
          body: {
            person_id: person.id,
            report_type: f.querySelector('[name="report_type"]').value,
            description: f.querySelector('[name="description"]').value.trim(),
            reporter_name: f.querySelector('[name="reporter_name"]').value.trim(),
            turnstile_token: turnstileToken(f),
          },
        });
        closeModal();
        toast('گزارشِ شما ثبت شد و بررسی خواهد شد. سپاسگزاریم.');
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     ۳) پیشنهادِ عکس (برای جاویدنامِ بدونِ تصویر)
     ════════════════════════════════════════════════════════ */
  function openSuggestPhoto(person) {
    openModal(
      '<i class="fa-solid fa-image"></i> پیشنهادِ عکس',
      '<form id="cm-sp-form" class="cm-form">' +
        '<p class="cm-hint">اگر تصویرِ موثقی از «' +
        esc(person.n) +
        '» سراغ دارید، نشانیِ آن را اینجا بگذارید. مدیر بررسی و در صورتِ صحت اضافه می‌کند.</p>' +
        '<label class="cm-label">نشانیِ عکس (URL)</label>' +
        '<input name="photo_url" class="cm-input" type="url" dir="ltr" placeholder="https://…" required>' +
        '<label class="cm-label">منبع / توضیح</label>' +
        '<textarea name="source_note" class="cm-input" rows="2" placeholder="منبعِ عکس یا توضیح…"></textarea>' +
        '<input name="suggester_name" class="cm-input" placeholder="نام شما (اختیاری)" maxlength="60">' +
        turnstileWidget('ts-sp') +
        '<button type="submit" class="cm-btn"><i class="fa-solid fa-paper-plane"></i> ارسالِ پیشنهاد</button>' +
        '</form>'
    );
    renderTurnstile();
    const f = document.getElementById('cm-sp-form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = f.querySelector('[name="photo_url"]').value.trim();
      if (!/^https?:\/\//i.test(url)) {
        toast('نشانیِ عکس نامعتبر است.', 'error');
        return;
      }
      const btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api('/photo-suggestions', {
          method: 'POST',
          body: {
            person_id: person.id,
            photo_url: url,
            source_note: f.querySelector('[name="source_note"]').value.trim(),
            suggester_name: f.querySelector('[name="suggester_name"]').value.trim(),
            turnstile_token: turnstileToken(f),
          },
        });
        closeModal();
        toast('پیشنهادِ عکس ثبت شد. سپاسگزاریم 🤍');
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     ۴) افزودنِ جاویدنامِ جدید
     ════════════════════════════════════════════════════════ */
  function openSubmitPerson() {
    openModal(
      '<i class="fa-solid fa-feather-pointed"></i> افزودنِ جاویدنامِ تازه',
      '<form id="cm-sub-form" class="cm-form">' +
        '<p class="cm-hint">نامِ یکی از جان‌باختگانِ راهِ آزادی را که در فهرست نیست ثبت کنید. پس از صحت‌سنجیِ مدیر افزوده می‌شود.</p>' +
        '<div class="cm-grid2">' +
        '<div><label class="cm-label">نام و نام‌خانوادگی *</label><input name="name" class="cm-input" required maxlength="100"></div>' +
        '<div><label class="cm-label">نام به انگلیسی</label><input name="name_en" class="cm-input" dir="ltr" maxlength="100"></div>' +
        '<div><label class="cm-label">سن</label><input name="age" class="cm-input" type="number" min="0" max="129"></div>' +
        '<div><label class="cm-label">جنسیت</label><select name="gender" class="cm-input"><option value="">—</option><option value="مرد">مرد</option><option value="زن">زن</option></select></div>' +
        '<div><label class="cm-label">شهر</label><input name="city" class="cm-input" maxlength="60"></div>' +
        '<div><label class="cm-label">استان</label><input name="province" class="cm-input" maxlength="60"></div>' +
        '<div><label class="cm-label">تاریخِ جان‌باختن</label><input name="date_jalali" class="cm-input" placeholder="مثلاً ۱۴۰۱/۰۷/۲۵" maxlength="30"></div>' +
        '<div><label class="cm-label">شغل</label><input name="occupation" class="cm-input" maxlength="100"></div>' +
        '</div>' +
        '<label class="cm-label">شرحِ جان‌باختن</label><input name="cause" class="cm-input" maxlength="200">' +
        '<label class="cm-label">روایت / زندگی‌نامهٔ کوتاه</label><textarea name="story" class="cm-input" rows="4" maxlength="5000"></textarea>' +
        '<label class="cm-label">نشانیِ عکس (اختیاری)</label><input name="photo_url" class="cm-input" type="url" dir="ltr" placeholder="https://…">' +
        '<label class="cm-label">منابع (لینک یا توضیح)</label><textarea name="sources" class="cm-input" rows="2" maxlength="2000" placeholder="پیوندِ خبر، شبکهٔ اجتماعی، …"></textarea>' +
        '<div class="cm-grid2">' +
        '<div><label class="cm-label">نام شما (اختیاری)</label><input name="submitter_name" class="cm-input" maxlength="60"></div>' +
        '<div><label class="cm-label">راهِ ارتباط (اختیاری)</label><input name="submitter_contact" class="cm-input" maxlength="120" dir="ltr"></div>' +
        '</div>' +
        turnstileWidget('ts-sub') +
        '<button type="submit" class="cm-btn cm-btn-lg"><i class="fa-solid fa-paper-plane"></i> ارسال برای بازبینی</button>' +
        '</form>'
    );
    renderTurnstile();
    const f = document.getElementById('cm-sub-form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = f.querySelector('[name="name"]').value.trim();
      if (name.length < 2) {
        toast('نام را وارد کنید.', 'error');
        return;
      }
      const photo = f.querySelector('[name="photo_url"]').value.trim();
      if (photo && !/^https?:\/\//i.test(photo)) {
        toast('نشانیِ عکس نامعتبر است.', 'error');
        return;
      }
      const btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      const oldHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> در حال ارسال…';
      const get = (n) => f.querySelector('[name="' + n + '"]').value.trim();
      try {
        await api('/submissions', {
          method: 'POST',
          body: {
            name: name,
            name_en: get('name_en'),
            age: get('age'),
            gender: get('gender'),
            city: get('city'),
            province: get('province'),
            date_jalali: get('date_jalali'),
            occupation: get('occupation'),
            cause: get('cause'),
            story: get('story'),
            photo_url: photo,
            sources: get('sources'),
            submitter_name: get('submitter_name'),
            submitter_contact: get('submitter_contact'),
            turnstile_token: turnstileToken(f),
          },
        });
        closeModal();
        toast('سپاسگزاریم. پیشنهادِ شما ثبت شد و پس از صحت‌سنجی افزوده می‌شود 🤍', 'info');
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     تزریقِ ویجت‌ها به مودالِ جزئیاتِ شخص
     این تابع از داخلِ openPerson صدا زده می‌شود.
     ════════════════════════════════════════════════════════ */
  function renderPersonWidgets(person) {
    const hasPhoto = !!person.ph;
    return (
      '<div class="cm-section" data-person="' +
      esc(person.id) +
      '">' +
      // نوارِ کنش‌ها
      '<div class="cm-actions">' +
      '<button type="button" class="cm-chip" data-cm="report-person"><i class="fa-solid fa-triangle-exclamation"></i> گزارشِ این صفحه</button>' +
      (!hasPhoto
        ? '<button type="button" class="cm-chip cm-chip-accent" data-cm="suggest-photo"><i class="fa-solid fa-image"></i> پیشنهادِ عکس</button>'
        : '') +
      '</div>' +
      // یادبود/کامنت
      '<div class="cm-comments">' +
      '<div class="cm-comments-title"><i class="fa-regular fa-comments"></i> یادبودها و پیام‌ها</div>' +
      '<form id="cm-form" class="cm-form cm-comment-form">' +
      '<input name="author" class="cm-input" placeholder="نام شما (اختیاری)" maxlength="60">' +
      '<textarea name="body" class="cm-input" rows="3" placeholder="پیامِ یادبودِ خود را برای ' +
      esc(person.n) +
      ' بنویسید…" required></textarea>' +
      turnstileWidget('ts-cm') +
      '<button type="submit" class="cm-btn"><i class="fa-solid fa-heart"></i> ثبتِ یادبود</button>' +
      '</form>' +
      '<div id="cm-list" class="cm-list"></div>' +
      '</div>' +
      '</div>'
    );
  }

  // پس از آنکه openPerson محتوای مودال را ساخت، این تابع را صدا بزنید.
  function wirePersonWidgets(person) {
    loadTurnstile();
    renderTurnstile();
    const sec = document.querySelector('.cm-section[data-person="' + CSS.escape(person.id) + '"]');
    if (!sec) return;

    // نوارِ کنش‌ها
    sec.querySelectorAll('[data-cm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-cm');
        if (k === 'report-person') openReportPerson(person);
        else if (k === 'suggest-photo') openSuggestPhoto(person);
      });
    });

    // فرمِ کامنت
    const cf = document.getElementById('cm-form');
    if (cf) cf.addEventListener('submit', (e) => { e.preventDefault(); submitComment(person.id, cf); });

    // دکمه‌های گزارشِ کامنت (واگذاری رویداد)
    const list = document.getElementById('cm-list');
    if (list)
      list.addEventListener('click', (e) => {
        const b = e.target.closest('.cm-report-btn');
        if (b) openReportComment(b.getAttribute('data-cid'));
      });

    // بارگذاریِ کامنت‌ها
    loadComments(person.id);
  }

  /* ───────────── بستن مودالِ فرم با Escape ───────────── */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const m = document.getElementById('cm-modal');
      if (m && m.classList.contains('show')) closeModal();
    }
  });

  /* ───────────── در دسترس قراردادن API عمومی ───────────── */
  window.Community = {
    API_BASE: API_BASE,
    renderPersonWidgets: renderPersonWidgets,
    wirePersonWidgets: wirePersonWidgets,
    openSubmitPerson: openSubmitPerson,
    toast: toast,
  };
})();
