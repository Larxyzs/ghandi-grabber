/*
  shim.js — lets the dashboard READ the brand recipes (name + website words)
  without running them. The recipe files call GHANDI.register(...); here we
  just write down who they are, so the "Brand recipe" menu is always complete.
*/
window.GHANDI = {
  recipes: [],
  register: function (r) {
    if (r && r.id) {
      window.GHANDI.recipes.push({ id: r.id, brand: r.brand || r.id, match: r.match || [], home: r.home || '', productLinks: r.productLinks || {} });
    }
  },
};
