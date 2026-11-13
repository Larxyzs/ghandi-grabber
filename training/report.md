# Training report (replay, 2026-11-13 18:22)

Run `20261113-182232-replay` (replay), 102 products grabbed in 144 s.

**Total: 80.3 / 100** on 102 products (101 verified expected files).

## Points lost per field (all products)
| Field | Max | Average | Points lost (sum) |
|---|---|---|---|
| spec_recall | 20 | 15.71 | 438 |
| pic_precision | 10 | 6.56 | 351 |
| pic_recall | 10 | 7.04 | 302 |
| spec_precision | 10 | 7.87 | 217 |
| model | 15 | 13.24 | 180 |
| pic_main | 5 | 3.53 | 150 |
| pic_order | 5 | 3.82 | 120 |
| brand | 10 | 9.22 | 80 |
| sheet | 5 | 4.25 | 77 |
| type | 5 | 4.46 | 55 |
| name | 5 | 4.61 | 40 |

## Score per site
| Site | N | Total | model | brand | name | type | pic rec | pic prec | main | order | spec rec | spec prec | sheet | sec | quick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bosch | 11 | **98.5** | 15.0 | 10.0 | 5.0 | 4.5 | 10.0 | 10.0 | 5.0 | 5.0 | 19.0 | 10.0 | 4.9 | 2.1 | 0/11 |
| candy | 17 | **87.1** | 15.0 | 10.0 | 5.0 | 4.4 | 6.5 | 6.5 | 3.2 | 3.2 | 18.8 | 9.7 | 4.7 | 1.8 | 14/17 |
| electrobousfiha | 27 | **98.1** | 13.3 | 10.0 | 5.0 | 5.0 | 9.8 | 10.0 | 5.0 | 5.0 | 20.0 | 10.0 | 5.0 | 0.2 | 27/27 |
| haier | 14 | **94.7** | 15.0 | 10.0 | 5.0 | 5.0 | 8.6 | 8.2 | 4.3 | 4.3 | 19.5 | 9.8 | 5.0 | 0.6 | 13/14 |
| lg | 9 | **10.4** | 1.7 | 1.1 | 0.6 | 0.6 | 1.1 | 0.4 | 0.6 | 0.6 | 2.2 | 1.1 | 0.6 | 0.3 | 1/9 |
| samsung | 11 | **88.9** | 13.6 | 10.0 | 5.0 | 5.0 | 8.2 | 4.0 | 4.1 | 4.1 | 19.9 | 10.0 | 5.0 | 0.7 | 11/11 |
| tcl | 13 | **44.7** | 15.0 | 10.0 | 5.0 | 5.0 | 1.1 | 1.3 | 0.4 | 2.7 | 1.5 | 0.0 | 2.6 | 4.0 | 0/13 |

## Score per product type
| Type | N | Total | model | pic rec | pic prec | spec rec | spec prec | sheet | type |
|---|---|---|---|---|---|---|---|---|---|
| ac | 6 | **71.3** | 15.0 | 4.7 | 6.7 | 10.0 | 5.0 | 3.3 | 5.0 |
| cooker | 2 | **99.5** | 15.0 | 10.0 | 10.0 | 20.0 | 9.5 | 5.0 | 5.0 |
| dishwasher | 6 | **84.1** | 15.0 | 5.0 | 4.2 | 20.0 | 9.9 | 5.0 | 5.0 |
| dryer | 2 | **79.6** | 15.0 | 5.0 | 5.0 | 19.6 | 10.0 | 5.0 | 0.0 |
| freezer | 3 | **96.7** | 15.0 | 10.0 | 10.0 | 20.0 | 10.0 | 3.3 | 3.3 |
| fridge | 20 | **75.0** | 12.8 | 6.5 | 6.0 | 15.0 | 7.0 | 4.2 | 4.2 |
| hob | 6 | **98.7** | 15.0 | 10.0 | 9.2 | 19.8 | 9.7 | 5.0 | 5.0 |
| hood | 3 | **91.7** | 10.0 | 10.0 | 9.5 | 17.2 | 10.0 | 5.0 | 5.0 |
| microwave | 8 | **97.3** | 15.0 | 10.0 | 9.2 | 18.4 | 9.7 | 5.0 | 5.0 |
| oven | 10 | **86.5** | 15.0 | 6.0 | 5.9 | 18.9 | 9.8 | 4.9 | 5.0 |
| sink | 2 | **85.0** | 0.0 | 10.0 | 10.0 | 20.0 | 10.0 | 5.0 | 5.0 |
| soundbar | 1 | **79.2** | 0.0 | 10.0 | 4.9 | 19.3 | 10.0 | 5.0 | 5.0 |
| tv | 11 | **60.4** | 12.3 | 4.9 | 4.7 | 9.1 | 4.5 | 2.6 | 4.1 |
| washer | 18 | **77.4** | 13.3 | 7.0 | 5.9 | 14.3 | 7.2 | 4.2 | 4.4 |
| washer-dryer | 4 | **73.6** | 11.2 | 7.5 | 6.1 | 15.0 | 7.5 | 3.8 | 3.8 |

## Weakest products
| Product | Total | Lost on | Notes |
|---|---|---|---|
| lg-gr-b499nqla | 0 | spec_recall -20, model -15, spec_precision -10, pic_recall -10, pic_precision -10, brand - | I could not find a product on this page. Is this a product page link? |
| lg-f2x5pyny6 | 0 | spec_recall -20, model -15, spec_precision -10, pic_recall -10, pic_precision -10, brand - | I could not find a product on this page. Is this a product page link? |
| lg-f2v5pgp2t | 0 | spec_recall -20, model -15, spec_precision -10, pic_recall -10, pic_precision -10, brand - | I could not find a product on this page. Is this a product page link? |
| lg-gr-b48fplam | 0 | spec_recall -20, model -15, spec_precision -10, pic_recall -10, pic_precision -10, brand - | I could not find a product on this page. Is this a product page link? |
| lg-f4v9rwp2e | 0 | spec_recall -20, model -15, spec_precision -10, pic_recall -10, pic_precision -10, brand - | I could not find a product on this page. Is this a product page link? |
| lg-oled65g66lw | 0 | spec_recall -20, model -15, spec_precision -10, pic_recall -10, pic_precision -10, brand - | I could not find a product on this page. Is this a product page link? |
| lg-oled77c66la | 0 | spec_recall -20, model -15, spec_precision -10, pic_recall -10, pic_precision -10, brand - | I could not find a product on this page. Is this a product page link? |
| lg-gr-b639nlcm | 0 | spec_recall -20, model -15, spec_precision -10, pic_recall -10, pic_precision -10, brand - | I could not find a product on this page. Is this a product page link? |
| tcl-115x955 | 36 | spec_recall -20, spec_precision -10, pic_recall -10, pic_precision -10, pic_order -5, pic_ |  missing 40 specs (e.g. Category) 12 foreign pics |
| tcl-freshin-3-0 | 36 | spec_recall -20, spec_precision -10, pic_recall -10, pic_precision -10, pic_order -5, pic_ |  missing 40 specs (e.g. Catégorie(Norme italienne EER>=3.23 COP>=3.71)) 2 foreign pics |
| tcl-voxin | 38 | spec_recall -20, spec_precision -10, pic_recall -10, pic_precision -10, pic_order -5, pic_ |  missing 26 specs (e.g. Type) 3 foreign pics |
| tcl-p520sb | 40 | spec_recall -20, spec_precision -10, pic_recall -10, pic_precision -10, pic_order -5, pic_ |  missing 12 specs (e.g. Dimensions(W*H*D mm)) 1 foreign pics |
| tcl-p425tms | 40 | spec_recall -20, spec_precision -10, pic_recall -10, pic_precision -10, pic_order -5, pic_ |  missing 11 specs (e.g. Dimensions(W*H*D mm)) 8 foreign pics |
| tcl-85c8l | 42 | spec_recall -20, spec_precision -10, pic_precision -10, pic_recall -9, pic_main -5, sheet  |  missing 40 specs (e.g. Catégorie) 12 foreign pics |
| tcl-50s5k | 43 | spec_recall -20, spec_precision -10, pic_precision -9, pic_recall -9, pic_main -5, sheet - | I could not find the specifications table. missing 40 specs (e.g. Catégorie) 12 foreign pics |
| tcl-98p8k | 43 | spec_recall -20, spec_precision -10, pic_precision -9, pic_recall -9, pic_main -5, sheet - |  missing 40 specs (e.g. Catégorie) 12 foreign pics |
| tcl-p606flg | 45 | spec_recall -20, spec_precision -10, pic_recall -9, pic_precision -8, pic_main -5, sheet - |  missing 12 specs (e.g. Wash Capacity) 3 foreign pics |
| tcl-p607flg | 49 | spec_recall -20, spec_precision -10, pic_precision -9, pic_recall -8, pic_main -5 |  missing 9 specs (e.g. Series) 8 foreign pics |
| tcl-p609flg | 49 | spec_recall -20, spec_precision -10, pic_precision -9, pic_recall -8, pic_main -5 |  missing 9 specs (e.g. Series) 8 foreign pics |
| tcl-f166tmw | 60 | spec_precision -10, pic_recall -10, pic_precision -10, pic_order -5, pic_main -5 |  7 foreign pics |
| tcl-free-standing-fhi | 61 | spec_recall -20, spec_precision -10, pic_recall -5, sheet -4 | Slideshow mode: this page has no « Caractéristiques » box, so I took no details. missing 23 specs (e.g. Name) |
| candy-f-cid-x100 | 64 | pic_recall -10, pic_precision -10, pic_order -5, pic_main -5, spec_recall -5 |  missing 11 specs (e.g. Pourcentage de matière recyclée dans le produit) 10 foreign pics |
| candy-cse-c10drgr-47 | 65 | pic_recall -10, pic_precision -10, type -5, pic_order -5, pic_main -5 |  missing 1 specs (e.g. Présence de substances extrêmement préoccupantes dans le produit) 5 foreign pics |
| candy-f-idcp-x625-l | 68 | pic_recall -10, pic_precision -10, pic_order -5, pic_main -5, spec_recall -1 |  missing 2 specs (e.g. Emballage recyclable) 11 foreign pics |
| candy-ci-3e53l0w | 70 | pic_recall -10, pic_precision -10, pic_order -5, pic_main -5 |  12 foreign pics |
