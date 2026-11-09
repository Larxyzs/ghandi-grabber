// Which site section the side tab picks for a product (app/app.js), on the NEW Electroplanet-style tree and the OLD one.
// Run: node tests/test_sections.js
const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'..','app','app.js'),'utf8').split('\n');
const start=src.findIndex(l=>l.includes('const foldText = (t) =>'));
const end=src.findIndex((l,i)=>i>start&&l.includes('async function sendToSite()'));
const body=src.slice(start,end).join('\n');
const make=(sections)=>new Function('S','nameOf',body+'; return {findSection, fridgeSections, TYPE_SECTION, foldText};')({sections},(it)=>it.result.name);
const P=(name,path)=>({id:path,name,path});
const NEW=[P('Gros électroménager','Gros électroménager'),P('Réfrigérateur','Gros électroménager > Réfrigérateur'),
 P('Réfrigérateur avec congélateur en haut','Gros électroménager > Réfrigérateur > Réfrigérateur avec congélateur en haut'),
 P('Réfrigérateur avec congélateur en bas','Gros électroménager > Réfrigérateur > Réfrigérateur avec congélateur en bas'),
 P('Réfrigérateur américain side by side','Gros électroménager > Réfrigérateur > Réfrigérateur américain side by side'),
 P('Réfrigérateur multi-portes','Gros électroménager > Réfrigérateur > Réfrigérateur multi-portes'),
 P('Réfrigérateur 1 porte','Gros électroménager > Réfrigérateur > Réfrigérateur 1 porte'),
 P('Mini bar et table top','Gros électroménager > Réfrigérateur > Mini bar et table top'),
 P('Réfrigérateur encastrable','Gros électroménager > Encastrable > Réfrigérateur encastrable'),
 P('Congélateur','Gros électroménager > Congélateur'),P('Congélateur armoire','Gros électroménager > Congélateur > Congélateur armoire'),P('Congélateur coffre','Gros électroménager > Congélateur > Congélateur coffre'),
 P('Machine à laver','Gros électroménager > Machine à laver'),P('Machine à laver à hublot','Gros électroménager > Machine à laver > Machine à laver à hublot'),P('Machine à laver séchante','Gros électroménager > Machine à laver > Machine à laver séchante'),P('Machine à laver encastrable','Gros électroménager > Encastrable > Machine à laver encastrable'),
 P('Lave-vaisselle','Gros électroménager > Lave-vaisselle'),P('Lave-vaisselle encastrable','Gros électroménager > Encastrable > Lave-vaisselle encastrable'),
 P('Plaque de cuisson','Gros électroménager > Plaque de cuisson'),P('Four encastrable','Gros électroménager > Encastrable > Four encastrable'),P('Micro-ondes encastrable','Gros électroménager > Encastrable > Micro-ondes encastrable'),P('Micro-ondes','Petit électroménager > Four et micro-ondes > Micro-ondes'),P('Four posable','Petit électroménager > Four et micro-ondes > Four posable'),
 P('Évier','Gros électroménager > Encastrable > Évier'),P('Téléviseur','TV - Son > Téléviseur'),P('Climatiseur','Confort de la maison > Climatisation > Climatiseur'),P('Ventilateur','Confort de la maison > Climatisation > Ventilateur')];
const OLD=[P('Réfrigérateurs','Gros électroménager > Froid > Réfrigérateurs'),P('Réfrigérateurs - Congélateurs','Gros électroménager > Froid > Réfrigérateurs - Congélateurs'),P('Réfrigérateurs Combinés','x > Réfrigérateurs Combinés'),P('Réfrigérateurs 2 portes','x > Réfrigérateurs 2 portes'),P('Congélateurs','x > Congélateurs'),P('Congélateurs Vertical','x > Congélateurs Vertical'),P('Lave-linge','x > Lave-linge'),P('Lave-linge séchants','x > Lave-linge séchants'),P('Télévisions','Télévisions'),P('Fours','Cuisson > Fours'),P('Micro-ondes','Cuisson > Micro-ondes'),P('Climatiseurs','Climatisation > Climatiseurs')];
function pick(sections,type,name){const f=make(sections);const it={result:{name,specs:[]},sheet:{groups:[],model:''}};let tries=(f.TYPE_SECTION[type]||[]).slice();if(type==='fridge')tries=f.fridgeSections(it);if(type==='washer'&&/sechant/.test(f.foldText(name)))tries.unshift('machine a laver sechante','lave linge sechants');for(const w of tries){const t=f.findSection(w);if(t.exact||t.guess)return (t.exact||t.guess).name;}return null;}
const cases=[['fridge','Réfrigérateur combiné 340L congélateur en bas','Réfrigérateur avec congélateur en bas','Réfrigérateurs Combinés'],
['fridge','Réfrigérateur 2 portes 411L','Réfrigérateur avec congélateur en haut','Réfrigérateurs 2 portes'],
['fridge','Réfrigérateur side by side 617L','Réfrigérateur américain side by side',null],
['fridge','Congélateur armoire 7 tiroirs','Congélateur armoire','Congélateurs Vertical'],
['fridge','Congélateur coffre 300L','Congélateur coffre','Congélateurs'],
['fridge','Réfrigérateur','Réfrigérateur','Réfrigérateurs'],
['washer','Lave-linge 9 kg','Machine à laver à hublot','Lave-linge'],
['washer','Lave-linge séchant 10/6 kg','Machine à laver séchante','Lave-linge séchants'],
['tv','TV QLED 55','Téléviseur','Télévisions'],['oven','Four encastrable','Four encastrable','Fours'],
['microwave','Micro-ondes encastrable','Micro-ondes encastrable','Micro-ondes'],['ac','Climatiseur','Climatiseur','Climatiseurs'],['sink','Évier','Évier',null]];
let ok=true;
for(const [type,name,wantNew,wantOld] of cases){const a=pick(NEW,type,name),b=pick(OLD,type,name);const g=a===wantNew&&(wantOld===null||b===wantOld);ok=ok&&g;console.log(g?'PASS':'FAIL',type,name,'| new:',a,'| old:',b);}
console.log(ok?'ALL PASS':'SOME FAILED'); process.exit(ok?0:1);
