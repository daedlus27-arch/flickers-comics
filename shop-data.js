/* Flickers Comics: shop settings and stock
   ------------------------------------------------------------------
   The easy way to change stock is on the site itself: click "Staff login" at the
   bottom of the page. Saving from there rewrites this whole file, so any comments
   you add below this guide are not kept.

   You can also edit this file on GitHub. After you commit, the site updates in a
   minute or two.

   FLICKERS_CONFIG: postage (dollars), openHour / closeHour (24-hour clock),
   timeZone (for the "Open now" badge), collectDaysAhead, testMode, orderEndpoint,
   and github (the repository the stock manager saves to).

   Each item in FLICKERS_PRODUCTS:
     id         unique, no spaces (e.g. "batman-1")
     cat        issues | graphic | tpb | omnibus | manga | funko
     title      the series or figure name
     price      dollars, numbers only (750, not "$750")
     stock      copies in the shop (0 shows it as sold out)
     publisher  shown on the cover and in the details
     blurb      one or two sentences for the details panel
   Optional:
     num        issue or figure number, e.g. "#1" or "No. 01"
     vol        e.g. "Vol. 1" (trade paperbacks, manga)
     subtitle   e.g. "Boardwalk Justice" or "Omnibus Vol. 1"
     collects   e.g. "Collects #1-6"
     pages      page count
     grade      condition of single issues, e.g. "NM 9.4"
     variant    e.g. "Variant cover" or "Glow in the dark"
     tagline    short line printed on a single-issue cover
     badges     any of ["new"], ["variant"], ["exclusive"]
     staff      a staff pick note, e.g. "Read it in one sitting."
     image      a photo instead of the drawn cover, e.g. "assets/covers/batman-1.jpg"
     art        look of the drawn cover: { motif: "skyline", pal: 3 }
                motifs: skyline beam lightning waves tentacle ghost saints sunset
                        diner mountains hex atom blade bowl mecha torii
                pal: 0 to 7 (colour scheme)
*/

window.FLICKERS_CONFIG = {
  "postage": 1000,
  "openHour": 20,
  "closeHour": 22,
  "timeZone": "Europe/London",
  "collectDaysAhead": 14,
  "testMode": true,
  "orderEndpoint": "",
  "github": {
    "owner": "daedlus27-arch",
    "repo": "flickers-comics",
    "branch": "main"
  }
};

window.FLICKERS_CATEGORIES = [
  {
    "key": "all",
    "label": "Everything"
  },
  {
    "key": "issues",
    "label": "Single Issues",
    "one": "Single issue"
  },
  {
    "key": "graphic",
    "label": "Graphic Novels",
    "one": "Graphic novel"
  },
  {
    "key": "tpb",
    "label": "Trade Paperbacks",
    "one": "Trade paperback"
  },
  {
    "key": "omnibus",
    "label": "Omnibus",
    "one": "Omnibus"
  },
  {
    "key": "manga",
    "label": "Manga",
    "one": "Manga"
  },
  {
    "key": "funko",
    "label": "Funko Pops",
    "one": "Funko Pop"
  }
];

window.FLICKERS_PRODUCTS = [
  {"id":"vv-1","cat":"issues","title":"Batman","num":"#14","publisher":"DC Comics","price":750,"stock":32,"blurb":"FRACTION AND SCALERA TURN UP THE HEAT ON BAD SEEDS WITH THE COLDEST VILLAIN IN TOWN! As the night wears on and the threat of dawn looms, Batman must search for answers from the one man capable of stopping Ivy and the bloom. Elsewhere, Verity Pennyworth must defend the Manor from all manner of threats—and they're about to discover they picked the wrong house to mess with.","tagline":"INCLUDES BONUS STORY!","badges":["new"],"image":"assets/covers/vv-1-muu28owi.jpg","art":{"motif":"mecha","pal":1}}
];

window.FLICKERS_NEW_THIS_WEEK = ["vv-1"];
