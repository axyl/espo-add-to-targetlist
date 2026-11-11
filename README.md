# Add to Target List — EspoCRM extension

Adds **Add to Target List** to the list-view **Actions** menu for entities that support Target List membership. Select checked records or **all matching results**, then choose an existing Target List or create a new one in EspoCRM's standard selection dialog.

## Compatibility

Developed against the supplied EspoCRM checkout (`10.1.1-8-g135cad55d3`, package version `10.1.1`), using its built-in APIs. The manifest requires EspoCRM 10.1.1+ and PHP 8.3+. Older versions and future versions have not been verified.

No additional extension, PHP service, database migration, core edit, or per-entity view override is needed.

## Build and install

Requirements for building: Bash and Python 3. Tests require Node.js 18+ and no npm dependencies.

```bash
./build-extension.sh
```

Output: `build/add-to-target-list-1.0.0.zip`. The build uses the version in `manifest.json` without incrementing it. The archive contains `manifest.json` at its root and application files under `files/`, as required by the EspoCRM extension installer.

1. Back up the CRM and test in a staging instance first.
2. Open **Administration → Extensions**, upload the ZIP, and complete installation.
3. Reload the browser. If metadata or frontend assets appear stale, clear EspoCRM's cache and reload.

To remove it, uninstall **Add to Target List** in Administration → Extensions. Removing the extension does not remove existing Target List memberships.

## Usage

1. Open a compatible entity's list view, such as Contacts.
2. Check individual records, or use EspoCRM's **select all results** option after applying your filters.
3. Choose **Actions → Add to Target List**.
4. Select a Target List, or use **Create** in the selector, save the new list, and it will be used automatically.
5. Wait for the completion notification.

Canceling the selector makes no membership changes. Creating a Target List uses EspoCRM's existing creation permission checks and form validation. Target List categories are preserved by using the configured selection-modal view.

This extension adds no detail-view record action. It uses the normal list mass-action infrastructure; compatible relationship lists may also inherit the checked-record action. EspoCRM controls whether all-results selection is available in those contexts.

## How entity support is determined

The handler checks `scopes.TargetList.targetLinkList`, resolving each registered TargetList-side link through `entityDefs.TargetList.links.<link>.entity`. This is the same registry used by EspoCRM's Target List metadata provider, not a hardcoded list or a guess based on an email field.

The built-in supported entities are **Account, Contact, Lead, and User**. A properly configured custom target entity is detected automatically. A generic relationship to TargetList is not enough: it must be registered as a target-membership relationship and have the corresponding server relationship configuration.

EspoCRM's relationship manager supplies that configuration when creating a supported many-to-many relationship between TargetList and a Person/Company entity, with the other entity's link named `targetLists`. Custom code can configure other supported relationships using the same metadata conventions. If several registered target links point to one entity type, the last registered link is used, matching the core metadata provider.

The action is hidden before display when the entity is unsupported or scope-level access is insufficient. The handler checks availability again when invoked.

## Permissions and data behavior

- The user needs read access to source records and read/edit access to Target Lists. Source edit permission is not required.
- The standard relationship API enforces destination record edit access, source access, relationship permissions, and configured link rules. Browser visibility checks are only a convenience, not the security boundary.
- A readable but non-editable Target List may appear in the selector. The server will reject adding records to it.
- Duplicate membership and restoring removed relationships are handled by EspoCRM. Existing opt-out flags are not deliberately cleared; adding records does **not** cancel an opt-out.
- The selected records/filters are captured when the action is opened. In all-results mode the server evaluates those filters when submitting, rather than freezing a list of matching IDs at dialog-open time.
- The core API returns a boolean, not a reliable new-membership count. The extension therefore does not display a count. An explicit `false` response produces a no-records-added warning.
- Explicit IDs are processed sequentially by the core API. If a request fails partway through, some records may already have been linked. The error notification warns about this; inspect the Target List before retrying.
- Requests use the existing **synchronous** relationship endpoint. Select-all is not a background job. Very large selections may exceed your web server or PHP timeout; use narrower filters or batches in that case. Bulk selection follows the core mass-link path, which can have different hook behavior from individual linking.
- The extension leaves the source selection intact after completion so it does not unexpectedly change list state.

## Implementation layout

- `custom/Espo/Modules/AddToTargetList/Resources/module.json`: isolated module, loaded after CRM.
- `custom/Espo/Modules/AddToTargetList/Resources/metadata/clientDefs/Global.json`: additive mass-action registration, including all-results support.
- `custom/Espo/Modules/AddToTargetList/Resources/i18n/en_US/Global.json`: English labels and messages, with normal EspoCRM language fallback.
- `client/custom/modules/add-to-target-list/src/handlers/add-to-target-list.js`: compatibility/ACL checks, standard select/create dialog, and relationship submission.

Using a named module avoids overwriting a site's existing `custom/Espo/Custom/Resources/metadata/clientDefs/Global.json` or custom JavaScript. Metadata arrays use `__APPEND__` so existing actions remain available.

The handler posts checked IDs as `{ids: [...]}` to `TargetList/{id}/{link}`. For all-results selections it posts `{massRelate: true, where: [...], searchParams: {...}}` to the same endpoint, preserving the list's filters and search parameters.

## Automated checks

```bash
node --test tests/*.test.mjs
bash -n build-extension.sh
./build-extension.sh
```

The dependency-free handler tests use EspoCRM API mocks. They cover built-in and custom entity eligibility, permissions, metadata registration, explicit/all-results payloads, selection snapshots, selector creation configuration, cancellation, duplicate-click protection, errors, and no-record responses. They do not replace testing against a live CRM.

## Manual acceptance checklist

A live EspoCRM installation is required for these checks:

- Install the generated ZIP; verify existing Actions entries remain present.
- Check Account, Contact, Lead and User lists; verify an unrelated entity has no action.
- Configure a custom target entity using the relationship manager; verify automatic detection.
- Add checked records to an existing list, then create a list from the selector and add records to it.
- Select all matching records with text, primary and advanced filters; verify records beyond the current page are included and non-matching records are not.
- Cancel the selector and confirm no membership change.
- Verify category navigation and behavior when Create permission is denied.
- With a non-admin user, test source read-only access, no TargetList edit access, and a readable but non-editable destination.
- Add already related, opted-out and previously removed members; confirm the expected core behavior and unchanged opt-out status.
- Force an API error and verify the warning, no false success, and ability to retry.
- Uninstall the extension and confirm the action disappears while memberships remain.
