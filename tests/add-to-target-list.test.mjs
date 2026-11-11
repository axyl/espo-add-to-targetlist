import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL(
    'client/custom/modules/add-to-target-list/src/handlers/add-to-target-list.js', root
), 'utf8');
const readJson = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const moduleRoot = 'custom/Espo/Modules/AddToTargetList/Resources/';
const translations = readJson(moduleRoot + 'i18n/en_US/Global.json');

function fixture(options = {}) {
    const entityType = options.entityType || 'Contact';
    const metadata = {
        scopes: {TargetList: {targetLinkList: ['accounts', 'contacts', 'leads', 'users', 'cPeople']}},
        entityDefs: {TargetList: {links: {
            accounts: {entity: 'Account'},
            contacts: {entity: 'Contact'},
            leads: {entity: 'Lead'},
            users: {entity: 'User'},
            cPeople: {entity: 'CPerson'},
        }}},
        clientDefs: {TargetList: {modalViews: {select: 'views/modals/select-records-with-categories'}}},
    };
    const notifications = [];
    const requests = [];
    const removed = [];
    const dialogs = [];
    let Handler;
    let selection = options.selection || {ids: ['one', 'two']};
    const sandbox = {
        Espo: {
            define: (name, dependencies, factory) => {
                assert.equal(name, 'add-to-target-list:handlers/add-to-target-list');
                assert.deepEqual(Array.from(dependencies), ['action-handler']);
                Handler = factory(class {constructor(view) {this.view = view;}});
            },
            Utils: {cloneDeep: structuredClone},
            Ui: Object.fromEntries(['error', 'success', 'warning', 'notifyWait'].map(method =>
                [method, message => notifications.push({method, message})]
            )),
            Ajax: {postRequest: async (url, data) => {
                requests.push({url, data});

                if (options.request) {
                    return options.request();
                }

                return options.result === undefined ? true : options.result;
            }},
        },
    };
    const view = {
        entityType,
        collection: {},
        getMetadata: () => ({get: keys => keys.reduce((value, key) => value?.[key], metadata)}),
        getAcl: () => ({checkScope: (scope, action) =>
            !(options.denied || []).includes(`${scope}:${action}`)
        }),
        removeMassAction: name => removed.push(name),
        translate: (key, category) => {
            assert.ok(translations[category]?.[key], `Missing translation: ${category}.${key}`);

            return key;
        },
        getMassActionSelectionPostData: () => selection,
        createView: async (key, name, args) => {
            if (options.dialogFails) {
                throw new Error('Dialog failed');
            }

            const modal = {
                key, name, args,
                render: async () => {modal.rendered = true;},
                close: () => modal.onClose?.(),
            };

            dialogs.push(modal);

            return modal;
        },
        listenToOnce: (modal, event, callback) => {
            assert.equal(event, 'close');
            modal.onClose = callback;
        },
    };
    vm.runInNewContext(source, sandbox);

    return {
        Handler, handler: new Handler(view), view, metadata, dialogs, requests, notifications, removed,
        setSelection: value => {selection = value;},
        select: async (id = 'target-id') => {
            dialogs.at(-1).args.onSelect([{id}]);
            dialogs.at(-1).close();
            await new Promise(resolve => setImmediate(resolve));
        },
    };
}

for (const entityType of ['Account', 'Contact', 'Lead', 'User', 'CPerson']) {
    test(`registered target entity ${entityType} retains the action`, () => {
        const f = fixture({entityType});
        f.handler.initAddToTargetList();
        assert.equal(f.removed.length, 0);
    });
}

test('an unsupported entity loses the action', () => {
    const f = fixture({entityType: 'Task'});
    f.handler.initAddToTargetList();
    assert.deepEqual(f.removed, ['addToTargetList']);
});

test('a link not registered as Target List membership does not qualify', () => {
    const f = fixture({entityType: 'Task'});
    f.metadata.entityDefs.TargetList.links.tasks = {entity: 'Task'};
    f.handler.initAddToTargetList();
    assert.deepEqual(f.removed, ['addToTargetList']);
});

for (const denied of ['Contact:read', 'TargetList:read', 'TargetList:edit']) {
    test(`missing ${denied} access hides the action and blocks invocation`, async () => {
        const f = fixture({denied: [denied]});
        f.handler.initAddToTargetList();
        await f.handler.actionAddToTargetList();
        assert.deepEqual(f.removed, ['addToTargetList']);
        assert.equal(f.dialogs.length, 0);
        assert.equal(f.requests.length, 0);
    });
}

test('source edit access is not required', () => {
    const f = fixture({denied: ['Contact:edit']});
    assert.ok(f.handler.isAvailable());
});

test('missing collection hides the action', () => {
    const f = fixture();
    f.view.collection = null;
    f.handler.initAddToTargetList();
    assert.deepEqual(f.removed, ['addToTargetList']);
});

test('mapping follows the core last-link-wins convention', () => {
    const f = fixture();
    f.metadata.scopes.TargetList.targetLinkList.push('otherContacts');
    f.metadata.entityDefs.TargetList.links.otherContacts = {entity: 'Contact'};
    assert.equal(f.handler.getTargetLink(), 'otherContacts');
});

test('selector uses configured categories, single selection and built-in creation', async () => {
    const f = fixture();
    await f.handler.actionAddToTargetList();
    const modal = f.dialogs[0];
    assert.equal(modal.name, 'views/modals/select-records-with-categories');
    assert.equal(modal.args.scope, 'TargetList');
    assert.equal(modal.args.multiple, false);
    assert.equal(modal.args.createButton, true);
    assert.equal(modal.args.onCreate, undefined);
    assert.ok(modal.rendered);
});

test('generic selector fallback works', async () => {
    const f = fixture();
    delete f.metadata.clientDefs.TargetList.modalViews;
    await f.handler.actionAddToTargetList();
    assert.equal(f.dialogs[0].name, 'views/modals/select-records');
});

test('explicit records are posted to the destination relationship', async () => {
    const f = fixture();
    await f.handler.actionAddToTargetList();
    await f.select();
    assert.equal(f.requests[0].url, 'TargetList/target-id/contacts');
    assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].data)), {ids: ['one', 'two']});
    assert.equal(f.notifications.at(-1).message, 'addToTargetListDone');
    assert.equal(f.view._addToTargetListState, undefined);
});

test('all-results preserves filters and search parameters, without a page ID limit', async () => {
    const selection = {
        byWhere: true,
        where: [{type: 'equals', attribute: 'status', value: 'New'}],
        searchParams: {primaryFilter: 'active', boolFilterList: ['onlyMy']},
    };
    const f = fixture({selection});
    await f.handler.actionAddToTargetList();
    await f.select();
    assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].data)), {
        massRelate: true, where: selection.where, searchParams: selection.searchParams,
    });
});

test('selection is deeply snapshotted before the dialog opens', async () => {
    const selection = {byWhere: true, where: [], searchParams: {primaryFilter: 'active'}};
    const f = fixture({selection});
    await f.handler.actionAddToTargetList();
    selection.where.push({type: 'changed'});
    selection.searchParams.primaryFilter = 'changed';
    await f.select();
    assert.equal(f.requests[0].data.where.length, 0);
    assert.equal(f.requests[0].data.searchParams.primaryFilter, 'active');
});

test('no selection is rejected before opening the dialog', async () => {
    const f = fixture({selection: {ids: []}});
    await f.handler.actionAddToTargetList();
    assert.equal(f.dialogs.length, 0);
    assert.equal(f.notifications.at(-1).message, 'addToTargetListEmptySelection');
});

test('cancel posts nothing and allows reopening', async () => {
    const f = fixture();
    await f.handler.actionAddToTargetList();
    f.dialogs[0].close();
    await new f.Handler(f.view).actionAddToTargetList();
    assert.equal(f.dialogs.length, 2);
    assert.equal(f.requests.length, 0);
});

test('new handler instances cannot open duplicate dialogs', async () => {
    const f = fixture();
    await f.handler.actionAddToTargetList();
    await new f.Handler(f.view).actionAddToTargetList();
    assert.equal(f.dialogs.length, 1);
});

test('request guard survives dialog close and prevents duplicate submission', async () => {
    let finish;
    const request = new Promise(resolve => {finish = resolve;});
    const f = fixture({request: () => request});
    await f.handler.actionAddToTargetList();
    await f.select();
    f.dialogs[0].args.onSelect([{id: 'duplicate'}]);
    await new f.Handler(f.view).actionAddToTargetList();
    assert.equal(f.dialogs.length, 1);
    assert.equal(f.requests.length, 1);
    finish(true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.view._addToTargetListState, undefined);
});

test('newly created target ID follows the same submission path', async () => {
    const f = fixture();
    await f.handler.actionAddToTargetList();
    await f.select('newly-created');
    assert.equal(f.requests[0].url, 'TargetList/newly-created/contacts');
});

test('server errors warn about partial completion and release the guard', async () => {
    const f = fixture({request: () => {throw new Error('Forbidden');}});
    await f.handler.actionAddToTargetList();
    await f.select();
    assert.equal(f.notifications.at(-1).message, 'addToTargetListFailed');
    assert.equal(f.notifications.filter(n => n.method === 'success').length, 0);
    assert.equal(f.view._addToTargetListState, undefined);
});

test('false API response is not reported as records added', async () => {
    const f = fixture({result: false});
    await f.handler.actionAddToTargetList();
    await f.select();
    assert.equal(f.notifications.at(-1).method, 'warning');
    assert.equal(f.notifications.at(-1).message, 'addToTargetListNoRecords');
});

test('dialog loading failure releases the guard', async () => {
    const f = fixture({dialogFails: true});
    await f.handler.actionAddToTargetList();
    assert.equal(f.notifications.at(-1).message, 'addToTargetListDialogFailed');
    assert.equal(f.view._addToTargetListState, undefined);
});

test('metadata appends actions rather than replacing existing ones', () => {
    const defs = readJson(moduleRoot + 'metadata/clientDefs/Global.json');
    assert.deepEqual(defs.massActionList, ['__APPEND__', 'addToTargetList']);
    assert.deepEqual(defs.checkAllResultMassActionList, ['__APPEND__', 'addToTargetList']);
    assert.equal(defs.massActionDefs.addToTargetList.aclScope, 'TargetList');
    assert.equal(defs.massActionDefs.addToTargetList.acl, 'edit');
    assert.equal(defs.massActionDefs.addToTargetList.handler,
        'add-to-target-list:handlers/add-to-target-list');
    assert.equal(translations.massActions.addToTargetList, 'Add to Target List');
});
