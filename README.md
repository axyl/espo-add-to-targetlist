# Add to Target List — EspoCRM extension

Adds **Add to Target List** to the list-view **Actions** menu for entities that support Target List membership. Select checked records or **all matching results**, then choose an existing Target List or create a new one in EspoCRM's standard selection dialog.

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

1. Open a compatible entity's list view, such as Contacts or List Report from a compatible entity list.
2. Check individual records, or use EspoCRM's **select all results** option after applying your filters.
3. Choose **Actions → Add to Target List**.
4. Select a Target List, or use **Create** in the selector, save the new list, and it will be used automatically.
5. Wait for the completion notification.

Only works from lists, not detail views.

## Implementation layout

- `custom/Espo/Modules/AddToTargetList/Resources/module.json`: isolated module, loaded after CRM.
- `custom/Espo/Modules/AddToTargetList/Resources/metadata/clientDefs/Global.json`: additive mass-action registration, including all-results support.
- `custom/Espo/Modules/AddToTargetList/Resources/i18n/en_US/Global.json`: English labels and messages, with normal EspoCRM language fallback.
- `client/custom/modules/add-to-target-list/src/handlers/add-to-target-list.js`: compatibility/ACL checks, standard select/create dialog, and relationship submission.

The handler posts checked IDs as `{ids: [...]}` to `TargetList/{id}/{link}`. For all-results selections it posts `{massRelate: true, where: [...], searchParams: {...}}` to the same endpoint, preserving the list's filters and search parameters.
