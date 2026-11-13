# Jiggle Workshop

A Windows editor for Nyawing accessories with flexible details: capes, tails, ribbons and hanging ornaments.

## Get started

Download the Windows x64 ZIP from Releases, extract the entire folder and run **Jiggle Workshop.exe**. Keep the resources folder beside the executable. No separate Python or Node installation is required.

1. Open an accessory RBXM/RBXMX, a saved .jiggle.json project, or load an accessory by its catalog ID.
2. Select the flexible surface and create a chain with a start and endpoint. Add bend points where needed.
3. Paint weights or use a gradient. Zero weight keeps a surface rigid; stronger weights make it follow the chain.
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

The preview uses a trusted SmartBone solver through a compatibility adapter, rather than the full Roblox engine. Check the exported item in game before publishing. Imported legacy projects retain their saved settings. Existing skinned meshes can have import/export restrictions; keep source backups.

## Development

Install dependencies with `npm ci`, build with `npm run build`, run unit tests with `npm test`, and launch with `npm start`. Backend tests are in `tests/test_asset_io.py`.

## Licenses

Third-party notices are included in `licenses`. Original SmartBone and other vendor notices are retained.
