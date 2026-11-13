/*
  scraper/brands.js — the brands we know, written the right way ("ARTHUR MARTIN" -> "Arthur Martin").
  Shared by the SHOP recipes (Electrobousfiha, Electroplanet) that must find each product's brand.
  Loaded right after core.js (first line of recipe-list.js).
*/
(function () {
  // Brands sold in Morocco, as they should be written. Longest names are tried first.
  var BRANDS = [
    'Arthur Martin', 'De Dietrich', 'Russell Hobbs', 'Black & Decker', 'Black+Decker', 'Continental Edison', 'Saunier Duval', 'Bosch', 'Siemens', 'Neff',
    'LG', 'Samsung', 'Whirlpool', 'Candy', 'Hoover', 'Haier', 'TCL', 'Hisense', 'Midea', 'Beko', 'Grundig', 'Electrolux', 'AEG', 'Zanussi',
    'Indesit', 'Ariston', 'Hotpoint', 'Franke', 'Teka', 'Smeg', 'Brandt', 'Sauter', 'Faure', 'Thomson', 'Sharp', 'Panasonic', 'Sony', 'Philips',
    'Toshiba', 'Daewoo', 'Condor', 'Vestel', 'Kenwood', 'Moulinex', 'Tefal', 'Rowenta', 'Krups', 'Seb', 'Calor', 'Braun', 'Babyliss', 'Remington',
    'Dyson', 'Jata', 'Taurus', 'Ufesa', 'Sencor', 'Elexia', 'Ocean', 'Siera', 'Carrier', 'Gree', 'Daikin', 'Mitsubishi', 'Fujitsu', 'Westpoint',
    'Nikai', 'Logitech', 'HP', 'Lenovo', 'Asus', 'Acer', 'Dell', 'Apple', 'Xiaomi', 'Huawei', 'Oppo', 'Realme', 'Infinix', 'Tecno', 'Honor',
    'Nokia', 'JBL', 'Bose', 'Marshall', 'PlayStation', 'Microsoft', 'Nintendo', 'Tornado', 'KitchenAid', "De'Longhi", 'Delonghi', 'Nespresso',
    'Bomann', 'Clatronic', 'Severin', 'Princess', 'Cecotec', 'Cata', 'Elica', 'Pyramis', 'Blanco', 'Grohe', 'Chaffoteaux', 'Atlantic', 'Junkers',
    'Vaillant', 'Thermor', 'Glem', 'Elba', 'Bertazzoni', 'Iris', 'Biolux', 'Starlight', 'Kiwi', 'Royal', 'Felicia', 'Sanford', 'Geepas',
    'Kelon', 'Mega Life', 'Hyundai', 'Sinbo', 'Black & Decker', 'Stiebel Eltron', 'Ferroli', 'Baxi', 'Ariston Thermo', 'Lenoxx', 'Akai', 'Aiwa',
  ];
  var fold = function (s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  };
  var SORTED = BRANDS.slice().sort(function (a, b) {
    return fold(b).length - fold(a).length;
  });
  // "LG", "lg", "2-lg" (brand page address), "ARTHUR MARTIN" -> the brand as it should be written
  function canonical(raw) {
    var f = fold(String(raw || '').replace(/^\d+-/, ''));
    if (!f) return '';
    for (var i = 0; i < SORTED.length; i++) if (fold(SORTED[i]) === f) return SORTED[i] === 'Delonghi' ? "De'Longhi" : SORTED[i] === 'Black+Decker' ? 'Black & Decker' : SORTED[i];
    if (f.length > 30) return '';
    // unknown brand: "SOME BRAND" -> "Some Brand" (short ones like "AUX" stay in capitals)
    return f
      .split(' ')
      .map(function (w) {
        return w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');
  }
  // the first known brand written in a text ("REFRIGERATEUR SAMSUNG 2 PORTES" -> Samsung)
  function brandInText(text) {
    var f = ' ' + fold(text) + ' ';
    var best = null;
    SORTED.forEach(function (b) {
      var at = f.indexOf(' ' + fold(b) + ' ');
      if (at !== -1 && (!best || at < best.at)) best = { at: at, b: b };
    });
    if (!best) return '';
    return best.b === 'Delonghi' ? "De'Longhi" : best.b === 'Black+Decker' ? 'Black & Decker' : best.b;
  }

  window.GHANDI = window.GHANDI || {};
  window.GHANDI.brands = { list: BRANDS, fold: fold, canonical: canonical, inText: brandInText };
})();
