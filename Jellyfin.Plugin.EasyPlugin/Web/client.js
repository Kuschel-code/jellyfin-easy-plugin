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

    var cfg = { enabled: true, hidden: [], order: [], added: [] };
    var SELF = 'EasyPlugin';
    var STYLE_ID = 'easyPluginStyle';
    var LIST = 'ul[aria-labelledby="plugins-subheader"]';
    var ADDED_ATTR = 'data-ep-added';

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
        (cfg.order || []).forEach(function (n, i) {
            if (n) { css.push(sel(n) + ' { order: ' + (i + 1) + '; }'); }
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

    // Pin the whole "Plugins" nav section to the top of the dashboard sidebar, so the active
    // plugin entries appear first. The section lives among sibling sections; we flex the
    // container and give the plugins list a negative order. Re-applied on each mutation.
    function pinPluginsTop() {
        if (!cfg || cfg.enabled === false) { return; }
        var list = document.querySelector(LIST);
        if (!list || !list.parentElement) { return; }
        var container = list.parentElement;
        var disp = '';
        try { disp = window.getComputedStyle(container).display; } catch (e) { /* ignore */ }
        if (disp.indexOf('flex') < 0) {
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
        }
        list.style.order = '-1';
    }

    function apply() {
        buildStyle();
        injectAdded();
        pinPluginsTop();
    }

    function loadConfig() {
        return fetch('/EasyPlugin/Config', { credentials: 'include' })
            .then(function (r) { return r.json(); })
            .then(function (c) { if (c) { cfg = c; } })
            .catch(function () { /* keep defaults */ });
    }

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
