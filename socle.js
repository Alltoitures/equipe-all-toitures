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

  /* Connecteurs : Microsoft 365 (microsoft.js) et base de l'application équipes (pont sécurisé) */
  var EQ_KEY = "sb_publishable_pbvGqlBRgxJj5Or6ePehkg_t-igOJZ7", pontEq = null;
  async function equipesSql(query) {
    if (!pontEq) {
      var r = await sb.from("ponts").select("config").eq("entreprise_id", ENT).eq("nom", "equipes").limit(1);
      if (r.error || !r.data.length) { var e0 = new Error("Application équipes non reliée."); e0.code = "unavailable"; throw e0; }
      pontEq = r.data[0].config;
    }
    var res = await fetch(pontEq.url + "/rest/v1/rpc/pilotage_requete", { method: "POST", headers: { apikey: EQ_KEY, Authorization: "Bearer " + EQ_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ jeton: pontEq.jeton, requete: query }) });
    var j = null; try { j = await res.json(); } catch (_) {}
    if (!res.ok) { var e = new Error((j && j.message) || "Application équipes indisponible"); e.code = "equipes_" + res.status; throw e; }
    var txt = JSON.stringify(j || []);
    return { payload: { result: txt }, content: [{ type: "text", text: txt }] };
  }
  window.equipesPhotos = async function (pid, limit) {
    if (!pontEq) { await equipesSql("select 1 as ok"); }
    var r = await fetch(pontEq.url + "/functions/v1/pilotage-photos", { method: "POST", headers: { apikey: EQ_KEY, Authorization: "Bearer " + EQ_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ jeton: pontEq.jeton, pilotage_id: pid, limit: limit || 24 }) });
    if (!r.ok) { var e = new Error("Photos indisponibles"); e.code = "photos_" + r.status; throw e; }
    var j = await r.json(); return j.photos || [];
  };
  var mcp = {
    callTool: async function (server, tool, args) {
      if (server === "Supabase" && tool === "execute_sql" && args && args.project_id === "mvuwaujybchrwhocxtlk") return equipesSql(args.query);
      if (server === "Microsoft 365" && window.__ms && window.__ms.configured) return window.__ms.callTool(server, tool, args);
      var e = new Error("Fonction pas encore disponible dans l'application : " + server + " / " + tool); e.code = "unavailable"; throw e;
    }
  };

  /* Fonctions pas encore branchées hors de Claude : la page affiche alors son message « non accessible » */
  window.claude = {
    use: async function (cap) {
      if (cap === "db") { await ready; listen(); return db; }
      if (cap === "mcp") { await ready; return mcp; }
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
    ".sx-out{display:block;width:100%;text-align:left;background:none;border:0;padding:4px 10px;font-size:11px;color:#7E95A6;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sx-out:hover{color:#fff}" +
    ".sx-logo .sx-lg{height:30px;width:auto;color:#0b1921;display:block}.sx-logo span{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#768593;border-left:1px solid #dce3ea;padding-left:10px}" +
    ".sx-imp{position:fixed;inset:0;z-index:400;background:rgba(11,25,33,.55);display:grid;place-items:center;padding:16px}";
  document.head.appendChild(css);

  var LOGO = "<svg class=\"sx-lg\" viewBox=\"0 0 1610.16 208.405\" role=\"img\" aria-label=\"ALL TOITURES\" xmlns=\"http://www.w3.org/2000/svg\"><defs><clipPath id=\"sxl-clip-0\"><path clip-rule=\"nonzero\" d=\"M 1524 42 L 1607.449219 42 L 1607.449219 168 L 1524 168 Z M 1524 42 \"/></clipPath><clipPath id=\"sxl-clip-1\"><path clip-rule=\"nonzero\" d=\"M 1.875 0 L 267 0 L 267 207.8125 L 1.875 207.8125 Z M 1.875 0 \"/></clipPath><clipPath id=\"sxl-clip-2\"><path clip-rule=\"nonzero\" d=\"M 162 0 L 335 0 L 335 207.8125 L 162 207.8125 Z M 162 0 \"/></clipPath><clipPath id=\"sxl-clip-3\"><path clip-rule=\"nonzero\" d=\"M 229 0 L 402 0 L 402 207.8125 L 229 207.8125 Z M 229 0 \"/></clipPath></defs><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 514.59375 119.953125 L 553.8125 119.953125 L 538.839844 79.035156 C 538.160156 77.21875 537.40625 75.078125 536.585938 72.609375 C 535.761719 70.144531 534.953125 67.464844 534.160156 64.570312 C 533.363281 67.464844 532.585938 70.160156 531.820312 72.652344 C 531.054688 75.148438 530.304688 77.332031 529.566406 79.203125 Z M 594.222656 166.40625 L 576.527344 166.40625 C 574.542969 166.40625 572.910156 165.910156 571.636719 164.917969 C 570.359375 163.925781 569.4375 162.691406 568.871094 161.214844 L 559.683594 136.117188 L 508.722656 136.117188 L 499.535156 161.214844 C 499.082031 162.519531 498.1875 163.710938 496.855469 164.789062 C 495.519531 165.867188 493.890625 166.40625 491.960938 166.40625 L 474.183594 166.40625 L 522.503906 43.386719 L 545.898438 43.386719 Z M 594.222656 166.40625 \"/><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 629.78125 147.519531 L 679.039062 147.519531 L 679.039062 166.40625 L 606.898438 166.40625 L 606.898438 43.386719 L 629.78125 43.386719 Z M 629.78125 147.519531 \"/><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 717.75 147.519531 L 767.007812 147.519531 L 767.007812 166.40625 L 694.863281 166.40625 L 694.863281 43.386719 L 717.75 43.386719 Z M 717.75 147.519531 \"/><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 902.359375 43.386719 L 902.359375 62.1875 L 865.351562 62.1875 L 865.351562 166.40625 L 842.464844 166.40625 L 842.464844 62.1875 L 805.289062 62.1875 L 805.289062 43.386719 Z M 902.359375 43.386719 \"/><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 1004.789062 104.898438 C 1004.789062 98.148438 1003.894531 92.09375 1002.109375 86.734375 C 1000.320312 81.375 997.753906 76.820312 994.410156 73.078125 C 991.058594 69.335938 986.992188 66.472656 982.199219 64.484375 C 977.40625 62.5 972.003906 61.507812 965.992188 61.507812 C 959.980469 61.507812 954.5625 62.5 949.746094 64.484375 C 944.921875 66.472656 940.824219 69.335938 937.449219 73.078125 C 934.078125 76.820312 931.480469 81.375 929.667969 86.734375 C 927.851562 92.09375 926.945312 98.148438 926.945312 104.898438 C 926.945312 111.644531 927.851562 117.699219 929.667969 123.0625 C 931.480469 128.417969 934.078125 132.957031 937.449219 136.671875 C 940.824219 140.386719 944.921875 143.238281 949.746094 145.222656 C 954.5625 147.207031 959.980469 148.199219 965.992188 148.199219 C 972.003906 148.199219 977.40625 147.207031 982.199219 145.222656 C 986.992188 143.238281 991.058594 140.386719 994.410156 136.671875 C 997.753906 132.957031 1000.320312 128.417969 1002.109375 123.0625 C 1003.894531 117.699219 1004.789062 111.644531 1004.789062 104.898438 M 1028.269531 104.898438 C 1028.269531 113.914062 1026.765625 122.265625 1023.761719 129.949219 C 1020.753906 137.636719 1016.527344 144.285156 1011.085938 149.902344 C 1005.640625 155.515625 999.085938 159.898438 991.429688 163.042969 C 983.773438 166.191406 975.292969 167.765625 965.992188 167.765625 C 956.691406 167.765625 948.199219 166.191406 940.515625 163.042969 C 932.828125 159.898438 926.25 155.515625 920.777344 149.902344 C 915.304688 144.285156 911.0625 137.636719 908.058594 129.949219 C 905.050781 122.265625 903.550781 113.914062 903.550781 104.898438 C 903.550781 95.878906 905.050781 87.527344 908.058594 79.84375 C 911.0625 72.15625 915.304688 65.507812 920.777344 59.890625 C 926.25 54.277344 932.828125 49.894531 940.515625 46.75 C 948.199219 43.601562 956.691406 42.027344 965.992188 42.027344 C 975.292969 42.027344 983.773438 43.613281 991.429688 46.789062 C 999.085938 49.96875 1005.640625 54.347656 1011.085938 59.933594 C 1016.527344 65.523438 1020.753906 72.15625 1023.761719 79.84375 C 1026.765625 87.527344 1028.269531 95.878906 1028.269531 104.898438 \"/><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 1072.082031 166.40625 L 1049.113281 166.40625 L 1049.113281 43.386719 L 1072.082031 43.386719 Z M 1072.082031 166.40625 \"/><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 1186.421875 43.386719 L 1186.421875 62.1875 L 1149.414062 62.1875 L 1149.414062 166.40625 L 1126.527344 166.40625 L 1126.527344 62.1875 L 1089.351562 62.1875 L 1089.351562 43.386719 Z M 1186.421875 43.386719 \"/><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 1250.480469 147.945312 C 1254.902344 147.945312 1258.859375 147.207031 1262.347656 145.734375 C 1265.835938 144.257812 1268.785156 142.1875 1271.195312 139.523438 C 1273.605469 136.855469 1275.449219 133.625 1276.722656 129.824219 C 1278 126.023438 1278.640625 121.769531 1278.640625 117.0625 L 1278.640625 43.386719 L 1301.523438 43.386719 L 1301.523438 117.0625 C 1301.523438 124.378906 1300.347656 131.140625 1297.992188 137.351562 C 1295.640625 143.5625 1292.25 148.921875 1287.828125 153.429688 C 1283.402344 157.941406 1278.042969 161.457031 1271.746094 163.980469 C 1265.453125 166.503906 1258.363281 167.765625 1250.480469 167.765625 C 1242.59375 167.765625 1235.507812 166.503906 1229.210938 163.980469 C 1222.914062 161.457031 1217.570312 157.941406 1213.175781 153.429688 C 1208.777344 148.921875 1205.402344 143.5625 1203.050781 137.351562 C 1200.695312 131.140625 1199.519531 124.378906 1199.519531 117.0625 L 1199.519531 43.386719 L 1222.40625 43.386719 L 1222.40625 116.976562 C 1222.40625 121.683594 1223.042969 125.9375 1224.320312 129.738281 C 1225.59375 133.539062 1227.425781 136.785156 1229.808594 139.480469 C 1232.1875 142.171875 1235.125 144.257812 1238.613281 145.734375 C 1242.101562 147.207031 1246.054688 147.945312 1250.480469 147.945312 \"/><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 1348.484375 101.917969 L 1362.777344 101.917969 C 1367.085938 101.917969 1370.84375 101.378906 1374.050781 100.304688 C 1377.253906 99.226562 1379.890625 97.738281 1381.960938 95.835938 C 1384.03125 93.9375 1385.578125 91.683594 1386.597656 89.074219 C 1387.621094 86.464844 1388.128906 83.601562 1388.128906 80.480469 C 1388.128906 74.242188 1386.074219 69.449219 1381.960938 66.101562 C 1377.847656 62.757812 1371.566406 61.082031 1363.117188 61.082031 L 1348.484375 61.082031 Z M 1348.484375 118.339844 L 1348.484375 166.40625 L 1325.597656 166.40625 L 1325.597656 43.386719 L 1363.117188 43.386719 C 1371.511719 43.386719 1378.699219 44.253906 1384.683594 45.980469 C 1390.667969 47.714844 1395.574219 50.136719 1399.402344 53.257812 C 1403.230469 56.375 1406.039062 60.105469 1407.824219 64.441406 C 1409.609375 68.78125 1410.503906 73.5625 1410.503906 78.777344 C 1410.503906 82.917969 1409.894531 86.832031 1408.675781 90.519531 C 1407.453125 94.207031 1405.695312 97.550781 1403.398438 100.558594 C 1401.101562 103.566406 1398.265625 106.203125 1394.890625 108.46875 C 1391.519531 110.738281 1387.675781 112.554688 1383.367188 113.914062 C 1386.257812 115.558594 1388.753906 117.914062 1390.851562 120.976562 L 1421.648438 166.40625 L 1401.0625 166.40625 C 1399.074219 166.40625 1397.386719 166.007812 1396 165.214844 C 1394.609375 164.421875 1393.433594 163.285156 1392.46875 161.8125 L 1366.605469 122.421875 C 1365.640625 120.949219 1364.574219 119.898438 1363.414062 119.273438 C 1362.25 118.652344 1360.535156 118.339844 1358.269531 118.339844 Z M 1348.484375 118.339844 \"/><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 1513.871094 43.386719 L 1513.871094 61.59375 L 1459.335938 61.59375 L 1459.335938 95.707031 L 1502.300781 95.707031 L 1502.300781 113.320312 L 1459.335938 113.320312 L 1459.335938 148.113281 L 1513.871094 148.113281 L 1513.871094 166.40625 L 1436.28125 166.40625 L 1436.28125 43.386719 Z M 1513.871094 43.386719 \"/><g clip-path=\"url(#sxl-clip-0)\"><path fill-rule=\"nonzero\" fill=\"currentColor\" fill-opacity=\"1\" d=\"M 1599.625 65.761719 C 1599 67.011719 1598.277344 67.890625 1597.453125 68.398438 C 1596.632812 68.910156 1595.652344 69.164062 1594.519531 69.164062 C 1593.382812 69.164062 1592.109375 68.726562 1590.691406 67.847656 C 1589.273438 66.96875 1587.597656 65.988281 1585.671875 64.910156 C 1583.742188 63.835938 1581.488281 62.855469 1578.910156 61.976562 C 1576.328125 61.097656 1573.28125 60.660156 1569.761719 60.660156 C 1566.585938 60.660156 1563.820312 61.039062 1561.46875 61.804688 C 1559.113281 62.574219 1557.128906 63.636719 1555.511719 64.996094 C 1553.898438 66.359375 1552.691406 67.988281 1551.898438 69.890625 C 1551.101562 71.789062 1550.707031 73.875 1550.707031 76.140625 C 1550.707031 79.035156 1551.515625 81.445312 1553.132812 83.371094 C 1554.75 85.300781 1556.886719 86.945312 1559.554688 88.308594 C 1562.21875 89.667969 1565.253906 90.890625 1568.65625 91.964844 C 1572.0625 93.042969 1575.535156 94.191406 1579.078125 95.410156 C 1582.621094 96.632812 1586.097656 98.046875 1589.5 99.664062 C 1592.902344 101.28125 1595.9375 103.324219 1598.601562 105.789062 C 1601.269531 108.257812 1603.410156 111.277344 1605.027344 114.851562 C 1606.640625 118.421875 1607.449219 122.761719 1607.449219 127.867188 C 1607.449219 133.425781 1606.5 138.628906 1604.601562 143.476562 C 1602.699219 148.328125 1599.921875 152.554688 1596.261719 156.15625 C 1592.605469 159.757812 1588.140625 162.59375 1582.863281 164.660156 C 1577.589844 166.730469 1571.550781 167.765625 1564.742188 167.765625 C 1560.828125 167.765625 1556.972656 167.382812 1553.175781 166.617188 C 1549.371094 165.851562 1545.730469 164.761719 1542.242188 163.34375 C 1538.753906 161.925781 1535.492188 160.222656 1532.457031 158.238281 C 1529.421875 156.253906 1526.714844 154.042969 1524.332031 151.601562 L 1530.96875 140.628906 C 1531.59375 139.835938 1532.34375 139.167969 1533.222656 138.628906 C 1534.101562 138.089844 1535.082031 137.820312 1536.160156 137.820312 C 1537.574219 137.820312 1539.105469 138.402344 1540.753906 139.5625 C 1542.398438 140.726562 1544.339844 142.019531 1546.582031 143.4375 C 1548.820312 144.855469 1551.457031 146.144531 1554.492188 147.308594 C 1557.527344 148.46875 1561.171875 149.050781 1565.425781 149.050781 C 1571.945312 149.050781 1576.996094 147.507812 1580.566406 144.414062 C 1584.140625 141.324219 1585.929688 136.882812 1585.929688 131.097656 C 1585.929688 127.867188 1585.117188 125.230469 1583.503906 123.1875 C 1581.886719 121.144531 1579.746094 119.429688 1577.082031 118.039062 C 1574.414062 116.652344 1571.378906 115.476562 1567.976562 114.511719 C 1564.574219 113.546875 1561.113281 112.496094 1557.597656 111.363281 C 1554.082031 110.230469 1550.621094 108.867188 1547.21875 107.277344 C 1543.816406 105.691406 1540.78125 103.621094 1538.113281 101.070312 C 1535.449219 98.515625 1533.308594 95.328125 1531.691406 91.5 C 1530.074219 87.667969 1529.265625 82.949219 1529.265625 77.332031 C 1529.265625 72.851562 1530.160156 68.484375 1531.949219 64.230469 C 1533.734375 59.976562 1536.34375 56.207031 1539.773438 52.917969 C 1543.207031 49.628906 1547.417969 46.992188 1552.40625 45.003906 C 1557.398438 43.019531 1563.097656 42.027344 1569.507812 42.027344 C 1576.765625 42.027344 1583.460938 43.160156 1589.585938 45.429688 C 1595.710938 47.699219 1600.929688 50.875 1605.238281 54.957031 Z M 1599.625 65.761719 \"/></g><g clip-path=\"url(#sxl-clip-1)\"><path fill-rule=\"nonzero\" fill=\"#01A9E1\" fill-opacity=\"1\" d=\"M 97.421875 0.0195312 L 1.871094 138.539062 L 27.617188 138.539062 C 30.203125 138.539062 32.621094 137.261719 34.074219 135.125 L 110.257812 23.113281 L 234.027344 204.40625 C 235.480469 206.535156 237.890625 207.808594 240.46875 207.8125 L 266.929688 207.8125 L 125.828125 3.375 C 124.367188 1.261719 121.964844 0 119.394531 0 Z M 97.421875 0.0195312 \"/></g><g clip-path=\"url(#sxl-clip-2)\"><path fill-rule=\"nonzero\" fill=\"#01A9E1\" fill-opacity=\"1\" d=\"M 162.566406 0 L 303.667969 204.4375 C 305.125 206.550781 307.527344 207.8125 310.09375 207.8125 L 334.347656 207.8125 L 193.246094 3.371094 C 191.789062 1.261719 189.386719 0 186.820312 0 Z M 162.566406 0 \"/></g><g clip-path=\"url(#sxl-clip-3)\"><path fill-rule=\"nonzero\" fill=\"#01A9E1\" fill-opacity=\"1\" d=\"M 254.242188 0 L 229.988281 0 L 371.089844 204.4375 C 372.546875 206.550781 374.949219 207.8125 377.515625 207.8125 L 401.769531 207.8125 L 260.667969 3.371094 C 259.210938 1.261719 256.808594 0 254.242188 0 \"/></g></svg>";

  function loginScreen(msg) {
    var mode = "login";
    var w = document.createElement("div"); w.className = "sx-ov"; document.body.appendChild(w);
    function draw() {
      w.innerHTML = '<form class="sx-bx"><div class="sx-logo">' + LOGO + '<span>Pilotage</span></div>' +
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
      w.innerHTML = '<form class="sx-bx"><div class="sx-logo">' + LOGO + '<span>Pilotage</span></div><h1>Nouveau mot de passe</h1><label>Mot de passe<input type="password" name="p" minlength="8" required autocomplete="new-password"></label><div class="sx-err"></div><button type="submit">Enregistrer</button></form>';
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
    var foot = document.querySelector(".side-foot"); (foot || document.body).appendChild(out);
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
