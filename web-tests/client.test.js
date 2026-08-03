'use strict';

// Tests for Web/client.js -- the script injected into index.html that rewrites the admin sidebar.

const test = require('node:test');
const assert = require('node:assert');
const { bootClient, minify, readClient } = require('./helpers');

const ENTRIES = [
    ['PlugA', 'Alpha'],
    ['PlugB', 'Bravo'],
    ['MemX', 'Xray'],
    ['MemY', 'Yankee'],
    ['MemZ', 'Zulu']
];

function config(over) {
    return Object.assign(
        {
            enabled: true,
            showSearch: false,
            hidden: [],
            order: [],
            added: [],
            groups: [],
            renames: [],
            sections: [],
            collapsed: []
        },
        over || {}
    );
}

test('the script parses both as source and as the minified build output', () => {
    assert.doesNotThrow(() => new Function(readClient()));
    assert.doesNotThrow(() => new Function(minify(readClient())));
});

test('ungrouped entries follow cfg.order', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({ order: ['PlugB', 'PlugA'] })
    });

    assert.ok(c.orderOfName('PlugB') < c.orderOfName('PlugA'));
});

test('hidden entries get display:none', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({ hidden: ['PlugB'] })
    });

    assert.ok(c.hiddenName('PlugB'));
    assert.ok(!c.hiddenName('PlugA'));
});

test('a "group:<id>" token places the whole group inline with ungrouped entries', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({
            order: ['PlugA', 'group:g1', 'MemX', 'MemY', 'PlugB'],
            groups: [{ id: 'g1', name: 'Tools', members: ['MemX', 'MemY'] }]
        })
    });

    const seq = [
        c.orderOfName('PlugA'),
        c.orderOfGroup('g1'),
        c.orderOfName('MemX'),
        c.orderOfName('MemY'),
        c.orderOfName('PlugB')
    ];
    assert.ok(
        seq.every((v, i) => v !== null && (i === 0 || v > seq[i - 1])),
        'expected strictly increasing order, got ' + JSON.stringify(seq)
    );
});

test('groups without a token keep the pre-0.0.6 placement, after everything ordered', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({
            order: ['PlugA', 'PlugB'],
            groups: [{ id: 'g1', name: 'Legacy', members: ['MemX'] }]
        })
    });

    assert.ok(c.orderOfGroup('g1') > c.orderOfName('PlugB'));
    assert.ok(c.orderOfName('MemX') > c.orderOfGroup('g1'));
});

test('a collapsed group hides its members but keeps its header', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({
            order: ['group:g1', 'MemX'],
            groups: [{ id: 'g1', name: 'Tools', members: ['MemX'] }],
            collapsed: ['g1']
        })
    });

    assert.ok(c.hiddenName('MemX'));
    assert.ok(!c.hiddenGroup('g1'));
    assert.ok(c.groupHeader('g1'));
});

test('a group whose members are all hidden leaves no orphan header', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({
            hidden: ['MemX', 'MemY'],
            order: ['group:g1', 'MemX', 'MemY'],
            groups: [{ id: 'g1', name: 'Tools', members: ['MemX', 'MemY'] }]
        })
    });

    assert.equal(c.groupHeader('g1'), null, 'header should not be rendered at all');
});

test('a partly hidden group still shows its header', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({
            hidden: ['MemX'],
            order: ['group:g1', 'MemX', 'MemY'],
            groups: [{ id: 'g1', name: 'Tools', members: ['MemX', 'MemY'] }]
        })
    });

    assert.ok(c.groupHeader('g1'));
    assert.ok(c.hiddenName('MemX'));
    assert.ok(!c.hiddenName('MemY'));
});

test('a group icon is rendered in the header', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({
            groups: [{ id: 'g1', name: 'Tools', icon: 'tune', members: ['MemX'] }]
        })
    });

    const icon = c.groupHeader('g1').querySelector('.material-icons');
    assert.ok(icon);
    assert.equal(icon.textContent, 'tune');
});

test('clicking a group header toggles it and saves the state for this user', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({
            order: ['group:g1', 'MemX'],
            groups: [{ id: 'g1', name: 'Tools', members: ['MemX'] }]
        })
    });

    assert.ok(!c.hiddenName('MemX'), 'starts expanded');

    c.groupHeader('g1').dispatchEvent(new c.window.Event('click'));
    await c.tick();

    assert.ok(c.hiddenName('MemX'), 'members hide after collapsing');

    const post = c.calls.find((x) => String(x.url).indexOf('/EasyPlugin/Collapse') === 0);
    assert.ok(post, 'collapse state is persisted');
    assert.equal(post.init.method, 'POST');
    assert.deepEqual(JSON.parse(post.init.body), { groupId: 'g1', collapsed: true });
});

test('renaming relabels an entry and keeps the original for restoring', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({ renames: [{ name: 'PlugA', display: 'My Alpha' }] })
    });

    assert.equal(c.labelOf('PlugA'), 'My Alpha');
    assert.equal(c.labelOf('PlugB'), 'Bravo');

    const label = c.document.querySelector('a[href*="name=PlugA"] .MuiListItemText-primary');
    assert.equal(label.getAttribute('data-ep-orig'), 'Alpha');
});

test('dropping a rename puts the plugin\'s own label back', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({ renames: [{ name: 'PlugA', display: 'My Alpha' }] })
    });
    assert.equal(c.labelOf('PlugA'), 'My Alpha');

    c.window.fetch = () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(config({ renames: [] })) });
    await c.window.EasyPluginRefresh();
    await c.tick();

    assert.equal(c.labelOf('PlugA'), 'Alpha');
});

test('force-added pages are cloned in, and removed again when un-added', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({ added: [{ name: 'Extra1', display: 'Extra One' }] })
    });

    assert.ok(c.document.querySelector('[data-ep-added="Extra1"]'));
    assert.equal(c.labelOf('Extra1'), 'Extra One');

    c.window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(config()) });
    await c.window.EasyPluginRefresh();
    await c.tick();

    assert.equal(c.document.querySelector('[data-ep-added="Extra1"]'), null);
});

test('the filter box hides non-matching entries and empty groups', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({
            showSearch: true,
            order: ['group:g1', 'MemX'],
            groups: [{ id: 'g1', name: 'Tools', members: ['MemX'] }]
        })
    });

    const box = c.searchBox();
    assert.ok(box, 'filter box is injected');

    box.value = 'brav';
    box.dispatchEvent(new c.window.Event('input'));
    await c.tick();

    assert.ok(!c.hiddenName('PlugB'), 'Bravo matches');
    assert.ok(c.hiddenName('PlugA'), 'Alpha does not match');
    assert.ok(c.hiddenName('MemX'), 'Xray does not match');
    assert.ok(c.hiddenGroup('g1'), 'group with no matches is hidden too');
});

test('the filter box is absent unless enabled', async () => {
    const c = await bootClient({ entries: ENTRIES, config: config({ showSearch: false }) });
    assert.equal(c.searchBox(), null);
});

test('other drawer sections can be hidden and reordered by href', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        sections: [
            {
                id: 'server-subheader',
                entries: [
                    ['#/dashboard/general', 'General'],
                    ['#/dashboard/branding', 'Branding'],
                    ['#/dashboard/users', 'Users']
                ]
            }
        ],
        config: config({
            sections: [
                {
                    id: 'server-subheader',
                    hidden: ['#/dashboard/branding'],
                    order: ['#/dashboard/users', '#/dashboard/general']
                }
            ]
        })
    });

    const css = c.css();
    assert.ok(css.indexOf('ul[aria-labelledby="server-subheader"]') >= 0);
    assert.ok(c.hiddenHref('#/dashboard/branding'));

    const users = /server-subheader"\] a\[href="#\/dashboard\/users"\][^{]*\{[^}]*order:\s*(\d+)/.exec(css);
    const general = /server-subheader"\] a\[href="#\/dashboard\/general"\][^{]*\{[^}]*order:\s*(\d+)/.exec(css);
    assert.ok(users && general);
    assert.ok(Number(users[1]) < Number(general[1]));
});

test('the plugins section is never driven by a section override', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({
            sections: [{ id: 'plugins-subheader', hidden: ['#/dashboard/plugins'], order: [] }]
        })
    });

    assert.ok(!c.hiddenHref('#/dashboard/plugins'));
});

test('disabling reverts every DOM change', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({
            showSearch: true,
            added: [{ name: 'Extra1', display: 'Extra One' }],
            renames: [{ name: 'PlugA', display: 'My Alpha' }],
            groups: [{ id: 'g1', name: 'Tools', members: ['MemX'] }]
        })
    });
    assert.ok(c.groupHeader('g1'));

    c.window.fetch = () =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(config({ enabled: false })) });
    await c.window.EasyPluginRefresh();
    await c.tick();

    assert.equal(c.css(), '', 'stylesheet is emptied');
    assert.equal(c.groupHeader('g1'), null);
    assert.equal(c.document.querySelector('[data-ep-added="Extra1"]'), null);
    assert.equal(c.searchBox(), null);
    assert.equal(c.labelOf('PlugA'), 'Alpha', 'original label restored');
});

test('requests carry the web app\'s access token', async () => {
    const c = await bootClient({ entries: ENTRIES, config: config() });

    const get = c.calls.find((x) => String(x.url).indexOf('/EasyPlugin/Config') === 0);
    assert.ok(get);
    assert.equal(get.init.headers.Authorization, 'MediaBrowser Token="test-token"');
});

test('without a signed-in ApiClient nothing is requested or changed', async () => {
    const c = await bootClient({ entries: ENTRIES, config: config(), token: false });

    assert.equal(c.calls.length, 0, 'no unauthenticated calls are made');
    assert.equal(c.css(), '');
});

test('applying repeatedly does not rewrite identical CSS', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        config: config({ order: ['PlugB', 'PlugA'] })
    });

    const styleEl = c.document.getElementById('easyPluginStyle');
    let writes = 0;
    const observer = new c.window.MutationObserver(() => { writes += 1; });
    observer.observe(styleEl, { childList: true, characterData: true, subtree: true });

    await c.window.EasyPluginRefresh();
    await c.tick(200);
    observer.disconnect();

    assert.equal(writes, 0, 'unchanged rules must not churn the stylesheet');
});

test('the minified build behaves like the source', async () => {
    const c = await bootClient({
        entries: ENTRIES,
        minified: true,
        config: config({
            order: ['PlugA', 'group:g1', 'MemX'],
            groups: [{ id: 'g1', name: 'Tools', icon: 'tune', members: ['MemX'] }],
            renames: [{ name: 'PlugB', display: 'Renamed' }]
        })
    });

    assert.ok(c.orderOfGroup('g1') > c.orderOfName('PlugA'));
    assert.ok(c.orderOfName('MemX') > c.orderOfGroup('g1'));
    assert.equal(c.labelOf('PlugB'), 'Renamed');
    assert.equal(c.groupHeader('g1').querySelector('.material-icons').textContent, 'tune');
});
