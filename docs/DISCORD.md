# Logging orders to Discord

Every order is posted to a Discord channel you choose, as a message like this:

> **Order FC-7K3PQ2 · $1,400**
> New order to **collect** in store.
> Customer, phone, collection day (or postal address), the comics and quantities, totals, notes.

Orders are also saved for 90 days and listed in the staff area under **Orders**, so nothing is lost if Discord
has a bad day. The message is sent by a **webhook**: a private address that lets the shop post into one channel.
No bot needs hosting or keeping online.

Customers can't order online until you switch it on (step 4). Until then everything below can be set up and tested safely.

## 1. Make the webhook (2 minutes, in Discord)

1. Open your server, then the channel where orders should appear (make it private to staff).
2. Click the **gear** next to the channel name → **Integrations** → **Webhooks** → **New Webhook**.
3. Name it `Flickers Orders`, make sure the right channel is selected, and click **Copy Webhook URL**.

**Treat that URL like a password.** Anyone who has it can post into the channel. If it ever leaks, delete the webhook
in the same screen and make a new one.

## 2. Give it to the Worker

In PowerShell, in the `worker` folder:

```powershell
npx.cmd wrangler secret put DISCORD_WEBHOOK_URL
```

Paste the URL when it asks. The paste is hidden, and it goes straight to Cloudflare, not into the repository.

## 3. Test it

Sign in to the staff area, open **Orders**, and click **Send a test message to Discord**. A message marked **TEST**
should appear in your channel straight away. If it says it couldn't post, the webhook URL was copied wrongly or was deleted.

*Optional:* to ping your staff role on every real order, add its id to `worker/wrangler.toml`
(`DISCORD_PING_ROLE = "..."`; in Discord turn on Developer Mode, then right-click the role → Copy Role ID) and run `npx.cmd wrangler deploy`.
Test messages never ping anyone.

## 4. Switch on online ordering (when you're ready)

This makes checkout real for customers. Do both:

1. In `worker/wrangler.toml` change `ORDERS_ENABLED = "false"` to `"true"` and run `npx.cmd wrangler deploy` in the `worker` folder.
2. In `data/config.json` change `"testMode": true` to `false` and commit. The site rebuilds in a minute or two.

Then checkout says **Place order** (not "Place test order"), the shop gets every order in Discord, and the
confirmation page tells the customer "The shop has your order." To switch back, reverse both changes.

Until Fleeca is connected, orders are logged as **Payment pending**: the shop and customer sort out payment themselves.
When Fleeca is ready, set `"payOnline": true` and the checkout button changes to "Pay with Fleeca" (that part still needs
the payment link built into the Worker).

## What the Worker checks

- Prices, titles and stock come from the shop's own published data. The browser only says which comics and how many,
  so a customer can't change a price.
- Orders for sold-out, missing or over-stock comics are refused with a clear message.
- Phone, name, collection day (within the allowed window) and address are checked.
- One connection can place 5 orders every 10 minutes.
- Customer text can't ping `@everyone`, other people or roles, and Discord formatting in it is neutralised.
- The webhook URL is never sent to a browser or written to a log.

## Good to know

- **Stock isn't reduced automatically.** Orders are logged for you to fulfil. Adjust stock in the staff area as comics sell.
- **Working through orders:** in the staff area's **Orders** tab, mark an order ready, collected or posted, paid, or cancelled.
  These changes are kept in the order's history (who and when) but aren't posted to Discord; the channel stays a plain log of new orders.
- **Customer details are stored** (name, phone, address) for 90 days for the order log. Delete a Discord message by hand if you want it gone there.
- **Trying it locally without Discord:** `npm run dev:api` prints each order's Discord message in the terminal instead of sending it.
  Build the site with `ORDERS_LIVE=1 ORDER_API=http://localhost:8787/orders ADMIN_API=http://localhost:8787 npm run build`, then `npm run serve`.
