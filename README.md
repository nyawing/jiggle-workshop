# Jiggle Workshop

Use Jiggle Workshop on Windows to prepare flexible Nyawing accessories, including capes, tails, ribbons and hanging decorations.

## Get started

Extract the complete Windows x64 release into a folder, then launch **Jiggle Workshop.exe**. Leave resources beside the executable; the portable release already includes its Python and Node runtime.

1. Open an accessory RBXM/RBXMX, a saved .jiggle.json project, or load an accessory by its catalog ID.
2. Mark the surface that should bend, place the chain start and end, and add intermediate bend points as needed.
3. Use the brush or gradient to distribute weights. A weight of zero leaves the surface fixed; increasing it makes the surface follow the chain more closely.
4. Preview the accessory in motion or try it on the character with walking and jumping.
5. To animate a particular chain, select its part in Bones and enable its wind wave, then choose a direction.
6. Save the editable project. Export the mesh and accessory ZIP when ready; upload the mesh and supply its asset ID in the export dialog.

Imported accessory scripts are not executed. Keep the original file if you need custom scripts. Unavailable meshes can be selected manually. The editor does not publish accessories automatically.

## Version 0.5.4

- Synchronized simulation and improved boundary contact reduce shaking across frame rates.
- Smooth cloth bending and wave directions for individual chains.
- Character fitting preview with walking, jumping and shift-lock controls.
- Protection against accidentally closing an edited project.
- Updated documentation and a cleaned distribution.

## Notes

The preview runs SmartBone through an editor compatibility layer. It does not contain the full Roblox engine, so check exported items in game before publishing. Saved settings are retained when an older project is opened. Keep the original files: import and export of meshes with an existing skin may be restricted.

## Development

Install dependencies with `npm ci`, build with `npm run build`, run unit tests with `npm test`, and launch with `npm start`. Backend tests are in `tests/test_asset_io.py`.

## Licenses

Third-party notices are included in `licenses`. Original SmartBone and other vendor notices are retained.

## Подготовка проверок исходников

Для сборки из исходников нужны Node.js/npm и Python 3. Установите Python-зависимости из `backend/requirements.txt`. Для чтения и записи двоичного RBXM положите `rbxmk.exe` в `backend/`; сторонний исполняемый файл в Source.zip не включён. Проверки интерфейса запускаются через `node tests/ui-smoke.mjs` в скрытом окне Electron.
