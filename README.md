# Flickers Comics

Website for Flickers Comics, an independent comic shop on GTA World, live at https://flickerscomics.github.io/.
It's a static site hosted free on GitHub Pages. Every comic has its own page, and staff manage stock from a password-protected staff area.

## How it fits together

| Part | What it does |
| --- | --- |
| `data/` | The shop's content: `products.json` (stock), `featured.json` ("new this week"), `config.json` (postage, hours, categories, addresses). |
| `build/` | A small script that turns `data/` and `assets/` into the finished site in `dist/`: one page per comic, resized WebP covers, minified CSS and JavaScript, self-hosted fonts, sitemap. |
| `src/` | The site's CSS and JavaScript (`js/site.js` is the storefront, `admin/admin.js` the staff area, `shared.mjs` is used by both and by the build). |
| `tests/` | Automated checks: the build, valid HTML, the staff service, and the order pipeline. The deploy stops if any fail. |
| `worker/` | The staff service (Cloudflare Worker): logins, publishing, and the order log with Discord. See `docs/SETUP.md` and `docs/DISCORD.md`. |
| `.github/workflows/deploy.yml` | Tests, builds and publishes the site on every push to `main`. |
| `assets/` | Logo, icons and the original cover photos (`assets/covers/`). |

## Changing stock

**In the staff area** (`/admin/`): sign in with your username and password, change prices and stock,
add or edit comics, upload cover photos, then **Publish changes**. The site updates in a minute or two.

To change many comics at once, tick them (or tick **Select all**, which respects your search; hold Shift to
select a range), then use the yellow bar to set a price, raise or lower prices by a percentage or an amount,
set stock, or delete them. Nothing goes live until you publish, and **Discard** undoes everything.
If your session ends while you have unpublished changes, you are asked to sign in again and your changes are kept.

Above the list you can **Show** only low stock (1 or 2 left), sold-out comics, or comics you've changed but not yet published,
and **Sort** by title, price or stock. Select all then applies to whatever you're looking at.

**Orders** (staff area → **Orders**): every order is listed with its customer, items and notes. Open an order and mark it
**ready**, **collected** (or **posted**), **paid**, or **cancelled**; each change is recorded with who made it. Filter by
Open, Finished, Cancelled or All, and **Download as spreadsheet (CSV)** to keep your own records.
Stock isn't reduced by orders, so adjust it under **Stock** as comics sell.

**By hand:** edit `data/products.json` on GitHub. One comic per line:

```json
{"id":"batman-423","cat":"issues","title":"Batman","num":"#423","variant":"Facsimile Edition","publisher":"DC Comics","price":400,"stock":11,"blurb":"…","badges":["new"],"image":"assets/covers/batman-423.jpg"}
```

- Required: `id` (lowercase letters, numbers, dashes; becomes the page address), `cat`, `title`, `price`, `stock`, `blurb`.
- Optional: `num`, `vol`, `subtitle`, `variant`, `collects`, `pages`, `grade`, `publisher`, `tagline`, `badges` (`new`, `variant`, `exclusive`), `staff` (a staff pick note), `image`.
- `cat` is one of `issues`, `graphic`, `tpb`, `omnibus`, `manga`, `funko`.
- Without `image`, the comic gets a plain typographic cover. Add the photo to `assets/covers/` and set `image` to use it.
- `data/featured.json` lists up to three ids shown at the top of the home page.
- If something is wrong, the build stops and says what; the live site stays as it was.

Opening hours, postage and the time zone used for the "Open now" badge are in `data/config.json`.

## Orders and payment

Online ordering is on (`testMode: false` in `data/config.json`, `ORDERS_ENABLED = "true"` in `worker/wrangler.toml`).
Every order is re-priced from the real catalog by the staff service, saved for 90 days (staff area → **Orders**),
and logged to a Discord channel. Payment isn't online yet: orders are "payment pending" and the shop settles up with
the customer. Fleeca payment is a later step (`payOnline`). See `docs/DISCORD.md` to reconnect Discord or switch ordering off.

Customers can share a shelf with a link: `/?shelf=DC+Comics&sort=price-asc`. Pressing <kbd>/</kbd> jumps to the search box.

## Working on the site

Needs [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm test            # checks the build, the HTML, the staff service and orders
npm run build       # writes dist/
npm run serve       # preview at http://localhost:8080
```

To try the staff area locally without Cloudflare, see the last section of `docs/SETUP.md`.
