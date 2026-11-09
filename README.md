# Pengele Engele

A small Secret Santa ("Wichteln") website with a retro pixel look. The site text is in German.

- **Password first:** visitors enter a shared site password (set by the organiser) before they can see the page or sign up.
- **Simple sign-up:** name + email. Each person gets a personal secret link.
- **Draw:** the organiser starts it in `/admin`, or sets a sign-up deadline ("Anmeldeschluss") and the site draws on its own when it passes, then emails everyone. Everyone is put in one random circle, so nobody draws themselves and no two people draw each other. The deadline is in Europe/Vienna time; set `TZ` to change it. If the server was off at the deadline, it draws right after starting.
- **Result:** each person gets an email saying whom they give a present to (if email is set up) and can reveal it on their personal page.
- **Setup page (`/admin/setup`):** set the draw time (with a live countdown on the site), email sending, the gift date and budget, and the site password.
  - **Proton Mail:** enter your address and an SMTP token (Proton → Settings → IMAP/SMTP → SMTP tokens), or use any other SMTP server. The token is stored only in the server's data file and is never shown again.
  - **`.env`:** SMTP settings in `.env` still work; settings made on the setup page take priority.
- **Retro extras:** every so often a Krampus flies by and an angel puts on a helmet, pulls a blaster and shoots it down.
  - **Santa:** flies over with funny lines, turns into Satan at random, and bombs the forest.
  - **Boss:** a big Krampus appears that the angel's sniper and the visitor can shoot by clicking or tapping.
  - **Switching off:** a footer link turns all of this off. It's off by default for people who prefer reduced motion.
  - **Trying it:** add `#krampus`, `#santa` or `#boss` to the address.
- The organiser never sees who gives to whom.

## Run

Needs Node.js 22.9 or newer. No dependencies, no `npm install`.

```bash
cp .env.example .env
```

```bash
npm start
```

Then open http://localhost:8787. On first start, the organiser password is printed **once** in the log, unless you set `ADMIN_PASSWORD` in `.env`.

In `/admin` you can:

- set the **site password** (shown as "Seiten-Passwort")
- set the date, budget and info text
- open or close sign-up
- start or reset the draw
- create a new personal link for someone
- send a test email
- delete everything after the event

## Security

- **No third-party code:** only Node's own modules. All pages are rendered on the server, and all user input is HTML-escaped.
- **Strict headers:** a strict Content-Security-Policy (no inline scripts, no external resources, no Google Fonts), plus `X-Frame-Options`, `nosniff`, `Referrer-Policy` and `noindex` on private pages.
- **Forms:** cross-site form posts are rejected (Origin / Sec-Fetch-Site), the form body is limited to 8 KB, and a honeypot field catches bots.
- **Rate limits:** on sign-up, the site password, organiser login and link requests.
- **Passwords:** site and organiser passwords are stored only as scrypt hashes. Organiser sessions use HttpOnly cookies with SameSite=Strict, and change if the password changes.
- **Personal links:** each link is 256 bits random. Only its SHA-256 hash is stored, so the data file contains no usable links.
- **Data file:** `data/engele.json` is written atomically with mode 0600. Only name, email and the draw are stored.
- **SMTP:** TLS or STARTTLS with certificate checks. Plain-text SMTP is refused unless the mail server is on localhost.

## Deploy with Dockge (behind your reverse proxy)

On every push to `main`, a GitHub Action (`.github/workflows/docker.yml`) runs the tests, builds the image and stores it privately at `ghcr.io/brab-one/engele-pengele:latest`. The image is built for amd64 and arm64, so it also runs on a Raspberry Pi.

### 1. Let the server pull the private image (once)

1. On GitHub, create a classic personal access token with only the `read:packages` scope.
2. Log in to the registry where Dockge runs:

   ```bash
   docker login ghcr.io -u brab-one
   ```

   Use the token as the password. Dockge runs `docker compose` inside its own container, so if pulling fails, log in there instead:

   ```bash
   docker exec -it <dockge-container> docker login ghcr.io -u brab-one
   ```

   Alternatively, mount the host's `~/.docker` into the Dockge container.

### 2. Create the stack in Dockge

1. Click **+ Compose** and paste [`dockge/compose.yaml`](dockge/compose.yaml).
2. In the `.env` field, set `BASE_URL` (the public `https://` address) and `ADMIN_PASSWORD`. The template is [`dockge/.env.example`](dockge/.env.example).
3. Click **Deploy**.

### 3. Point your reverse proxy at it

Forward your domain to `http://SERVER-IP:8787` (or another port set with `HOST_PORT`), with a Let's Encrypt certificate and HTTPS forced. In Nginx Proxy Manager, also tick **Block Common Exploits**. The app trusts the proxy's `X-Forwarded-For` header.

### Updating

Push to `main`, wait for the Action to finish, then click **Update** on the stack in Dockge. Data is kept in the stack's `data` volume.

## Deploy with Docker Compose

`compose.yaml` runs the site behind [Caddy](https://caddyserver.com), which gets the HTTPS certificate automatically. It's the same locked-down setup `webhost` generates:

- the app runs read-only and as an unprivileged user, with all Linux capabilities dropped
- only Caddy is reachable from outside
- data lives in a Docker volume

On the server, you need Docker with the Compose plugin, ports 80 and 443 free, and DNS for your domain (and `www.`) pointing at the server.

```bash
cp .env.example .env
```

In `.env`, set `SITE_DOMAIN` and `ADMIN_PASSWORD`. You can also set up email there, or later on the setup page.

```bash
docker compose up -d
```

Everyday commands:

| Command | What it does |
|---|---|
| `docker compose logs -f app` | Show the app's output |
| `git pull && docker compose up -d --build` | Update to the latest version |
| `docker compose down` | Stop the site; data is kept in the `app_data` volume |

## Deploy with webhost (Docker)

The easiest way is the `webhost` tool in the sibling folder:

```bash
../webhost/webhost add engele wichteln.example.at .
```

```bash
../webhost/webhost up
```

## Deploy by hand (example: Linux server with Caddy)

Caddy takes care of HTTPS automatically:

```
wichteln.example.at {
    reverse_proxy 127.0.0.1:8787
}
```

Set `BASE_URL=https://wichteln.example.at` and `TRUST_PROXY=1` in `.env`.

Example systemd unit (`/etc/systemd/system/engele-pengele.service`):

```ini
[Unit]
Description=Pengele Engele
After=network.target

[Service]
WorkingDirectory=/opt/engele-pengele
ExecStart=/usr/bin/node --env-file=.env server.js
Environment=DATA_DIR=/var/lib/engele-pengele
DynamicUser=yes
StateDirectory=engele-pengele
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
NoNewPrivileges=yes
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

A public site in Austria/Germany may need an Impressum and a privacy notice. Those aren't included because they need your real details.

## Develop

```bash
npm test
```

```bash
npm run sprites
```

`npm run sprites` rebuilds the pixel graphics in `public/img` from the ASCII art in `tools/pixelart.js`.
