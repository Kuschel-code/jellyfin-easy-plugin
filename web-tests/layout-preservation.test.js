'use strict';

// Regression tests for the reported bug: after updating the plugin, everything looked switched off
// and the whole sidebar had to be set up again.
//
// Cause: the saved layout is rebuilt from the rows the configuration page has rendered, and the
// page treated "could not fetch /web/ConfigurationPages" as "there are no plugins". Right after an
// update the server is still coming up, so that request can fail or come back short. Touching any
// switch then saved a layout rebuilt from nothing, overwriting the stored one for good.

const test = require('node:test');
const assert = require('node:assert');
const { bootConfigPage } = require('./helpers');

const PAGES = [
    { Name: 'PlugA', DisplayName: 'Alpha', EnableInMainMenu: true, PluginId: 'a' },
    { Name: 'PlugB', DisplayName: 'Bravo', EnableInMainMenu: true, PluginId: 'b' },
    { Name: 'MemX', DisplayName: 'Xray', EnableInMainMenu: true, PluginId: 'x' },
    { Name: 'Extra1', DisplayName: 'Extra One', EnableInMainMenu: false, PluginId: 'e' }
];

// A configured server: something hidden, an extra force-added, a rename and a group.
function furnished() {
    return {
        Enabled: true,
        PerUser: false,
        ShowSearch: false,
        Hidden: ['PlugB'],
        Order: ['PlugA', 'group:g1', 'MemX', 'PlugB', 'Extra1'],
        Added: [{ Name: 'Extra1', DisplayName: 'Extra One' }],
        Groups: [{ Id: 'g1', Name: 'Tools', Icon: 'tune', Members: ['MemX'] }],
        Renames: [{ Name: 'PlugA', DisplayName: 'My Alpha' }],
        Sections: [],
        Users: [],
        CollapseStates: []
    };
}

function layoutOf(cfg) {
    return {
        Hidden: cfg.Hidden,
        Order: cfg.Order,
        Added: cfg.Added,
        Groups: cfg.Groups,
        Renames: cfg.Renames
    };
}

test('a failed plugin-page request does not let a switch wipe the layout', async () => {
    const before = furnished();
    const c = await bootConfigPage({ pagesFail: true, config: before });

    // The page is up but has no rows to rebuild a layout from.
    assert.match(c.document.querySelector('#epWarn').textContent, /Could not load/);

    // The user does what anyone would: flips the master switch to try to fix it.
    const cb = c.document.querySelector('#epEnabled');
    cb.checked = false;
    cb.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await c.tick();

    const after = c.stored();
    assert.equal(after.Enabled, false, 'the switch itself is still saved');
    assert.deepEqual(layoutOf(after), layoutOf(before), 'but the layout must be untouched');
});

test('an empty plugin-page list does not wipe the layout either', async () => {
    const before = furnished();
    const c = await bootConfigPage({ pages: [], config: before });

    const cb = c.document.querySelector('#epShowSearch');
    cb.checked = true;
    cb.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await c.tick();

    const after = c.stored();
    assert.equal(after.ShowSearch, true);
    assert.deepEqual(layoutOf(after), layoutOf(before));
});

test('a plugin missing from the list keeps its hidden/added/rename entries', async () => {
    // PlugB (hidden), Extra1 (force-added) and MemX (grouped) are absent this time — as if those
    // plugins had not finished registering yet.
    const c = await bootConfigPage({
        pages: [PAGES[0]],
        config: furnished()
    });

    await c.setVisible('PlugA', false);

    const after = c.stored();
    assert.ok(after.Hidden.indexOf('PlugB') >= 0, 'PlugB stays hidden');
    assert.ok(after.Hidden.indexOf('PlugA') >= 0, 'the actual edit still applies');
    assert.deepEqual(after.Added, [{ Name: 'Extra1', DisplayName: 'Extra One' }], 'Extra1 stays added');
    assert.equal(after.Groups.length, 1);
    assert.deepEqual(after.Groups[0].Members, ['MemX'], 'the group keeps its absent member');
    assert.equal(after.Groups[0].Icon, 'tune');
    assert.ok(
        after.Renames.some((r) => r.Name === 'PlugA'),
        'the rename for the rendered plugin survives'
    );
    assert.ok(after.Order.indexOf('PlugB') >= 0, 'absent entries keep an order slot');
    assert.ok(after.Order.indexOf('group:g1') >= 0);
});

test('a group whose members are all absent is not dropped', async () => {
    const c = await bootConfigPage({
        pages: [PAGES[0]],   // MemX missing, so group g1 renders with no rows
        config: furnished()
    });

    await c.setVisible('PlugA', false);

    const g = c.stored().Groups.filter((x) => x.Id === 'g1')[0];
    assert.ok(g, 'the group must survive');
    assert.deepEqual(g.Members, ['MemX']);
    assert.equal(g.Name, 'Tools');
});

test('deleting a group still deletes it when some of its members are absent', async () => {
    // render() draws every stored group, empty ones included, so an absent group section means the
    // user removed it. Preserving absent members must not resurrect the group itself.
    const c = await bootConfigPage({
        pages: [PAGES[0]],   // MemX (the group's only member) is missing
        config: furnished()
    });
    assert.ok(c.document.querySelector('.epGroupSection[data-group-id="g1"]'), 'group renders empty');

    await c.click('.epGroupSection[data-group-id="g1"] .epGroupDel');

    const after = c.stored();
    assert.deepEqual(after.Groups, [], 'the group is gone');
    assert.equal(after.Order.indexOf('group:g1'), -1, 'and so is its order token');
    assert.ok(after.Order.indexOf('MemX') >= 0, 'its absent member survives, now ungrouped');
});

test('with the full list a save still rewrites the layout normally', async () => {
    // The preservation logic must not turn saving into append-only: removing something has to stick.
    const c = await bootConfigPage({ pages: PAGES, config: furnished() });

    await c.setVisible('PlugB', true);   // un-hide it

    const after = c.stored();
    assert.equal(after.Hidden.indexOf('PlugB'), -1, 'un-hiding really removes it');
    assert.deepEqual(after.Added, [{ Name: 'Extra1', DisplayName: 'Extra One' }]);
});

test('un-adding an extra still removes it when the list is complete', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: furnished() });

    await c.setVisible('Extra1', false);

    assert.deepEqual(c.stored().Added, [], 'the extra is really dropped');
});

test('deleting a group still removes it when the list is complete', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: furnished() });

    await c.click('.epGroupSection[data-group-id="g1"] .epGroupDel');

    assert.deepEqual(c.stored().Groups, [], 'the group is really deleted');
});

test('clearing a rename still removes it when the list is complete', async () => {
    const c = await bootConfigPage({ pages: PAGES, config: furnished() });

    await c.rename('PlugA', 'Alpha');   // back to the plugin's own label

    assert.deepEqual(c.stored().Renames, []);
});

test('per-user layouts get the same protection', async () => {
    const before = furnished();
    before.PerUser = true;
    before.Users = [
        {
            UserId: 'user-1',
            Hidden: ['PlugB'],
            Order: ['PlugA', 'PlugB'],
            Added: [{ Name: 'Extra1', DisplayName: 'Extra One' }],
            Groups: [],
            Renames: [],
            Sections: []
        }
    ];

    const c = await bootConfigPage({ pagesFail: true, userId: 'user-1', config: before });

    const cb = c.document.querySelector('#epShowSearch');
    cb.checked = true;
    cb.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await c.tick();

    const after = c.stored();
    assert.equal(after.ShowSearch, true);
    assert.deepEqual(after.Users, before.Users, "the user's layout is untouched");
    assert.deepEqual(layoutOf(after), layoutOf(before), 'and so is the server default');
});
