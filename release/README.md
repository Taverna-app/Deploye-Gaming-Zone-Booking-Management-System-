# Deploying with PM2 (VPS)

## 1. Build (on your computer)

Create `frontend/.env.production` with the **public** API address (it is baked into the web app):

```
VITE_API_URL=https://api.example.com/api
VITE_SOCKET_URL=https://api.example.com
# Only for a demo site: shows demo sign-ins under the login form
# VITE_SHOW_DEMO_ACCOUNTS=true
```

Then, from the repository root:

```
npm run deploy:build
```

This builds both apps and creates `deploy/release/`:

```
release/
  backend/            API (dist/, package.json, .env.example)
  frontend/           built web app (static files)
  ecosystem.config.cjs
  BUILD_INFO.txt      when it was built and for which API address
```

## 2. Server (first time)

Needs Node 20+ and PM2 (`npm i -g pm2`). Copy `release/` to the server (for example to `/var/www/zobix`), then:

```
cd /var/www/zobix/backend
npm ci --omit=dev
cp .env.example .env      # fill it in: see below
cd ..
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup               # run the command it prints, so PM2 starts again after a reboot
```

Required in `backend/.env`: `NODE_ENV=production`, `PORT=4000`, `FRONTEND_URL=https://your-site.com` (must be https, no trailing slash), `MONGODB_URI`, `JWT_SECRET` (long random), SMTP settings. The API refuses to start if something required is missing or unsafe; `pm2 logs zobix-api` says what.

Processes: `zobix-api` on port 4000, `zobix-web` on port 5173.

## 3. HTTPS with nginx

Put nginx (with a Let's Encrypt certificate, e.g. `certbot --nginx`) in front of both:

```nginx
server {                              # web app
  server_name your-site.com;
  location / { proxy_pass http://127.0.0.1:5173; }
}
server {                              # API + Socket.IO
  server_name api.example.com;
  client_max_body_size 10m;
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 4. Updating

Build again, upload the new `backend/dist`, `frontend/` and (if dependencies changed) `backend/package*.json`. **Keep `backend/.env` and `backend/uploads/`** (payment proofs with `STORAGE_DRIVER=local`). Then:

```
cd backend && npm ci --omit=dev && cd ..
pm2 reload ecosystem.config.cjs
```

Useful: `pm2 status`, `pm2 logs`, `pm2 restart zobix-api`.
