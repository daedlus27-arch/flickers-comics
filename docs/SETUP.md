# Setting up staff logins

The shop's public pages are plain files on GitHub Pages. Staff logins can't live there, because anything
in a static site can be read by anyone. So logins run on a tiny free service, a **Cloudflare Worker**, that:

- keeps usernames and **hashed** passwords (nobody, including you, can read a password back),
- checks who is signed in,
- saves stock changes to GitHub for staff, using one GitHub token that only the Worker knows.

Staff never need a GitHub account, and no token is ever in the website's code.
You do this setup once. It takes about 20 minutes and costs nothing.

## 0. Turn on the new deploy

1. Push this project to the `main` branch of the repo.
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Open the **Actions** tab. The "Build and deploy" run should go green, and the site goes live as before.

## 1. Make a GitHub token for the Worker

1. GitHub → your avatar → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → `flickers-comics`.
3. **Permissions → Repository permissions → Contents: Read and write.** Nothing else.
4. Set the longest expiry you're comfortable with and copy the token. Put a reminder in your calendar to renew it.

## 2. Deploy the Worker

You need [Node.js](https://nodejs.org) and a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create USERS
```

Copy the `id` it prints into `worker/wrangler.toml` (replace `PASTE_KV_NAMESPACE_ID_HERE`). Check that
`GITHUB_REPO` and `ALLOWED_ORIGINS` there match your repo and site address, then:

```bash
npx wrangler secret put GITHUB_TOKEN     # paste the token from step 1
npx wrangler secret put SESSION_SECRET   # paste any long random string (40+ characters)
npx wrangler secret put SETUP_KEY        # make up a one-time key, e.g. three random words
npx wrangler deploy
```

Wrangler prints the Worker's address, like `https://flickers-staff-api.yourname.workers.dev`.

## 3. Point the site at it

Edit `data/config.json` and set `adminApi` to that address, then commit. When the deploy finishes,
the staff area at `/admin/` shows a sign in form instead of "Not set up yet".

## 4. Create the owner account (once)

Run this once, with your own username, a strong password and the `SETUP_KEY` from step 2.
(PowerShell shown. On Mac/Linux use `curl -X POST ... -d '{...}'`.)

```powershell
Invoke-RestMethod -Method Post -Uri https://YOUR-WORKER-ADDRESS/setup -ContentType application/json `
  -Body '{"key":"YOUR_SETUP_KEY","username":"yourname","password":"a long passphrase here"}'
```

It only works while there are no users, so it can't be used later to take over. Then sign in at `/admin/`.
After that, the **Staff** tab lets you add, remove and reset passwords for everyone else.
You can delete the `SETUP_KEY` secret afterwards (`npx wrangler secret delete SETUP_KEY`).

## Day to day

- **Publish changes** in the staff area makes one commit to `main`. The site rebuilds and goes live in a minute or two.
- If you ever change stock by hand in GitHub, edit `data/products.json` (see the README). A mistake there stops the deploy and the old site stays up.
- Passwords need 10+ characters. Changing or resetting a password signs that person out everywhere.
- Too many wrong passwords from one place locks sign-ins for 15 minutes.

## Should the repository be private?

You don't need to, and it doesn't add safety here:

- Nothing secret is in the repo. Passwords are hashed in Cloudflare and the GitHub token lives in Cloudflare.
- GitHub Pages from a **private** repo needs a paid GitHub plan, and the published website is public either way.
  Browsers must download the site's HTML, CSS and JavaScript to show it, so no setup can hide that code.

If you want it private anyway, upgrade the account and switch the repo to private. Nothing else changes.

## Trying the staff area without any of this

```bash
npm run dev:api              # fake staff service on :8787 (login owner / owner-password-1)
ADMIN_API=http://localhost:8787 npm run build
npm run serve                # site on :8080, staff area at /admin/
```

Nothing is written to GitHub or kept after you stop it.
