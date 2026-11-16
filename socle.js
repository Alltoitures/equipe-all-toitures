/* Socle de l'application ALL TOITURES : connexion, données Supabase, installation.
   Remplace l'environnement Claude de l'ancien Pilotage (window.claude.use) par Supabase. */
(function () {
  "use strict";
  var SB_URL = "https://nmoqvwzobaqndevikawi.supabase.co";
  var SB_KEY = "sb_publishable_xBlKfYE4V0B9sDxjnHDPDg_TtayYcCc";
  var sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  window.__sb = sb;

  var ENT = null, USER = null, readyRes, ready = new Promise(function (r) { readyRes = r; });
  var clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* ---------------- Données : même interface que l'ancien stockage ---------------- */
  var cache = {}, loaded = {}, loading = {}, subs = {}, channel = null;
  function colMap(col) { return cache[col] || (cache[col] = new Map()); }
  function docSnap(col, id) {
    var m = colMap(col), has = m.has(id), v = m.get(id);
    return { id: id, exists: has, data: function () { return has ? clone(v) : undefined; } };
  }
  function colSnap(col) {
    var docs = []; colMap(col).forEach(function (v, id) { docs.push(docSnap(col, id)); });
    return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (f) { docs.forEach(f); } };
  }
  function notify(col) { (subs[col] || []).forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function loadCol(col) {
    if (loaded[col]) return Promise.resolve();
    if (loading[col]) return loading[col];
    loading[col] = (async function () {
      var m = new Map(), from = 0, step = 1000;
      for (;;) {
        var r = await sb.from("docs").select("id,data").eq("entreprise_id", ENT).eq("col", col).range(from, from + step - 1);
        if (r.error) throw r.error;
        r.data.forEach(function (row) { m.set(row.id, row.data); });
        if (r.data.length < step) break; from += step;
      }
      cache[col] = m; loaded[col] = true;
    })();
    return loading[col];
  }
  function listen() {
    if (channel) return;
    channel = sb.channel("docs-" + ENT).on("postgres_changes", { event: "*", schema: "public", table: "docs", filter: "entreprise_id=eq." + ENT }, function (p) {
      var row = p.eventType === "DELETE" ? p.old : p.new; if (!row || !row.col) return;
      if (!loaded[row.col]) return;
      if (p.eventType === "DELETE") colMap(row.col).delete(row.id); else colMap(row.col).set(row.id, row.data);
      notify(row.col);
    }).subscribe();
  }
  function setPath(o, path, val) {
    var k = path.split("."), t = o;
    for (var i = 0; i < k.length - 1; i++) { if (!t[k[i]] || typeof t[k[i]] !== "object") t[k[i]] = {}; t = t[k[i]]; }
    if (val && val.__delete__ === true) delete t[k[k.length - 1]]; else t[k[k.length - 1]] = val;
  }
  async function write(col, id, data) {
    colMap(col).set(id, clone(data)); notify(col);
    var r = await sb.from("docs").upsert({ entreprise_id: ENT, col: col, id: id, data: data });
    if (r.error) { console.error(r.error); throw { code: "write_failed", message: "Enregistrement impossible : " + (r.error.message || "") }; }
  }
  function docRef(col, id) {
    return {
      id: id,
      get: async function () { await loadCol(col); return docSnap(col, id); },
      set: async function (data) { await loadCol(col); return write(col, id, clone(data) || {}); },
      update: async function (patch) {
        await loadCol(col); var cur = clone(colMap(col).get(id));
        if (cur == null) throw { code: "not_found", message: "Document introuvable" };
        Object.keys(patch || {}).forEach(function (k) { setPath(cur, k, clone(patch[k])); });
        return write(col, id, cur);
      },
      delete: async function () {
        await loadCol(col); colMap(col).delete(id); notify(col);
        var r = await sb.from("docs").delete().eq("entreprise_id", ENT).eq("col", col).eq("id", id);
        if (r.error) throw { code: "write_failed", message: r.error.message };
      },
      onSnapshot: function (cb, err) {
        var f = function () { cb(docSnap(col, id)); };
        (subs[col] = subs[col] || []).push(f);
        loadCol(col).then(f, function (e) { if (err) err(e); });
        return function () { subs[col] = (subs[col] || []).filter(function (x) { return x !== f; }); };
      }
    };
  }
  var db = {
    collection: function (col) {
      return {
        doc: function (id) { return docRef(col, id); },
        get: async function () { await loadCol(col); return colSnap(col); },
        onSnapshot: function (cb, err) {
          var f = function () { cb(colSnap(col)); };
          (subs[col] = subs[col] || []).push(f);
          loadCol(col).then(f, function (e) { if (err) err(e); });
          return function () { subs[col] = (subs[col] || []).filter(function (x) { return x !== f; }); };
        }
      };
    },
    doc: function (path) { var p = path.split("/"); return docRef(p[0], p.slice(1).join("/")); }
  };

  /* Fonctions pas encore branchées hors de Claude : la page affiche alors son message « non accessible » */
  window.claude = {
    use: async function (cap) {
      if (cap === "db") { await ready; listen(); return db; }
      if (cap === "mcp") { await ready; return window.__ms && window.__ms.configured ? window.__ms : null; }
      return null;
    }
  };

  /* ---------------- Écran de connexion ---------------- */
  var css = document.createElement("style");
  css.textContent = ".sx-ov{position:fixed;inset:0;z-index:500;background:#0b1921;display:grid;place-items:center;padding:16px;font-family:inherit}" +
    ".sx-bx{background:#fff;color:#0b1921;border-radius:16px;padding:28px 26px;width:min(400px,100%);display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.35)}" +
    ".sx-bx h1{font-size:22px;margin:0}.sx-bx p{margin:0;font-size:14px;color:#4b5b66;line-height:1.5}.sx-bx label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:700}" +
    ".sx-bx input{padding:11px 12px;border:1px solid #c9d3da;border-radius:9px;font-size:15px}.sx-bx button{padding:12px;border:0;border-radius:9px;font-size:15px;font-weight:700;cursor:pointer;background:#0c6ea8;color:#fff}" +
    ".sx-bx button.sx-l{background:none;color:#0c6ea8;padding:4px;font-weight:600;font-size:13px}.sx-err{color:#b42318;font-size:13px;min-height:1em}.sx-logo{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.02em}" +
    ".sx-out{position:fixed;left:12px;bottom:4px;z-index:90;background:none;border:0;padding:2px 8px;font-size:11px;color:#8fa3b0;cursor:pointer;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sx-out:hover{color:#fff}@media(max-width:900px){.sx-out{left:auto;right:8px;bottom:6px;color:#4b5b66;background:rgba(255,255,255,.9);border-radius:999px}}" +
    ".sx-imp{position:fixed;inset:0;z-index:400;background:rgba(11,25,33,.55);display:grid;place-items:center;padding:16px}";
  document.head.appendChild(css);

  var LOGO = '<svg width="34" height="24" viewBox="0 0 34 24" aria-hidden="true"><path d="M2 22 17 4l15 18" fill="none" stroke="#0c6ea8" stroke-width="3.2" stroke-linejoin="round"/><path d="M9 22 17 12l8 10" fill="none" stroke="#5fb3e4" stroke-width="3.2" stroke-linejoin="round"/></svg>';

  function loginScreen(msg) {
    var mode = "login";
    var w = document.createElement("div"); w.className = "sx-ov"; document.body.appendChild(w);
    function draw() {
      w.innerHTML = '<form class="sx-bx"><div class="sx-logo">' + LOGO + '<span>ALL TOITURES · Pilotage</span></div>' +
        '<h1>' + (mode === "login" ? "Connexion" : "Créer mon accès") + '</h1>' +
        (mode === "signup" ? '<p>Réservé aux personnes invitées par l\'entreprise. Choisissez votre mot de passe.</p>' : "") +
        '<label>E-mail<input type="email" name="e" autocomplete="username" required></label>' +
        '<label>Mot de passe<input type="password" name="p" autocomplete="' + (mode === "login" ? "current-password" : "new-password") + '" minlength="8" required></label>' +
        '<div class="sx-err">' + esc(msg || "") + '</div><button type="submit">' + (mode === "login" ? "Se connecter" : "Créer mon accès") + '</button>' +
        '<button type="button" class="sx-l" data-sw>' + (mode === "login" ? "Première connexion ? Créer mon accès" : "J'ai déjà un accès : me connecter") + '</button>' +
        (mode === "login" ? '<button type="button" class="sx-l" data-fg>Mot de passe oublié</button>' : "") + '</form>';
      w.querySelector("[data-sw]").onclick = function () { mode = mode === "login" ? "signup" : "login"; msg = ""; draw(); };
      var fg = w.querySelector("[data-fg]"); if (fg) fg.onclick = async function () {
        var e = w.querySelector("[name=e]").value.trim(); if (!e) { msg = "Saisissez d'abord votre e-mail."; draw(); return; }
        var r = await sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + location.pathname });
        msg = r.error ? "Envoi impossible : " + r.error.message : "Un lien de réinitialisation vient d'être envoyé à " + e + "."; draw();
      };
      w.querySelector("form").onsubmit = async function (ev) {
        ev.preventDefault(); var e = w.querySelector("[name=e]").value.trim(), p = w.querySelector("[name=p]").value;
        var b = w.querySelector("button[type=submit]"); b.disabled = true; b.textContent = "Patientez…";
        var r = mode === "login" ? await sb.auth.signInWithPassword({ email: e, password: p }) : await sb.auth.signUp({ email: e, password: p });
        if (r.error) { msg = /Invalid login/i.test(r.error.message) ? "E-mail ou mot de passe incorrect." : r.error.message; draw(); return; }
        if (mode === "signup" && !r.data.session) { var r2 = await sb.auth.signInWithPassword({ email: e, password: p }); if (r2.error) { msg = "Accès créé. Validez le lien reçu par e-mail puis connectez-vous."; mode = "login"; draw(); return; } }
        w.remove(); start();
      };
    }
    draw();
  }

  async function newPassword() {
    return new Promise(function (res) {
      var w = document.createElement("div"); w.className = "sx-ov"; document.body.appendChild(w);
      w.innerHTML = '<form class="sx-bx"><div class="sx-logo">' + LOGO + '<span>ALL TOITURES · Pilotage</span></div><h1>Nouveau mot de passe</h1><label>Mot de passe<input type="password" name="p" minlength="8" required autocomplete="new-password"></label><div class="sx-err"></div><button type="submit">Enregistrer</button></form>';
      w.querySelector("form").onsubmit = async function (ev) {
        ev.preventDefault(); var r = await sb.auth.updateUser({ password: w.querySelector("[name=p]").value });
        if (r.error) { w.querySelector(".sx-err").textContent = r.error.message; return; } w.remove(); res();
      };
    });
  }

  /* ---------------- Import de la sauvegarde du Pilotage ---------------- */
  function rowsFrom(o) {
    var rows = [];
    if (Array.isArray(o)) return o.filter(function (r) { return r && r.col && r.id; });
    if (o && o.collections) {
      Object.keys(o.collections).forEach(function (c) { var m = o.collections[c] || {}; Object.keys(m).forEach(function (id) { rows.push({ col: c, id: id, data: m[id] }); }); });
      Object.keys(o.docs || {}).forEach(function (p) { if (o.docs[p]) { var s = p.split("/"); rows.push({ col: s[0], id: s.slice(1).join("/"), data: o.docs[p] }); } });
    }
    return rows;
  }
  function importScreen() {
    return new Promise(function (res) {
      var w = document.createElement("div"); w.className = "sx-imp"; document.body.appendChild(w);
      w.innerHTML = '<div class="sx-bx"><h1>Récupérer vos données</h1><p>L\'application est vide. Choisissez le fichier de données du Pilotage (fichier .json) pour y copier vos dossiers, devis, factures, clients, ouvrages et produits.</p>' +
        '<label>Fichier<input type="file" accept=".json,application/json"></label><div class="sx-err"></div><button type="button" class="sx-l" data-skip>Plus tard</button></div>';
      w.querySelector("[data-skip]").onclick = function () { w.remove(); res(); };
      w.querySelector("input").onchange = async function (ev) {
        var f = ev.target.files[0], er = w.querySelector(".sx-err"); if (!f) return;
        try {
          var rows = rowsFrom(JSON.parse(await f.text())); if (!rows.length) throw new Error("Fichier non reconnu.");
          for (var i = 0; i < rows.length; i += 200) {
            er.style.color = "#0b1921"; er.textContent = "Copie en cours… " + Math.min(i + 200, rows.length) + " / " + rows.length;
            var r = await sb.from("docs").upsert(rows.slice(i, i + 200).map(function (x) { return { entreprise_id: ENT, col: x.col, id: String(x.id), data: x.data || {} }; }));
            if (r.error) throw r.error;
          }
          er.textContent = rows.length + " éléments copiés."; setTimeout(function () { w.remove(); res(); }, 800);
        } catch (e) { er.style.color = ""; er.textContent = "Import impossible : " + (e.message || e); }
      };
    });
  }

  /* ---------------- Démarrage ---------------- */
  async function start() {
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { loginScreen(); return; }
    USER = s.user;
    var m = await sb.from("membres").select("entreprise_id").limit(1);
    if (m.error || !m.data.length) {
      await sb.auth.signOut();
      loginScreen("Ce compte (" + USER.email + ") n'est rattaché à aucune entreprise. Demandez une invitation.");
      return;
    }
    ENT = m.data[0].entreprise_id;
    var c = await sb.from("docs").select("id", { count: "exact", head: true }).eq("entreprise_id", ENT);
    if (!c.error && c.count === 0) await importScreen();
    var out = document.createElement("button"); out.className = "sx-out"; out.type = "button"; out.title = "Se déconnecter";
    out.textContent = "Déconnexion · " + USER.email;
    out.onclick = async function () { await sb.auth.signOut(); location.reload(); };
    document.body.appendChild(out);
    if (window.__msPaint) window.__msPaint();
    readyRes();
  }
  sb.auth.onAuthStateChange(function (ev) { if (ev === "PASSWORD_RECOVERY") newPassword(); });
  /* Fenêtre de connexion Microsoft : ne pas lancer l'application dedans */
  var MS_POPUP = !!window.opener && /[#&?](code|error)=/.test(location.hash + location.search);
  function go() {
    if (MS_POPUP) { document.documentElement.innerHTML = "<body style='font-family:sans-serif;padding:24px'>Connexion Microsoft en cours…</body>"; return; } start().catch(function (e) { console.error(e); loginScreen("Connexion au serveur impossible. Vérifiez votre réseau puis réessayez."); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();

  /* ---------------- Installation sur l'ordinateur / le téléphone ---------------- */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
