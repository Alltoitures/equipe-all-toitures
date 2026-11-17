/* Appels d'offres v2 — pertinence en %, fiche AO en 7 onglets, réglages de la veille.
   Chargé après le script principal : remplace vAO et aoOpen. */
(function(){
"use strict";
const AO2_DEF={min:30000,max:500000,distMax:60,seuilP:70,seuilV:50,
  oui:["Couverture tuiles","Couverture zinc","Zinguerie","Bac acier","Charpente","Ossature bois"],
  non:["Étanchéité seule","Désamiantage","Monuments historiques","Lots tous corps d'état","Marchés d'entretien"],
  poids:[["Métier (couverture / zinguerie)",30],["Montant adapté à votre taille",20],["Distance depuis Vourles",15],["Capacité équipes sur la période",15],["Délai pour préparer",10],["Historique avec l'acheteur",10]],
  sources:{"BOAMP":true,"marches-publics.info (AWS)":true,"Profils acheteurs (Métropole, bailleurs…)":true,"Marchés privés (syndics, régies)":false},
  notif:{"Une notification par AO pertinent":true,"Rappel J-7 et J-2 avant dépôt":true,"Rappel des visites obligatoires":true}};
const R=()=>Object.assign(clone(AO2_DEF),(S.cfg&&S.cfg.aoReglages)||{});
const TABS=[["synthese","Synthèse"],["dce","DCE"],["chiffrage","Chiffrage"],["memoire","Mémoire"],["pieces","Pièces"],["depot","Dépôt"],["suivi","Suivi"]];
const PIECES=[["dc1","Lettre de candidature (DC1) ou DUME"],["dc2","Déclaration du candidat (DC2)"],["ca","Chiffre d'affaires des 3 derniers exercices"],["eff","Effectifs et encadrement des 3 dernières années"],["refs","Liste des références (5 ans)"],["qualibat","Certificat QUALIBAT"],["urssaf","Attestation URSSAF de moins de 6 mois"],["fisc","Attestation de régularité fiscale"],["assur","Assurances décennale et RC"],["kbis","Kbis de moins de 3 mois"],["visite","Certificat de visite"]];
const pctOf=a=>{const s=aoScore(a);return s==null?null:Math.round(s/13*100)};
function verdict(a){const p=pctOf(a),r=R();
  if(p==null){const rc=a.recommandation;return rc==="Go conseillé"?["g","Pertinent"]:rc==="No-go conseillé"?["x","Peu pertinent"]:rc==="À étudier"?["o","À voir"]:["n","À évaluer"]}
  return p>=r.seuilP?["g","Pertinent"]:p>=r.seuilV?["o","À voir"]:["x","Peu pertinent"]}
const VTXT={g:"je vous conseille d'y aller",o:"à regarder de plus près avant de décider",x:"je vous conseille de passer",n:"pas encore de score de la veille"};
function reasons(a){const t=String(a.motifsReco||"").replace(/\bScore \d+\/13\.?/i,"").replace(/^\s*\d+\/13\s*:\s*/,"");
  const parts=t.split(/\s*[;•]\s*|\.\s+(?=[A-ZÉ])/).map(s=>s.trim().replace(/\.$/,"")).filter(s=>s.length>2);
  const bad=/non communiqu|MAIS|vérif|vigilance|à confirmer|serré|pénalit|loin|non précis|inconnu|exig|protégé|Monument|à lire|entretien|mixte|étanch/i;
  const out={oui:[],non:[]};parts.forEach(p=>(bad.test(p)?out.non:out.oui).push(p.charAt(0).toUpperCase()+p.slice(1)));
  if(a.loin)out.non.push("Loin du secteur");if(a.signatureElecDepot)out.non.push("Signature électronique demandée au dépôt");return out}
function prep(a){const L=aoPrepList(a),pc=a.pieces||{},np=PIECES.filter(([k])=>pc[k]).length;
  const items=L.map(x=>({l:x.l,ok:x.s==="ok",w:x.s==="w"}));items.splice(4,1,{l:"Pièces administratives ("+np+" / "+PIECES.length+")",ok:np===PIECES.length,w:np>0&&np<PIECES.length});
  const ok=items.filter(x=>x.ok).length;return{items,pct:Math.round(ok/items.length*100)}}
const ring=(p,c)=>`<span class="a2-ring" style="--p:${p};--c:${c||"var(--accent)"}"><b>${p} %</b></span>`;
const field=(k,l,v,o)=>aoF(k,l,v,o).replace(/data-a="/g,'data-a2="');
const st=a=>a.statut||"Détecté";

/* ---------- Liste ---------- */
function list(){
  const A=aoAll(),words=normTxt(S.aoQ||"").split(" ").filter(Boolean);
  const F=A.filter(a=>!words.length||words.every(w=>normTxt([a.acheteur,a.objet,a.ville,a.dept,a.ref,a.lot].join(" ")).includes(w)));
  const by=s=>F.filter(a=>s.includes(st(a)));
  const asc=L=>L.sort((x,y)=>String(x.dateLimite||"9999").localeCompare(String(y.dateLimite||"9999")));
  const desc=L=>L.sort((x,y)=>String(y.dateResultat||y.dateLimite||"").localeCompare(String(x.dateResultat||x.dateLimite||"")));
  const G={decider:asc(by(["Détecté"])),prep:asc(by(["Go","En préparation"])),depose:asc(by(["Déposé","En négociation"])),fini:desc(by(["Gagné","Perdu"])),ecart:desc(by(["No-go","Non répondu","Sans suite"]))};
  const tab=S.ao2Tab||(G.decider.length?"decider":"prep");
  const Y=TODAY.slice(0,4),gY=A.filter(a=>st(a)==="Gagné"&&aoYear(a)===Y),pY=A.filter(a=>st(a)==="Perdu"&&aoYear(a)===Y);
  const nextP=G.prep.filter(a=>a.dateLimite&&a.dateLimite>=TODAY)[0];
  const T=[["decider","À décider",G.decider.length],["prep","En préparation",G.prep.length],["depose","Déposés",G.depose.length],["fini","Résultats",G.fini.length],["ecart","Écartés",G.ecart.length],["reglages","Réglages",""]];
  let body="";
  if(tab==="reglages")body=reglages();
  else if(tab==="decider")body=inbox(G.decider);
  else{const kind={prep:"prep",depose:"depose",fini:"fini",ecart:"clos"}[tab],L=G[tab];
    body=L.length?`<div class="aoc-g">${L.map(a=>tab==="prep"?prepCard(a):aoCard(a,kind)).join("")}</div>`:`<div class="empty">Rien dans cette rubrique.</div>`}
  main.innerHTML=`<div class="phead"><div><h1>Appels d'offres</h1><p class="sub">La veille trie, vous décidez, l'outil prépare.</p></div><div class="acts"><input class="search" id="ao-q" type="search" placeholder="Rechercher (acheteur, ville…)" value="${esc(S.aoQ||"")}" aria-label="Rechercher un AO"><button type="button" class="btn pri" id="ao-add">＋ Ajouter un AO</button></div></div>
  <div class="aot-g">
    <button type="button" class="aot aot-v" data-a2tab="decider"><span>À décider</span><b>${G.decider.length}</b><small>${G.decider.length?"Go / No-go à donner":"rien à décider"}</small></button>
    <button type="button" class="aot aot-c" data-a2tab="prep"><span>En préparation</span><b>${G.prep.length}</b><small>${nextP?"prochain dépôt "+aoJLbl(aoJ(nextP))+" · "+esc(nextP.acheteur||""):"aucun dépôt proche"}</small></button>
    <button type="button" class="aot aot-b" data-a2tab="depose"><span>Déposés</span><b>${G.depose.length}</b><small>${G.depose.length?"en attente de résultat":"aucun"}</small></button>
    <button type="button" class="aot aot-g" data-a2tab="fini"><span>Taux de réussite ${Y}</span><b>${gY.length+pY.length?pct(gY.length/(gY.length+pY.length)):"—"}</b><small>${gY.length} gagné${gY.length>1?"s":""} · ${pY.length} perdu${pY.length>1?"s":""}</small></button></div>
  <div class="a2-tabs" role="tablist">${T.map(([k,l,n])=>`<button type="button" role="tab" aria-selected="${k===tab}" data-a2tab="${k}">${l}${n!==""?` <span class="n">${n}</span>`:""}</button>`).join("")}</div>
  ${!S.ao.size&&tab!=="reglages"?`<div class="empty">${S.mode==="loading"?"Chargement des appels d'offres…":"Aucun appel d'offres pour l'instant."}</div>`:body}`;
  document.getElementById("ao-add").onclick=()=>drawerOpen(null);
  const q=document.getElementById("ao-q");q.addEventListener("input",()=>{S.aoQ=q.value;const p=q.selectionStart;vAO();const n=document.getElementById("ao-q");if(n){n.focus();try{n.setSelectionRange(p,p)}catch(_){}}});
}
function inbox(L){if(!L.length)return`<div class="empty">Aucun appel d'offres à décider. La veille vous préviendra dès qu'un AO pertinent arrive.</div>`;
  const cur=L.find(a=>a.id===S.ao2Sel)||L[0];
  const it=a=>{const[v,lab]=verdict(a),p=pctOf(a),j=aoJ(a);return`<button type="button" class="a2-it${a.id===cur.id?" on":""}" data-a2sel="${esc(a.id)}"><b>${esc(a.objet||aoName(a))}</b><small>${esc([a.acheteur,a.lot?(/^lot/i.test(a.lot)?a.lot:"lot "+a.lot):""].filter(Boolean).join(" · "))}</small>
    <span class="a2-rw"><span>${typeof a.montantEstime==="number"?"≈ "+keur(a.montantEstime)+" · ":""}${a.dateLimite?"⏱ "+fd(a.dateLimite)+(j!=null?" ("+aoJLbl(j)+")":""):"date à confirmer"}</span><span class="a2-vd ${v}">${lab}${p!=null?" · "+p+" %":""}</span></span></button>`};
  return`<div class="a2-inbox"><div class="a2-lst">${L.map(it).join("")}</div><div class="a2-det">${decide(cur)}</div></div>`}
function decide(a){const[v,lab]=verdict(a),p=pctOf(a),rs=reasons(a),j=aoJ(a);
  const k=(l,b,s)=>`<div><span>${l}</span><b>${b}</b>${s?`<small>${s}</small>`:""}</div>`;
  return`<div class="a2-meta">${esc([a.acheteur,a.procedure,a.lot?(/^lot/i.test(a.lot)?a.lot:"lot "+a.lot):"",a.dateLimite?"dépôt le "+fd(a.dateLimite)+(a.heureLimite?" à "+a.heureLimite:""):""].filter(Boolean).join(" · "))}</div>
  <h2 class="a2-h">${esc(a.objet||aoName(a))}</h2>
  <div class="a2-verd ${v}"><span class="a2-sc">${p!=null?p+"<i>%</i>":"?"}</span><div><b>${lab} : ${VTXT[v]}</b><p>${esc(String(a.motifsReco||"Analyse de la veille à venir.").slice(0,260))}</p></div>
    <button type="button" class="btn" data-aoq="nogo" data-id="${esc(a.id)}">No-go</button><button type="button" class="btn go" data-aoq="go" data-id="${esc(a.id)}">Go</button></div>
  <div class="a2-k">${k("Montant estimé",typeof a.montantEstime==="number"?eur(a.montantEstime)+" HT":"non communiqué")}${k("Dépôt",a.dateLimite?fd(a.dateLimite):"à confirmer",j!=null?aoJLbl(j):"")}${k("Distance",aoDist(a)||"—",a.ville||"")}${k("Visite",a.visiteObligatoire==="Oui"?"obligatoire":a.visiteObligatoire==="Non"?"facultative":"—",a.dateVisite?aoVis(a):"")}${k("Critères",a.criteres||"—")}${k("Plateforme",a.plateforme||"—")}</div>
  <div class="a2-why"><div class="a2b"><h3>Pourquoi oui</h3>${rs.oui.length?`<ul>${rs.oui.map(x=>`<li class="ok">${esc(x)}</li>`).join("")}</ul>`:'<p class="hint">—</p>'}</div><div class="a2b"><h3>À surveiller</h3>${rs.non.length?`<ul>${rs.non.map(x=>`<li class="w">${esc(x)}</li>`).join("")}</ul>`:'<p class="hint">Rien de particulier.</p>'}
    <button type="button" class="linkbtn" data-a2open="${esc(a.id)}">Ouvrir la fiche complète ›</button></div></div>`}
function prepCard(a){const P=prep(a),j=aoJ(a),todo=P.items.filter(x=>!x.ok);
  return`<article class="aoc aoc-prep a2-pc"><div class="aoc-h"><div><b>${esc(a.acheteur||"—")}${a.ville?" · "+esc(a.ville):""}</b><small>${esc([a.lot,a.objet].filter(Boolean).join(" · "))}</small></div>${aoPill(st(a))}</div>
  <div class="a2-pcm">${ring(P.pct,P.pct>=80?"#3B6D11":P.pct>=40?"var(--accent)":"#E24B4A")}<div><div class="aoc-j${j!=null&&j<=3?" r":""}">${j==null?"date à saisir":j<0?"dépôt passé":j===0?"dépôt aujourd'hui":"dépôt J-"+j}<small>${a.dateLimite?fd(a.dateLimite)+(a.heureLimite?" à "+esc(a.heureLimite):""):""}</small></div><p class="aoc-l">${todo.length?"Reste : "+todo.slice(0,3).map(x=>esc(x.l)).join(" · ")+(todo.length>3?"…":""):"Tout est prêt pour le dépôt."}</p></div></div>
  <div class="aoc-a"><button type="button" class="btn pri sm" data-a2open="${esc(a.id)}">Ouvrir la fiche</button></div></article>`}

/* ---------- Fiche AO ---------- */
function fiche(id){const a0=S.ao.get(id);if(!a0){S.aoId=null;return list()}
  const a=Object.assign({id},a0),tab=S.ao2FT||"synthese",P=prep(a),j=aoJ(a),pc=a.pieces||{},np=PIECES.filter(([k])=>pc[k]).length;
  const badge={synthese:P.pct+" %",dce:a.analyse||a.motifsReco?"✓":"",chiffrage:a.dpgfChiffree?"✓":(a.materiaux||[]).length?"à valider":"",memoire:a.memoireV1?"V1":"",pieces:np+"/"+PIECES.length,depot:j!=null&&j>=0?"J-"+j:"",suivi:["Gagné","Perdu"].includes(st(a))?st(a):""};
  const bc=k=>{const b=badge[k];return!b?"":/✓|Gagné/.test(b)?"g":k==="depot"&&j!=null&&j<=5?"r":"o"};
  const links=[["lien","Annonce"],["lienDCE","DCE"],["dossierOneDrive","Dossier OneDrive"]].filter(([k])=>aoUrl(a[k])).map(([k,l])=>`<a class="btn sm" href="${esc(a[k])}" target="_blank" rel="noopener">${l} ↗</a>`).join("");
  main.innerHTML=`<div class="a2-fh"><div><button type="button" class="linkbtn" data-a2back>‹ Appels d'offres</button><h1>${esc(a.objet||aoName(a))}</h1><p class="sub">${esc([a.acheteur,a.lot?(/^lot/i.test(a.lot)?a.lot:"lot "+a.lot):"",a.ville].filter(Boolean).join(" · "))} ${aoPill(st(a))}${a.dateLimite?` <span class="pill s-${j!=null&&j<=5&&j>=0?"red":"gray"}">dépôt ${fd(a.dateLimite)}${a.heureLimite?" "+esc(a.heureLimite):""}</span>`:""}</p></div><div class="acts">${links}<button type="button" class="btn sm" data-a2edit>Modifier les infos</button></div></div>
  <div class="a2-ft" role="tablist">${TABS.map(([k,l])=>`<button type="button" role="tab" aria-selected="${k===tab}" data-a2ft="${k}">${l}${badge[k]?` <i class="${bc(k)}">${esc(badge[k])}</i>`:""}</button>`).join("")}</div>
  <div class="a2-pane" id="a2-pane">${({synthese:tSyn,dce:tDce,chiffrage:tChif,memoire:tMem,pieces:tPie,depot:tDep,suivi:tSui}[tab]||tSyn)(a,P)}</div>`;
  window.scrollTo(0,0)}
const saveBar=`<div class="a2-save"><button type="button" class="btn pri" data-a2save>Enregistrer</button></div>`;
function tSyn(a,P){const[v,lab]=verdict(a),p=pctOf(a),rs=reasons(a),todo=P.items.filter(x=>!x.ok),s=st(a);
  return`<div class="a2-2">
  <div class="a2b"><div class="a2-big">${ring(P.pct,"#3B6D11")}<div><b>Préparé par l'outil</b><p class="hint">${todo.length?"Il vous reste "+todo.length+" point"+(todo.length>1?"s":"")+" à traiter.":"Le dossier est prêt."}</p></div></div>
    <ul class="a2-ck">${P.items.map(x=>`<li class="${x.ok?"ok":x.w?"w":""}"><i>${x.ok?"✓":x.w?"!":""}</i>${esc(x.l)}</li>`).join("")}</ul></div>
  <div><div class="a2-verd ${v} sm"><span class="a2-sc">${p!=null?p+"<i>%</i>":"?"}</span><div><b>${lab}</b><p>${esc(VTXT[v])}</p></div>${s==="Détecté"?`<button type="button" class="btn" data-aoq="nogo" data-id="${esc(a.id)}">No-go</button><button type="button" class="btn go" data-aoq="go" data-id="${esc(a.id)}">Go</button>`:""}</div>
    <div class="a2b a2-you"><h3>À vous</h3>${todo.length?todo.map((x,i)=>`<div class="a2-yi"><span>${i+1}</span>${esc(x.l)}</div>`).join(""):'<p class="hint">Rien, sinon déposer.</p>'}</div>
    <div class="a2b"><h3>Pourquoi oui</h3><ul>${rs.oui.map(x=>`<li class="ok">${esc(x)}</li>`).join("")||"<li>—</li>"}</ul><h3 style="margin-top:10px">À surveiller</h3><ul>${rs.non.map(x=>`<li class="w">${esc(x)}</li>`).join("")||"<li>—</li>"}</ul></div></div></div>`}
function tDce(a){const an=a.analyse||{};const rows=Object.entries(an);
  return`<div class="a2-2"><div class="a2b"><h3>Ce qu'il faut retenir du DCE</h3>${rows.length?`<div class="a2-an">${rows.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(typeof v==="object"?v.v:v)}</b>${v&&v.src?`<small>↗ ${esc(v.src)}</small>`:""}</div>`).join("")}</div>`:`<p class="hint">L'analyse automatique du DCE s'affichera ici (dates, critères, pièces demandées, vigilances, avec l'article d'origine).</p>`}
    ${(a.vigilances||[]).length?`<h3 style="margin-top:14px">Points de vigilance</h3><ul>${a.vigilances.map(x=>`<li class="w">${esc(x)}</li>`).join("")}</ul>`:""}</div>
  <div class="a2b"><h3>Échéances</h3><form class="a2-form" onsubmit="return false">${field("dateLimite","Date limite",a.dateLimite,{type:"date"})}${field("heureLimite","Heure limite",a.heureLimite,{ph:"12h00"})}${field("visiteObligatoire","Visite",a.visiteObligatoire,{sel:["Oui","Non","Non précisé"],blank:true})}${field("dateVisite","Date de visite",a.dateVisite,{type:"date"})}${field("dateQuestions","Questions avant le",a.dateQuestions,{type:"date"})}${field("criteres","Critères",a.criteres)}${field("procedure","Procédure",a.procedure)}${field("plateforme","Plateforme de dépôt",a.plateforme)}${field("lienDCE","Lien du DCE",a.lienDCE,{type:"url",full:true})}${field("dossierOneDrive","Dossier OneDrive",a.dossierOneDrive,{type:"url",full:true})}</form>${saveBar}</div></div>`}
function tChif(a){const M=a.materiaux||[],fo=[...new Set(M.map(m=>m.f||"Autre"))];
  return`<div class="a2-2"><div class="a2b"><h3>Prix</h3><form class="a2-form" onsubmit="return false">${field("montantEstime","Estimation de l'acheteur HT (€)",a.montantEstime,{type:"number"})}${field("montantOffre","Notre offre HT (€)",a.montantOffre,{type:"number"})}</form>
    <label class="ck" style="margin-top:8px"><input type="checkbox" data-a2="dpgfChiffree"${a.dpgfChiffree?" checked":""}> DPGF chiffrée et vérifiée</label>${saveBar}</div>
  <div class="a2b"><h3>Matériaux extraits du DCE ${M.length?`<small>${M.length} lignes</small>`:""}</h3>${M.length?`<div class="tblw"><table class="tbl"><thead><tr><th>Produit</th><th class="r">Qté</th><th>À vérifier</th></tr></thead><tbody>${fo.map(f=>`<tr class="a2-grp"><td colspan="3">${esc(f)}</td></tr>`+M.filter(m=>(m.f||"Autre")===f).map(m=>`<tr><td>${esc(m.p)}<span class="sm">${esc(m.src||"")}</span></td><td class="r nw"><b>${esc(String(m.q==null?"—":m.q).replace(".",","))}</b> ${esc(m.u||"")}</td><td class="sm">${esc(m.v||"")}</td></tr>`).join("")).join("")}</tbody></table></div>
    <p class="hint" style="margin-top:8px">Nature lue dans le CCTP, quantités de la DPGF. Les demandes de prix partent en brouillon Outlook, une par fournisseur.</p>`:`<p class="hint">La liste des matériaux à demander (CCTP + DPGF) s'affichera ici.</p>`}</div></div>`}
function tMem(a){const Pl=a.memoirePlan||[];
  return`<div class="a2-2"><div class="a2b"><h3>Plan imposé par le RC ${a.criteres?`<small>${esc(a.criteres)}</small>`:""}</h3>${Pl.length?`<ul class="a2-plan">${Pl.map((x,i)=>`<li class="${x.ok?"ok":""}"><b>${i+1}</b><span>${esc(x.t)}</span>${x.poids?`<em>${esc(x.poids)}</em>`:""}<i>${x.ok?"✓":"à rédiger"}</i></li>`).join("")}</ul>`:'<p class="hint">Le plan suivra les sous-critères de notation du règlement de consultation.</p>'}
    <label class="ck" style="margin-top:10px"><input type="checkbox" data-a2="memoireV1"${a.memoireV1?" checked":""}> Mémoire technique V1 rédigé</label>${saveBar}</div>
  <div class="a2b"><h3>Rédaction</h3><p class="hint">Chaque partie est assemblée à partir de vos contenus (méthodologie, moyens, sécurité, déchets, références), puis adaptée au CCTP. Vous relisez et validez partie par partie.</p>${aoUrl(a.dossierOneDrive)?`<a class="btn sm" href="${esc(a.dossierOneDrive)}" target="_blank" rel="noopener">Ouvrir le dossier du mémoire ↗</a>`:""}</div></div>`}
function tPie(a){const pc=a.pieces||{};
  return`<div class="a2b"><h3>Pièces administratives <small>${PIECES.filter(([k])=>pc[k]).length} / ${PIECES.length}</small></h3><div class="a2-pie">${PIECES.map(([k,l])=>`<label class="ck"><input type="checkbox" data-a2p="${k}"${pc[k]?" checked":""}> ${esc(l)}</label>`).join("")}</div>
  <p class="hint" style="margin-top:8px">Bientôt : coffre-fort administratif, avec les dates de validité contrôlées et les pièces jointes d'office.</p>${saveBar}</div>`}
function tDep(a){const P=prep(a),j=aoJ(a);
  return`<div class="a2-2"><div class="a2b"><h3>Contrôle avant dépôt</h3><ul class="a2-ck">${P.items.map(x=>`<li class="${x.ok?"ok":x.w?"w":""}"><i>${x.ok?"✓":x.w?"!":""}</i>${esc(x.l)}</li>`).join("")}</ul>
    <label class="ck" style="margin-top:8px"><input type="checkbox" data-a2="controleJ3"${a.controleJ3?" checked":""}> Contrôle final fait (J-3)</label>${saveBar}</div>
  <div class="a2b a2-you"><h3>Déposer</h3><p>${a.dateLimite?"Avant le <b>"+fd(a.dateLimite)+(a.heureLimite?" à "+esc(a.heureLimite):"")+"</b>"+(j!=null&&j>=0?" ("+aoJLbl(j)+")":""):"Date limite à saisir dans l'onglet DCE."}${a.plateforme?"<br>Plateforme : "+esc(a.plateforme):""}</p><p class="hint">Déposez sur la plateforme de l'acheteur, puis marquez l'offre comme déposée.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${aoUrl(a.lien)?`<a class="btn" href="${esc(a.lien)}" target="_blank" rel="noopener">Ouvrir l'annonce ↗</a>`:""}${["Go","En préparation"].includes(st(a))?`<button type="button" class="btn pri" data-aoq="depose" data-id="${esc(a.id)}">Marquer « Déposé »</button>`:`<span class="hint">Statut : ${esc(st(a))}${a.dateDepot?" le "+fd(a.dateDepot):""}</span>`}</div></div></div>`}
function tSui(a){return`<div class="a2-2"><div class="a2b"><h3>Résultat</h3><form class="a2-form" onsubmit="return false">${field("statut","Statut",st(a),{sel:AO_ST})}${field("dateDepot","Déposé le",a.dateDepot,{type:"date"})}${field("dateResultat","Résultat attendu / reçu le",a.dateResultat,{type:"date"})}${field("rang","Classement / notes",a.rang,{ph:"ex. 2e sur 5 · tech. 38/50"})}${field("motifRejet","Motifs de rejet",a.motifRejet,{ta:true,full:true})}${field("rex","Retour d'expérience",a.rex,{ta:true,full:true})}</form>
  <label class="ck"><input type="checkbox" data-a2="piecesAttributaire"${a.piecesAttributaire?" checked":""}> Pièces de l'attributaire transmises</label>${saveBar}</div>
  <div class="a2b"><h3>Après le dépôt</h3><ul><li>Questions de l'acheteur à surveiller sur la plateforme</li><li>Relance si pas de résultat à la date prévue</li><li>Gagné : le chantier est créé avec le marché et les pièces</li><li>Perdu : motifs demandés, prix de l'attributaire noté</li></ul></div></div>`}

async function save(){const id=S.aoId,a0=S.ao.get(id);if(!a0)return;const o=clone(a0);
  main.querySelectorAll("[data-a2]").forEach(el=>{const k=el.dataset.a2;let v;if(el.type==="checkbox")v=el.checked;else if(el.type==="number"){v=el.value===""?null:parseFloat(String(el.value).replace(",","."));if(isNaN(v))v=null}else{v=el.value.trim();if(v==="")v=null}o[k]=v});
  const pp=main.querySelectorAll("[data-a2p]");if(pp.length){o.pieces=Object.assign({},o.pieces||{});pp.forEach(el=>o.pieces[el.dataset.a2p]=el.checked)}
  o.updatedAt=new Date().toISOString();
  if(S.db){try{await S.db.collection("ao").doc(id).set(o)}catch(err){toast("Enregistrement impossible, réessayez.");console.error(err);return}}
  S.ao.set(id,o);vAO();toast("Appel d'offres enregistré")}

/* ---------- Réglages de la veille ---------- */
function reglages(){const r=R();const tg=(grp,k,on)=>`<label class="a2-tg"><span>${esc(k)}</span><input type="checkbox" data-a2r="${grp}" data-k="${esc(k)}"${on?" checked":""}><i></i></label>`;
  return`<div class="a2-reg"><div class="a2b"><h3>Ce que la veille recherche</h3><p class="hint">Les annonces hors de ces critères sont écartées automatiquement, avec la raison.</p>
    <div class="a2-g3"><div class="f"><label>Montant minimum (€ HT)</label><input type="number" id="a2r-min" value="${r.min}"></div><div class="f"><label>Montant maximum (€ HT)</label><input type="number" id="a2r-max" value="${r.max}"></div><div class="f"><label>Distance maximale (min depuis Vourles)</label><input type="number" id="a2r-dist" value="${r.distMax}"></div></div>
    <div class="f"><label>Travaux recherchés (un par ligne)</label><textarea id="a2r-oui" rows="6">${esc(r.oui.join("\n"))}</textarea></div>
    <div class="f"><label>Travaux refusés (un par ligne)</label><textarea id="a2r-non" rows="5">${esc(r.non.join("\n"))}</textarea></div></div>
  <div class="a2-2"><div class="a2b"><h3>Score de pertinence</h3><p class="hint">Poids de chaque critère (%).</p>${r.poids.map(([l,v],i)=>`<div class="a2-w"><span>${esc(l)}</span><input type="range" min="0" max="50" step="5" value="${v}" data-a2w="${i}"><b>${v} %</b></div>`).join("")}
    <div class="a2-g3" style="margin-top:8px"><div class="f"><label>Seuil « Pertinent » (%)</label><input type="number" id="a2r-sp" value="${r.seuilP}"></div><div class="f"><label>Seuil « À voir » (%)</label><input type="number" id="a2r-sv" value="${r.seuilV}"></div></div></div>
  <div><div class="a2b"><h3>Sources surveillées</h3>${Object.entries(r.sources).map(([k,v])=>tg("sources",k,v)).join("")}</div><div class="a2b" style="margin-top:14px"><h3>Notifications</h3>${Object.entries(r.notif).map(([k,v])=>tg("notif",k,v)).join("")}</div></div></div>
  <div class="a2-save"><button type="button" class="btn pri" data-a2regsave>Enregistrer les réglages</button></div></div>`}
async function regSave(){const r=R(),g=id=>document.getElementById(id),n=id=>{const v=parseFloat(g(id).value);return isNaN(v)?null:v},ln=id=>g(id).value.split("\n").map(s=>s.trim()).filter(Boolean);
  r.min=n("a2r-min");r.max=n("a2r-max");r.distMax=n("a2r-dist");r.seuilP=n("a2r-sp")||70;r.seuilV=n("a2r-sv")||50;r.oui=ln("a2r-oui");r.non=ln("a2r-non");
  main.querySelectorAll("[data-a2w]").forEach(el=>r.poids[+el.dataset.a2w][1]=+el.value);
  main.querySelectorAll("[data-a2r]").forEach(el=>r[el.dataset.a2r][el.dataset.k]=el.checked);
  const nc=Object.assign({},S.cfg,{aoReglages:r});if(S.db){try{await S.db.doc("config/params").set(JSON.parse(JSON.stringify(nc)))}catch(e){toast("Enregistrement impossible, réessayez.");return}}S.cfg=nc;toast("Réglages de la veille enregistrés")}

/* ---------- Branchements ---------- */
const drawerOpen=window.aoOpen;
window.vAO=function(){if(S.aoId&&S.ao.has(S.aoId))return fiche(S.aoId);S.aoId=null;return list()};
window.aoOpen=function(id){if(!id)return drawerOpen(null);S.aoId=id;S.ao2FT=S.ao2FT||"synthese";if(S.view!=="ao")setView("ao");else render()};
document.addEventListener("click",e=>{if(S.view!=="ao"||!e.target.closest)return;const t=e.target;
  const tb=t.closest("[data-a2tab]");if(tb){S.ao2Tab=tb.dataset.a2tab;S.aoId=null;vAO();return}
  const se=t.closest("[data-a2sel]");if(se){S.ao2Sel=se.dataset.a2sel;vAO();return}
  const op=t.closest("[data-a2open]");if(op){e.stopPropagation();S.aoId=op.dataset.a2open;S.ao2FT="synthese";vAO();return}
  if(t.closest("[data-a2back]")){S.aoId=null;vAO();window.scrollTo(0,0);return}
  const ft=t.closest("[data-a2ft]");if(ft){S.ao2FT=ft.dataset.a2ft;vAO();return}
  if(t.closest("[data-a2save]")){save();return}
  if(t.closest("[data-a2regsave]")){regSave();return}
  if(t.closest("[data-a2edit]")){drawerOpen(S.aoId);return}},true);
document.addEventListener("input",e=>{const w=e.target.closest&&e.target.closest("[data-a2w]");if(w)w.nextElementSibling.textContent=w.value+" %"});
const css=document.createElement("style");css.textContent=`
.a2b{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px}.a2b h3{margin:0 0 10px;font-size:15px;display:flex;gap:8px;align-items:baseline}.a2b h3 small{font-size:12px;color:var(--muted);font-weight:600}
.a2-fh a.btn,.a2-pane a.btn{text-decoration:none;color:var(--ink)}
.a2-tabs,.a2-ft{display:flex;gap:4px;margin:18px 0 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.a2-tabs button,.a2-ft button{background:none;border:0;border-bottom:3px solid transparent;padding:10px 12px;font:inherit;font-weight:700;font-size:13.5px;color:var(--muted);cursor:pointer;display:flex;gap:6px;align-items:center}
.a2-tabs button[aria-selected=true],.a2-ft button[aria-selected=true]{color:var(--ink);border-color:var(--accent)}
.a2-tabs .n{font-size:11px;background:var(--surface-2);border-radius:99px;padding:1px 7px;color:var(--ink-2)}
.a2-ft i{font-style:normal;font-size:10.5px;font-weight:800;border-radius:99px;padding:1px 7px;background:var(--surface-2);color:var(--ink-2)}.a2-ft i.g{background:var(--ok-bg);color:var(--ok)}.a2-ft i.o{background:var(--warn-bg);color:var(--warn)}.a2-ft i.r{background:var(--danger-bg);color:var(--danger)}
.a2-inbox{display:grid;grid-template-columns:minmax(260px,380px) 1fr;gap:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;min-height:520px}
.a2-lst{border-right:1px solid var(--line);overflow:auto;max-height:78vh}
.a2-it{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);padding:13px 16px;font:inherit;cursor:pointer}.a2-it:hover{background:var(--surface-2)}.a2-it.on{background:var(--accent-soft);box-shadow:inset 4px 0 0 var(--accent)}
.a2-it b{display:block;font-size:14px}.a2-it small{display:block;color:var(--muted);font-size:12px;margin-top:2px}.a2-rw{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:7px;font-size:12px}
.a2-vd{font-size:11.5px;font-weight:800;border-radius:6px;padding:3px 8px;white-space:nowrap}.a2-vd.g{background:var(--ok-bg);color:var(--ok)}.a2-vd.o{background:var(--warn-bg);color:var(--warn)}.a2-vd.x,.a2-vd.n{background:var(--surface-2);color:var(--muted)}
.a2-det{padding:20px 24px;overflow:auto}.a2-meta{font-size:12.5px;color:var(--muted)}.a2-h{margin:4px 0 14px;font-size:21px}
.a2-verd{display:flex;gap:14px;align-items:center;border-radius:14px;padding:12px 16px;border:1px solid var(--line);background:var(--surface-2);margin-bottom:14px}.a2-verd.g{background:var(--ok-bg);border-color:#bfd8a3}.a2-verd.o{background:var(--warn-bg);border-color:#f0d39b}
.a2-verd>div{flex:1}.a2-verd p{margin:3px 0 0;font-size:13px;color:var(--ink-2)}.a2-verd b{font-size:15px}.a2-verd.g b{color:var(--ok)}.a2-verd.o b{color:var(--warn)}
.a2-sc{width:62px;height:62px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:20px;font-weight:800;color:#fff;background:var(--muted)}.a2-verd.g .a2-sc{background:var(--ok)}.a2-verd.o .a2-sc{background:#D08A0B}.a2-sc i{font-style:normal;font-size:.6em;margin-left:1px}.a2-sc{grid-auto-flow:column;align-content:center}
.a2-verd.sm .a2-sc{width:50px;height:50px;font-size:16px}
.a2-k{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.a2-k>div,.a2-an>div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:12px;color:var(--muted)}.a2-k b,.a2-an b{display:block;color:var(--ink);font-size:14px;margin-top:2px}.a2-k small{display:block;margin-top:1px}
.a2-an{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.a2-an small{display:block;color:var(--accent-ink);font-weight:700;margin-top:2px}
.a2-why{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
.a2b ul{margin:0;padding:0;list-style:none}.a2b ul:not(.a2-ck):not(.a2-plan) li{font-size:13.5px;padding:4px 0 4px 20px;position:relative;line-height:1.45}.a2b ul:not(.a2-ck):not(.a2-plan) li.ok::before{content:"✓";position:absolute;left:0;color:var(--ok);font-weight:800}.a2b ul:not(.a2-ck):not(.a2-plan) li.w::before{content:"!";position:absolute;left:4px;color:var(--warn);font-weight:800}
.a2-fh{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.a2-fh h1{margin:4px 0 4px;font-size:22px}.a2-fh .acts{display:flex;gap:8px;flex-wrap:wrap}
.a2-2{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;align-items:start}.a2-2>div>.a2b+.a2b,.a2-2>div>.a2-verd+.a2b,.a2-2>div>.a2-verd+.a2-you,.a2-you+.a2b{margin-top:14px}
.a2-big{display:flex;gap:16px;align-items:center;margin-bottom:8px}.a2-big b{font-size:17px}
.a2-ring{--p:0;width:96px;height:96px;border-radius:50%;flex:none;display:grid;place-items:center;background:conic-gradient(var(--c) calc(var(--p)*1%),var(--surface-2) 0)}.a2-ring b{width:74px;height:74px;border-radius:50%;background:var(--surface);display:grid;place-items:center;font-size:19px}
.a2-pcm{display:flex;gap:14px;align-items:center}.a2-pcm .a2-ring{width:72px;height:72px}.a2-pcm .a2-ring b{width:54px;height:54px;font-size:14px}
.a2-ck{list-style:none;margin:0;padding:0}.a2-ck li{display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:13.5px}.a2-ck i{width:24px;height:24px;border-radius:50%;flex:none;display:grid;place-items:center;font-style:normal;font-size:12px;font-weight:800;background:var(--surface-2);color:var(--muted)}.a2-ck li.ok i{background:var(--ok-bg);color:var(--ok)}.a2-ck li.w i{background:var(--warn-bg);color:var(--warn)}
.a2-you{border:2px solid var(--accent);background:var(--accent-soft)}.a2-yi{display:flex;gap:10px;align-items:center;padding:8px 0;font-size:13.5px;border-bottom:1px solid #cfe9f5}.a2-yi span{width:24px;height:24px;border-radius:50%;background:var(--accent-ink);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:800;flex:none}
.a2-form{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}.a2-form .full{grid-column:1/-1}.a2-save{display:flex;justify-content:flex-end;margin-top:12px}
.a2-grp td{background:var(--surface-2);font-weight:800;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2)}
.a2-plan{list-style:none;margin:0;padding:0}.a2-plan li{display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);font-size:13.5px}.a2-plan b{width:22px;color:var(--muted)}.a2-plan span{flex:1}.a2-plan em{font-style:normal;font-size:12px;font-weight:700;color:var(--accent-ink)}.a2-plan i{font-style:normal;font-size:11.5px;font-weight:800;color:var(--warn)}.a2-plan li.ok i{color:var(--ok)}
.a2-pie{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}
.a2-reg .a2b{margin-bottom:14px}.a2-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:10px 0}
.a2-w{display:flex;gap:10px;align-items:center;padding:5px 0;font-size:13.5px}.a2-w span{flex:1}.a2-w input{width:160px}.a2-w b{width:44px;text-align:right}
.a2-tg{display:flex;align-items:center;justify-content:space-between;padding:7px 0;font-size:13.5px;cursor:pointer}.a2-tg input{position:absolute;opacity:0}.a2-tg i{width:38px;height:22px;border-radius:99px;background:var(--line-2);position:relative;flex:none;transition:.15s}.a2-tg i::after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s}.a2-tg input:checked+i{background:var(--ok)}.a2-tg input:checked+i::after{left:19px}
@media(max-width:900px){.a2-inbox,.a2-2,.a2-why{grid-template-columns:1fr}.a2-k,.a2-g3{grid-template-columns:1fr 1fr}.a2-lst{max-height:none}}`;
document.head.appendChild(css);
})();
