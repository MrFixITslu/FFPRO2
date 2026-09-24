> **Production upgrade:** Read [the remediation and deployment guide](docs/PRODUCTION-READINESS.md) before deploying this branch. The production entry point is `build/server.cjs`; preserve the existing encryption key and database.

# Fire Finance Pro - Production Deployment Guide

Fire Finance Pro is a strategic personal finance hub featuring secure data synchronization, wealth forecasts, budget assistance, transaction trackers, and dynamic AI-powered insights.

This repository is fully configured for deployment on any server (including multi-tenant environments with existing Nginx/OpenResty proxies) using Docker and Docker Compose.

---

## 🚀 Quick Start Git Checklist

Before pushing this repository to GitHub or GitLab:
1. **Ensure `.gitignore` is active**: The `.gitignore` file is pre-configured to prevent pushing sensitive credentials, actual database files, and encryption keys (`.env*`, `database.json`, `encryption.key`, `data/`).
2. **Setup your `.env`**: Copy `.env.example` to `.env` on your server and fill in your secrets.
3. **Use the Docker setup**: Build and run the app cleanly in a sandboxed Docker container.

---

## 🛠️ Local & Server Installation

### 1. Configure the Environment
Copy the example environment template to create a secure, server-specific configuration:
```bash
cp .env.example .env
```

Open the newly created `.env` file and configure the settings:
*   **`APP_PORT`**: Change this to an unused port (e.g., `3010`) if port `3000` is already in use by another application.
*   **`FRONTEND_URL`**: Set this to your public IP or domain name (e.g., `http://199.223.249.193` or `https://ffpro.v79sl.com`).
*   **`SESSION_SECRET`**: Run `openssl rand -base64 32` to generate a secure random secret key.
*   **`DATA_ENCRYPTION_KEY`**: Run `openssl rand -base64 32` to generate your 256-bit database encryption key.
*   **`GEMINI_API_KEY`**: Insert your Google Gemini API Key to enable live budget advice, portfolio analysis, and predictions.
*   **OAuth (Google & Facebook)**: Input your developer client IDs and secrets. Make sure your developer portals have the matching callback URLs matching your IP/Domain.

---

## 🐳 Docker Deployment (Recommended)

The app is fully dockerized for instant deployments. It uses a multi-stage `Dockerfile` to minimize size and optimize start speeds.

### Start the Application
Ensure `proxy_network` exists (`docker network inspect proxy_network`); create it with `docker network create proxy_network` only on a new host. Set `POSTGRES_PASSWORD`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY` and `FRONTEND_URL` in `.env`. Existing installations must retain their actual password and key. Configure SMTP for verification and account recovery, and provider credentials for optional integrations.

To build and start the container in the background:
```bash
docker compose up -d --build
```

### Stop the Application
To stop the running container:
```bash
docker compose down
```

### Check Logs
To view live logs from the application:
```bash
docker compose logs -f
```

---

## 🌐 Nginx / OpenResty Configuration

If you have multiple apps running on a single server, you can proxy incoming traffic from your public IP (`http://199.223.249.193/` or a domain name) to the application container via Nginx or OpenResty.

Add the following block to your Nginx/OpenResty server block (e.g., in `/etc/nginx/sites-available/` or `/etc/openresty/` config):

```nginx
server {
    listen 80;
    server_name 199.223.249.193; # Or your domain name

    location / {
        proxy_pass http://127.0.0.1:3010; # Match the APP_PORT set in your .env file
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Security headers
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Reload Nginx/OpenResty to apply:
```bash
sudo systemctl reload nginx
# or
sudo systemctl reload openresty
```

---

## 💾 Backups & Persistence

Production records and sessions are stored in PostgreSQL, in the persistent `ffpro2_pgdata` volume. The `./data` directory holds the encryption key and any file-backed artifacts; `database.json` is only a development fallback.

Back up PostgreSQL with `pg_dump`, the `./data` directory, and your deployment `.env`. Keep the encryption key with protected backups: the database alone cannot restore encrypted records. Test restoration into an isolated database. Never run `docker compose down -v` on a live installation.

## Automatic server deployment

After a validated merge to `main`, the delivery workflow deploys the `fire-finance` service through Tailscale and pinned SSH. Publication to GHCR alone never changes the server. In GitHub **Settings → Environments → production**, configure the secrets `TAILSCALE_AUTHKEY`, `DEPLOY_HOST` (the server's Tailscale address), `DEPLOY_USER`, `DEPLOY_SSH_KEY` (private deploy key), and `DEPLOY_KNOWN_HOSTS` (independently verified host key). Restrict who can change the production environment. Configure environment variables `DEPLOY_ROOT` (absolute existing server directory containing this app's Compose file and `.env`), `DEPLOY_PROJECT` (the current Compose project shown by `docker inspect`), and optional `DEPLOY_SSH_PORT` (default 22).

The deploy user needs Docker and `rsync` access and the server must already have `proxy_network`. Before enabling the workflow, back up the application's existing data, encryption keys, uploads, databases and `.env` and verify a restore. The script preserves `.env`, `data`, `uploads`, backups and existing `.git`; it updates the app in place, starts only `fire-finance` and checks its HTTP readiness inside the container. It does not remove orphan containers or volumes. Source removed from Git may remain in the server directory because deployment intentionally does not delete unknown local files. A first merge will fail closed if a required secret, mount, project, or server directory is absent. Review Actions → deploy and record the `.deployed_sha` in the server directory after each successful release.
