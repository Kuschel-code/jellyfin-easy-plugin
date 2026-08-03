(function () {
    'use strict';

    // Easy Plugin client script (injected into index.html by a File Transformation provider).
    //
    // jellyfin-web 10.11 renders plugin configuration-page links in the dashboard drawer
    // (PluginDrawerSection) as React-managed MUI <a class="MuiListItemButton-root"> elements
    // under  ul[aria-labelledby="plugins-subheader"], href #/configurationpage?name=<enc(Name)>.
    //
    // - HIDE + REORDER are done purely with an injected <style> keyed off the href, which wins
    //   over React and survives re-renders.
    // - ADD (force-show pages that aren't normally in the menu), RENAME, group headers and the
    //   filter box need real DOM nodes. React owns that list and reverts foreign changes on
    //   re-render, so we re-apply them on every mutation (debounced).

    var cfg = {
        enabled: true, showSearch: false, hidden: [], order: [], added: [],
        groups: [], renames: [], sections: [], collapsed: []
    };
    var SELF = 'EasyPlugin';
    var STYLE_ID = 'easyPluginStyle';
    var SEARCH_STYLE_ID = 'easyPluginSearchStyle';
    var LIST = 'ul[aria-labelledby="plugins-subheader"]';
    var PLUGINS_SECTION = 'plugins-subheader';
    var ADDED_ATTR = 'data-ep-added';
    var GROUP_ATTR = 'data-ep-group';
    var ORIG_ATTR = 'data-ep-orig';
    var SEARCH_ATTR = 'data-ep-search';

    var collapsed = {};     // group id -> true, mirrored from the server and updated optimistically
    var filter = '';        // current filter-box text (never persisted)

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Escape a value for use inside a double-quoted CSS attribute selector.
    function cssStr(s) {
        return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function styleEl(id) {
        var el = document.getElementById(id);
        if (!el) {
            el = document.createElement('style');
            el.id = id;
            (document.head || document.documentElement).appendChild(el);
        }
        return el;
    }

    // Only touch the DOM when the rules actually changed. Rewriting identical CSS would feed the
    // MutationObserver a fresh mutation on every pass and keep re-applying forever.
    function setCss(el, text) {
        if (el.textContent !== text) { el.textContent = text; }
    }

    function sel(name) {
        return LIST + ' a[href*="configurationpage?name=' + encodeURIComponent(name) + '"]';
    }

    function nameFromHref(href) {
        var m = /configurationpage\?name=([^&"]*)/.exec(href || '');
        if (!m) { return null; }
        try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
    }

    function labelEl(a) {
        return a.querySelector('.MuiListItemText-primary')
            || a.querySelector('.MuiListItemText-root span')
            || a.querySelector('.MuiListItemText-root');
    }

    function isHidden(name) {
        return (cfg.hidden || []).indexOf(name) >= 0;
    }

    // Members of a group that are not hidden. A group whose members are all hidden must not leave
    // an empty header behind in the sidebar.
    function visibleMembers(g) {
        return ((g && g.members) || []).filter(function (m) { return m && !isHidden(m); });
    }

    function liveGroups() {
        return (cfg.groups || []).filter(function (g) {
            return g && g.id && visibleMembers(g).length;
        });
    }

    // --- server access ---------------------------------------------------------------------

    // The layout endpoint requires a signed-in caller, but this script is injected into
    // index.html and has no credentials of its own. jellyfin-web keeps the session's access
    // token on its ApiClient, so borrow that; before the app has booted there is simply no token
    // and we leave the sidebar alone until the next refresh.
    function token() {
        try {
            var c = window.ApiClient;
            if (!c) { return null; }
            if (typeof c.accessToken === 'function') { return c.accessToken() || null; }
            return (c._serverInfo && c._serverInfo.AccessToken) || null;
        } catch (e) {
            return null;
        }
    }

    function apiFetch(path, options) {
        var t = token();
        if (!t) { return Promise.reject(new Error('no token')); }
        var opts = options || {};
        opts.headers = opts.headers || {};
        opts.headers['Authorization'] = 'MediaBrowser Token="' + t + '"';
        return fetch(path, opts);
    }

    // --- style -----------------------------------------------------------------------------

    function buildStyle() {
        var el = styleEl(STYLE_ID);
        if (!cfg || cfg.enabled === false) { setCss(el, ''); return; }

        var css = [
            LIST + ' { display: flex; flex-direction: column; }',
            LIST + ' a[href*="dashboard/plugins"] { order: 0; }'
        ];
        (cfg.hidden || []).forEach(function (n) {
            if (n && n !== SELF) { css.push(sel(n) + ' { display: none !important; }'); }
        });

        // cfg.order is a single top-to-bottom sequence: plugin names for ungrouped entries, plus
        // "group:<id>" tokens marking where a whole group sits. A group emits its header followed
        // by its indented members; collapsed groups hide their members. Groups without a token
        // (configs saved by older versions) come after everything placed by cfg.order, in
        // cfg.groups array order — the old behaviour.
        var groups = liveGroups();
        var byId = {};
        var grouped = {};
        groups.forEach(function (g) {
            byId[g.id] = g;
            (g.members || []).forEach(function (m) { if (m) { grouped[m] = true; } });
        });

        var o = 1;
        var placed = {};
        function emitGroup(g) {
            var isShut = !!collapsed[g.id];
            css.push(LIST + ' [' + GROUP_ATTR + '="' + cssStr(g.id) + '"] { order: ' + (o++) + '; }');
            visibleMembers(g).forEach(function (m) {
                css.push(sel(m) + ' { order: ' + (o++) + '; padding-left: 2.2em !important; }');
                if (isShut) { css.push(sel(m) + ' { display: none !important; }'); }
            });
        }

        (cfg.order || []).forEach(function (n) {
            if (!n) { return; }
            if (n.indexOf('group:') === 0) {
                var g = byId[n.slice(6)];
                if (g && !placed[g.id]) { placed[g.id] = true; emitGroup(g); }
            } else if (!grouped[n]) {
                css.push(sel(n) + ' { order: ' + (o++) + '; }');
            }
        });

        groups.forEach(function (g) {
            if (!placed[g.id]) { emitGroup(g); }
        });

        buildSectionCss(css);
        setCss(el, css.join('\n'));
    }

    // The other drawer sections (Server, Devices, Live TV, …) hold core dashboard links rather
    // than plugin pages, so their entries are keyed by href instead of configuration-page name.
    function buildSectionCss(css) {
        (cfg.sections || []).forEach(function (s) {
            if (!s || !s.id || s.id === PLUGINS_SECTION) { return; }
            var list = 'ul[aria-labelledby="' + cssStr(s.id) + '"]';
            css.push(list + ' { display: flex; flex-direction: column; }');
            (s.hidden || []).forEach(function (h) {
                if (h) { css.push(list + ' a[href="' + cssStr(h) + '"] { display: none !important; }'); }
            });
            var o = 1;
            (s.order || []).forEach(function (h) {
                if (h) { css.push(list + ' a[href="' + cssStr(h) + '"] { order: ' + (o++) + '; }'); }
            });
        });
    }

    // --- added entries ---------------------------------------------------------------------

    function injectAdded() {
        if (!cfg || cfg.enabled === false) { return; }
        var added = cfg.added || [];
        if (!added.length) { return; }

        var list = document.querySelector(LIST);
        if (!list) { return; }

        // Prefer a real plugin-page entry as the clone template (gives the right icon + markup),
        // else fall back to the static "Plugins" entry.
        var template = list.querySelector('a[href*="configurationpage?name="]') || list.querySelector('a');
        if (!template) { return; }

        added.forEach(function (item) {
            var name = item && item.name ? item.name : item;
            if (!name) { return; }
            var display = (item && item.display) ? item.display : name;
            var href = '#/configurationpage?name=' + encodeURIComponent(name);

            // Already there (a real entry with this name, or our previously-injected clone)?
            if (list.querySelector('a[href*="configurationpage?name=' + encodeURIComponent(name) + '"]')) {
                return;
            }

            var a = template.cloneNode(true);
            a.setAttribute(ADDED_ATTR, name);
            a.classList.remove('Mui-selected');
            a.setAttribute('href', href);

            var label = labelEl(a);
            if (label) { label.textContent = display; } else { a.textContent = display; }

            list.appendChild(a);
        });
    }

    // Remove the entries we previously cloned in (used when disabling, so the sidebar reverts).
    function removeAdded() {
        var nodes = document.querySelectorAll('[' + ADDED_ATTR + ']');
        Array.prototype.forEach.call(nodes, function (n) { n.remove(); });
    }

    // Reconcile cloned entries with cfg.added: drop clones whose name is no longer wanted, then add
    // the rest. injectAdded() only adds, so without this an un-added plugin would leave its clone
    // behind. Match strictly on the data-ep-added attribute value vs cfg.added[].name (never href).
    function syncAdded() {
        var wanted = {};
        (cfg.added || []).forEach(function (it) {
            var n = (it && it.name) ? it.name : it;
            if (n) { wanted[n] = true; }
        });
        var nodes = document.querySelectorAll('[' + ADDED_ATTR + ']');
        Array.prototype.forEach.call(nodes, function (n) {
            if (!wanted[n.getAttribute(ADDED_ATTR)]) { n.remove(); }
        });
        injectAdded();
    }

    // --- renamed entries -------------------------------------------------------------------

    // Relabel entries Jellyfin already renders. The plugin's own label is kept in data-ep-orig so
    // turning a rename off (or the whole plugin) puts the original text back.
    function syncRenames() {
        var list = document.querySelector(LIST);
        if (!list) { return; }

        var wanted = {};
        (cfg.renames || []).forEach(function (r) {
            if (r && r.name && r.display) { wanted[r.name] = r.display; }
        });

        Array.prototype.forEach.call(list.querySelectorAll('a[href*="configurationpage?name="]'), function (a) {
            if (a.hasAttribute(ADDED_ATTR)) { return; }
            var label = labelEl(a);
            if (!label) { return; }
            var name = nameFromHref(a.getAttribute('href'));
            var want = name ? wanted[name] : null;

            if (want) {
                if (!label.hasAttribute(ORIG_ATTR)) { label.setAttribute(ORIG_ATTR, label.textContent || ''); }
                if (label.textContent !== want) { label.textContent = want; }
            } else if (label.hasAttribute(ORIG_ATTR)) {
                var orig = label.getAttribute(ORIG_ATTR);
                if (label.textContent !== orig) { label.textContent = orig; }
                label.removeAttribute(ORIG_ATTR);
            }
        });
    }

    function removeRenames() {
        Array.prototype.forEach.call(document.querySelectorAll('[' + ORIG_ATTR + ']'), function (label) {
            var orig = label.getAttribute(ORIG_ATTR);
            if (label.textContent !== orig) { label.textContent = orig; }
            label.removeAttribute(ORIG_ATTR);
        });
    }

    // --- group headers ---------------------------------------------------------------------

    // Inject a collapsible header row for each group that still has visible members (positioned by
    // the injected <style> order rules). Re-applied on every mutation, like the added clones. The
    // header carries data-ep-group=<id>; clicking it toggles the collapse state, which is stored
    // per user on the server so it follows them across browsers.
    function syncGroups() {
        var list = document.querySelector(LIST);
        if (!list) { return; }
        var groups = liveGroups();
        var wanted = {};
        groups.forEach(function (g) { wanted[g.id] = true; });

        Array.prototype.forEach.call(list.querySelectorAll('[' + GROUP_ATTR + ']'), function (h) {
            if (!wanted[h.getAttribute(GROUP_ATTR)]) { h.remove(); }
        });

        groups.forEach(function (g) {
            var h = list.querySelector('[' + GROUP_ATTR + '="' + cssStr(g.id) + '"]');
            if (!h) {
                h = document.createElement('div');
                h.setAttribute(GROUP_ATTR, g.id);
                h.className = 'MuiListSubheader-root MuiListSubheader-gutters';
                h.style.cssText = 'display:flex; align-items:center; gap:.35em; cursor:pointer; user-select:none;';
                h.addEventListener('click', function () { toggleGroup(h.getAttribute(GROUP_ATTR)); });
                list.appendChild(h);
            }
            // Only rewrite the header content when its rendered state actually changed, so we don't
            // feed the MutationObserver an endless stream of (identical) DOM edits.
            var isShut = !!collapsed[g.id];
            var stateKey = (isShut ? 'c' : 'o') + '|' + (g.name || '') + '|' + (g.icon || '');
            if (h.getAttribute('data-ep-state') !== stateKey) {
                h.setAttribute('data-ep-state', stateKey);
                h.innerHTML =
                    '<span style="display:inline-block;transition:transform .15s;opacity:.7;transform:rotate(' +
                    (isShut ? '-90deg' : '0deg') + ');">&#9662;</span>' +
                    (g.icon
                        ? '<span class="material-icons" style="font-size:1.1em;opacity:.75;" aria-hidden="true">' +
                          escapeHtml(g.icon) + '</span>'
                        : '') +
                    '<span>' + escapeHtml(g.name || 'Group') + '</span>';
            }
        });
    }

    function removeGroups() {
        Array.prototype.forEach.call(document.querySelectorAll('[' + GROUP_ATTR + ']'), function (h) { h.remove(); });
    }

    function toggleGroup(id) {
        if (!id) { return; }
        var now = !collapsed[id];
        if (now) { collapsed[id] = true; } else { delete collapsed[id]; }
        apply();
        // Best effort: the sidebar already reflects the new state, so a failed save only means the
        // next page load starts from the stored one.
        apiFetch('/EasyPlugin/Collapse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: id, collapsed: now })
        }).catch(function () { /* ignore */ });
    }

    // --- filter box ------------------------------------------------------------------------

    function syncSearch() {
        var list = document.querySelector(LIST);
        if (!list || !list.parentElement) { return; }

        if (!cfg.showSearch || cfg.enabled === false) { removeSearch(); return; }

        var box = document.querySelector('[' + SEARCH_ATTR + ']');
        if (!box) {
            box = document.createElement('input');
            box.setAttribute(SEARCH_ATTR, '1');
            box.setAttribute('type', 'search');
            box.setAttribute('placeholder', 'Filter plugins…');
            box.setAttribute('aria-label', 'Filter plugins');
            box.style.cssText = 'width:calc(100% - 2.4em); margin:.2em 1.2em .4em; padding:.35em .6em;' +
                'border-radius:4px; border:1px solid rgba(255,255,255,.2); background:rgba(255,255,255,.06);' +
                'color:inherit; font:inherit; font-size:.9em; box-sizing:border-box;';
            box.addEventListener('input', function () { filter = box.value || ''; buildSearchStyle(); });
            // Keep the caret where it was: React re-renders the list, not our sibling input.
            list.parentElement.insertBefore(box, list);
        }
        if (box.value !== filter) { box.value = filter; }
        buildSearchStyle();
    }

    function removeSearch() {
        Array.prototype.forEach.call(document.querySelectorAll('[' + SEARCH_ATTR + ']'), function (b) { b.remove(); });
        setCss(styleEl(SEARCH_STYLE_ID), '');
    }

    // Filtering rides on the same CSS-override trick as hiding: entries whose label doesn't match
    // get display:none, and a group header goes with them once none of its members match.
    function buildSearchStyle() {
        var el = styleEl(SEARCH_STYLE_ID);
        var list = document.querySelector(LIST);
        var q = (filter || '').trim().toLowerCase();
        if (!q || !list || cfg.enabled === false) { setCss(el, ''); return; }

        var memberOf = {};
        (cfg.groups || []).forEach(function (g) {
            if (g && g.id) { (g.members || []).forEach(function (m) { if (m) { memberOf[m] = g.id; } }); }
        });

        var css = [];
        var matchesInGroup = {};
        Array.prototype.forEach.call(list.querySelectorAll('a[href]'), function (a) {
            var label = labelEl(a);
            var text = (label ? label.textContent : a.textContent) || '';
            var hit = text.toLowerCase().indexOf(q) >= 0;
            var name = nameFromHref(a.getAttribute('href'));
            if (hit) {
                if (name && memberOf[name]) { matchesInGroup[memberOf[name]] = true; }
                return;
            }
            css.push(name
                ? sel(name) + ' { display: none !important; }'
                : LIST + ' a[href="' + cssStr(a.getAttribute('href')) + '"] { display: none !important; }');
        });

        liveGroups().forEach(function (g) {
            if (!matchesInGroup[g.id]) {
                css.push(LIST + ' [' + GROUP_ATTR + '="' + cssStr(g.id) + '"] { display: none !important; }');
            }
        });

        setCss(el, css.join('\n'));
    }

    // --- legacy cleanup --------------------------------------------------------------------

    // Earlier versions pinned the whole "Plugins" nav section to the top of the sidebar. Users
    // want it left in its normal place, so we no longer pin — and we actively clear any pin styles
    // a previous version set, so upgrading reverts the section to where Jellyfin puts it. (Hiding
    // and within-section reordering still work via the injected <style>, which only flexes the
    // plugins list itself, not its position among the sibling nav sections.)
    function unpinSection() {
        var list = document.querySelector(LIST);
        if (!list || !list.parentElement) { return; }
        var container = list.parentElement;
        if (list.style.order) { list.style.order = ''; }
        if (container.style.display) { container.style.display = ''; }
        if (container.style.flexDirection) { container.style.flexDirection = ''; }
        var prev = container.querySelector(':scope > [data-ep-pinned]');
        if (prev) { prev.style.order = ''; prev.removeAttribute('data-ep-pinned'); }
    }

    function apply() {
        buildStyle();
        unpinSection();
        if (!cfg || cfg.enabled === false) {
            removeAdded(); removeGroups(); removeRenames(); removeSearch();
            return;
        }
        syncAdded();
        syncRenames();
        syncGroups();
        syncSearch();
    }

    function loadConfig() {
        return apiFetch('/EasyPlugin/Config')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (c) {
                if (!c) { return false; }
                cfg = c;
                collapsed = {};
                (c.collapsed || []).forEach(function (id) { if (id) { collapsed[id] = true; } });
                return true;
            })
            .catch(function () { return false; });
    }

    // Re-fetch the config and re-apply. The admin config page dispatches "easyplugin-config-changed"
    // right after it auto-saves, so every edit reflects in the sidebar with no page reload.
    // Registered synchronously (before the first fetch) so an early save is never missed; also
    // exposed as a global for a direct call. visibilitychange picks up edits made in another
    // tab/device when this tab is focused again.
    function refresh() { return loadConfig().then(apply); }
    window.EasyPluginRefresh = refresh;
    window.addEventListener('easyplugin-config-changed', function () { refresh(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { refresh(); } });

    // The script is injected into index.html, so it runs before jellyfin-web has signed in and
    // published its ApiClient. Poll briefly for a token, then start; if the user signs in later,
    // the visibilitychange/config-changed hooks pick things up.
    function start(attempt) {
        loadConfig().then(function (ok) {
            if (!ok && attempt < 40) {
                setTimeout(function () { start(attempt + 1); }, 500);
                return;
            }
            apply();
            // React rebuilds the drawer; re-apply (re-inject added entries, re-ensure <style>) on change.
            var t = null;
            new MutationObserver(function () {
                clearTimeout(t);
                t = setTimeout(apply, 150);
            }).observe(document.documentElement, { childList: true, subtree: true });
        });
    }

    start(0);
})();
