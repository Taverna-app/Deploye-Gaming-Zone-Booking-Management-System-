// PM2 process file. On the server, from the release folder:  pm2 start ecosystem.config.cjs
// Two processes: the API (Express + Socket.IO + reminder jobs) and the web app (static files with an index.html fallback).
module.exports = {
  apps: [
    {
      name: 'zobix-api',
      cwd: './backend',
      script: 'dist/server.js',
      // One instance only: the reminder scheduler and Socket.IO rooms live in this process.
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' }, // everything else comes from backend/.env
      max_memory_restart: '500M',
      time: true,
    },
    {
      name: 'zobix-web',
      script: 'serve', // PM2's built-in static server
      env: {
        PM2_SERVE_PATH: './frontend',
        PM2_SERVE_PORT: 5173,
        PM2_SERVE_SPA: 'true', // every page URL gets index.html, so refresh on /admin/... works
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
    },
  ],
}
