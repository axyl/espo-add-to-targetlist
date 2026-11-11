Espo.define('add-to-target-list:handlers/add-to-target-list', ['action-handler'],
function (ActionHandler) {

    class AddToTargetListHandler extends ActionHandler {

        initAddToTargetList() {
            if (!this.isAvailable()) {
                this.view.removeMassAction('addToTargetList');
            }
        }

        getTargetLink() {
            const metadata = this.view.getMetadata();
            const entityType = this.view.entityType;
            const links = metadata.get(['scopes', 'TargetList', 'targetLinkList']) || [];

            // Follow the same last-link-wins mapping as TargetList MetadataProvider.
            return links.filter(link =>
                metadata.get(['entityDefs', 'TargetList', 'links', link, 'entity']) === entityType
            ).pop();
        }

        isAvailable() {
            const acl = this.view.getAcl();

            return !!this.view.collection &&
                !!this.getTargetLink() &&
                acl.checkScope(this.view.entityType, 'read') &&
                acl.checkScope('TargetList', 'read') &&
                acl.checkScope('TargetList', 'edit');
        }

        async actionAddToTargetList() {
            if (this.view._addToTargetListState) {
                return;
            }

            if (!this.isAvailable()) {
                Espo.Ui.error(this.view.translate('addToTargetListUnavailable', 'messages'));

                return;
            }

            // Snapshot the selection before opening a dialog. Do not use just the
            // currently loaded collection models or lose all-results filters.
            const selection = Espo.Utils.cloneDeep(this.view.getMassActionSelectionPostData());

            if (!selection.byWhere && !selection.searchParams && !(selection.ids || []).length) {
                Espo.Ui.error(this.view.translate('addToTargetListEmptySelection', 'messages'));

                return;
            }

            const link = this.getTargetLink();
            const state = {submitting: false};

            // Handlers are re-created on every click; keep the guard on the view.
            this.view._addToTargetListState = state;

            const modalName = this.view.getMetadata()
                .get(['clientDefs', 'TargetList', 'modalViews', 'select']) ||
                'views/modals/select-records';

            try {
                const modal = await this.view.createView('addToTargetListDialog', modalName, {
                    scope: 'TargetList',
                    multiple: false,
                    createButton: true,
                    onSelect: models => {
                        if (!models[0] || !models[0].id || state.submitting) {
                            return;
                        }

                        state.submitting = true;

                        // The built-in selector closes after this callback. Keep
                        // the click guard until the relationship request finishes.
                        this.addRecords(models[0].id, link, selection)
                            .finally(() => this.releaseState(state));
                    },
                });

                this.view.listenToOnce(modal, 'close', () => {
                    if (!state.submitting) {
                        this.releaseState(state);
                    }
                });

                await modal.render();
            } catch (error) {
                this.releaseState(state);
                Espo.Ui.error(this.view.translate('addToTargetListDialogFailed', 'messages'));
            }
        }

        releaseState(state) {
            if (this.view._addToTargetListState === state) {
                delete this.view._addToTargetListState;
            }
        }

        async addRecords(targetListId, link, selection) {
            const data = selection.ids ? {ids: selection.ids} : {
                massRelate: true,
                where: selection.where || [],
                searchParams: selection.searchParams || selection.selectData || {},
            };

            const url = `TargetList/${encodeURIComponent(targetListId)}/${encodeURIComponent(link)}`;

            Espo.Ui.notifyWait();

            try {
                // The existing Record service validates destination edit access,
                // relationship access and source read access on the server.
                const result = await Espo.Ajax.postRequest(url, data);

                if (result === false) {
                    Espo.Ui.warning(this.view.translate('addToTargetListNoRecords', 'messages'));

                    return;
                }

                Espo.Ui.success(this.view.translate('addToTargetListDone', 'messages'));
            } catch (error) {
                // Explicit IDs are linked sequentially by EspoCRM. An error can
                // leave earlier records linked, so do not report a total failure.
                Espo.Ui.error(this.view.translate('addToTargetListFailed', 'messages'));
            }
        }
    }

    return AddToTargetListHandler;
});
