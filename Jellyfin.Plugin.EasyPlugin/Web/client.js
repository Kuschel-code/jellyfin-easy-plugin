(function () {
    'use strict';

    // Easy Plugin client script.
    //
    // jellyfin-web 10.11 renders plugin configuration-page links in the dashboard drawer
    // (component PluginDrawerSection) as React-managed MUI <a class="MuiListItemButton-root">
    // elements under  ul[aria-labelledby="plugins-subheader"], with href
    //   #/configurationpage?name=<encodeURIComponent(Name)>
    //
    // Because that list is React-rendered, moving nodes or setting inline display is undone on
    // the next reconciliation. So we never touch the nodes: we inject a single <style> element
    // and express hide (display:none) and order (flexbox order) purely as CSS keyed off the
    // href. CSS wins over React's DOM and survives re-renders; we only re-inject the <style>
    // if it ever gets removed.

    var cfg = { enabled: true, hidden: [], order: [] };
    var SELF = 'EasyPlugin';                       // never hide our own page
    var STYLE_ID = 'easyPluginStyle';
    var LIST = 'ul[aria-labelledby="plugins-subheader"]';

    function styleEl() {
        var el = document.getElementById(STYLE_ID);
        if (!el) {
            el = document.createElement('style');
            el.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(el);
        }
        return el;
    }

    // Selector for one plugin entry, matched on the href the drawer actually renders.
    function sel(name) {
        return LIST + ' a[href*="configurationpage?name=' + encodeURIComponent(name) + '"]';
    }

    function build() {
        var el = styleEl();
        if (!cfg || cfg.enabled === false) { el.textContent = ''; return; }

        var css = [
            // Make the plugins list a flex column so the `order` property below takes effect.
            LIST + ' { display: flex; flex-direction: column; }',
            // Keep the static "Plugins" entry (href #/dashboard/plugins) pinned to the top.
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

    function loadConfig() {
        return fetch('/EasyPlugin/Config', { credentials: 'include' })
            .then(function (r) { return r.json(); })
            .then(function (c) { if (c) { cfg = c; } })
            .catch(function () { /* keep defaults */ });
    }

    loadConfig().then(function () {
        build();
        // The SPA almost never re-renders <head>, but guard against our <style> being dropped.
        var t = null;
        new MutationObserver(function () {
            clearTimeout(t);
            t = setTimeout(function () { if (!document.getElementById(STYLE_ID)) { build(); } }, 200);
        }).observe(document.documentElement, { childList: true, subtree: true });
    });
})();
