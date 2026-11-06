# Jiggle Workshop

Desktop accessory rigging and weight-painting editor for Nyawing.

## Run from source

Requires Node.js/npm and Python 3 on PATH.

```sh
npm ci
python -m pip install -r backend/requirements.txt
npm run build
npm start
```

For binary RBXM import/export, install rbxmk and place `rbxmk.exe` in `backend/`.
The binary is not included. Importing by catalog ID uses Nyawing's public service
and requires network access. Local editing does not require a Nyawing login.

The SmartBone solver and its MIT notice are included under `vendor/` and `licenses/`.
Third-party dependencies retain their respective licenses. No additional license
grant is asserted for project-authored code.

## Editing

Create a chain along the flexible part, assign weights, then review its movement.
Keep the attachment and other rigid surfaces at zero flexible weight.

- Q: select; V: brush; E: erase; Shift while painting: smooth.
- Ctrl+W: weight gradient; Ctrl+Q: new chain; Ctrl+D: mirror.
- G: place the selected control point; Space: simulation; Ctrl+Z: undo.

Save the project to continue editing later. Export creates the accessory package.
The original accessory geometry is preserved.

## Physics preview

SmartBone runs inside a Luau WASM sandbox with a Roblox compatibility adapter.
Accessory-supplied scripts are not executed. Its sources are in `vendor/smartbone`;
the original license is in `licenses/SmartBone-LICENSE.txt`.

## Checks

```sh
npm test
npm run build
```
