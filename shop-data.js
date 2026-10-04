/* Flickers Comics: shop settings and stock
   ------------------------------------------------------------------
   Edit this file to change hours, postage, prices and stock.
   After you commit, GitHub Pages updates the site in a minute or two.

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

/* ===================== Shop settings: edit these ===================== */
window.FLICKERS_CONFIG = {
  postage: 1000,
  openHour: 20,              // 8PM
  closeHour: 22,             // 10PM
  timeZone: "Europe/London", // used for the "Open now" badge and the earliest collection day
  collectDaysAhead: 14,
  // Test mode: checkout doesn't take payment or ping Discord. Turn it off once the
  // bank API and the order worker are live, and fill in orderEndpoint.
  testMode: true,
  orderEndpoint: ""          // e.g. "https://flickers-orders.example.workers.dev/orders"
};

window.FLICKERS_CATEGORIES = [
  { key: "all", label: "Everything" },
  { key: "issues", label: "Single Issues", one: "Single issue" },
  { key: "graphic", label: "Graphic Novels", one: "Graphic novel" },
  { key: "tpb", label: "Trade Paperbacks", one: "Trade paperback" },
  { key: "omnibus", label: "Omnibus", one: "Omnibus" },
  { key: "manga", label: "Manga", one: "Manga" },
  { key: "funko", label: "Funko Pops", one: "Funko Pop" }
];

/* ===================== Stock: placeholder titles, swap for real stock =====================
   price is in dollars, stock is copies in the shop. Add  image: "https://..."  to use a real photo. */
window.FLICKERS_PRODUCTS = [
  { id: "vv-1", cat: "issues", title: "The Vespucci Vigilante", num: "#1", price: 750, publisher: "Vinewood Press", grade: "NM 9.4",
    blurb: "A masked lifeguard starts patrolling the pier after dark, and the crooks of Vespucci notice. The first issue of the year everyone's talking about.",
    tagline: "A new hero walks the pier", badges: ["new"], staff: "Best first issue this year.", stock: 6, art: { motif: "beam", pal: 3 } },
  { id: "ns-4", cat: "issues", title: "Night Shift: Del Perro", num: "#4", price: 600, publisher: "Del Perro Ink", grade: "NM− 9.2",
    blurb: "Two paramedics, one ambulance and a twelve-hour shift that won't end. Part four of the Del Perro arc.",
    tagline: "Twelve hours, one ambulance", stock: 8, art: { motif: "skyline", pal: 7 } },
  { id: "cs-12", cat: "issues", title: "Captain Senora", num: "#12", price: 650, publisher: "Senora Comics", grade: "NM 9.4",
    blurb: "The desert's own hero faces a storm that came out of a clear sky. The last part of the second arc.",
    tagline: "Thunder over the desert", badges: ["new"], stock: 5, art: { motif: "lightning", pal: 4 } },
  { id: "mpm-2", cat: "issues", title: "Mirror Park Mysteries", num: "#2", price: 600, publisher: "Vinewood Press", grade: "VF 8.0",
    blurb: "Three teen detectives, a missing record store owner and a lake that glows at midnight.",
    tagline: "Something is in the lake", stock: 3, art: { motif: "waves", pal: 1 } },
  { id: "asm-1v", cat: "issues", title: "Alamo Sea Monster", num: "#1", variant: "Variant cover", price: 1500, publisher: "Senora Comics", grade: "NM+ 9.6",
    blurb: "The hard-to-find 1-in-25 variant cover of the first issue. One copy in the shop.",
    tagline: "It came from the salt flats", badges: ["variant"], stock: 1, art: { motif: "tentacle", pal: 2 } },
  { id: "gpb-7", cat: "issues", title: "Ghost of Paleto Bay", num: "#7", price: 600, publisher: "Del Perro Ink", grade: "NM 9.4",
    blurb: "Fog rolls in off the bay and the old sawmill starts running again.",
    tagline: "The mill never closed", stock: 0, art: { motif: "ghost", pal: 5 } },

  { id: "concrete-saints", cat: "graphic", title: "Concrete Saints", price: 3000, publisher: "Pillbox Hill Publishing", pages: 176,
    blurb: "Three sisters run a laundromat that washes more than clothes. A standalone crime story.",
    staff: "Read it in one sitting.", stock: 4, art: { motif: "saints", pal: 6 } },
  { id: "sunset-vinewood", cat: "graphic", title: "Sunset on Vinewood", price: 2800, publisher: "Vinewood Press", pages: 144,
    blurb: "A washed-up stuntman gets one last shot at the big screen. Full colour, standalone.", stock: 5, art: { motif: "sunset", pal: 0 } },
  { id: "last-diner", cat: "graphic", title: "The Last Diner on Route 68", price: 2500, publisher: "Senora Comics", pages: 128,
    blurb: "Six strangers, a broken jukebox and one long night at the edge of the desert.", stock: 2, art: { motif: "diner", pal: 3 } },

  { id: "vv-v1", cat: "tpb", title: "The Vespucci Vigilante", vol: "Vol. 1", subtitle: "Boardwalk Justice", collects: "Collects #1–6", price: 3500, publisher: "Vinewood Press", pages: 152,
    blurb: "The complete first arc of the year's breakout series in one book.", badges: ["new"], stock: 6, art: { motif: "beam", pal: 2 } },
  { id: "cs-v2", cat: "tpb", title: "Captain Senora", vol: "Vol. 2", subtitle: "Desert Storm", collects: "Collects #7–12", price: 3200, publisher: "Senora Comics", pages: 144,
    blurb: "The storm arc, collected. Picks up straight after Vol. 1.", stock: 4, art: { motif: "mountains", pal: 4 } },
  { id: "ns-v1", cat: "tpb", title: "Night Shift", vol: "Vol. 1", subtitle: "Graveyard Hours", collects: "Collects #1–5", price: 3200, publisher: "Del Perro Ink", pages: 128,
    blurb: "The first five issues of the paramedic drama in one book.", stock: 3, art: { motif: "skyline", pal: 1 } },
  { id: "hex-v1", cat: "tpb", title: "Hex Station", vol: "Vol. 1", subtitle: "Signal Lost", collects: "Collects #1–6", price: 3000, publisher: "Pillbox Hill Publishing", pages: 160,
    blurb: "The crew of an orbital research station picks up a signal from home that shouldn't exist.", stock: 5, art: { motif: "hex", pal: 7 } },

  { id: "cs-omni", cat: "omnibus", title: "Captain Senora", subtitle: "Omnibus Vol. 1", collects: "Collects #1–36", price: 14000, publisher: "Senora Comics", pages: 1104,
    blurb: "The first 36 issues in one oversized hardcover.", staff: "Worth every dollar.", stock: 2, art: { motif: "lightning", pal: 0 } },
  { id: "gpb-omni", cat: "omnibus", title: "Ghost of Paleto Bay", subtitle: "The Complete Saga", collects: "Collects #1–30", price: 12500, publisher: "Del Perro Ink", pages: 880,
    blurb: "The whole series, start to finish, in one hardcover.", stock: 1, art: { motif: "ghost", pal: 3 } },
  { id: "atomic-omni", cat: "omnibus", title: "Atomic Age Anthology", subtitle: "Omnibus", collects: "40 short stories", price: 11000, publisher: "Pillbox Hill Publishing", pages: 960,
    blurb: "Forty short sci-fi stories drawn in the style of 1950s pulp comics.", stock: 3, art: { motif: "atom", pal: 6 } },

  { id: "ronin-1", cat: "manga", title: "Neon Ronin", vol: "Vol. 1", price: 950, publisher: "Kaiju Kitchen Press",
    blurb: "A disgraced swordsman takes night jobs in a city of neon and rain.", staff: "Start here if you're new to manga.", stock: 7, art: { motif: "blade", pal: 7 } },
  { id: "ronin-2", cat: "manga", title: "Neon Ronin", vol: "Vol. 2", price: 950, publisher: "Kaiju Kitchen Press",
    blurb: "The ronin takes a job he can't finish alone.", stock: 5, art: { motif: "blade", pal: 2 } },
  { id: "ramen-1", cat: "manga", title: "Spirit Ramen", vol: "Vol. 1", price: 900, publisher: "Kaiju Kitchen Press",
    blurb: "A ramen shop that only opens for ghosts, and the new cook who can see them.", badges: ["new"], stock: 6, art: { motif: "bowl", pal: 4 } },
  { id: "mecha-3", cat: "manga", title: "Mecha Delivery Boy", vol: "Vol. 3", price: 900, publisher: "Kaiju Kitchen Press",
    blurb: "Deliveries get dangerous when a rival courier builds a bigger robot.", stock: 4, art: { motif: "mecha", pal: 1 } },
  { id: "shrine-1", cat: "manga", title: "Moonlit Shrine Club", vol: "Vol. 1", price: 900, publisher: "Kaiju Kitchen Press",
    blurb: "Four students, one abandoned shrine and the spirits who still live there.", stock: 2, art: { motif: "torii", pal: 3 } },

  { id: "pop-vv", cat: "funko", title: "The Vespucci Vigilante", num: "No. 01", price: 2000,
    blurb: "The pier's masked hero as a boxed vinyl figure, about 4 inches tall.", stock: 4, art: { motif: "beam", pal: 3 } },
  { id: "pop-cs-glow", cat: "funko", title: "Captain Senora", num: "No. 02", variant: "Glow in the dark", price: 3500,
    blurb: "Shop exclusive with a glow-in-the-dark finish. Boxed.", badges: ["exclusive"], stock: 2, art: { motif: "lightning", pal: 7 } },
  { id: "pop-asm", cat: "funko", title: "Alamo Sea Monster", num: "No. 03", price: 2200,
    blurb: "The monster from the salt flats as a boxed vinyl figure.", stock: 5, art: { motif: "tentacle", pal: 1 } },
  { id: "pop-ronin", cat: "funko", title: "Neon Ronin", num: "No. 04", price: 2000,
    blurb: "Boxed vinyl figure with a removable sword.", stock: 0, art: { motif: "blade", pal: 2 } }
];

window.FLICKERS_NEW_THIS_WEEK = ["vv-1", "ramen-1", "cs-12"];
