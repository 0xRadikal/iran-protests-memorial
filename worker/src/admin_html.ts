// پنلِ ادمینِ جاویدنام — تک‌صفحه، RTL، فارسی. سرو از مسیرِ /admin
export const ADMIN_HTML = /* html */ `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>پنل مدیریت — جاویدنام</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/css/all.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet">
<style>
  :root{ --bg:#0a0e1a; --panel:#121829; --panel2:#1a2236; --line:rgba(255,255,255,.08); --acc:#10b981; --acc2:#3b82f6; }
  *{ font-family:'Vazirmatn',system-ui,sans-serif; }
  body{ background:var(--bg); color:#e6eaf2; }
  .card{ background:var(--panel); border:1px solid var(--line); border-radius:1rem; }
  .btn{ transition:.15s; border-radius:.6rem; font-weight:600; }
  .btn:active{ transform:scale(.97); }
  .tab.active{ background:var(--panel2); color:#fff; border-color:var(--acc); }
  .badge{ font-size:11px; padding:2px 8px; border-radius:999px; }
  .scroll::-webkit-scrollbar{ width:8px;height:8px } .scroll::-webkit-scrollbar-thumb{ background:#2a3550;border-radius:8px }
  input,textarea,select{ background:var(--panel2); border:1px solid var(--line); border-radius:.6rem; color:#e6eaf2; }
  input:focus,textarea:focus,select:focus{ outline:none;border-color:var(--acc2) }
  .row-enter{ animation:fade .25s ease both } @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1}}
  .pill{ width:9px;height:9px;border-radius:999px;display:inline-block }
  .spin{ animation:sp 1s linear infinite } @keyframes sp{to{transform:rotate(360deg)}}
</style>
</head>
<body class="min-h-screen">

<!-- ============ صفحهٔ ورود ============ -->
<div id="loginView" class="min-h-screen flex items-center justify-center p-4">
  <div class="card p-8 w-full max-w-sm">
    <div class="text-center mb-6">
      <div class="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
        <i class="fa-solid fa-dove text-2xl text-emerald-400"></i>
      </div>
      <h1 class="text-xl font-bold">پنل مدیریت جاویدنام</h1>
      <p class="text-sm text-gray-400 mt-1">برای ورود، اطلاعاتِ حساب را وارد کنید</p>
    </div>
    <form id="loginForm" class="space-y-3">
      <input id="lUser" type="text" placeholder="نام کاربری" class="w-full px-4 py-2.5" autocomplete="username" required>
      <input id="lPass" type="password" placeholder="رمز عبور" class="w-full px-4 py-2.5" autocomplete="current-password" required>
      <button type="submit" class="btn w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white">
        <i class="fa-solid fa-right-to-bracket ml-1"></i> ورود
      </button>
      <p id="loginErr" class="text-sm text-red-400 text-center hidden"></p>
    </form>
  </div>
</div>

<!-- ============ پنل اصلی ============ -->
<div id="appView" class="hidden">
  <header class="sticky top-0 z-30 bg-[var(--panel)]/90 backdrop-blur border-b border-[var(--line)]">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-dove text-emerald-400"></i>
        <span class="font-bold">پنل مدیریت جاویدنام</span>
      </div>
      <div class="flex items-center gap-3 text-sm">
        <span id="whoami" class="text-gray-400"></span>
        <button onclick="App.logout()" class="btn px-3 py-1.5 bg-white/5 hover:bg-white/10">
          <i class="fa-solid fa-right-from-bracket"></i> خروج
        </button>
      </div>
    </div>
    <nav class="max-w-7xl mx-auto px-4 pb-2 flex gap-2 overflow-x-auto scroll">
      <button data-tab="dashboard" class="tab active btn px-4 py-2 border border-[var(--line)] bg-white/5 whitespace-nowrap"><i class="fa-solid fa-gauge ml-1"></i> داشبورد</button>
      <button data-tab="comments" class="tab btn px-4 py-2 border border-[var(--line)] bg-white/5 whitespace-nowrap"><i class="fa-solid fa-comments ml-1"></i> کامنت‌ها <span id="b-comments" class="badge bg-amber-500/20 text-amber-300 hidden">0</span></button>
      <button data-tab="reports" class="tab btn px-4 py-2 border border-[var(--line)] bg-white/5 whitespace-nowrap"><i class="fa-solid fa-flag ml-1"></i> گزارش‌ها <span id="b-reports" class="badge bg-red-500/20 text-red-300 hidden">0</span></button>
      <button data-tab="photos" class="tab btn px-4 py-2 border border-[var(--line)] bg-white/5 whitespace-nowrap"><i class="fa-solid fa-image ml-1"></i> پیشنهاد عکس <span id="b-photos" class="badge bg-blue-500/20 text-blue-300 hidden">0</span></button>
      <button data-tab="submissions" class="tab btn px-4 py-2 border border-[var(--line)] bg-white/5 whitespace-nowrap"><i class="fa-solid fa-user-plus ml-1"></i> افزودن جاویدنام <span id="b-submissions" class="badge bg-purple-500/20 text-purple-300 hidden">0</span></button>
      <button data-tab="settings" class="tab btn px-4 py-2 border border-[var(--line)] bg-white/5 whitespace-nowrap"><i class="fa-solid fa-gear ml-1"></i> تنظیمات</button>
    </nav>
  </header>

  <main class="max-w-7xl mx-auto px-4 py-6">
    <div id="content"><div class="text-center py-20 text-gray-500"><i class="fa-solid fa-spinner spin text-2xl"></i></div></div>
  </main>
</div>

<div id="modal" class="hidden fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onclick="if(event.target===this)App.closeModal()">
  <div class="card p-6 w-full max-w-lg max-h-[85vh] overflow-auto scroll" id="modalBody"></div>
</div>

<div id="toast" class="hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl text-white text-sm shadow-lg"></div>

<script src="/admin-app.js"></script>
</body>
</html>`;
