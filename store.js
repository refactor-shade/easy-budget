/* Easy Budget — хранилище. Один интерфейс для облака (Supabase) и локального режима (IndexedDB).
   Облако включается, если в config.js заданы SUPABASE_URL и SUPABASE_ANON_KEY. */
(function (root) {
  "use strict";
  var E = root.BudgetEngine;
  var cfg = root.EASY_BUDGET_CONFIG || {};

  // ---------- IndexedDB (кэш и локальный режим) ----------
  var DB = "easy-budget", KV = "kv";
  var dbPromise = null;
  function idb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (res, rej) {
      if (!root.indexedDB) return rej(new Error("no idb"));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(KV); };
      r.onsuccess = function () {
        var db = r.result;
        db.onversionchange = function () { db.close(); dbPromise = null; };
        res(db);
      };
      r.onerror = function () { dbPromise = null; rej(r.error); };
    });
    return dbPromise;
  }
  function kvGet(k) {
    return idb().then(function (db) {
      return new Promise(function (res) {
        var q = db.transaction(KV).objectStore(KV).get(k);
        q.onsuccess = function () { res(q.result === undefined ? null : q.result); };
        q.onerror = function () { res(null); };
      });
    }).catch(function () { try { var s = localStorage.getItem(DB + ":" + k); return s ? JSON.parse(s) : null; } catch (e) { return null; } });
  }
  function kvSet(k, v) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(KV, "readwrite");
        t.objectStore(KV).put(v, k);
        t.oncomplete = function () { res(); };
        t.onerror = function () { rej(t.error); };
      });
    }).catch(function () { localStorage.setItem(DB + ":" + k, JSON.stringify(v)); });
  }
  function kvDel(k) {
    return idb().then(function (db) { db.transaction(KV, "readwrite").objectStore(KV).delete(k); }).catch(function () { localStorage.removeItem(DB + ":" + k); });
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // ---------- приватные категории: отдельный документ, видит только владелец ----------
  function splitPrivate(state) {
    var data = clone(state);
    delete data._ver;
    var privIds = {};
    data.categories.forEach(function (c) { if (c.private) privIds[c.id] = true; });
    var priv = { categories: data.categories.filter(function (c) { return privIds[c.id]; }), years: {} };
    data.categories = data.categories.filter(function (c) { return !privIds[c.id]; });
    Object.keys(data.years).forEach(function (y) {
      var yr = data.years[y], p = { entries: {}, recurring: [] };
      Object.keys(yr.entries || {}).forEach(function (cid) { if (privIds[cid]) { p.entries[cid] = yr.entries[cid]; delete yr.entries[cid]; } });
      yr.recurring = (yr.recurring || []).filter(function (r) { if (privIds[r.catId]) { p.recurring.push(r); return false; } return true; });
      priv.years[y] = p;
    });
    data.hasPrivate = priv.categories.length > 0;
    return { pub: data, priv: priv };
  }
  function mergePrivate(pub, priv) {
    var s = clone(pub);
    if (!priv || !priv.categories) return s;
    s.categories = s.categories.concat(priv.categories);
    Object.keys(priv.years || {}).forEach(function (y) {
      if (!s.years[y]) return;
      var p = priv.years[y], yr = s.years[y];
      yr.entries = yr.entries || {};
      Object.keys(p.entries || {}).forEach(function (cid) { yr.entries[cid] = p.entries[cid]; });
      yr.recurring = (yr.recurring || []).concat(p.recurring || []);
    });
    return s;
  }

  // Итоги по месяцам для уровня «только итоги» (без приватных категорий)
  function buildSummary(state) {
    var pub = splitPrivate(state).pub;
    pub._ver = 1;
    var out = { years: {}, hasPrivate: pub.hasPrivate, rate: pub.settings.rate, updatedAt: new Date().toISOString() };
    Object.keys(pub.years).forEach(function (y) {
      try { var m = E.monthly(pub, y); out.years[y] = { months: m.months, total: m.total, archived: !!pub.years[y].archived }; } catch (e) { /* пропустить год */ }
    });
    return out;
  }

  // ---------- общие траты: строка базы ↔ «моя перспектива» ----------
  function fromRow(row, meId) {
    var cost = Number(row.amount_cents), share = Number((row.shares || {})[meId] || 0), mine = row.paid_by === meId;
    return { id: row.id, ext: row.ext_id, date: String(row.date).slice(0, 10), desc: row.description, cost: cost, currency: row.currency,
      net: (mine ? cost : 0) - share, share: share, paidByMe: mine, kind: row.kind, cat: row.category || null, swCat: row.sw_category || null,
      method: row.method, source: row.source, paidBy: row.paid_by, shares: row.shares, createdBy: row.created_by, split: row.split || null, note: row.note || "" };
  }
  function toRow(e, meId, partnerId, spaceId) {
    var shares = {};
    shares[meId] = e.share;
    shares[partnerId] = e.cost - e.share;
    var r = { space_id: spaceId, date: e.date, description: e.desc || "", amount_cents: e.cost, currency: e.currency || "EUR",
      paid_by: e.paidByMe ? meId : partnerId, shares: shares, kind: e.kind || "expense", category: e.cat || null,
      sw_category: e.swCat || null, method: e.method || null, source: e.source || "app", split: e.split || null, note: e.note || null };
    if (e.source === "splitwise") r.ext_id = e.id;
    return r;
  }

  // =====================================================================
  // Локальный режим: один профиль, всё в IndexedDB этого браузера
  // =====================================================================
  function LocalStore() {
    var listeners = [];
    var me = { id: "local", email: "", name: "Я" };
    var api = {
      mode: "local",
      init: function () { return Promise.resolve({ user: me }); },
      user: function () { return me; },
      signIn: function () { return Promise.resolve(me); }, signUp: function () { return Promise.resolve({ user: me }); },
      signOut: function () { return Promise.resolve(); },
      loadMyBudget: function () {
        return kvGet("state").then(function (s) {
          if (!s) return null;
          if (s.shared && s.shared.expenses) { // перенос со старой версии
            var sh = s.shared; delete s.shared;
            return api._legacyShared(sh).then(function () { return kvSet("state", s); }).then(function () { return { data: s, version: 1 }; });
          }
          return { data: s, version: 1 };
        });
      },
      remoteVersion: function () { return Promise.resolve(null); },
      saveMyBudget: function (state) {
        var d = clone(state); delete d._ver; d.savedAt = new Date().toISOString();
        return kvSet("state", d).then(function () { return 1; });
      },
      updateProfileName: function (n) { me.name = n; return Promise.resolve(); },
      listPeople: function () { return Promise.resolve([]); },
      loadBudgetOf: function () { return Promise.resolve(null); },
      loadSummaryOf: function () { return Promise.resolve(null); },
      setVisibility: function () { return Promise.resolve(); },
      myVisibility: function () { return Promise.resolve({}); },
      // общее пространство
      loadSpace: function () { return kvGet("space"); },
      createSpace: function (name, myName, partnerName) {
        var sp = { space: { id: "local-space", name: name || "Общие траты", settings: { learned: {} } },
          people: [{ id: "p-me", name: myName || "Я", userId: "local" }, { id: "p-partner", name: partnerName || "Партнёр", userId: null }] };
        return kvSet("space", sp).then(function () { return sp; });
      },
      saveSpaceSettings: function (spaceId, settings) {
        return kvGet("space").then(function (sp) { sp.space.settings = settings; return kvSet("space", sp); });
      },
      loadShared: function () { return kvGet("shared_rows").then(function (r) { return r || []; }); },
      insertShared: function (rows) {
        return kvGet("shared_rows").then(function (all) {
          all = all || [];
          var ext = {}; all.forEach(function (r) { if (r.ext_id) ext[r.ext_id] = 1; });
          var added = 0;
          rows.forEach(function (r) {
            if (r.ext_id && ext[r.ext_id]) return;
            r.id = r.id || E.uid("x"); r.created_by = "local"; all.push(r); added++;
          });
          return kvSet("shared_rows", all).then(function () { listeners.forEach(function (f) { f(); }); return added; });
        });
      },
      updateShared: function (id, patch) {
        return kvGet("shared_rows").then(function (all) {
          all.forEach(function (r) { if (r.id === id) Object.assign(r, patch); });
          return kvSet("shared_rows", all);
        });
      },
      deleteShared: function (id) {
        return kvGet("shared_rows").then(function (all) { return kvSet("shared_rows", all.filter(function (r) { return r.id !== id; })); });
      },
      subscribeShared: function (spaceId, cb) { listeners.push(cb); },
      _legacyShared: function (sh) {
        return api.createSpace("Общие траты", "Я", "Партнёр").then(function (sp) {
          sp.space.settings.learned = sh.learned || {};
          return kvSet("space", sp).then(function () {
            return api.insertShared(sh.expenses.map(function (e) { var r = toRow(e, "p-me", "p-partner", sp.space.id); if (!r.ext_id) r.id = e.id; return r; }));
          });
        });
      },
      wipe: function () { return Promise.all([kvDel("state"), kvDel("space"), kvDel("shared_rows")]); },
    };
    return api;
  }

  // =====================================================================
  // Облако: Supabase (вход по коду из письма, RLS на сервере)
  // =====================================================================
  function CloudStore() {
    var sb = root.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    var me = null, version = 0, channel = null;
    function must(res) { if (res.error) throw res.error; return res.data; }
    function setUser(u) { me = u ? { id: u.id, email: u.email, name: "" } : null; return me; }
    var api = {
      mode: "cloud",
      client: sb,
      init: function () {
        return sb.auth.getSession().then(function (r) {
          var u = r.data && r.data.session && r.data.session.user;
          if (!u) return { user: null };
          setUser(u);
          return api._afterLogin().then(function () { return { user: me }; });
        });
      },
      user: function () { return me; },
      onAuthChange: function (cb) { sb.auth.onAuthStateChange(function (ev, session) { cb(ev, session && session.user); }); },
      _afterLogin: function () {
        return sb.rpc("claim_invites").then(function () {
          return sb.from("profiles").select("name").eq("id", me.id).maybeSingle();
        }).then(function (r) { if (r.data && r.data.name) me.name = r.data.name; });
      },
      signUp: function (email, password) {
        return sb.auth.signUp({ email: email, password: password, options: { emailRedirectTo: location.origin + location.pathname } }).then(must).then(function (d) {
          if (d.session) { setUser(d.user); return api._afterLogin().then(function () { return { user: me }; }); }
          return { needsConfirm: true };
        });
      },
      signIn: function (email, password) {
        return sb.auth.signInWithPassword({ email: email, password: password }).then(must).then(function (d) {
          setUser(d.user);
          return api._afterLogin().then(function () { return me; });
        });
      },
      sendLink: function (email) {
        return sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } }).then(must);
      },
      resetPassword: function (email) {
        return sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(must);
      },
      updatePassword: function (password) { return sb.auth.updateUser({ password: password }).then(must); },
      signOut: function () { var id = me && me.id; return sb.auth.signOut().then(function () { me = null; return kvDel("cache:" + id); }); },
      updateProfileName: function (name) {
        me.name = name;
        return sb.from("profiles").upsert({ id: me.id, name: name, email: me.email }).then(must);
      },

      loadMyBudget: function () {
        return Promise.all([
          sb.from("budgets").select("data,version").eq("owner_id", me.id).maybeSingle().then(must),
          sb.from("budget_private").select("data").eq("owner_id", me.id).maybeSingle().then(must),
        ]).then(function (r) {
          if (!r[0]) { version = 0; return null; }
          version = r[0].version;
          var data = mergePrivate(r[0].data, r[1] && r[1].data);
          kvSet("cache:" + me.id, { data: data, version: version });
          return { data: data, version: version };
        }).catch(function (err) {
          // нет сети — берём кэш с этого устройства
          return kvGet("cache:" + me.id).then(function (c) { if (c) { version = c.version; c.offline = true; return c; } throw err; });
        });
      },
      remoteVersion: function () {
        return sb.from("budgets").select("version").eq("owner_id", me.id).maybeSingle().then(function (r) { return r.data ? r.data.version : 0; });
      },
      localVersion: function () { return version; },
      saveMyBudget: function (state) {
        var parts = splitPrivate(state);
        return sb.rpc("save_budget", { new_data: parts.pub, expected_version: version }).then(function (r) {
          if (r.error) {
            if (/version_conflict/.test(r.error.message)) { var e = new Error("conflict"); e.code = "conflict"; throw e; }
            throw r.error;
          }
          version = r.data;
          kvSet("cache:" + me.id, { data: mergePrivate(parts.pub, parts.priv), version: version });
          return Promise.all([
            sb.from("budget_private").upsert({ owner_id: me.id, data: parts.priv, updated_at: new Date().toISOString() }).then(must),
            sb.from("budget_summaries").upsert({ owner_id: me.id, data: buildSummary(state), updated_at: new Date().toISOString() }).then(must),
          ]).then(function () { return version; });
        });
      },

      // люди, чьи бюджеты можно смотреть, и мой доступ для них
      listPeople: function () {
        return sb.from("visibility").select("owner_id,viewer_id,level").then(must).then(function (rows) {
          var ids = {};
          rows.forEach(function (r) { ids[r.owner_id === me.id ? r.viewer_id : r.owner_id] = 1; });
          var list = Object.keys(ids);
          if (!list.length) return [];
          return sb.from("profiles").select("id,name,email").in("id", list).then(must).then(function (profs) {
            return list.map(function (id) {
              var p = profs.find(function (x) { return x.id === id; }) || {};
              var theirs = rows.find(function (r) { return r.owner_id === id && r.viewer_id === me.id; });
              var mine = rows.find(function (r) { return r.owner_id === me.id && r.viewer_id === id; });
              return { userId: id, name: p.name || (p.email || "").split("@")[0] || "Партнёр", email: p.email, theirLevel: theirs ? theirs.level : "hidden", myLevel: mine ? mine.level : "hidden" };
            });
          });
        });
      },
      loadBudgetOf: function (userId) {
        return sb.from("budgets").select("data,version,updated_at").eq("owner_id", userId).maybeSingle().then(must);
      },
      loadSummaryOf: function (userId) {
        return sb.from("budget_summaries").select("data,updated_at").eq("owner_id", userId).maybeSingle().then(must);
      },
      setVisibility: function (viewerId, level) {
        return sb.from("visibility").upsert({ owner_id: me.id, viewer_id: viewerId, level: level, updated_at: new Date().toISOString() }).then(must);
      },

      // общее пространство
      loadSpace: function () {
        return sb.from("space_people").select("space_id").eq("user_id", me.id).limit(1).then(must).then(function (r) {
          if (!r.length) return null;
          var sid = r[0].space_id;
          return Promise.all([
            sb.from("spaces").select("id,name,settings").eq("id", sid).single().then(must),
            sb.from("space_people").select("id,name,email,user_id").eq("space_id", sid).order("created_at").then(must),
          ]).then(function (x) {
            return { space: x[0], people: x[1].map(function (p) { return { id: p.id, name: p.name, email: p.email, userId: p.user_id }; }) };
          });
        });
      },
      createSpace: function (name, myName, partnerName, partnerEmail) {
        return sb.rpc("create_space", { space_name: name, my_name: myName, partner_name: partnerName, partner_email: partnerEmail || "" }).then(must).then(api.loadSpace);
      },
      saveSpaceSettings: function (spaceId, settings) { return sb.from("spaces").update({ settings: settings }).eq("id", spaceId).then(must); },
      loadShared: function (spaceId) {
        var all = [], page = 1000;
        function next(from) {
          return sb.from("shared_expenses").select("*").eq("space_id", spaceId).order("date").order("created_at").range(from, from + page - 1).then(must).then(function (rows) {
            all = all.concat(rows);
            return rows.length === page ? next(from + page) : all;
          });
        }
        return next(0);
      },
      insertShared: function (rows) {
        var chunks = [];
        for (var i = 0; i < rows.length; i += 500) chunks.push(rows.slice(i, i + 500));
        var added = 0;
        return chunks.reduce(function (p, ch) {
          return p.then(function () {
            var withExt = ch.filter(function (r) { return r.ext_id; }), plain = ch.filter(function (r) { return !r.ext_id; });
            return Promise.all([
              withExt.length ? sb.from("shared_expenses").upsert(withExt, { onConflict: "space_id,ext_id", ignoreDuplicates: true }).select("id").then(must) : [],
              plain.length ? sb.from("shared_expenses").insert(plain).select("id").then(must) : [],
            ]).then(function (r) { added += r[0].length + r[1].length; });
          });
        }, Promise.resolve()).then(function () { return added; });
      },
      updateShared: function (id, patch) { patch.updated_at = new Date().toISOString(); return sb.from("shared_expenses").update(patch).eq("id", id).then(must); },
      deleteShared: function (id) { return sb.from("shared_expenses").delete().eq("id", id).then(must); },
      subscribeShared: function (spaceId, cb) {
        if (channel) sb.removeChannel(channel);
        channel = sb.channel("shared-" + spaceId)
          .on("postgres_changes", { event: "*", schema: "public", table: "shared_expenses", filter: "space_id=eq." + spaceId }, function () { cb(); })
          .subscribe();
      },
      wipe: function () { return Promise.resolve(); },
    };
    return api;
  }

  var cloud = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && root.supabase);
  root.BudgetStore = cloud ? CloudStore() : LocalStore();
  root.BudgetStoreUtil = { splitPrivate: splitPrivate, mergePrivate: mergePrivate, buildSummary: buildSummary, fromRow: fromRow, toRow: toRow, kvGet: kvGet, kvSet: kvSet };
})(window);
