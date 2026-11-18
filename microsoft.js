/* Liaison Microsoft 365 (Outlook, OneDrive / SharePoint) de l'application Pilotage.
   Remplace le connecteur Claude « Microsoft 365 » : mêmes noms d'outils, mêmes réponses, via Microsoft Graph. */
(function () {
  "use strict";
  var MS_CLIENT = "5afd2a12-7c1d-4041-9a08-6f480e343b26";
  var MS_TENANT = "f7c2d61b-b7b9-4c0c-ac90-3ed776b9b9de";
  var SCOPES = ["User.Read", "Mail.ReadWrite", "Files.ReadWrite.All", "Sites.ReadWrite.All"];
  var G = "https://graph.microsoft.com/v1.0";
  var configured = MS_CLIENT.indexOf("__") !== 0;
  var pca = null, ready = null, stale = false;

  function err(code, message) { var e = new Error(message); e.code = code; return e; }

  function init() {
    if (ready) return ready;
    ready = (async function () {
      if (!configured || !window.msal) return null;
      pca = new msal.PublicClientApplication({
        auth: { clientId: MS_CLIENT, authority: "https://login.microsoftonline.com/" + MS_TENANT, redirectUri: location.origin + "/" },
        cache: { cacheLocation: "localStorage" }
      });
      await pca.initialize();
      try { await pca.handleRedirectPromise(); } catch (e) { console.warn(e); }
      return pca;
    })();
    return ready;
  }
  function account() { var a = pca && pca.getAllAccounts(); return a && a.length ? a[0] : null; }

  async function token(interactive) {
    await init();
    if (!pca) throw err("unavailable", "Microsoft 365 n'est pas encore relié à l'application.");
    var acc = account();
    if (acc) {
      try { var tk = (await pca.acquireTokenSilent({ scopes: SCOPES, account: acc })).accessToken; if (stale) { stale = false; paint(); } return tk; } catch (e) { if (!interactive) console.warn(e); }
    }
    if (interactive) { await pca.acquireTokenRedirect({ scopes: SCOPES, account: acc || undefined, prompt: acc ? undefined : "select_account", redirectStartPage: location.href.split("#")[0] }); return new Promise(function () {}); }
    stale = true; paint();
    throw err("consent", "Connectez Microsoft 365 (bouton en bas à gauche) pour utiliser Outlook et OneDrive.");
  }

  async function g(path, opt) {
    opt = opt || {};
    var t = await token(false);
    var h = Object.assign({ Authorization: "Bearer " + t }, opt.headers || {});
    if (opt.json !== undefined) { h["Content-Type"] = "application/json"; opt.body = JSON.stringify(opt.json); }
    var r = await fetch(path.indexOf("http") === 0 ? path : G + path, { method: opt.method || "GET", headers: h, body: opt.body });
    if (r.status === 204) return null;
    var j = null; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { var m = j && j.error && j.error.message || ("Erreur " + r.status); var e = err(r.status === 409 ? "conflict" : r.status === 403 ? "denied" : "graph_" + r.status, m); throw e; }
    return j;
  }
  async function all(path) { var out = [], next = path; for (var i = 0; next && i < 20; i++) { var j = await g(next); out = out.concat(j.value || []); next = j["@odata.nextLink"]; } return out; }
  var segs = function (p) { return p.split("/").filter(Boolean).map(encodeURIComponent).join("/"); };
  function b64ToBytes(b64) { var s = atob(b64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

  async function tokenCal(interactive) {
    await init();
    if (!pca) throw err("unavailable", "Microsoft 365 n'est pas encore relié à l'application.");
    var acc = account(), sc = ["Calendars.Read"];
    if (acc) { try { return (await pca.acquireTokenSilent({ scopes: sc, account: acc })).accessToken; } catch (e) {} }
    if (interactive) { await pca.acquireTokenRedirect({ scopes: SCOPES.concat(sc), account: acc || undefined, redirectStartPage: location.href.split("#")[0] }); return new Promise(function () {}); }
    throw err("calendar_consent", "Autorisez la lecture de l'agenda Outlook.");
  }
  window.msCalendarConnect = function () { return tokenCal(true); };
  var tools = {
    outlook_calendar_search: async function (a) {
      var t = await tokenCal(false), d0 = String(a.afterDateTime || new Date().toISOString().slice(0, 10) + "T00:00:00"), d1 = String(a.beforeDateTime || d0.slice(0, 10) + "T23:59:59");
      var r = await fetch(G + "/me/calendarView?startDateTime=" + encodeURIComponent(d0) + "&endDateTime=" + encodeURIComponent(d1) + "&$top=" + (a.limit || 25) + "&$orderby=start/dateTime&$select=subject,start,end,location,isAllDay,webLink", { headers: { Authorization: "Bearer " + t, Prefer: 'outlook.timezone="Europe/Paris"' } });
      var j = null; try { j = await r.json(); } catch (_) {}
      if (!r.ok) throw err("graph_" + r.status, (j && j.error && j.error.message) || "Agenda indisponible");
      var ev = (j.value || []).map(function (x) { return { subject: x.subject, start: x.start, end: x.end, location: x.location, isAllDay: x.isAllDay, webLink: x.webLink }; });
      return { payload: ev, content: [{ type: "text", text: JSON.stringify(ev) }] };
    },
    onedrive_thumbs: async function (a) {
      var ids = (a.ids || []).slice(0, 60), out = {};
      for (var i = 0; i < ids.length; i += 20) {
        var reqs = ids.slice(i, i + 20).map(function (id, k) { return { id: String(k), method: "GET", url: "/drives/" + a.driveId + "/items/" + id + "/thumbnails/0/medium" }; });
        var b = await g("/$batch", { method: "POST", json: { requests: reqs } });
        (b.responses || []).forEach(function (r) { var id = ids[i + Number(r.id)]; if (r.status === 200 && r.body && r.body.url) out[id] = r.body.url; });
      }
      return { payload: out, content: [{ type: "text", text: JSON.stringify(out) }] };
    },
    outlook_create_draft: async function (a) {
      var m = await g("/me/messages", { method: "POST", json: {
        subject: a.subject || "",
        body: { contentType: /html/i.test(a.bodyType || "") ? "HTML" : "Text", content: a.body || "" },
        toRecipients: (a.to || []).map(function (x) { return { emailAddress: { address: x } }; }),
        ccRecipients: (a.cc || []).map(function (x) { return { emailAddress: { address: x } }; })
      } });
      return { payload: { id: m.id, webLink: m.webLink }, content: [{ type: "text", text: "Brouillon créé : " + m.webLink }] };
    },
    read_resource: async function (a) {
      var u = String(a.uri || ""), mt = u.match(/^file:\/\/\/([^\/]+)\/?(.*)$/);
      if (!mt) throw err("bad_request", "Adresse non reconnue : " + u);
      var drive = mt[1], rest = decodeURIComponent(mt[2] || "");
      var base = !rest ? "/drives/" + drive + "/root" : /^[A-Z0-9]{34}$/.test(rest) ? "/drives/" + drive + "/items/" + rest : "/drives/" + drive + "/root:/" + segs(rest) + ":";
      var items = await all(base + "/children?$top=200&$select=id,name,folder,file,size,webUrl,parentReference");
      var text = items.map(function (x) {
        return x.name + (x.folder ? " (folder, " + (x.folder.childCount || 0) + " items)" : " (file, " + (x.size || 0) + " bytes)") + " file:///" + drive + "/" + x.id;
      }).join("\n");
      return { payload: text, content: [{ type: "text", text: text }] };
    },
    sharepoint_create_folder: async function (a) {
      var j = await g("/drives/" + a.driveId + "/items/" + a.parentItemId + "/children", { method: "POST", json: { name: a.name, folder: {}, "@microsoft.graph.conflictBehavior": a.conflictBehavior || "fail" } });
      return { payload: { itemId: j.id, id: j.id, webUrl: j.webUrl, name: j.name }, content: [{ type: "text", text: "itemId: " + j.id + "\nwebUrl: " + j.webUrl }] };
    },
    sharepoint_folder_search: async function (a) {
      var drive = a.driveId || window.__OD_DRIVE || "b!4efKqbnV-EKC_9Z0oks90n3mvlMiPLJFjdsjFcMnwiyAgT6m5zLnSriFuukUJq2m";
      var q = String(a.name || "").replace(/'/g, "''"), lim = a.limit || 30, off = a.offset || 0;
      var items = (await all("/drives/" + drive + "/root/search(q='" + encodeURIComponent(q) + "')?$top=200&$select=id,name,folder,webUrl,parentReference"))
        .filter(function (x) { return x.folder; })
        .map(function (x) { return { id: x.id, name: x.name, webUrl: x.webUrl, driveId: (x.parentReference && x.parentReference.driveId) || drive, path: x.parentReference && x.parentReference.path }; });
      var page = items.slice(off, off + lim);
      if (off + lim < items.length && page.length) page[page.length - 1].nextOffset = off + lim;
      return { payload: page, content: [{ type: "text", text: JSON.stringify(page) }] };
    },
    /* Pilotage › dossier chantier : contenu d'un dossier OneDrive (par lien ou par id), avec miniatures et lien de téléchargement */
    onedrive_list: async function (a) {
      var drive = a.driveId, item = a.itemId;
      if (!item && a.url) {
        var u = String(a.url).replace(/ /g, "%20");
        var b64 = btoa(unescape(encodeURIComponent(u))).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
        var it = await g("/shares/u!" + b64 + "/driveItem?$select=id,parentReference");
        item = it.id; drive = it.parentReference && it.parentReference.driveId;
      }
      if (!drive || !item) throw err("bad_request", "Dossier OneDrive introuvable");
      var L = await all("/drives/" + drive + "/items/" + item + "/children?$top=200&$expand=thumbnails");
      var items = L.map(function (x) {
        var th = x.thumbnails && x.thumbnails[0];
        return { id: x.id, name: x.name, folder: !!x.folder, n: x.folder ? x.folder.childCount : null, mime: x.file && x.file.mimeType, size: x.size,
          webUrl: x.webUrl, dl: x["@microsoft.graph.downloadUrl"] || null, thumb: th && th.medium && th.medium.url || null, big: th && th.large && th.large.url || null,
          date: x.lastModifiedDateTime };
      });
      return { payload: { driveId: drive, itemId: item, items: items }, content: [{ type: "text", text: JSON.stringify(items.length) }] };
    },
    onedrive_preview: async function (a) {
      var j = await g("/drives/" + a.driveId + "/items/" + a.itemId + "/preview", { method: "POST", json: {} });
      return { payload: { url: j && (j.getUrl || j.postUrl) }, content: [{ type: "text", text: (j && j.getUrl) || "" }] };
    },
    sharepoint_upload_file: async function (a) {
      var t = await token(false);
      var url = G + "/drives/" + a.driveId + "/items/" + a.parentItemId + ":/" + encodeURIComponent(a.filename) + ":/content?@microsoft.graph.conflictBehavior=" + (a.conflictBehavior || "replace");
      var r = await fetch(url, { method: "PUT", headers: { Authorization: "Bearer " + t, "Content-Type": "application/octet-stream" }, body: b64ToBytes(a.contentBase64 || "") });
      var j = null; try { j = await r.json(); } catch (_) {}
      if (!r.ok) throw err("graph_" + r.status, (j && j.error && j.error.message) || "Téléversement impossible");
      return { payload: { itemId: j.id, id: j.id, webUrl: j.webUrl, name: j.name }, content: [{ type: "text", text: "itemId: " + j.id + "\nwebUrl: " + j.webUrl }] };
    }
  };

  window.__ms = {
    configured: configured,
    connected: function () { return !!account(); },
    connect: function () { return token(true); },
    callTool: async function (server, tool, args) {
      if (server === "Microsoft 365" && tools[tool]) return tools[tool](args || {});
      throw err("unavailable", "Fonction pas encore disponible dans l'application : " + server + " / " + tool);
    }
  };

  /* Bouton « Microsoft 365 » en bas de l'écran */
  var pill = null;
  function paint() {
    if (!configured) return;
    if (!pill) {
      pill = document.createElement("button"); pill.type = "button"; pill.className = "sx-ms";
      pill.onclick = async function () { if (account() && !stale) return; pill.textContent = "Ouverture de la connexion Microsoft…"; try { await token(true); } catch (e) { console.error(e); pill.textContent = "Connexion impossible : " + (e.message || e); } };
      var st = document.createElement("style");
      st.textContent = ".sx-ms{display:block;width:100%;text-align:left;margin-top:6px;background:none;border:0;padding:4px 10px;font-size:11px;cursor:pointer;color:#7E95A6;white-space:normal}.sx-ms:hover{color:#fff}.sx-ms.off{color:#f5b041;font-weight:700}";
      document.head.appendChild(st); var foot = document.querySelector(".side-foot"); (foot || document.body).appendChild(pill);
    }
    var a = account();
    pill.className = "sx-ms" + (a && !stale ? "" : " off");
    pill.textContent = a ? (stale ? "Reconnecter Microsoft 365" : "Microsoft 365 connecté") : "Connecter Microsoft 365 (Outlook, OneDrive)";
    pill.title = a ? a.username : "Nécessaire pour les brouillons Outlook et le rangement dans OneDrive";
  }
  window.__msPaint = function () { init().then(paint); };
  /* Retour de la page de connexion Microsoft : traité dès le chargement */
  init().catch(function (e) { console.error(e); });
})();
