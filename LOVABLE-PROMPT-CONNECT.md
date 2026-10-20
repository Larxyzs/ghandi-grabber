# Prompt for Lovable — connect the Chrome extension to my site

Send this AFTER the first prompt (new shop look + importer) is done.
Copy everything inside the box below and paste it into Lovable's chat.

````
Connect my product-grabber Chrome extension DIRECTLY to my site. The extension sends products to an INBOX on my site. Nothing goes on the shop until I decide. On the site I get a notification: I can CANCEL (wipe them) or BRING THEM TO THE SITE (choose products and the section for each).

Reuse what you built for the JSON importer: the same product format ("ghandi-products/v1" products), the same shared server function that checks/saves a product (duplicates, pictures copy, sections, specs), the same section search box and the same preview table. Do NOT build a second import system.

1) DATABASE (migration; tell me what you add)
- import_batches: id (text, primary key — the extension sends it, e.g. "b0lq3x9k2ab"), label (text), note (text), source (text), status (text: 'receiving' | 'ready' | 'done' | 'cancelled'), total_expected (int), product_count (int), suggested_category_id (uuid/int like my categories, nullable), suggested_section_text (text), created_at, updated_at.
- import_inbox_items: id, batch_id (references import_batches, on delete cascade), source_url (text), payload (jsonb — the full product exactly as received), suggested_category_id (nullable), status ('pending' | 'imported' | 'skipped'), product_id (the product created on my site, nullable), error (text), created_at. Unique (batch_id, source_url).
- extension_keys: id, label, key_hash (text — SHA-256 of the key, NEVER the key itself), created_at, last_used_at, revoked (bool).
- Row Level Security: only admins can read/write these 3 tables from the site. The Edge Function uses the service role.

2) EDGE FUNCTION "ghandi-import" (Supabase Edge Function, public URL, no Supabase login)
URL: https://<my-project>.supabase.co/functions/v1/ghandi-import
- Set verify_jwt = false for this function (the extension has no Supabase login); security = the secret key below.
- CORS: answer OPTIONS with 204 and headers Access-Control-Allow-Origin: *, Access-Control-Allow-Headers: content-type, x-ghandi-key, Access-Control-Allow-Methods: POST, OPTIONS. Add Access-Control-Allow-Origin: * to every answer.
- Every request is a POST with JSON and the header "x-ghandi-key: <secret key>". Hash the received key with SHA-256 and compare with extension_keys.key_hash (not revoked). Wrong/missing key → HTTP 401 {"ok": false, "error": "bad key"}. Update last_used_at.
- Limit: max 50 products per request, max 5 MB per request (else 413 with a clear error).
- Always answer JSON. Errors: {"ok": false, "error": "<simple sentence in English>"}.

Action "ping" — request:
  { "action": "ping", "source": "Ghandi Product Grabber 3.2" }
answer:
  { "ok": true, "site": "Ghandi Home Electro", "sections": [ { "id": "<category id>", "name": "Réfrigérateurs combinés", "path": "Froid > Réfrigérateurs combinés" }, … ] }
  (all my categories, path = parent names joined with " > ", sorted by path)

Action "push" — the extension sends one batch in several requests of up to 20 products, all with the same batchId:
  {
    "action": "push",
    "source": "Ghandi Product Grabber 3.2",
    "batchId": "b0lq3x9k2ab",
    "label": "Test batch",                       // or "34 produits – Whirlpool, LG"
    "note": "Test batch",                        // may be ""
    "total": 34,                                 // number of products in the WHOLE batch
    "final": false,                              // true on the LAST request of the batch
    "suggestedSectionId": "<category id>" or null,
    "suggestedSectionPath": "Lavage > Lave-linge", // text typed in the extension (may not exist yet, may be "")
    "products": [ …up to 20 products, EXACTLY the same product objects as in the JSON file ("sourceUrl", "brand", "category", "sourceCategory", "name", "model", "price", "priceValue", "currency", "mainImage", "otherImages", "images", "specs", "specGroups", "needsReview", "warnings", "scrapedAt")… ]
  }
  - Create the batch if it does not exist (status 'receiving'), else add to it. Upsert items by (batch_id, source_url) so sending twice never makes doubles.
  - When "final" is true: status → 'ready', product_count = number of items. Only 'ready' batches create a notification.
  - Answer: { "ok": true, "batchId": "b0lq3x9k2ab", "received": 20 }
  - Do NOT create products here. Products are created only when I press "Bring to site".
  - Batches stuck in 'receiving' for more than 24 hours: show them in the inbox as "incomplete" with a Cancel button.

3) ADMIN PAGE "Extension Chrome" (/admin/extension, in my admin menu)
- Shows the import address (the function URL above) with a "Copier" button.
- Button "Créer une clé secrète": generates a random key like "gk_" + 40 random letters/numbers, shows it ONCE with a "Copier" button and the text "Collez-la dans l'extension. Elle ne sera plus affichée.", and saves only its SHA-256 hash. List of keys with "last used" and a "Révoquer" button.
- Short help: "1. Copiez l'adresse. 2. Copiez la clé. 3. Dans l'extension, cliquez « My site » et collez les deux. 4. Cliquez « Save and test »."

4) NOTIFICATION ON MY SITE (admin only, never visible to customers)
- A bell icon in my admin header with a red counter = number of 'ready' batches. It updates LIVE (Supabase Realtime on import_batches), no page reload.
- When a new batch becomes 'ready' while I am on any admin page, show a pop-up card at the bottom right:
  "📦 34 nouveaux produits importés depuis l'extension — « Test batch »"   [Annuler]  [Ajouter au site]
- The bell opens a list of waiting batches (label, number of products, brands, date, suggested section) with the same two buttons.
- "Annuler" → confirm "Supprimer ces 34 produits importés ? Rien n'a été ajouté au site." → delete the batch and its items (wipe). Nothing on the shop changes.
- "Ajouter au site" → opens /admin/import/inbox/<batchId>.

5) INBOX PAGE /admin/import/inbox/<batchId> (= the importer preview, filled from the batch)
- Same preview table as the JSON importer: picture, name, brand, model, section, price, pictures count, specs count, status (New / Already on my site / Needs a look). Click a row to see all pictures and all spec sections.
- Checkbox on each row + "Tout sélectionner" / "Tout désélectionner" at the top.
- Section: the batch's suggested section is pre-filled for every row (if suggestedSectionId exists, else try to match suggestedSectionPath with my sections; if nothing matches, leave empty and mark the row "Choisir une section").
- With rows selected: "Mettre dans…" = the same section search box (type "lave" → "Lavage > Lave-linge"), applies the section to the selected rows only. So I can send some products to one section and others to another section. Each row also has its own small section picker.
- Buttons for the selected rows: "Ajouter les sélectionnés au site (12)" and "Retirer de la liste" (marks them skipped, they disappear).
- "Ajouter…" uses the shared import function with the same settings as the importer (already on my site: skip / fill empty / replace; save as hidden; copy pictures to my storage). Progress bar, a product failing never stops the others. Imported rows show "✓ Ajouté" with a link to the product and disappear from the pending list.
- When no pending rows are left: batch status 'done', the notification disappears. A link "Voir les produits ajoutés".
- Also add a page /admin/import/inbox listing all batches (ready, incomplete, done in the last 30 days).

6) RULES
- The key is checked on EVERY request. Never log the key. Never send it back.
- Never create shop products from the Edge Function directly — only from the inbox page when I click.
- Keep accents/special characters and picture links exactly as received (do not cut links).
- Do not break the JSON importer, my admin, or the shop.

When you are done, tell me in simple words: the import address, where to create the key, and how to test (for example with curl: a "ping" with the key must return my site name and sections).
````

## What YOU do (step by step)

1. Make sure the first prompt (`LOVABLE-PROMPT.md`: new shop look + importer) is finished in Lovable.
2. Paste the prompt above into Lovable. Wait until it is done. If Lovable asks to "deploy the Edge Function" or "enable it", say yes.
3. On your site, open the admin page **Extension Chrome**:
   - click **Copier** next to the import address,
   - click **Créer une clé secrète**, then **Copier**.
4. In the extension (side tab), click **My site: not connected** at the top.
   Paste the address in the first box and the key in the second box. Click **Save and test**.
   You should see "✓ Connected to Ghandi Home Electro — N sections found."
5. Grab products. Click **Select all** (or tick some rows). Click **Import to site** at the bottom.
   Choose "The ones I selected", type a section to suggest (optional), click **Send**.
6. Open your site's admin: the bell shows a red number and a card pops up.
   **Annuler** wipes them. **Ajouter au site** opens the list: tick products, use **Mettre dans…** to choose the section, click **Ajouter les sélectionnés au site**.

You do NOT need to send me anything. Never paste your secret key in a chat.
If "Save and test" says "I cannot reach that address", copy the address again. If it says "The secret key is wrong", make a new key on the site and paste it again.
