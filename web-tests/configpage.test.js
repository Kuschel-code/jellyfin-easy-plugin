'use strict';

// Tests for Configuration/configPage.html -- the admin page that edits the sidebar layout.

const test = require('node:test');
const assert = require('node:assert');
const { bootConfigPage, minify, readConfigPage } = require('./helpers');

const PAGES = [
    { Name: 'PlugA', DisplayName: 'Alpha', EnableInMainMenu: true, PluginId: 'a' },
    { Name: 'PlugB', DisplayName: 'Bravo', EnableInMainMenu: true, PluginId: 'b' },
    { Name: 'MemX', DisplayName: 'Xray', EnableInMainMenu: true, PluginId: 'x' },
    { Name: 'MemY', DisplayName: 'Yankee', EnableInMainMenu: true, PluginId: 'y' },
    { Name: 'Extra1', DisplayName: 'Extra One', EnableInMainMenu: false, PluginId: 'e' }
];

const SECTIONS = [
    {
        id: 'server-subheader',
        title: 'Server',
        entries: [
            ['#/dashboard/general', 'General'],
            ['#/dashboard/branding', 'Branding'],
            ['#/dashboard/users', 'Users']
        ]
    }
];

function config(over) {
    return Object.assign(
        {
            Enabled: true,
            PerUser: false,
            ShowSearch: false,
            Hidden: [],
            Order: [],
            Added: [],
            Groups: [],
            Renames: [],
            Sections: [],
            Users: [],
            CollapseStates: []
        },
        over || {}
    );
}

test('the embedded script parses as source and minified', () => {
    const script = /<script type="text\/javascript">([\s\S]*?)<\/script>/.exec(readConfigPage())[1];
    assert.doesNotThrow(() => new Function(script));
    assert.doesNotThrow(() => new Function(minify(script)));
});

test('groups and ungrouped plugins render as one interleaved sequence', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        config: config({
            Order: ['PlugA', 'group:g1', 'MemX', 'PlugB'],
            Groups: [{ Id: 'g1', Name: 'Tools', Members: ['MemX'] }]
        })
    });

    assert.deepEqual(c.topSequence(), ['PlugA', 'group:g1', 'PlugB', 'MemY']);
    assert.deepEqual(c.membersOf('g1'), ['MemX']);
});

test('extras are listed separately and marked', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: config() });

    assert.ok(c.document.querySelector('.epAddGroup .epRow[data-name="Extra1"]'));
    assert.equal(c.topSequence().indexOf('Extra1'), -1);
});

test('the move buttons reorder a plugin without dragging', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        config: config({ Order: ['PlugA', 'PlugB', 'MemX', 'MemY'] })
    });

    await c.move('PlugB', -1);

    assert.deepEqual(c.topSequence().slice(0, 2), ['PlugB', 'PlugA']);
    assert.deepEqual(c.last().Order.slice(0, 2), ['PlugB', 'PlugA']);
});

test('moving a plugin onto a group puts it inside, and past the end takes it out', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        config: config({
            Order: ['PlugA', 'group:g1', 'MemX', 'PlugB'],
            Groups: [{ Id: 'g1', Name: 'Tools', Members: ['MemX'] }]
        })
    });
    assert.deepEqual(c.membersOf('g1'), ['MemX']);

    // PlugA sits directly above the group: one step down walks it in, at the top.
    await c.move('PlugA', 1);
    assert.deepEqual(c.membersOf('g1'), ['PlugA', 'MemX']);
    assert.deepEqual(c.last().Groups[0].Members, ['PlugA', 'MemX']);

    // Walking it back up leaves the group again, above it.
    await c.move('PlugA', -1);
    assert.deepEqual(c.membersOf('g1'), ['MemX']);
    assert.deepEqual(c.topSequence().slice(0, 2), ['PlugA', 'group:g1']);
    assert.deepEqual(c.last().Groups[0].Members, ['MemX']);
});

test('a plugin can be walked out of the bottom of a group', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        config: config({
            Order: ['group:g1', 'MemX', 'MemY', 'PlugA'],
            Groups: [{ Id: 'g1', Name: 'Tools', Members: ['MemX', 'MemY'] }]
        })
    });

    await c.move('MemY', 1);

    assert.deepEqual(c.membersOf('g1'), ['MemX']);
    assert.equal(c.topSequence()[1], 'MemY');
});

test('a whole group can be moved with its buttons', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        config: config({
            Order: ['PlugA', 'PlugB', 'group:g1', 'MemX'],
            Groups: [{ Id: 'g1', Name: 'Tools', Members: ['MemX'] }]
        })
    });
    assert.deepEqual(c.topSequence(), ['PlugA', 'PlugB', 'group:g1', 'MemY']);

    await c.moveGroup('g1', -1);
    assert.deepEqual(c.topSequence(), ['PlugA', 'group:g1', 'PlugB', 'MemY']);

    await c.moveGroup('g1', -1);
    assert.deepEqual(c.topSequence(), ['group:g1', 'PlugA', 'PlugB', 'MemY']);
    assert.equal(c.last().Order[0], 'group:g1');
});

test('renaming an entry stores a rename, and clearing it back removes it', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: config() });

    await c.rename('PlugA', 'My Alpha');
    assert.deepEqual(c.last().Renames, [{ Name: 'PlugA', DisplayName: 'My Alpha' }]);

    await c.rename('PlugA', 'Alpha');
    assert.deepEqual(c.last().Renames, []);
});

test('an existing rename is shown in the label field', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        config: config({ Renames: [{ Name: 'PlugB', DisplayName: 'Renamed B' }] })
    });

    assert.equal(c.row('PlugB').querySelector('.epNameInput').value, 'Renamed B');
    assert.equal(c.row('PlugA').querySelector('.epNameInput').value, 'Alpha');
});

test('a group icon round-trips through save', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        config: config({
            Order: ['group:g1', 'MemX'],
            Groups: [{ Id: 'g1', Name: 'Tools', Icon: 'tune', Members: ['MemX'] }]
        })
    });

    const icon = c.document.querySelector('.epGroupSection[data-group-id="g1"] .epIconInput');
    assert.equal(icon.value, 'tune');

    icon.value = 'movie';
    icon.dispatchEvent(new c.window.Event('input', { bubbles: true }));
    await c.tick();

    assert.equal(c.last().Groups[0].Icon, 'movie');
});

test('hiding an entry stores it, and enabling an extra adds it', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: config() });

    await c.setVisible('PlugA', false);
    assert.deepEqual(c.last().Hidden, ['PlugA']);

    await c.setVisible('Extra1', true);
    assert.deepEqual(c.last().Added, [{ Name: 'Extra1', DisplayName: 'Extra One' }]);
});

test('deleting a group keeps its plugins where the group was', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        config: config({
            Order: ['PlugA', 'group:g1', 'MemX', 'PlugB'],
            Groups: [{ Id: 'g1', Name: 'Tools', Members: ['MemX'] }]
        })
    });

    await c.click('.epGroupSection[data-group-id="g1"] .epGroupDel');

    assert.deepEqual(c.topSequence(), ['PlugA', 'MemX', 'PlugB', 'MemY']);
    assert.deepEqual(c.last().Groups, []);
    assert.deepEqual(c.last().Order, ['PlugA', 'MemX', 'PlugB', 'MemY', 'Extra1']);
});

test('adding a group twice does not double-wire the settings arrow', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: config() });

    await c.click('#epNewGroup');
    await c.click('#epNewGroup');

    const wrap = c.wrap('PlugA');
    wrap.querySelector('.epArrow').dispatchEvent(new c.window.Event('click', { bubbles: true }));
    await c.tick(50);

    assert.ok(
        wrap.querySelector('.epEmbed').classList.contains('epEmbedOpen'),
        'one click must leave the inline settings open'
    );
});

test('the other sidebar sections are listed, hideable and reorderable', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: config(), sections: SECTIONS });

    const rows = c.document.querySelectorAll('#epNav .epSecRow');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].getAttribute('data-href'), '#/dashboard/general');

    const branding = c.document.querySelector('#epNav .epSecRow[data-href="#/dashboard/branding"]');
    const cb = branding.querySelector('.epVis');
    cb.checked = false;
    cb.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await c.tick();

    assert.deepEqual(c.last().Sections[0].Id, 'server-subheader');
    assert.deepEqual(c.last().Sections[0].Hidden, ['#/dashboard/branding']);

    const up = c.document.querySelector(
        '#epNav .epSecRow[data-href="#/dashboard/users"]'
    ).parentNode.querySelector('.epNavMove[data-dir="-1"]');
    up.dispatchEvent(new c.window.Event('click', { bubbles: true }));
    await c.tick();

    assert.deepEqual(c.last().Sections[0].Order, [
        '#/dashboard/general',
        '#/dashboard/users',
        '#/dashboard/branding'
    ]);
});

test('saving without a drawer present leaves stored section overrides alone', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        config: config({
            Sections: [{ Id: 'server-subheader', Hidden: ['#/dashboard/branding'], Order: [] }]
        })
        // no sections: the drawer is not in this document
    });

    await c.setVisible('PlugA', false);

    assert.deepEqual(c.last().Sections, [
        { Id: 'server-subheader', Hidden: ['#/dashboard/branding'], Order: [] }
    ]);
});

test('per-user layouts are edited and stored separately from the default', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        userId: 'user-1',
        config: config({
            PerUser: true,
            Order: ['PlugA', 'PlugB', 'MemX', 'MemY'],
            Users: []
        })
    });

    // With per-user on, the editor starts on the user's own layout.
    assert.equal(c.document.querySelector('#epScope').value, 'user');
    assert.notEqual(c.document.querySelector('#epScopeWrap').style.display, 'none');

    await c.move('PlugB', -1);

    const saved = c.last();
    assert.equal(saved.Users.length, 1);
    assert.equal(saved.Users[0].UserId, 'user-1');
    assert.deepEqual(saved.Users[0].Order.slice(0, 2), ['PlugB', 'PlugA']);
    assert.deepEqual(saved.Order.slice(0, 2), ['PlugA', 'PlugB'], 'the server default is untouched');
});

test('the scope selector switches back to editing the server default', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        userId: 'user-1',
        config: config({
            PerUser: true,
            Order: ['PlugA', 'PlugB', 'MemX', 'MemY'],
            Users: [{ UserId: 'user-1', Order: ['MemY', 'MemX', 'PlugB', 'PlugA'], Hidden: [], Added: [], Groups: [], Renames: [], Sections: [] }]
        })
    });
    assert.deepEqual(c.topSequence(), ['MemY', 'MemX', 'PlugB', 'PlugA']);

    const sel = c.document.querySelector('#epScope');
    sel.value = 'default';
    sel.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await c.tick();

    assert.deepEqual(c.topSequence(), ['PlugA', 'PlugB', 'MemX', 'MemY']);
});

test('the scope selector is hidden while per-user layouts are off', async () => {
    const c = await bootConfigPage({ pages: PAGES, userId: 'user-1', config: config({ PerUser: false }) });

    assert.equal(c.document.querySelector('#epScopeWrap').style.display, 'none');
});

test('the search toggle is persisted', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: config() });

    const cb = c.document.querySelector('#epShowSearch');
    cb.checked = true;
    cb.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await c.tick();

    assert.equal(c.last().ShowSearch, true);
});

test('import replaces the stored configuration and re-renders', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: config() });

    const incoming = config({
        Order: ['MemY', 'MemX', 'PlugB', 'PlugA'],
        Renames: [{ Name: 'PlugA', DisplayName: 'Imported' }]
    });

    // Drive the import path directly with a stub File, the way the file picker would.
    const input = c.document.querySelector('#epImportFile');
    const file = new c.window.File([JSON.stringify(incoming)], 'cfg.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await c.tick(800);

    assert.deepEqual(c.stored().Order, ['MemY', 'MemX', 'PlugB', 'PlugA']);
    assert.equal(c.row('PlugA').querySelector('.epNameInput').value, 'Imported');
});

test('import rejects a file that is not a configuration object', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: config() });
    const before = JSON.stringify(c.stored());

    const input = c.document.querySelector('#epImportFile');
    const file = new c.window.File(['[1,2,3]'], 'bad.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await c.tick(800);

    assert.equal(JSON.stringify(c.stored()), before);
    assert.match(c.document.querySelector('#epStatus').textContent, /Import failed/);
});

test('the minified build renders and saves the same way', async () => {
    const c = await bootConfigPage({
        pages: PAGES,
        minified: true,
        config: config({
            Order: ['PlugA', 'group:g1', 'MemX', 'PlugB'],
            Groups: [{ Id: 'g1', Name: 'Tools', Icon: 'tune', Members: ['MemX'] }]
        })
    });

    assert.deepEqual(c.topSequence(), ['PlugA', 'group:g1', 'PlugB', 'MemY']);

    await c.moveGroup('g1', -1);
    assert.deepEqual(c.topSequence(), ['group:g1', 'PlugA', 'PlugB', 'MemY']);
    assert.equal(c.last().Groups[0].Icon, 'tune');
});
