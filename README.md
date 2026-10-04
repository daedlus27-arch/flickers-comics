# Flickers Comics

Storefront for Flickers Comics, an independent comic shop on GTA World. It's plain HTML, CSS and JavaScript, hosted free on GitHub Pages.

## Stock manager (staff login)

Click **Staff login** at the bottom of the site to add, edit or delete stock, change prices and stock counts, write descriptions and upload cover photos.

1. Sign in with a GitHub access token. The login box links to GitHub with the right settings filled in (the `public_repo` box ticked). Choose an expiry, generate the token and paste it in.
2. Make your changes. They show on the page straight away as a preview, but customers don't see them yet.
3. Click **Publish changes**. Everything is saved to this repo in one commit, and the live site updates within a couple of minutes.

To give a member of staff access, add their GitHub account under **Settings → Collaborators** on this repo. They then make their own token the same way.

Tick "Keep me signed in" only on your own computer. If a token leaks, delete it at github.com/settings/tokens.

## Changing stock by hand

You can still edit **`shop-data.js`** directly on GitHub:

- `FLICKERS_PRODUCTS` has one entry per item: title, price, stock and so on. The top of the file explains every field.
- `FLICKERS_NEW_THIS_WEEK` lists the three covers shown at the top of the page.
- `FLICKERS_CONFIG` holds postage, opening hours and the time zone used for the "Open now" badge.

To edit on GitHub, open `shop-data.js`, click the pencil icon, make your change and click **Commit changes**. The live site updates within a minute or two.

To use a real photo instead of a drawn cover, upload it to `assets/covers/` and add `image: "assets/covers/your-file.jpg"` to that item.

## Test mode

Checkout runs in test mode (`testMode: true` in `shop-data.js`). Test orders aren't charged and nobody is notified. Once the business is approved for the GTA World banking API, a small order service gets added to take Fleeca payments and post each order to Discord. Test mode is switched off after that.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page layout |
| `styles.css` | Look and feel |
| `shop-data.js` | Stock, prices, hours, postage |
| `app.js` | Cart, checkout and cover drawing |
| `admin.js` | Staff login and stock manager |
| `assets/` | Logo, icons and uploaded cover photos |
