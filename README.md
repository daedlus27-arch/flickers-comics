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
add or edit comics, then **Publish changes**. The site updates in a minute or two.

**Covers:** no need to save a picture to your computer first. In a comic's editor, drag a picture onto the cover, or copy one
(right-click it in the browser, **Copy image**) and press <kbd>Ctrl</kbd> + <kbd>V</kbd> (or click **Paste image**). You can also drop a picture
straight onto a comic's row in the stock list to replace its cover. Pictures are resized to 600px wide in your browser before they're saved,
and a cover nothing uses any more is removed when you publish.

To change many comics at once, tick them (or tick **Select all**, which respects your search; hold Shift to
select a range), then use the yellow bar to set a price, raise or lower prices by a percentage or an amount,
set stock, or delete them. Nothing goes live until you publish, and **Discard** undoes everything.
If your session ends while you have unpublished changes, you are asked to sign in again and your changes are kept.

Above the list you can **Show** only low stock (1 or 2 left), sold-out comics, or comics you've changed but not yet published,
and **Sort** by title, price or stock. Select all then applies to whatever you're looking at.

**Orders** (staff area → **Orders**): every order is listed with its customer, items and notes. Open an order and mark it
**ready**, **collected** (or **posted**), **paid**, or **cancelled**; each change is recorded with who made it and the order's
Discord post is updated to match. Finished orders move to the **Archive** and are deleted 14 days later.
**Download as spreadsheet (CSV)** keeps your own records.

Orders **take comics off the shelf automatically** (and cancelling puts them back), so stock stays right without anyone editing it.
Publishing from an out-of-date screen is safe: your edits are merged with what orders have changed since.
If the stock can't be updated (for example the GitHub token has expired) the order is still taken but flagged **Adjust stock**.

Customers can use **Track order** in the menu with their order number and phone number to see where their order is.

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
Every order is re-priced from the real catalog by the staff service, saved (staff area → **Orders**), and logged to a
Discord channel. Payment isn't online yet: orders are "payment pending" and the shop settles up with
the customer. Fleeca payment is a later step (`payOnline`). See `docs/DISCORD.md` to reconnect Discord or switch ordering off.

**Shareable carts:** the cart has a "Copy a link to this cart" button. Opening such a link (`/?cart=batman-14:2,flash-3:1`, comic id
and quantity) adds those comics to the visitor's own cart, skipping anything sold out. Handy for setting a stack aside for a customer
over the phone: build the cart, copy the link, send it.

**Smart search and filters:** search understands partial words and issue numbers ("bat 14" finds Batman #14), ignores case and
punctuation, and forgives typos when nothing matches exactly. Chips narrow the shelves to In stock, Hide variants, Last copies
(1 or 2 left) and a price limit; they're saved in the address so a filtered shelf can be shared.

**Saved for later:** every comic has a heart. Saved comics live in the visitor's browser (nothing is sent to the shop), show up under
**Saved** in the header, can be added to the cart in one go, shared with a link, and are flagged **Back in stock** if they sold out
after being saved.

**The wanted list** (staff area → **Wanted**): customers can leave a name and phone number to
- be told when a **sold-out comic is back** (*Notify me*),
- **follow a series** so staff know to set aside each new issue (a pull list), or
- **request a comic** the shop doesn't stock.

New requests post to the orders Discord channel. When you restock a sold-out comic (or a cancelled order frees one), or add a new
issue of a followed series, Discord lists exactly who to contact and the Wanted tab flags them "Ready to contact". Mark them contacted
or remove them there. Nobody is texted automatically; staff make the call. Requests are deleted after 120 days.

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
