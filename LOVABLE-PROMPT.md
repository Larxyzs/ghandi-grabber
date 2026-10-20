# Prompt for Lovable — new shop look + "Import products from a JSON file"

Copy everything inside the box below and paste it into Lovable's chat.

````
This prompt has TWO parts. Do PART 1 (the new look of my shop), then PART 2 (the product importer). Both must work together: products added with the importer must appear in the new shop sections and on the new product page.

==================================================================
PART 1 — MAKE MY SHOP LOOK AND WORK LIKE A BIG MOROCCAN APPLIANCE STORE
==================================================================
Goal: my site ghandihomeelectro.com should feel like the big Moroccan electronics stores (the kind of layout electroplanet.ma uses): a real catalogue with a big search bar, a category menu, clean product cards, filters, and a strong product page. IMPORTANT: copy the LAYOUT and the way it works, NOT their logo, name, colors, texts or pictures. Everything keeps MY brand "Ghandi Home Electro", my logo, my phone, my address (41 Boulevard Ghandi, Casablanca). The site stays in French.
Do NOT add any warranty promises ("garantie") anywhere, and do NOT add promotions (no "Promotions" menu, no promo banners, no old/crossed prices, no "-15%" badges, no "meilleures offres").

IMPORTANT — DO NOT ADD ANY PRODUCTS
We are building the structure of the site and testing. Do NOT add demo, sample or fake products anywhere (not on the home page, not in categories, not in "Modèles en vedette"). "Modèles en vedette" is empty on purpose: I choose those products myself from the admin. Products will only come from me (admin page or the importer of PART 2).

Fix these
- Spelling: "Gros éléctromenager" → "Gros électroménager".
- No search, no category pages for TV / froid / lavage / climatisation even though the tagline lists them.
- The brand logos block appears twice. Keep it once.
- The WhatsApp link uses 212661194525 but the phone shown is +212 611 945 25…: use ONE number everywhere, stored in one settings place (ask me which one is right).

1) Top bar (thin strip, very top, on every page)
   Short lines: "Livraison à Casablanca et partout au Maroc" · "Paiement à la livraison" · phone number (click to call) · "WhatsApp".
2) Header (sticky when scrolling)
   Left: my logo. Center: a BIG search bar "Rechercher un produit, une marque, une référence…" with instant suggestions as I type (product picture + name + price or "Prix sur demande", and matching categories/brands). The search must also find model references with or without spaces ("WBMF 606374" and "wbmf606374" both work). Right: "WhatsApp" button, "Favoris" (heart, saved in the browser), "Panier" with a counter.
3) Main menu = my categories, with a mega-menu (big drop-down with sub-categories):
   - TV & Son: Téléviseurs, Barres de son
   - Froid: Réfrigérateurs, Réfrigérateurs combinés, Side by side / Américains, Congélateurs
   - Lavage: Lave-linge, Lave-linge séchants, Sèche-linge, Lave-vaisselle
   - Cuisson: Cuisinières, Fours, Plaques de cuisson, Hottes, Micro-ondes
   - Climatisation: Climatiseurs
   - Petit électroménager
   - Marques: Whirlpool, LG, Samsung, Bosch, Candy, Haier, TCL
   Create these categories (with parent → child) in the database if they do not exist. Keep any category I already have. On phones: a burger menu that slides in from the left with the same tree.
4) Home page, in this order
   a. Hero slider (3 slides, auto-play, arrows + dots) with banners I can change from the admin (picture, title, button text, link) — for example my shop, a brand, a category. No promotions.
   b. A strip of category tiles with a picture each (TV, Réfrigérateurs, Lave-linge, Climatiseurs, Cuisson, Petit électroménager).
   c. Product carousels with "Voir tout" links: "Modèles en vedette" (ONLY the products I pick in the admin, never filled automatically), "Nouveautés" (latest added), and one carousel per main category (Froid, Lavage, TV). On the public site, hide a carousel while it has no products; in the admin, show a hint "Choisissez des modèles en vedette" with a link to the admin page.
   d. "Nos marques": brand logos in one row; each logo opens that brand's page.
   e. Strip with icons: Livraison rapide · Paiement à la livraison · Conseil par téléphone / WhatsApp · Magasin à Casablanca.
   f. Store block: address, opening hours (editable), a Google Map, "Appeler" and "WhatsApp" buttons.
5) Product card (same everywhere)
   Picture (white background, the whole appliance visible, never cropped), brand name small above, product name (2 lines max), model reference in grey, price big and bold in DH ("4 999 DH"). When there is NO price (most of my products), show "Prix sur demande" and a "Demander le prix" WhatsApp button (message pre-filled with the product name and reference). Buttons: "Ajouter au panier" and a small heart. Hover on computer: second picture + slight lift. Small "Nouveau" badge for products added in the last 30 days.
6) Category page (and brand page, search results)
   Breadcrumb ("Accueil > Froid > Réfrigérateurs combinés"), title with number of products, sort (Pertinence, Prix croissant, Prix décroissant, Nouveautés), grid 4 columns on computer / 2 on phone, "Voir plus" or pages at the bottom.
   Filters on the left (a "Filtrer" button that opens a panel on phones): Marque (with counts), Prix (slider, only if products have prices), and smart filters built from the specs I import, for example "Classe d’efficacité énergétique", "Couleur", "Type de système de refroidissement", "Position du congélateur", "Total Net Volume", "Largeur", "Taille d'écran". Only show a filter when at least 2 products in the page have that spec. Treat labels the same even if the apostrophe differs (’ and ').
7) Product page
   Breadcrumb. Left: big picture gallery with thumbnails (up to 15 pictures), zoom on hover, swipe on phones, full-screen view. Right: brand, name, reference (model), price block (same rules as the card), quantity, "Ajouter au panier", "Commander sur WhatsApp" (message pre-filled with product name, reference and link), "Appeler", and small lines: livraison, paiement à la livraison.
   Under it, a short "Points clés" box: the first 6 rows of the first spec section (for example Hauteur, Largeur, Classe d’efficacité énergétique, Couleur).
   Then tabs "Caractéristiques" and "Livraison":
   - "Caractéristiques" shows EVERY spec section from the import, with its title, in the same order as in the file, as clean 2-column tables (label | value). My products have 7 to 10 sections and 30 to 40 rows (see PART 2). On phones each section is a box that opens/closes (first 2 open). A row can appear in two sections (for example "Couleur" in "Caractéristiques principales" and in "Conception"): show it in both, as in the file.
   Then "Produits similaires" (same category) and "Vous avez vu récemment" (saved in the browser).
8) Cart and order (simple, no online card payment)
   Cart drawer that slides from the right + a cart page. Checkout form: name, phone, city, address, note. "Valider la commande" saves the order in Supabase (orders + order_items) AND opens WhatsApp with the order summary to my number. Payment = "Paiement à la livraison". Products without a price can be added: the cart then says "Prix confirmé par téléphone". Show a thank-you page with the order number. Add a "Commandes" page in my admin to see orders and change their status (Nouvelle, Confirmée, Livrée, Annulée).
9) Footer
   Columns: "Ghandi Home Electro" (short text, address, phone, WhatsApp, hours), "Nos rayons" (main categories), "Marques", "Aide" (Livraison, Contact, Mentions légales), social links. Bottom line "© <year> Ghandi Home Electro".
10) Look and feel
   Clean white background, my brand color for buttons and links (use the main color of my current logo; if there is none, use a deep blue), rounded corners on cards (8px), soft shadows, a modern sans-serif font (Inter or Poppins). Mobile first: everything must work perfectly on phones (most of my clients use phones). Fast: lazy-load pictures, use small thumbnails in grids.
11) Admin
   From my admin I must be able to: edit the slider banners, mark products as "en vedette", edit prices quickly (a list of products with an editable price column, so I can type prices one after the other), edit categories (name, parent, picture, order), and edit opening hours and contact numbers.
12) SEO basics: a clear title and description for every category and product page (e.g. "Réfrigérateur combiné Whirlpool WBMF 606374 XNA – Ghandi Home Electro Casablanca"), product pages readable by Google (structured product data), a sitemap.

Do not lose any existing data. If you must change a table, use a migration and tell me.

==================================================================
PART 2 — THE PRODUCT IMPORTER (JSON FILE FROM MY CHROME EXTENSION)
==================================================================
Prepare for later: soon my Chrome extension will send products DIRECTLY to my site (no file). So put all the import logic (checking a product, finding duplicates, choosing the section, copying pictures, saving) in ONE reusable server function that takes the product list in the format below. The import page calls it today; later a protected endpoint for my extension will call the same function. Do not build the endpoint yet.
The section picker of the importer (step 2 below) must search the categories from PART 1 (including the parent → child tree), so I can put a whole file into, for example, "Froid > Réfrigérateurs combinés" in one click. Imported products must use the PART 1 product card and product page.

Build an "Import products" page in my admin area. It takes the JSON file made by my product-grabber Chrome extension and adds all the products to my store in one go, into the section (category) I choose.

STEP 0 — LOOK BEFORE YOU BUILD
Open my current admin "add product" page and my Supabase tables first. Use MY real products table, MY categories/sections table, and the way I already save product pictures. Do not create a second product system. If a column is missing (see "WHERE EACH FIELD GOES"), add it with a migration and tell me exactly what you added. Never delete or rename anything that exists.

WHERE
- New page /admin/import, with a link "Import products" in my admin menu.
- Same admin protection as my other admin pages. Only admins can open it and run it.

STEP 1 — GIVE THE FILE (3 ways, all on the same screen)
a) A big drop zone: "Drop your .json file here". Highlight it while a file is dragged over it.
b) A button "Choose a file" that opens the computer's file picker (accept .json only).
c) A tab or button "Paste the text instead" that shows a large text box where I paste the JSON, with a "Read it" button.
After any of the 3, read the file in the browser (no upload yet), check it, and show: "✓ File read: 42 products (Whirlpool 12, LG 30)". If it is not valid, say in simple words what is wrong ("This is not a product file", "The text is cut at the end — copy it again") and keep the box so I can try again.
Several files: allow dropping or choosing more than one file; merge them into one list (no duplicates by sourceUrl).

THE FILE FORMAT (schema "ghandi-products/v1") — this is ONE REAL product from one of my files, complete. Real files look exactly like this, with many products:
{
  "schema": "ghandi-products/v1",
  "generatedAt": "2026-10-10T14:53:27.846Z",
  "generator": "Ghandi Product Grabber 3.1",
  "count": 9,
  "products": [
    {
      "sourceUrl": "https://www.whirlpool.ma/ma-fr/produits/refrigerateurs-congelateurs/refrigerateur-congelateur-double-door-freezer-bottom-59-5-cm-wbmf-606374-xna",
      "brand": "Whirlpool",
      "category": "Réfrigérateur combiné",
      "sourceCategory": "Réfrigérateur combiné",
      "name": "WBMF 606374 XNA: Réfrigérateur-congélateur (2 portes - congélateur en bas, 59,5 cm)",
      "model": "WBMF 606374 XNA",
      "price": "",
      "priceValue": null,
      "currency": "",
      "mainImage": "https://www.whirlpool.ma/content/dam/whirlpool-global-multichannel-mc-aem/whirlpool-global-multichannel-mc-aemProductCatalog/product-images/7524620041-WBMF-606374-XNA/7524620041-MDM2-LOW-1.png/jcr:content/renditions/original",
      "otherImages": [
        "https://www.whirlpool.ma/content/dam/whirlpool-global-multichannel-mc-aem/whirlpool-global-multichannel-mc-aemProductCatalog/product-images/7524620041-WBMF-606374-XNA/7524620041-MDM2-LOW-2.png/jcr:content/renditions/original",
        "https://www.whirlpool.ma/content/dam/whirlpool-global-multichannel-mc-aem/whirlpool-global-multichannel-mc-aemProductCatalog/product-images/7524620041-WBMF-606374-XNA/7524620041-MDM2-LOW-3.png/jcr:content/renditions/original",
        "https://www.whirlpool.ma/content/dam/whirlpool-global-multichannel-mc-aem/whirlpool-global-multichannel-mc-aemProductCatalog/product-images/7524620041-WBMF-606374-XNA/7524620041-MDM2-LOW-4.png/jcr:content/renditions/original",
        "https://www.whirlpool.ma/content/dam/whirlpool-global-multichannel-mc-aem/whirlpool-global-multichannel-mc-aemProductCatalog/product-images/7524620041-WBMF-606374-XNA/7524620041-MDM2-LOW-5.png/jcr:content/renditions/original",
        "https://www.whirlpool.ma/content/dam/whirlpool-global-multichannel-mc-aem/whirlpool-global-multichannel-mc-aemProductCatalog/product-images/7524620041-WBMF-606374-XNA/7524620041-MDM2-LOW-6.png/jcr:content/renditions/original",
        "https://www.whirlpool.ma/content/dam/whirlpool-global-multichannel-mc-aem/whirlpool-global-multichannel-mc-aemProductCatalog/product-images/7524620041-WBMF-606374-XNA/7524620041-MDM2-LOW-7.png/jcr:content/renditions/original",
        "https://www.whirlpool.ma/content/dam/whirlpool-global-multichannel-mc-aem/whirlpool-global-multichannel-mc-aemProductCatalog/product-images/7524620041-WBMF-606374-XNA/7524620041-MDM2-LOW-8.png/jcr:content/renditions/original"
      ],
      "images": ["…the mainImage first, then all the otherImages, in this order (8 links here)…"],
      "specs": [
        {"label": "Type de raccord", "value": "Autoportant"},
        {"label": "Hauteur", "value": "186.5 cm"},
        {"label": "Largeur", "value": "59.5 cm"},
        {"label": "Profondeur", "value": "66.3 cm"},
        {"label": "Classe d’efficacité énergétique", "value": "A++"},
        {"label": "Compresseur à onduleur", "value": "Oui"},
        {"label": "Type de système de refroidissement", "value": "Sans givre"},
        {"label": "ProFresh", "value": "Oui"},
        {"label": "Position du congélateur", "value": "Fond de congélateur"},
        {"label": "Couleur", "value": "Titanium Inox"},
        {"label": "Fonction éco", "value": "Oui"},
        {"label": "Mode vacances", "value": "Oui"},
        {"label": "Total Net Volume", "value": "316 L"},
        {"label": "Volume net de stockage des aliments frais", "value": "210 L"},
        {"label": "Volume net de stockage des aliments surgelés", "value": "106 L"},
        {"label": "Type d’étagère de réfrigérateur", "value": "Verre"},
        {"label": "CoolRoom®", "value": "Oui"},
        {"label": "Gel rapide", "value": "Oui"},
        {"label": "Type de machine à glace", "value": "Plateau à glaçons Twist & Serve"},
        {"label": "Capacité quotidienne de production de glace (kg/jour)", "value": "1 kg"},
        {"label": "Capacité de congélation quotidienne (kg/jour)", "value": "6 kg"},
        {"label": "Consommation annuelle d’énergie : 25 °C", "value": "248 kWh/an"},
        {"label": "Niveau sonore", "value": "35 dBA"},
        {"label": "Classe climatique", "value": "SN-T"},
        {"label": "Porte réversible", "value": "Oui"},
        {"label": "Ouverture à 90° de la porte", "value": "Oui"},
        {"label": "Type de contrôle", "value": "Électronique"},
        {"label": "Poids", "value": "69.3 kg"},
        {"label": "Hauteur emballée", "value": "193 cm"},
        {"label": "Largeur emballée", "value": "64 cm"},
        {"label": "Profondeur emballée", "value": "76.5 cm"},
        {"label": "Poids emballé", "value": "72 kg"},
        {"label": "Alarme porte ouverte", "value": "Oui"},
        {"label": "Verrouillage d’enfant", "value": "Oui"}
      ],
      "specGroups": [
        { "title": "Caractéristiques principales", "rows": [
            {"label": "Type de raccord", "value": "Autoportant"},
            {"label": "Hauteur", "value": "186.5 cm"},
            {"label": "Largeur", "value": "59.5 cm"},
            {"label": "Profondeur", "value": "66.3 cm"},
            {"label": "Classe d’efficacité énergétique", "value": "A++"},
            {"label": "Compresseur à onduleur", "value": "Oui"},
            {"label": "Type de système de refroidissement", "value": "Sans givre"},
            {"label": "ProFresh", "value": "Oui"},
            {"label": "Position du congélateur", "value": "Fond de congélateur"},
            {"label": "Couleur", "value": "Titanium Inox"}
          ] },
        { "title": "Technologies", "rows": [
            {"label": "Compresseur à onduleur", "value": "Oui"},
            {"label": "Fonction éco", "value": "Oui"},
            {"label": "Mode vacances", "value": "Oui"}
          ] },
        { "title": "Volume brut et net", "rows": [
            {"label": "Total Net Volume", "value": "316 L"},
            {"label": "Volume net de stockage des aliments frais", "value": "210 L"},
            {"label": "Volume net de stockage des aliments surgelés", "value": "106 L"}
          ] },
        { "title": "Caractéristiques du réfrigérateur", "rows": [
            {"label": "ProFresh", "value": "Oui"},
            {"label": "Type d’étagère de réfrigérateur", "value": "Verre"},
            {"label": "CoolRoom®", "value": "Oui"}
          ] },
        { "title": "Caractéristiques du congélateur", "rows": [
            {"label": "Gel rapide", "value": "Oui"},
            {"label": "Type de machine à glace", "value": "Plateau à glaçons Twist & Serve"},
            {"label": "Capacité quotidienne de production de glace (kg/jour)", "value": "1 kg"},
            {"label": "Capacité de congélation quotidienne (kg/jour)", "value": "6 kg"}
          ] },
        { "title": "Performances et consommation", "rows": [
            {"label": "Classe d’efficacité énergétique", "value": "A++"},
            {"label": "Consommation annuelle d’énergie : 25 °C", "value": "248 kWh/an"},
            {"label": "Niveau sonore", "value": "35 dBA"},
            {"label": "Classe climatique", "value": "SN-T"}
          ] },
        { "title": "Conception", "rows": [
            {"label": "Porte réversible", "value": "Oui"},
            {"label": "Ouverture à 90° de la porte", "value": "Oui"},
            {"label": "Position du congélateur", "value": "Fond de congélateur"},
            {"label": "Type de contrôle", "value": "Électronique"},
            {"label": "Type de raccord", "value": "Autoportant"},
            {"label": "Couleur", "value": "Titanium Inox"}
          ] },
        { "title": "Dimensions et poids", "rows": [
            {"label": "Hauteur", "value": "186.5 cm"},
            {"label": "Largeur", "value": "59.5 cm"},
            {"label": "Profondeur", "value": "66.3 cm"},
            {"label": "Poids", "value": "69.3 kg"},
            {"label": "Hauteur emballée", "value": "193 cm"},
            {"label": "Largeur emballée", "value": "64 cm"},
            {"label": "Profondeur emballée", "value": "76.5 cm"},
            {"label": "Poids emballé", "value": "72 kg"}
          ] },
        { "title": "Sécurité", "rows": [
            {"label": "Alarme porte ouverte", "value": "Oui"},
            {"label": "Verrouillage d’enfant", "value": "Oui"}
          ] }
      ],
      "needsReview": false,
      "warnings": [],
      "scrapedAt": "2026-10-10T14:52:00.086Z"
    },
    { …8 more products with the same shape… }
  ],
  "failed": []
}

What real files are like (build for this, not for a tiny example):
- One file can have 1 to several hundred products, from different brands (Whirlpool, LG, Samsung, Bosch, Candy, Haier, TCL).
- Each product usually has 3 to 15 pictures and 25 to 40 spec rows split into 7 to 10 titled sections ("Caractéristiques principales", "Technologies", "Volume brut et net", "Caractéristiques du réfrigérateur", "Caractéristiques du congélateur", "Performances et consommation", "Conception", "Dimensions et poids", "Sécurité" …). Other brands use other titles, sometimes in CAPITAL letters ("DIMENSIONS ET POIDS", "SPÉCIFICATIONS DE BASE"). Keep titles and their order exactly as in the file.
- The SAME row can be in two sections (e.g. "Couleur: Titanium Inox" is in "Caractéristiques principales" and in "Conception"). specGroups keeps it in both; "specs" is the flat list without duplicates (use "specs" for filters and search, "specGroups" for the product page).
- Labels can contain special characters (’ ® ° é) and sometimes English words ("Total Net Volume"). Keep them exactly.
- Values are text with units ("186.5 cm", "316 L", "248 kWh/an", "0,87 kWh/jour", "35 dBA", "Oui"). Keep them as text. For filters, you may also read the number in front of the unit.
- Picture links are long and may NOT end with .jpg/.png (Whirlpool links end with "/jcr:content/renditions/original", Samsung links end with "?$1164_776_PNG$", Haier/Candy links have "?w=1000&...&s=..."). Keep each link EXACTLY as it is, never cut the end.
- Most products have NO price: "price" is "", "priceValue" is null, "currency" is "". Bosch products have prices in MAD ("6.999,00 MAD" → priceValue 6999).
- "failed" is often an empty list.
- "category" is the name I chose in the extension (here "Réfrigérateur combiné"); "sourceCategory" is the name of the list page on the brand website.
Be tolerant: any text may be "", priceValue may be null, specGroups may be empty (then show specs as one section "Caractéristiques"), ignore unknown keys, and also accept a file that is just an array of products. A file of several hundred products can be several MB: read it fast and do not freeze the page (show a small "Lecture du fichier…" spinner).

STEP 2 — CHOOSE WHERE THE PRODUCTS GO (the important part)
Show a search box: "Put these products in…". As I type, search my existing categories/sections (by name, accents and capital letters ignored, e.g. "lave" finds "Lave-linge" and "Lave-vaisselle"). Show matches as a list with how many products each already has. If my categories have parents (e.g. Électroménager > Lavage > Lave-linge), show the full path and search it too.
- I click one → ALL products in the file go there (one click for the whole file).
- If nothing matches, show "+ Create the section “<what I typed>”" (ask me for the parent if my categories have parents).
- Also offer "Use the category written in the file" (the product's "category", or "sourceCategory" when it is empty). Match each name to my sections the same smart way; list the names that match nothing and let me pick a section for each of them with the same search box.
- In the preview (step 3) every row has its own small section picker too, so I can move one product somewhere else. Selecting several rows + "Move selected to…" (same search box) must also work.

STEP 3 — PREVIEW BEFORE SAVING (nothing is saved yet)
A table: picture, name, brand, model, section, price, number of pictures, number of spec rows, and a status:
- New
- Already on my site (same sourceUrl, or same brand + model) → shows what will happen (see settings)
- Needs a look (needsReview = true, no picture, or no section) → yellow, with the reason
Search box and filters (All / New / Already there / Needs a look). Tick boxes to leave products out. Click a row to see all its pictures and ALL its spec sections (exactly like the future product page).
Settings above the table, in plain words:
- "If the product is already on my site": Skip it (default) / Fill only the empty fields / Replace everything.
- "Save as hidden (draft) so I can check before customers see them": on by default if my products have a published/visible flag.
- "Copy the pictures to my own storage": on by default. On the server, download each picture and upload it to my Supabase Storage bucket for products, then save MY link. If one picture cannot be copied, keep the original link and mark it with a small warning. Never do this in the browser.
- "Products without a price": Leave the price empty (default; the shop then shows "Prix sur demande"). After the import, I can type the prices in the quick price list from PART 1.
- If currency is not my store's currency (MAD), show it in yellow.

STEP 4 — IMPORT
Big button "Add 42 products to <section>". Save in small batches (10 at a time) through a server function, with a progress bar and live counters (added, updated, skipped, problems). One product failing must never stop the others, and a product is saved completely or not at all (product + pictures + specs). At the end: a summary, the list of problems with "Try these again", a link to open the section on my site, and "Download the report (.csv)".

WHERE EACH FIELD GOES (map to my existing columns; add only what is missing)
- name → product name; brand → brand; model → model / reference
- section chosen in step 2 → my category link
- priceValue → price (number); price → price_text if I have no such column, add it
- images (mainImage first) → my existing product pictures (main picture + gallery, in this order)
- specGroups → spec_groups (jsonb, keep every section, every row, in order); specs → specs (jsonb). The product page of PART 1 shows spec_groups (use specs when spec_groups is empty).
- sourceUrl → source_url (text, UNIQUE): used to find the same product again later
- needsReview → needs_review (boolean); add imported_at (timestamp)

RULES
- Running the same file twice must never create duplicates.
- Never change products I edited by hand unless I chose "Replace everything".
- Keep accents and special characters exactly as they are (é, è, ç, ℓ, ™). Trim spaces.
- Only accept picture links that start with http:// or https://.
- Do not break my existing "add product" page, my product list or my shop pages.
- Simple words everywhere on this page (French like the rest of my admin, if my admin is in French).

When you are done, tell me in simple words: what you added to the database, where the page is, and how to test it with the example product above (it must show 8 pictures and 9 spec sections on its product page).
````

## Tips

- If you can, ALSO attach one of your real .json files (from the extension) to the same message, and say: "this is a real file, the importer must read it". Lovable then sees exactly what you have.
- Lovable can look at pictures: for a closer look, take 3 or 4 screenshots of the store you like (home page, a category page, a product page, also on your phone) and attach them. Say: "use these screenshots for the layout only, keep my own brand".
- If Lovable says the prompt is too long, send PART 1 first, wait until it is done, then send PART 2.
- Answer Lovable's question about your phone/WhatsApp number (Part 1 asks it to use one number everywhere).

## How to use it

1. In the extension, press **Download .json** (or **Copy** to paste the text).
2. Open `/admin/import` on your site, drop the file (or choose it, or paste the text).
3. Type the section name in "Put these products in…", click it, check the preview, press **Add**.
4. First time: try a file with 3–4 products.
