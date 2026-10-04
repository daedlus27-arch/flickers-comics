# Flickers Comics

Storefront for Flickers Comics, an independent comic shop on GTA World. It's plain HTML, CSS and JavaScript, hosted free on GitHub Pages.

## Changing stock, prices or hours

Everything you'd normally change is in **`shop-data.js`**:

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
| `assets/` | Logo and icons |
