'use strict';

// Test harness for the two browser-side pieces of the plugin. Both are plain scripts that expect
// to run inside jellyfin-web, so each helper builds just enough of that environment: the admin
// drawer markup for client.js, and ApiClient/Dashboard for the configuration page.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const CLIENT_JS = path.join(ROOT, 'Jellyfin.Plugin.EasyPlugin', 'Web', 'client.js');
const CONFIG_HTML = path.join(ROOT, 'Jellyfin.Plugin.EasyPlugin', 'Configuration', 'configPage.html');

const TOKEN = 'test-token';

function readClient() {
    return fs.readFileSync(CLIENT_JS, 'utf8');
}

function readConfigPage() {
    return fs.readFileSync(CONFIG_HTML, 'utf8');
}

// The build embeds minified copies (comment-only lines and blank lines stripped, each line
// trimmed). Tests run against both forms so a change that only breaks after minification -- an
// unterminated comment, a statement relying on leading whitespace -- still fails here.
function minify(src) {
    return src
        .split('\n')
        .map((l) => l.trim())
        .filter((t) => {
            if (t.length === 0) return false;
            if (t.startsWith('//')) return false;
            if (t.startsWith('<!--') && t.endsWith('-->')) return false;
            if (t.startsWith('/*') && t.endsWith('*/')) return false;
            return true;
        })
        .join('\n');
}

function anchor(name, label) {
    return (
        '<a class="MuiListItemButton-root" href="#/configurationpage?name=' +
        encodeURIComponent(name) +
        '"><div class="MuiListItemText-root"><span class="MuiListItemText-primary">' +
        label +
        '</span></div></a>'
    );
}

function plainAnchor(href, label) {
    return (
        '<a class="MuiListItemButton-root" href="' +
        href +
        '"><div class="MuiListItemText-root"><span class="MuiListItemText-primary">' +
        label +
        '</span></div></a>'
    );
}

/**
 * Boot client.js against a fake drawer.
 *
 * @param {object} opts
 * @param {object} opts.config       payload the /EasyPlugin/Config endpoint returns
 * @param {Array}  opts.entries      [name, label] pairs rendered as plugin links
 * @param {Array}  opts.sections     [{id, entries: [[href, label], ...]}] extra drawer sections
 * @param {boolean} opts.token       false to simulate a signed-out app (no ApiClient token)
 * @param {boolean} opts.minified    run the minified build output instead of the source
 */
async function bootClient(opts) {
    const o = opts || {};
    const entries = o.entries || [];
    const sections = o.sections || [];

    const pluginList =
        '<ul aria-labelledby="plugins-subheader">' +
        plainAnchor('#/dashboard/plugins', 'Plugins') +
        entries.map((e) => anchor(e[0], e[1])).join('') +
        '</ul>';

    const others = sections
        .map(
            (s) =>
                '<ul aria-labelledby="' +
                s.id +
                '">' +
                (s.entries || []).map((e) => plainAnchor(e[0], e[1])).join('') +
                '</ul>'
        )
        .join('');

    const dom = new JSDOM(
        '<html><head></head><body><div class="mainDrawer">' + others + pluginList + '</div></body></html>',
        { runScripts: 'outside-only', url: 'http://localhost/' }
    );

    const calls = [];
    dom.window.fetch = (url, init) => {
        calls.push({ url, init: init || {} });
        if (String(url).indexOf('/EasyPlugin/Config') === 0) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve(o.config) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    };
    if (o.token !== false) {
        dom.window.ApiClient = { accessToken: () => TOKEN };
    }

    dom.window.eval(o.minified ? minify(readClient()) : readClient());
    await tick(dom.window, 60);

    const doc = dom.window.document;
    const api = {
        dom,
        window: dom.window,
        document: doc,
        calls,
        css: () => {
            const el = doc.getElementById('easyPluginStyle');
            return el ? el.textContent : '';
        },
        searchCss: () => {
            const el = doc.getElementById('easyPluginSearchStyle');
            return el ? el.textContent : '';
        },
        /** Flex order assigned to a plugin entry, or null when it has no rule. */
        orderOfName: (name) => matchOrder(api.css(), 'name=' + encodeURIComponent(name)),
        /** Flex order assigned to a group header, or null. */
        orderOfGroup: (id) => matchOrder(api.css(), '[data-ep-group="' + id + '"]'),
        /** True when some stylesheet hides this entry. */
        hiddenName: (name) =>
            hasHide(api.css() + '\n' + api.searchCss(), 'name=' + encodeURIComponent(name)),
        hiddenGroup: (id) =>
            hasHide(api.css() + '\n' + api.searchCss(), '[data-ep-group="' + id + '"]'),
        hiddenHref: (href) => hasHide(api.css() + '\n' + api.searchCss(), 'href="' + href + '"'),
        groupHeader: (id) => doc.querySelector('[data-ep-group="' + id + '"]'),
        labelOf: (name) => {
            const a = doc.querySelector('a[href*="name=' + encodeURIComponent(name) + '"]');
            const label = a && a.querySelector('.MuiListItemText-primary');
            return label ? label.textContent : null;
        },
        searchBox: () => doc.querySelector('[data-ep-search]'),
        tick: (ms) => tick(dom.window, ms == null ? 60 : ms)
    };
    return api;
}

/**
 * Boot the plugin's own configuration page with a stubbed ApiClient.
 *
 * @param {object} opts
 * @param {Array}  opts.pages     what /web/ConfigurationPages returns
 * @param {object} opts.config    the stored PluginConfiguration
 * @param {Array}  opts.sections  [{id, title, entries: [[href, label], ...]}] drawer markup to add
 * @param {string} opts.userId    id reported by ApiClient.getCurrentUserId()
 * @param {boolean} opts.minified run the minified build output instead of the source
 */
async function bootConfigPage(opts) {
    const o = opts || {};
    let html = o.minified ? minify(readConfigPage()) : readConfigPage();

    // The page normally renders inside the dashboard, where the drawer is part of the same
    // document. Splice a drawer in so the "rest of the sidebar" section has something to read.
    const drawer = (o.sections || [])
        .map(
            (s) =>
                '<h3 id="' + s.id + '">' + (s.title || s.id) + '</h3>' +
                '<ul aria-labelledby="' + s.id + '">' +
                (s.entries || []).map((e) => plainAnchor(e[0], e[1])).join('') +
                '</ul>'
        )
        .join('');
    if (drawer) {
        html = html.replace('<body>', '<body><div class="mainDrawer">' + drawer + '</div>');
    }

    const saved = [];
    let stored = JSON.parse(JSON.stringify(o.config || {}));

    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        url: 'http://localhost/',
        beforeParse(window) {
            window.ApiClient = {
                getUrl: (p) => p,
                getJSON: () => Promise.resolve(o.pages || []),
                getCurrentUserId: () => o.userId || null,
                getPluginConfiguration: () => Promise.resolve(JSON.parse(JSON.stringify(stored))),
                updatePluginConfiguration: (id, c) => {
                    stored = JSON.parse(JSON.stringify(c));
                    saved.push(stored);
                    return Promise.resolve();
                }
            };
            window.Dashboard = { showLoadingMsg() {}, hideLoadingMsg() {} };
            window.URL.createObjectURL = () => 'blob:stub';
            window.URL.revokeObjectURL = () => {};
        }
    });

    await tick(dom.window, 80);

    const doc = dom.window.document;
    const api = {
        dom,
        window: dom.window,
        document: doc,
        saved,
        /** The most recently saved configuration. */
        last: () => saved[saved.length - 1],
        stored: () => stored,
        /** Top-level sequence as ['PlugA', 'group:g1', ...] in rendered order. */
        topSequence: () => {
            const body = doc.querySelector('.epTopBody');
            if (!body) return [];
            return Array.from(body.children)
                .filter((c) => c.classList.contains('epRowWrap') || c.classList.contains('epGroupSection'))
                .map((c) =>
                    c.classList.contains('epGroupSection')
                        ? 'group:' + c.getAttribute('data-group-id')
                        : c.querySelector('.epRow').getAttribute('data-name')
                );
        },
        /** Member names of a rendered group section. */
        membersOf: (id) =>
            Array.from(
                doc.querySelectorAll('.epGroupSection[data-group-id="' + id + '"] .epSectionBody .epRow')
            ).map((r) => r.getAttribute('data-name')),
        row: (name) => doc.querySelector('#epList .epRow[data-name="' + name + '"]'),
        wrap: (name) => {
            const r = api.row(name);
            return r ? r.closest('.epRowWrap') : null;
        },
        /** Click a row's move button. dir -1 = up, +1 = down. */
        move: async (name, dir) => {
            const btn = api
                .wrap(name)
                .querySelector('.epMoveBtn[data-dir="' + dir + '"]:not(.epSecMove)');
            btn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
            await tick(dom.window, 600);
        },
        /** Click a group section's move button. */
        moveGroup: async (id, dir) => {
            const btn = doc.querySelector(
                '.epGroupSection[data-group-id="' + id + '"] .epSecMove[data-dir="' + dir + '"]'
            );
            btn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
            await tick(dom.window, 600);
        },
        /** Type a new sidebar label into a row and wait for the debounced save. */
        rename: async (name, label) => {
            const input = api.row(name).querySelector('.epNameInput');
            input.value = label;
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
            await tick(dom.window, 600);
        },
        setVisible: async (name, on) => {
            const cb = api.row(name).querySelector('.epVis');
            cb.checked = on;
            cb.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
            await tick(dom.window, 600);
        },
        click: async (selector, ms) => {
            doc.querySelector(selector).dispatchEvent(new dom.window.Event('click', { bubbles: true }));
            await tick(dom.window, ms == null ? 600 : ms);
        },
        tick: (ms) => tick(dom.window, ms == null ? 600 : ms)
    };
    return api;
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchOrder(css, fragment) {
    const m = new RegExp(escapeRe(fragment) + '[^{]*\\{[^}]*order:\\s*(\\d+)').exec(css);
    return m ? Number(m[1]) : null;
}

function hasHide(css, fragment) {
    return new RegExp(escapeRe(fragment) + '[^{]*\\{[^}]*display:\\s*none').test(css);
}

/** Let queued promises and short timers run. */
function tick(window, ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

module.exports = {
    TOKEN,
    readClient,
    readConfigPage,
    minify,
    bootClient,
    bootConfigPage,
    tick,
    anchor,
    plainAnchor
};
