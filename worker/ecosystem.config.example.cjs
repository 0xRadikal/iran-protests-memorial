// نمونهٔ پیکربندیِ PM2 برای توسعهٔ محلیِ Worter.
// این فایل را به ecosystem.config.cjs کپی کنید و توکن را از محیط بخوانید
// (هرگز توکن را مستقیم داخلِ فایلِ نسخه‌بندی‌شده ننویسید):
//   cp ecosystem.config.example.cjs ecosystem.config.cjs
//   export CLOUDFLARE_API_TOKEN=...   export CLOUDFLARE_ACCOUNT_ID=...
//   pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'jvn-worker',
      script: 'npx',
      args: 'wrangler dev --ip 0.0.0.0 --port 3000 --local',
      cwd: __dirname,
      env: {
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || '',
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
