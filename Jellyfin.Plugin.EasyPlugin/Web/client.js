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
    // - ADD (force-show pages that aren't normally in the menu) requires inserting new <a> nodes.
    //   React owns that list and removes foreign nodes on re-render, so we re-insert on every
    //   mutation (debounced). New nodes are clones of a real entry, so they match MUI styling.

    var cfg = { enabled: true, hidden: [], order: [], added: [], groups: [] };
    var SELF = 'EasyPlugin';
    var STYLE_ID = 'easyPluginStyle';
    var LIST = 'ul[aria-labelledby="plugins-subheader"]';
    var ADDED_ATTR = 'data-ep-added';
    var GROUP_ATTR = 'data-ep-group';
    var COLLAPSE_KEY = 'ep-group-collapsed:';

    function isCollapsed(id) {
        try { return localStorage.getItem(COLLAPSE_KEY + id) === '1'; } catch (e) { return false; }
    }
    function setCollapsed(id, v) {
        try { localStorage.setItem(COLLAPSE_KEY + id, v ? '1' : '0'); } catch (e) { /* ignore */ }
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function styleEl() {
        var el = document.getElementById(STYLE_ID);
        if (!el) {
            el = document.createElement('style');
            el.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(el);
        }
        return el;
    }

    function sel(name) {
        return LIST + ' a[href*="configurationpage?name=' + encodeURIComponent(name) + '"]';
    }

    function buildStyle() {
        var el = styleEl();
        if (!cfg || cfg.enabled === false) { el.textContent = ''; return; }

        var css = [
            LIST + ' { display: flex; flex-direction: column; }',
            LIST + ' a[href*="dashboard/plugins"] { order: 0; }'
        ];
        (cfg.hidden || []).forEach(function (n) {
            if (n && n !== SELF) { css.push(sel(n) + ' { display: none !important; }'); }
        });

        // Plugins assigned to a group are ordered under their group header; the rest ("ungrouped")
        // keep their cfg.order sequence ABOVE all groups.
        var groups = cfg.groups || [];
        var grouped = {};
        groups.forEach(function (g) { (g && g.members || []).forEach(function (m) { if (m) { grouped[m] = true; } }); });

        var o = 1;
        (cfg.order || []).forEach(function (n) {
            if (n && !grouped[n]) { css.push(sel(n) + ' { order: ' + (o++) + '; }'); }
        });

        // Each group: a header (order = base) then its indented members; collapsed groups (a per-
        // browser localStorage preference) hide their members. Big gaps keep groups well separated.
        groups.forEach(function (g, gi) {
            if (!g || !g.id || !g.members || !g.members.length) { return; }
            var base = 1000 + gi * 1000;
            var collapsed = isCollapsed(g.id);
            css.push(LIST + ' [' + GROUP_ATTR + '="' + g.id + '"] { order: ' + base + '; }');
            g.members.forEach(function (m, mi) {
                if (!m) { return; }
                css.push(sel(m) + ' { order: ' + (base + 1 + mi) + '; padding-left: 2.2em !important; }');
                if (collapsed) { css.push(sel(m) + ' { display: none !important; }'); }
            });
        });

        el.textContent = css.join('\n');
    }

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

            var label = a.querySelector('.MuiListItemText-primary')
                || a.querySelector('.MuiListItemText-root span')
                || a.querySelector('.MuiListItemText-root');
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

    // Inject a collapsible header row for each non-empty group (positioned by the injected <style>
    // order rules). Re-applied on every mutation, like the added clones. The header carries
    // data-ep-group=<id>; clicking it toggles the per-browser collapse state and re-applies.
    function syncGroups() {
        var list = document.querySelector(LIST);
        if (!list) { return; }
        var groups = (cfg.groups || []).filter(function (g) { return g && g.id && g.members && g.members.length; });
        var wanted = {};
        groups.forEach(function (g) { wanted[g.id] = true; });

        Array.prototype.forEach.call(list.querySelectorAll('[' + GROUP_ATTR + ']'), function (h) {
            if (!wanted[h.getAttribute(GROUP_ATTR)]) { h.remove(); }
        });

        groups.forEach(function (g) {
            var h = list.querySelector('[' + GROUP_ATTR + '="' + g.id + '"]');
            if (!h) {
                h = document.createElement('div');
                h.setAttribute(GROUP_ATTR, g.id);
                h.className = 'MuiListSubheader-root MuiListSubheader-gutters';
                h.style.cssText = 'display:flex; align-items:center; gap:.35em; cursor:pointer; user-select:none;';
                h.addEventListener('click', function () {
                    var id = h.getAttribute(GROUP_ATTR);
                    setCollapsed(id, !isCollapsed(id));
                    apply();
                });
                list.appendChild(h);
            }
            // Only rewrite the header content when its rendered state actually changed, so we don't
            // feed the MutationObserver an endless stream of (identical) DOM edits.
            var collapsed = isCollapsed(g.id);
            var stateKey = (collapsed ? 'c' : 'o') + '|' + (g.name || '');
            if (h.getAttribute('data-ep-state') !== stateKey) {
                h.setAttribute('data-ep-state', stateKey);
                h.innerHTML = '<span style="display:inline-block;transition:transform .15s;opacity:.7;transform:rotate(' +
                    (collapsed ? '-90deg' : '0deg') + ');">&#9662;</span><span>' + escapeHtml(g.name || 'Group') + '</span>';
            }
        });
    }

    function removeGroups() {
        Array.prototype.forEach.call(document.querySelectorAll('[' + GROUP_ATTR + ']'), function (h) { h.remove(); });
    }

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
        if (!cfg || cfg.enabled === false) { removeAdded(); removeGroups(); return; }
        syncAdded();
        syncGroups();
    }

    function loadConfig() {
        return fetch('/EasyPlugin/Config', { credentials: 'include' })
            .then(function (r) { return r.json(); })
            .then(function (c) { if (c) { cfg = c; } })
            .catch(function () { /* keep defaults */ });
    }

    // Re-fetch the config and re-apply. The admin config page dispatches "easyplugin-config-changed"
    // right after it auto-saves, so hide/show/add/un-add/reorder/enable reflect in the sidebar with
    // no page reload. Registered synchronously (before the first fetch) so an early save is never
    // missed; also exposed as a global for a direct call. visibilitychange picks up edits made in
    // another tab/device when this tab is focused again.
    function refresh() { return loadConfig().then(apply); }
    window.EasyPluginRefresh = refresh;
    window.addEventListener('easyplugin-config-changed', function () { refresh(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { refresh(); } });

    loadConfig().then(function () {
        apply();
        // React rebuilds the drawer; re-apply (re-inject added entries, re-ensure <style>) on change.
        var t = null;
        new MutationObserver(function () {
            clearTimeout(t);
            t = setTimeout(apply, 150);
        }).observe(document.documentElement, { childList: true, subtree: true });
    });
})();
