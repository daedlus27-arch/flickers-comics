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
  {"id":"absolute-green-lantern-19","cat":"issues","title":"Absolute Green Lantern","num":"#19","publisher":"DC Comics","price":500,"stock":6,"blurb":"Jo and her Green Lantern Corps head home from the war just as Cameron Chase gets ready to open the Manhunter File, and the series finally starts answering its biggest questions.","badges":["new"],"image":"assets/covers/absolute-green-lantern-19-muu6wx03.jpg","art":{"motif":"hex","pal":7}},
  {"id":"absolute-superman-24","cat":"issues","title":"Absolute Superman","num":"#24","publisher":"DC Comics","price":500,"stock":13,"blurb":"The hunt for Brainiac continues, and Superman recruits Steel. First, though, Steel needs a brand-new suit of armour.","badges":["new"],"image":"assets/covers/absolute-superman-24-muu6wx03.jpg","art":{"motif":"saints","pal":6}},
  {"id":"batgirl-24","cat":"issues","title":"Batgirl","num":"#24","publisher":"DC Comics","price":400,"stock":22,"blurb":"With Gotham overrun by the superbloom, Batgirl has to get a sick baby across the city to Gotham General while Tenji and Jaya defend the noodle shop. Part of Batman: Bad Seeds.","badges":["new"],"image":"assets/covers/batgirl-24-muu6wx03.jpg","art":{"motif":"beam","pal":1}},
  {"id":"the-deadman-5","cat":"issues","title":"The Deadman","num":"#5","publisher":"DC Comics","price":400,"stock":7,"blurb":"Boston Brand lands in a future where the Earth's ghosts have vanished for good. Human again, he has to survive a strange, soulless tomorrow full of twisted versions of familiar faces.","badges":["new"],"image":"assets/covers/the-deadman-5-muu6wx03.jpg","art":{"motif":"ghost","pal":0}},
  {"id":"the-demon-1","cat":"issues","title":"The Demon","num":"#1","publisher":"DC Comics","price":500,"stock":13,"blurb":"James Harren writes and draws a new take on Etrigan. Jason Blood, centuries old and split in two, tries to protect a world being fed on by beasts from Hell.","badges":["new"],"image":"assets/covers/the-demon-1-muu6wx03.jpg","art":{"motif":"hex","pal":0}},
  {"id":"dc-s-quoth-the-raven-whatever-1","cat":"issues","title":"DC's Quoth the Raven… Whatever","num":"#1","variant":"One-shot","publisher":"DC Comics","price":1000,"stock":4,"blurb":"A spooky-season anthology of strange, occult stories starring Raven, Swamp Thing, Constantine, Zatanna, Deadman and more.","badges":["new"],"image":"assets/covers/dc-s-quoth-the-raven-whatever-1-muu6wx03.jpg","art":{"motif":"blade","pal":7}},
  {"id":"jonah-hex-and-the-shadow-of-death-1","cat":"issues","title":"Jonah Hex and the Shadow of Death","num":"#1","publisher":"DC Comics","price":400,"stock":7,"blurb":"Michael Walsh brings horror to the Old West. A worn-out Jonah Hex thought his story was over, until something ancient and evil arrives in the town of Ashecott.","badges":["new"],"image":"assets/covers/jonah-hex-and-the-shadow-of-death-1-muu6wx03.jpg","art":{"motif":"blade","pal":2}},
  {"id":"jsa-24","cat":"issues","title":"JSA","num":"#24","publisher":"DC Comics","price":400,"stock":4,"blurb":"Wildcat, Dr. Midnite and Hourman are trapped behind enemy lines and have to rescue a former teammate, in the final Justice Society story of the run.","badges":["new"],"image":"assets/covers/jsa-24-muu6wx03.jpg","art":{"motif":"mecha","pal":3}},
  {"id":"superman-the-stranger-2","cat":"issues","title":"Superman: The Stranger","num":"#2","publisher":"DC Comics","price":500,"stock":21,"blurb":"Clark wants to help the people nobody sees, and finds an ally in Lois Lane, a reporter whose articles might show him where to start.","badges":["new"],"image":"assets/covers/superman-the-stranger-2-muu6wx03.jpg","art":{"motif":"waves","pal":2}},
  {"id":"the-adventures-of-superman-501","cat":"issues","title":"The Adventures of Superman","num":"#501","variant":"Facsimile Edition","publisher":"DC Comics","price":400,"stock":15,"blurb":"A reprint of the 1993 Reign of the Supermen issue, with the original ads, that introduced the Superboy clone.","badges":["new"],"image":"assets/covers/the-adventures-of-superman-501-muu6wx03.jpg","art":{"motif":"mountains","pal":1}},
  {"id":"batman-423","cat":"issues","title":"Batman","num":"#423","variant":"Facsimile Edition","publisher":"DC Comics","price":400,"stock":11,"blurb":"A reprint of the 1988 classic with Todd McFarlane's famous cover, in which three cops each tell their own story about the Dark Knight.","badges":["new"],"image":"assets/covers/batman-423-muu6wx03.jpg","art":{"motif":"atom","pal":2}},
  {"id":"swamp-thing-1","cat":"issues","title":"Swamp Thing","num":"#1","variant":"Facsimile Edition","publisher":"DC Comics","price":400,"stock":14,"blurb":"A reprint of the 1972 first issue by Len Wein and Bernie Wrightson, where Alec Holland becomes the Swamp Thing.","badges":["new"],"image":"assets/covers/swamp-thing-1-muu6wx03.jpg","art":{"motif":"skyline","pal":1}},
  {"id":"midnight-fantastic-four-1","cat":"issues","title":"Midnight Fantastic Four","num":"#1","publisher":"Marvel","price":600,"stock":13,"blurb":"A horror twist on the First Family. An obsessive scientist digs into secrets best left alone, and he and three others come back warped in terrible ways. By Benjamin Percy and Kev Walker.","badges":["new"],"image":"assets/covers/midnight-fantastic-four-1-muu6wx03.jpg","art":{"motif":"saints","pal":3}},
  {"id":"midnight-spider-man-1","cat":"issues","title":"Midnight Spider-Man","num":"#1","publisher":"Marvel","price":600,"stock":31,"blurb":"Oscorp turns a young Peter Parker into a monstrous spider hybrid in its search for eternal life. When they start making more hybrids, Peter uses his new form to stop them.","badges":["new"],"image":"assets/covers/midnight-spider-man-1-muu6wx03.jpg","art":{"motif":"saints","pal":7}},
  {"id":"midnight-x-men-1","cat":"issues","title":"Midnight X-Men","num":"#1","publisher":"Marvel","price":600,"stock":41,"blurb":"A dark new Marvel line begins. Vampires and mutants share the shadows of New York under a fragile peace, and war is close. With Jonathan Hickman.","badges":["new"],"image":"assets/covers/midnight-x-men-1-muu6wx03.jpg","art":{"motif":"ghost","pal":3}},
  {"id":"avengelyne-1","cat":"issues","title":"Avengelyne","num":"#1","publisher":"Image Comics","price":400,"stock":5,"blurb":"The avenging angel returns. A priest losing his faith meets a mysterious angel, and a wealthy demon lord sends his forces to turn her to his side.","badges":["new"],"image":"assets/covers/avengelyne-1-muu6wx03.jpg","art":{"motif":"atom","pal":1}},
  {"id":"crowbound-2","cat":"issues","title":"Crowbound","num":"#2","publisher":"Image Comics","price":400,"stock":4,"blurb":"Jeff Lemire and Dustin Nguyen's dark fantasy continues. Rose has been killed and sunk in the swamp, but something in the depths might save her, at a price.","badges":["new"],"image":"assets/covers/crowbound-2-muu6wx03.jpg","art":{"motif":"blade","pal":4}},
  {"id":"deadly-tales-of-the-gunslinger-spawn-19","cat":"issues","title":"Deadly Tales of the Gunslinger Spawn","num":"#19","publisher":"Image Comics","price":400,"stock":8,"blurb":"The Gunslinger tears across the West looking for Zyanya, and is shocked to learn who took her.","badges":["new"],"image":"assets/covers/deadly-tales-of-the-gunslinger-spawn-19-muu6wx03.jpg","art":{"motif":"tentacle","pal":2}},
  {"id":"death-vigil-3","cat":"issues","title":"Death Vigil","num":"#3","publisher":"Image Comics","price":400,"stock":12,"blurb":"Clara can't tell friend from foe, and new trouble with Mia drags up Bernadette's past. Workplace drama, centuries deep.","badges":["new"],"image":"assets/covers/death-vigil-3-muu6wx03.jpg","art":{"motif":"mountains","pal":0}},
  {"id":"exquisite-corpses-kill-shot-1","cat":"issues","title":"Exquisite Corpses: Kill Shot","num":"#1","publisher":"Image Comics","price":400,"stock":2,"blurb":"A new horror story set in the world of Exquisite Corpses from Image Comics.","badges":["new"],"art":{"motif":"ghost","pal":4}},
  {"id":"g-i-joe-a-real-american-hero-tomb-raider","cat":"issues","title":"G.I. Joe: A Real American Hero / Tomb Raider","num":"#1","publisher":"Image Comics","price":500,"stock":31,"blurb":"G.I. Joe and Lara Croft meet for the first time, on Cobra Island. A new limited series by Kyle Higgins and Elena Casagrande.","badges":["new"],"image":"assets/covers/g-i-joe-a-real-american-hero-tomb-raider-muu6wx03.jpg","art":{"motif":"mecha","pal":7}},
  {"id":"luther-strode-1-2","cat":"issues","title":"Luther Strode","num":"#1","variant":"15th Anniversary Edition","publisher":"Image Comics","price":500,"stock":22,"blurb":"Skinny, average Luther Strode finds an old book called The Method hidden in a used bookstore, and it changes him far more than he expected. The first issue, back for its 15th anniversary.","badges":["new"],"image":"assets/covers/luther-strode-1-2-muu6wx03.jpg","art":{"motif":"ghost","pal":6}},
  {"id":"luther-strode-1","cat":"issues","title":"Luther Strode","num":"#1","variant":"Anniversary Treasury Edition","publisher":"Image Comics","price":1500,"stock":3,"blurb":"The oversized treasury version of the 15th anniversary first issue, where Luther discovers The Method.","badges":["new"],"image":"assets/covers/luther-strode-1-muu6wx03.jpg","art":{"motif":"hex","pal":0}},
  {"id":"m-a-s-k-5","cat":"issues","title":"M.A.S.K.","num":"#5","publisher":"Image Comics","price":400,"stock":2,"blurb":"Matt Trakker tried to keep his son Scott safe from V.E.N.O.M. It didn't work, and now Scott is on the M.A.S.K. network.","badges":["new"],"image":"assets/covers/m-a-s-k-5-muu6wx03.jpg","art":{"motif":"atom","pal":7}},
  {"id":"of-the-earth-6","cat":"issues","title":"Of the Earth","num":"#6","publisher":"Image Comics","price":400,"stock":8,"blurb":"The finale. Abby takes on the Wildcatter creature, if she can survive its grip.","badges":["new"],"image":"assets/covers/of-the-earth-6-muu6wx03.jpg","art":{"motif":"beam","pal":6}},
  {"id":"starhenge-book-two-a-kiss-for-atticus-4","cat":"issues","title":"Starhenge, Book Two: A Kiss for Atticus","num":"#4","publisher":"Image Comics","price":400,"stock":31,"blurb":"Amber, Daryl and Merlin are back together, but escaping their strange prison means trusting a new friend from the enemy's side.","badges":["new"],"image":"assets/covers/starhenge-book-two-a-kiss-for-atticus-4-muu6wx03.jpg","art":{"motif":"saints","pal":1}},
  {"id":"tales-of-wonder-2","cat":"issues","title":"Tales of Wonder","num":"#2","publisher":"Image Comics","price":400,"stock":22,"blurb":"America's Freedom Force has come to our world. If Stu and Jake's comic book heroes are real, where are the villains?","badges":["new"],"image":"assets/covers/tales-of-wonder-2-muu6wx03.jpg","art":{"motif":"skyline","pal":0}},
  {"id":"the-walking-dead-deluxe-146","cat":"issues","title":"The Walking Dead Deluxe","num":"#146","publisher":"Image Comics","price":400,"stock":0,"blurb":"The full-colour Walking Dead reaches a breaking point.","badges":["new"],"image":"assets/covers/the-walking-dead-deluxe-146-muu6wx03.jpg","art":{"motif":"lightning","pal":7}},
  {"id":"something-is-killing-the-children-50","cat":"issues","title":"Something Is Killing the Children","num":"#50","publisher":"BOOM! Studios","price":700,"stock":0,"blurb":"Erica Slaughter returns in the milestone 50th issue. Shattered after the Tribulation saga and hunted by the Order, she runs to the Valmont Mountain Lodge.","badges":["new"],"image":"assets/covers/something-is-killing-the-children-50-muu6wx03.jpg","art":{"motif":"hex","pal":2}},
  {"id":"minor-arcana-19","cat":"issues","title":"Minor Arcana","num":"#19","publisher":"BOOM! Studios","price":500,"stock":0,"blurb":"Jeff Lemire's Ballad of Budd St. Pierre continues as Budd tries to make peace with his past, and his choices ripple down the family tree.","badges":["new"],"image":"assets/covers/minor-arcana-19-muu6wx03.jpg","art":{"motif":"mecha","pal":0}},
  {"id":"altered-states-warlords-4","cat":"issues","title":"Altered States: Warlords","num":"#4","publisher":"Dynamite","price":500,"stock":0,"blurb":"In Dynamite's what-if reality, Helium is losing its war on Barsoom until a starship brings Vampirella. Will she save the planet or doom it?","badges":["new"],"image":"assets/covers/altered-states-warlords-4-muu6wx03.jpg","art":{"motif":"tentacle","pal":6}},
  {"id":"ben-10-creator-files-1","cat":"issues","title":"Ben 10: Creator Files","num":"#1","publisher":"Dynamite","price":500,"stock":0,"blurb":"A behind-the-scenes look at the new Ben 10 series, from script to finished page, with creator interviews, unseen art and a first look at the next villain.","badges":["new"],"image":"assets/covers/ben-10-creator-files-1-muu6wx03.jpg","art":{"motif":"tentacle","pal":3}},
  {"id":"red-sonja-she-devil-with-a-sword-6","cat":"issues","title":"Red Sonja: She-Devil with a Sword","num":"#6","publisher":"Dynamite","price":500,"stock":0,"blurb":"After the battle with Rising Sun, Red Sonja takes a break to attend a wedding, where the bride turns out to be less than human.","badges":["new"],"image":"assets/covers/red-sonja-she-devil-with-a-sword-6-muu6wx03.jpg","art":{"motif":"sunset","pal":6}},
  {"id":"supernatural-dean-winchester-1","cat":"issues","title":"Supernatural: Dean Winchester","num":"#1","publisher":"Dynamite","price":500,"stock":0,"blurb":"Hurt and alone at Mardi Gras in New Orleans, Dean sets out to close a case his dad never could, even if it means killing a god. By Chuck Brown and Rapha Lobosco.","badges":["new"],"image":"assets/covers/supernatural-dean-winchester-1-muu6wx03.jpg","art":{"motif":"mountains","pal":3}},
  {"id":"supernatural-sam-winchester-1","cat":"issues","title":"Supernatural: Sam Winchester","num":"#1","publisher":"Dynamite","price":500,"stock":0,"blurb":"After doing something to Dean he can't take back, Sam is drawn to a mysterious farmhouse in the middle of nowhere. By Paulina Ganucheau and Kendall Goode.","badges":["new"],"image":"assets/covers/supernatural-sam-winchester-1-muu6wx03.jpg","art":{"motif":"hex","pal":6}},
  {"id":"dynamite-dispatches-16","cat":"issues","title":"Dynamite Dispatches","num":"#16","variant":"Preview magazine","publisher":"Dynamite","price":300,"stock":0,"blurb":"Dynamite's preview magazine, with news and first looks at upcoming series.","badges":["new"],"art":{"motif":"atom","pal":6}},
  {"id":"beneath-the-trees-where-nobody-sees-hall","cat":"issues","title":"Beneath the Trees Where Nobody Sees: Halloween Special","num":"#1","publisher":"IDW Publishing","price":800,"stock":0,"blurb":"A one-shot set years after Samantha Strong left Woodbrook. Her legend keeps growing, and not every murder blamed on her is hers. With Patrick Horvath, James Tynion IV and more.","badges":["new"],"image":"assets/covers/beneath-the-trees-where-nobody-sees-hall-muu6wx03.jpg","art":{"motif":"diner","pal":7}},
  {"id":"godzilla-kai-sei-era-13","cat":"issues","title":"Godzilla: Kai Sei Era","num":"#13","publisher":"IDW Publishing","price":500,"stock":0,"blurb":"Godzilla lives inside teenage G-Force operative Jacen Braid. As the old enemies start working together, Jacen uncovers the US government's part in his origin.","badges":["new"],"image":"assets/covers/godzilla-kai-sei-era-13-muu6wx03.jpg","art":{"motif":"sunset","pal":6}},
  {"id":"godzilla-s-monsterpiece-theatre-presents","cat":"issues","title":"Godzilla's Monsterpiece Theatre Presents: The Kaiju of Oz","num":"#1","publisher":"IDW Publishing","price":800,"stock":0,"blurb":"Godzilla goes to Oz to meet the Wizard. Ryan Browne's comedy smashes the Emerald City.","badges":["new"],"image":"assets/covers/godzilla-s-monsterpiece-theatre-presents-muu6wx03.jpg","art":{"motif":"torii","pal":6}},
  {"id":"star-trek-holo-ween-ii-1","cat":"issues","title":"Star Trek: Holo-Ween II","num":"#1","publisher":"IDW Publishing","price":500,"stock":0,"blurb":"A Halloween mystery on Deep Space 9. With a summit about to start and the senior staff away, Worf, Dax, Odo and Bashir face a blackout and a string of eerie incidents.","badges":["new"],"image":"assets/covers/star-trek-holo-ween-ii-1-muu6wx03.jpg","art":{"motif":"hex","pal":5}},
  {"id":"tmnt-journeys-14","cat":"issues","title":"TMNT: Journeys","num":"#14","publisher":"IDW Publishing","price":500,"stock":0,"blurb":"April calls Renet across space and time for help with her origins, while Raph's mutation spirals and Leo hunts a new enemy.","badges":["new"],"image":"assets/covers/tmnt-journeys-14-muu6wx03.jpg","art":{"motif":"bowl","pal":7}},
  {"id":"concrete-stars-over-sand-4","cat":"issues","title":"Concrete: Stars Over Sand","num":"#4","publisher":"Dark Horse Comics","price":500,"stock":0,"blurb":"Maureen survives a terrifying ordeal on a failing helicopter, Larry tracks Concrete into the mountains, and another killer closes in.","badges":["new"],"image":"assets/covers/concrete-stars-over-sand-4-muu6wx03.jpg","art":{"motif":"beam","pal":0}},
  {"id":"grendel-devil-s-crucible-sedition-3","cat":"issues","title":"Grendel: Devil's Crucible – Sedition","num":"#3","publisher":"Dark Horse Comics","price":500,"stock":0,"blurb":"Grendel's Hounds of Orion plan their attack as Anti-Grendel Squads close in. Matt Wagner's saga continues.","badges":["new"],"image":"assets/covers/grendel-devil-s-crucible-sedition-3-muu6wx03.jpg","art":{"motif":"atom","pal":0}},
  {"id":"groo-the-prophecy-4","cat":"issues","title":"Groo: The Prophecy","num":"#4","publisher":"Dark Horse Comics","price":500,"stock":0,"blurb":"The finale. Groo has no idea why the prophecies keep going wrong, but he's here to protect the townsfolk. By Sergio Aragonés and Mark Evanier.","badges":["new"],"art":{"motif":"mountains","pal":0}},
  {"id":"hellboy-in-hell-nothing-but-blood-1","cat":"issues","title":"Hellboy in Hell: Nothing But Blood","num":"#1","publisher":"Dark Horse Comics","price":500,"stock":0,"blurb":"Deep in Hell during an uprising, Hellboy saves a young woman from winged beasts, but nobody is what they seem. By Mike Mignola and Cyrille Pomès.","badges":["new"],"image":"assets/covers/hellboy-in-hell-nothing-but-blood-1-muu6wx03.jpg","art":{"motif":"atom","pal":2}},
  {"id":"kill-all-immortals-iii-1","cat":"issues","title":"Kill All Immortals III","num":"#1","publisher":"Dark Horse Comics","price":500,"stock":0,"blurb":"Frey Asvald broke away from her immortal Viking family. Now rival immortals want them all dead, and she has to decide what matters most.","badges":["new"],"image":"assets/covers/kill-all-immortals-iii-1-muu6wx03.jpg","art":{"motif":"diner","pal":5}},
  {"id":"kingdom-of-earth-3","cat":"issues","title":"Kingdom of Earth","num":"#3","publisher":"Dark Horse Comics","price":500,"stock":0,"blurb":"The Dark Watcher Orpheus hunts the human resistance in Chicago, Virago lives a double life, and Frankie heads into the Northern Territory alone.","badges":["new"],"image":"assets/covers/kingdom-of-earth-3-muu6wx03.jpg","art":{"motif":"mecha","pal":5}},
  {"id":"only-the-savage-are-left-4","cat":"issues","title":"Only the Savage Are Left","num":"#4","publisher":"Dark Horse Comics","price":500,"stock":0,"blurb":"Ryder fights marauders and monsters in the post-apocalypse and faces the sacrifice it may take to save his first love.","badges":["new"],"image":"assets/covers/only-the-savage-are-left-4-muu6wx03.jpg","art":{"motif":"hex","pal":4}},
  {"id":"the-ring-the-man-who-beat-the-man-4","cat":"issues","title":"The Ring: The Man Who Beat the Man","num":"#4","publisher":"Dark Horse Comics","price":500,"stock":0,"blurb":"Liam the Bulldog's next fight is a media circus, but Ivan the Bear only came to hurt him, while Ramon the Lion watches and plans his comeback. Written by Gail Simone.","badges":["new"],"image":"assets/covers/the-ring-the-man-who-beat-the-man-4-muu6wx03.jpg","art":{"motif":"atom","pal":0}},
  {"id":"the-shaolin-cowboy-staying-a-i-live-4","cat":"issues","title":"The Shaolin Cowboy: Staying A.I.live","num":"#4","variant":"Series finale","publisher":"Dark Horse Comics","price":500,"stock":0,"blurb":"The finale. Corporate villain Emil Cola has the Shaolin Cowboy blinded and seemingly helpless. Geof Darrow's chaos comes to an end.","badges":["new"],"art":{"motif":"blade","pal":5}},
  {"id":"witness-point-3","cat":"issues","title":"Witness Point","num":"#3","publisher":"Dark Horse Comics","price":500,"stock":0,"blurb":"Nathan Fillion's Midwestern murder mystery takes Sheriff Kite Calhoon and Deputy Marshal Priya Khabrani to Baraboo's shady Circus City.","badges":["new"],"image":"assets/covers/witness-point-3-muu6wx03.jpg","art":{"motif":"saints","pal":2}},
  {"id":"the-dirt-beneath-the-devil-3","cat":"issues","title":"The Dirt Beneath the Devil","num":"#3","publisher":"Mad Cave Studios","price":500,"stock":0,"blurb":"Chased across the frontier by mysterious riders, June and the other heirs turn on each other as secrets about William Buckley's legacy come out.","badges":["new"],"image":"assets/covers/the-dirt-beneath-the-devil-3-muu6wx03.jpg","art":{"motif":"skyline","pal":4}},
  {"id":"honor-and-curse-eternal-7","cat":"issues","title":"Honor and Curse: Eternal","num":"#7","publisher":"Mad Cave Studios","price":500,"stock":0,"blurb":"Genshi races across Exit City with the Tengu clinging to his soul, and a betrayal changes everything.","badges":["new"],"image":"assets/covers/honor-and-curse-eternal-7-muu6wx03.jpg","art":{"motif":"sunset","pal":2}},
  {"id":"land-of-never-4","cat":"issues","title":"Land of Never","num":"#4","publisher":"Mad Cave Studios","price":500,"stock":0,"blurb":"Two fathers close in on their lost children and learn the horrifying origins of the Floating Man.","badges":["new"],"image":"assets/covers/land-of-never-4-muu6wx03.jpg","art":{"motif":"ghost","pal":0}},
  {"id":"pop-kill-big-candy-1","cat":"issues","title":"Pop Kill: Big Candy","num":"#1","variant":"1 of 4","publisher":"Mad Cave Studios","price":500,"stock":0,"blurb":"The Cola Wars are over and the Sugar Wars begin. Dina's new sugar substitute puts her and Jon on a candy cartel's hit list.","badges":["new"],"image":"assets/covers/pop-kill-big-candy-1-muu6wx03.jpg","art":{"motif":"torii","pal":3}},
  {"id":"sabrina-the-teenage-witch-1","cat":"issues","title":"Sabrina the Teenage Witch","num":"#1","publisher":"Oni Press","price":500,"stock":0,"blurb":"A new ongoing series for comics' most famous witch-in-training, just in time for Halloween. By Corinna Bechko and Kano.","badges":["new"],"image":"assets/covers/sabrina-the-teenage-witch-1-muu6wx03.jpg","art":{"motif":"hex","pal":4}},
  {"id":"flux-house-presents-1","cat":"issues","title":"Flux House Presents","num":"#1","publisher":"Oni Press","price":1000,"stock":0,"blurb":"Matt Kindt hosts a new quarterly anthology of mind-bending stories and first appearances, introducing upcoming Flux House series.","badges":["new"],"image":"assets/covers/flux-house-presents-1-muu6wx03.jpg","art":{"motif":"bowl","pal":0}},
  {"id":"dinner-date-1","cat":"issues","title":"Dinner Date","num":"#1","publisher":"Ignition Press","price":500,"stock":0,"blurb":"Dating is hard enough. Syd was just trying to get over her ex when a date turned her into a vampire.","badges":["new"],"image":"assets/covers/dinner-date-1-muu6wx03.jpg","art":{"motif":"sunset","pal":3}},
  {"id":"minotaur-3","cat":"issues","title":"Minotaur","num":"#3","publisher":"Ignition Press","price":500,"stock":0,"blurb":"Gloria Monday's first mission ends in fire as CIA agent Koch and FBI agent Bull corner the team, and Monday's secret makes her the main target.","badges":["new"],"image":"assets/covers/minotaur-3-muu6wx03.jpg","art":{"motif":"beam","pal":5}},
  {"id":"vv-1","cat":"issues","title":"Batman","num":"#14","publisher":"DC Comics","price":500,"stock":0,"blurb":"FRACTION AND SCALERA TURN UP THE HEAT ON BAD SEEDS WITH THE COLDEST VILLAIN IN TOWN! As the night wears on and the threat of dawn looms, Batman must search for answers from the one man capable of stopping Ivy and the bloom. Elsewhere, Verity Pennyworth must defend the Manor from all manner of threats—and they're about to discover they picked the wrong house to mess with.","tagline":"INCLUDES BONUS STORY!","badges":["new"],"image":"assets/covers/vv-1-muu28owi.jpg","art":{"motif":"mecha","pal":1}}
];

window.FLICKERS_NEW_THIS_WEEK = ["vv-1","something-is-killing-the-children-50","absolute-superman-24"];
