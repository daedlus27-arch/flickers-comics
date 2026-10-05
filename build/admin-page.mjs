/* The staff manager page (admin/index.html). The app itself is src/admin/admin.js. */
import { page } from "./templates.mjs";

export function adminPage({ cfg, fontCss }) {
  const opts = { fontCss };
  const api = cfg.adminApi ? cfg.adminApi.replace(/\/+$/, "") : "";
  const apiOrigin = api ? ` ${new URL(api).origin}` : "";
  const body = `<header class="site-header">
  <div class="wrap header-in">
    <a class="logo-link" href="../"><img class="logo" src="../assets/flickers-logo.png" alt="Flickers Comics" width="640" height="104"></a>
    <div class="header-actions"><span class="adm-title">Staff area</span><a class="nav-link" href="../">Back to the shop</a></div>
  </div>
</header>
<main class="adm" id="app" data-api="${api}">
  <noscript><p class="wrap adm-note">The staff area needs JavaScript.</p></noscript>
</main>`;
  return page({
    title: "Staff area | Flickers Comics", desc: "Flickers Comics staff area.", root: "../", noindex: true, cfg,
    css: ["css/styles.css", "css/admin.css"], fontCss: opts.fontCss, script: "admin/admin.js", body,
    csp: `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'${apiOrigin}; base-uri 'self'; form-action 'none'`,
    fontPreload: ["fonts/anton-latin-400-normal.woff2", "fonts/archivo-latin-wght-normal.woff2"]
  }).replace(/<body data-root="\.\.\/"/, '<body data-root="../" class="adm-body"');
}
