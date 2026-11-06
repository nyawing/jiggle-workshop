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

## 0.5.0: manual gradient, MCP retired

The AI/MCP button, preload API and MCP listener are removed from the application.
MCP source is retained for reference but is excluded from portable releases.

Select the flexible surfaces, choose Gradient (Ctrl+W), then drag from the base to
its tip. The start value defaults to 0%; the end uses the Weight slider.
Vertices at the same position along the line receive the same scalar weight
across the whole width, rather than radial falloff around bones. Strength blends
with existing weights. Without a selection, the surface at the drag start is
used. Other chains remain protected. Through enables hidden surfaces explicitly.
Esc cancels; one completed drag is one Ctrl+Z undo. Source geometry is unchanged.

Set Weight, Zero and Isolate remain available. Clear Selection is now directly
accessible beside the selection tools, outside the collapsed Actions menu.
Autoweights retain their existing radial behavior.

## 0.4.1: requested-part-only containment

MCP guidance requires initially rigid non-target geometry to remain uninfluenced
by ALL chains after automatic weights and mirror operations. Selection alone is
not cleanup. State component summaries expose weightedVertices, maxWeight and
weightOwners independently of the active chain. Explicit set_weights erase with
allChains:true clears only selected components or supplied vertices and returns
cleanupSummary.remainingNonzero. This flag is rejected for other operations.
The UI's explicit “Обнулить” selection action also zeros all influences in that
selection; ordinary brushes retain owner protection. Pre-existing intentional
animation outside the request must be preserved. Automatic weighting math is
unchanged.

## 0.4.0: guided MCP, reference examples and input responsiveness

MCP initialization contains the short rigging workflow. Every tool description
and response includes contextual guidance (`_guide` in JSON results), without
repeating the full skill. Normal tasks hand motion review to the user with Space;
no automatic simulation/tuning loop is recommended. Automatic weights guidance
explicitly checks the entire flexible surface for weak edges/blue holes while
preserving rigid mounts; scalar statistics alone do not prove good coverage.

get_examples lists authored references or returns one JSON + PNG worked design:
cherry (2 points), curved ears (5 per ear), curved tail (4 points). These are
synthetic, statically validated design references, not user-approved simulations.
Coordinates must be adapted to the actual accessory. The local skill also ships
under skills/jiggle-workshop/SKILL.md for clients with skill discovery.

mirror_weights copies tuned scalar weights to a corresponding chain on the
opposite side of the same mirror axis. Matching is geometric, bounded and
reports unmatched/protected vertices; unrelated chains and source geometry are
unchanged. Use it after mirror_chain, which continues to copy only bones.

Newly loaded accessories always start in ordinary material view. Contrast weights
are switched on manually. Bone handles are hidden while painting and simulating. Vertex hover dots are off by default and available in
advanced actions. Brush events are batched per animation frame; scalar/skin GPU
uploads happen once per frame. The cursor keeps a stable opacity. Input controls
remain within a single header row at minimum supported window size.

## 0.3.0: user MCP connection

Open **ИИ · MCP**, enable the connection, choose OpenCode or OpenCode v2, then
copy the configuration into your opencode.json (merge the shown mcp block with
existing servers). Restart/reconnect the MCP client. Keep Workshop open. The
setting is off on first use and retained after an explicit enable/disable.

No separate Node or Python install is required by Workshop's bundled MCP server.
The HTTP endpoint binds only to 127.0.0.1 and requires the copied bearer token.
The configuration is private; do not publish it. Disable MCP in the same dialog
to stop the listener. The endpoint may change if another app occupies its port;
copy the current configuration from the dialog after enabling.

An image-capable model can receive viewport PNGs directly through screenshot.
Text-only models can still inspect structured state, components and vertices.
Screenshots capture only the Workshop 3D viewport, not the desktop. Close open
Workshop dialogs before screenshot or set_view. Screenshot metadata contains
CSS viewport dimensions and actual image dimensions: convert image coordinates
by CSS/image scale before brush_stroke. Positions for bones are mesh-local.

Tools: get_state, get_vertices (paged, 256 max), import_accessory, set_view,
screenshot, create_chain, move_bone, mirror_chain, select_chain, select_surfaces,
set_weights, brush_stroke, automatic_weights, configure_physics, simulate, undo,
save_project, export_accessory. Component summaries are capped at 64 entries.
Weight operations protect other chains; reassign requires explicit current
activeChain. Edits use normal undo. Save/export use the application's native
save dialogs; no automatic publishing or arbitrary code execution is exposed.
Imports reject unsaved changes unless discardChanges is explicitly supplied.
Concurrent/busy edits return an error instead of queuing stale commands.

Example request to an assistant: “Посмотри предмет с нескольких сторон, создай
две цепочки для прядей, назначь веса, покажи результат и запусти проверку.”
The model and provider are chosen in your MCP client, independently of Workshop.

Protocol: JSON Streamable HTTP 2025-03-26/2025-06-18/2025-11-25, with strict
schemas and localhost Host/Origin checks. References:
https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
https://opencode.ai/docs/mcp-servers/
https://dev.opencode.ai/v2/docs/mcp-servers/

Tests: npm test; node tests/mcp-renderer-smoke.mjs;
node tests/mcp-integration-smoke.mjs. The last check uses the official MCP SDK
against real Electron IPC, viewport capture, editing, undo and backend ZIP export.

## 0.2.0: predictable weight editing

Set, erase and smooth share a CSS-pixel screen brush, smoothstep hardness and strength.
A stroke applies maximum coverage from a snapshot; analytic swept disks include every
point of the mouse path without event-frequency accumulation. Shift temporarily smooths.
Visible mode caches a CPU depth buffer with source culling; the shared Through toggle
explicitly includes hidden shells. Original geometry is never subdivided.

Select connected surfaces independently of chains (Shift adds, Ctrl removes), isolate
selection, set/zero selected weights, or explicitly reassign selection. Other chains are
protected from ordinary strokes. Advanced actions include global cleanup and whole-item
assignment. Each stroke/action has one undo. Hover shows real eligible vertices; a gray
cursor means no eligible vertices. The scalar heatmap uses a fixed 0–100% fragment palette;
foreign chains are neutral, with an optional all-influences overview.

Projects retain version 1 plus optional editor settings/selection. Old projects open
without recomputing masks/skin. Original positions, topology, UVs and exported asset
formats are unchanged. No public accessory models or catalog statuses are modified.

Tests: npm test; node tests/ui-smoke.mjs; node tests/erase-smoke.mjs.
Weight projection tests include 100k vertices, occlusion, inside/backface views,
mirrored transforms, UV seams, isolation and event-frequency invariance.

## 0.1.30: compact editing and reliable erasing

Removed F1, the shortcut popup and repeated panel/canvas instructions. V paints,
E erases, Q selects bones, Ctrl+Q creates a chain, Ctrl+D mirrors, G places a point,
and Space tests. Shortcuts remain inactive in text fields. Checkbox alignment is fixed.
Erasing uses exact zero weights, accepts reverse faces and projected strokes without
an exact triangle hit. Through mode defaults on; whole-detail erasing includes shells
under the ray in that mode. Clear all weights is undoable. Eraser controls hide
irrelevant weight/radius inputs.

## 0.1.29: fast weight editing

E selects the eraser; Shift+E erases a whole connected surface in one click.
X toggles a projected through brush for both sides and overlapping shells. This
explicit mode can reach nearby details under the circle; ordinary surface painting
stays isolated. Erasing clears weights from every chain, with one-stroke undo.
N creates a chain, M mirrors it, B paints, Space tests, H toggles weights, and
F1 opens the shortcut popup. Text input fields retain their normal keyboard use.
Weight heatmaps retain the source culling mode too.

## 0.1.28: preserve cartoon outlines

The editor and exported MeshPart retain the source DoubleSided setting. Single-sided
inverted-hull accessories no longer show their colored outer backfaces over the
black core. Saved projects retain this appearance setting too; older drafts default
to normal backface culling. This fixes outline rendering, not a bloom effect.

# Jiggle Workshop — prototype 0.1.27

Contrast weight view uses an unlit, texture-free heatmap while editing. Blue means rigid; cyan/yellow/red show increasing weights. Other chains are purple. Toggle «Контрастные веса» to see the original texture. Simulation/Check use the textured material. This is display-only; automatic weights and exported textures are unchanged.

# Jiggle Workshop — prototype 0.1.26

G or «Точка по поверхности» picks the selected rest point onto the mesh under the cursor. Pink preview, click to commit, Escape to cancel. No edit is made while hovering. Right-drag remains camera orbit.

«Копировать цепочку» reflects the whole selected chain around the mesh bounding-box center along X (default), Y or Z. Existing geometry and weights remain unchanged; paint or regenerate weights for the mirrored side. Ctrl+Z undoes placement or mirroring. The 25-point limit still applies.

# Jiggle Workshop — prototype 0.1.25

0.1.25 adds Ctrl + mouse wheel to zoom the camera toward the pointer. Plain
wheel still rotates the accessory, right-drag still orbits the camera. Zoom
does not edit bones, weights or physics settings and is disabled while dragging
a bone/brush stroke. Distance limits scale with the imported model.

0.1.24 asks before replacing an edited accessory through Load, Open File,
drag-and-drop or the tutorial. Cancel does not start a download, replace the
backend source, stop simulation or discard bones/weights/settings. Protection
also applies to partial bone placement and restored projects containing work.
An untouched import does not require confirmation. Export does not disable the
replacement warning. This is confirmation protection, not automatic recovery.

This build also includes the SharedString converter hotfix: existing typed
binary fields retain their type and bytes instead of being passed to a
BinaryString constructor that rejects SharedString userdata.

Local v7 LOD hotfix: parse the LODS v1 boundary table and render/export only
LOD0, rather than overlaying every detail level. Invalid or duplicate LOD
tables fail explicitly. Verified with Fishing Rod 81552131544900 (3800 base
triangles out of 7025 across five levels); no UV/texture modification needed.
The valid type-0 `[0, 0]` no-LOD sentinel preserves the entire core mesh;
verified with fresh green sprout 81401971947398 (3514 triangles). Other invalid
boundary tables still fail validation rather than silently drawing all LODs.

0.1.11 restores the BrickColor type before binary RBXM export. This prevents
legacy clients rejecting MeshPart with "Unexpected format 3 (expected 11)".
The converter does not execute imported scripts or change the skin geometry.

0.1.10 fixes Cyrillic file paths: backend JSON input is explicitly UTF-8,
independent of the Windows code page. Existing files are not renamed.

0.1.9 adds **Добавить точку изгиба** in Bones. Select a point/segment and
insert a midpoint on its following segment (the tip splits the last segment).
Move the new selected point with XYZ arrows or numeric coordinates to form
an angled ear. Repeat for more bends. Unlike changing segment count, insertion
does not straighten the chain: existing rest points, painted strength and part
ownership survive. Influences are redistributed only for that chain; other
chains keep their weights. Ctrl+Z undoes insertion. Auto weights follow the
resulting bent chain; use the weight brush to strengthen/soften a local bend.

0.1.8 adds **Автовеса по всем костям** in the Weights tab. Create chains first,
set the desired weight strength, then generate weights. This replaces existing
paint only after confirmation and can be undone. Nearest chains receive smooth
proximity weights; roots and distant vertices stay rigid. Influence radius is
35% of chain length. This is a starting-point heuristic, not semantic detection
of ears/hair: nearby unrelated surfaces may need manual brush correction.

0.1.7 migrates downloads to assetdelivery.nyawing.com and public metadata to
www.nyawing.com. New .com item links and older .lol links are accepted;
legacy links are parsed locally and never contacted on the old domain.

Standalone Windows accessory editor. No Studio or separately installed Python is
needed for the portable build. Unzip the entire folder and run `Jiggle Workshop.exe`.
Do not move the executable out of its folder. The prototype is not code-signed.

## Simple workflow

1. Paste an item ID or Nyawing/Roblox catalog URL and click **Загрузить**.
   Nyawing catalog links and bare catalog IDs are resolved to the delivery
   alias (`2100000000 + catalog ID`); e.g. catalog `175567` uses asset
   `2100175567`. Roblox catalog links, `rbxassetid://` and asset endpoint
   URLs keep their asset IDs. A bare ID also tries the raw asset ID if the
   catalog alias returns 404. Explicit catalog URLs never silently load an
   unrelated raw asset. Downloads use Nyawing's fixed asset service.
   The accessory, mesh and texture load automatically when available.
   Alternatively open/drop a single Accessory in RBXM/RBXMX, or try the tutorial pendant.
2. Hair/accessory type is detected from the imported attachment/AccessoryType and,
   for ID/link imports, optional public item metadata. The corresponding physics
   preset is selected automatically; unavailable metadata does not block import.
3. The sidebar has three tabs: **Кости**, **Веса**, **Проверка**. Only the current
   tools are shown. Advanced controls are collapsed; export is in the top bar.
4. In **Кости**, click **Добавить кость: начало → конец** and click twice.
   This creates **one segment** for a separate part. Add another for the other
   bell/ear/tail. Choose the current part in **Часть предмета**; name it under
   the collapsed bone options. Marker/segment clicks also select its part.
   **Начало** / **Конец** replace endpoints of the selected chain without
   changing weights. There is no visible line from the mesh origin.
5. In **Веса**, paint the selected part. Set **Вес** to 100% for strong motion,
   or e.g. 20% for weak ears. Painting approaches this target and can reduce
   existing weights. Green shows the selected part, blue shows other chains,
   yellow shows retained unbound draft paint. Only painted vertices acquire the selected chain; erase
   skips vertices owned by another chain. Zero weight stays rigid. The brush
   follows connected triangle surfaces/UV seams and locks each stroke to its
   starting component. Optional surface lock is under **Ограничение кисти**.
   Its whole-mesh action explicitly binds the entire mesh to the selected part.
6. In **Кости**, **Выбрать / двигать** selects markers or visible segments.
   Drag X/Y/Z arrows in the item's coordinates. Collapsed options provide a
   point selector, numeric XYZ, **В центр меша** and view-plane placement.
   A bone can be inside the mesh, with no surface hit required. Extra segments
   are opt-in and update only the selected part's influences.
   Delete removes a node; removing a sole segment deletes that part's chain,
   retaining paint as an unbound draft and preserving other parts. Export
   requires positive paint to be assigned to a chain or erased. Creating a
   new chain adopts retained unbound paint; assigned parts remain untouched.
   A longer chain retains survivor rest frames and weight amounts, remapping
   a deleted influence to the nearest survivor of that same chain.
7. **Отменить** / Ctrl+Z restores strokes, creation, rest edits, count changes,
   naming and deletion (20 edits), including focused sliders/selects/numeric
   inputs and Russian keyboard layout. Text fields keep native text undo.
8. **Проверка** enables simulation. Left-drag moves the accessory in the screen
   plane; wheel rotates the item, right-drag rotates the camera. Reset stops
   simulation and clears viewport motion/yaw while preserving all bone edits
   and weights. Physics presets/sliders are under **Параметры движения**.
9. **Сохранить проект** saves exact rest frames, skin rows, part assignments
   and names in .jiggle.json; **Открыть файл** restores them. Older one-chain
   projects migrate without redistributing their weights.
10. **Экспорт** opens mesh save and optional RBXM export. Upload the saved mesh
    separately, enter its new asset ID, then save the local ZIP. The editor
    does not publish anything.

Moving rest bones never changes geometry or recalculates skin weights. Bind
matrices stay in mesh coordinates, independent of viewport rotation/movement.
Only explicitly painted/erased vertices get new flexible influences. Explicitly
changing the segment count rebuilds flexible influences only for the selected part;
rest/endpoint edits keep all existing skin rows unchanged. Zero green weight means 100%
binding to the immutable `RigidRoot`: those vertices follow the accessory's rigid
motion but receive no SmartBone deformation. A zero-sum skin row would instead
collapse a vertex and is not used. Keep neighboring chain bones at least 0.01
units apart. Saving a project/export stores the rest pose, even during simulation.

There is no automatic publishing or credential handling. An RBXM stores a mesh
reference, not necessarily the geometry itself. Import looks for `<assetID>.mesh`
next to the RBXM, then in the development cache, then queries Nyawing's fixed
asset endpoint. If unavailable, select a `.mesh` manually. Textures are optional.

## Current limits — this is not a finished public release

- One mesh with independent linear chains: one segment per added part by default.
  Up to 25 flexible points total (12 one-segment parts), or 1–24 segments for
  a single chain, due to the mesh subset format. The editor
  displays segments; SmartBone/export use start/tip Bone nodes plus an internal
  immutable rigid skin root. The rigid root is not an editable or visible segment.
- Mesh v2/v4/v5; v7/Draco is not yet supported by the desktop importer.
- Existing skinned meshes are not re-rigged; the prototype refuses their export
  rather than discarding their existing skin weights.
- Presets are starting points, not guaranteed good rigs for all shapes.
- Painting, undo, project persistence, real weights, skinned v4 export and
  SmartBone simulation are implemented. Native Nyawing rendering of a newly
  exported/hosted accessory still needs a real end-to-end test.

## Simulation

The trusted existing `games/newgame/smartbone` solver is bundled into a Luau WASM
VM using luau-web. The application supplies a small Vector3/CFrame/Bone adapter,
not Roblox Engine. One trusted controller manages all independent roots; no
second solver is added. Weight strength controls deformation amplitude, while
advanced physics settings remain global to the accessory. Export lists every
root in the native SmartBone Roots attribute. Tests check finite transforms, movement/rotation, bone axes
and cleanup; exact engine equivalence is not yet established. Wind is disabled
in the initial editor/export settings to keep the test reproducible.

Imported asset scripts are never executed and are excluded from exported copies.
The original file is untouched. Keep your original if it has custom effect
scripts you want to merge later. External mesh/texture URLs are not executed or
followed; downloads use numeric IDs on the fixed asset host, without redirects.

## Development checks

```powershell
npm ci
npm run build
npm test
python tests/test_asset_io.py
node tests/ui-smoke.mjs
node tests/multipart-smoke.mjs
npm start
```

Multipart tests exercise independent rest/count/deletion/paint, lower weight
targets, weak and strong deformation, all native export roots and project
ownership. The second invisible smoke test uses live catalog 175558, four
separate bell/ear chains, rigid vertices and local export.

Tests exercise default two-click creation, optional segments, global stroke undo,
connected-surface brush isolation and rest/bind invariance after body rotation, zero-weight vertices
with the real Luau SmartBone solver, brush isolation, moved/rotated export poses,
project restoration, Delete/undo and a painted draft without bones. Tests also
check camera-relative drag in both directions from front/rear views, repeated
reset with pending physics, and rest edits/restarts on a moved off-centre mesh. The Electron smoke test opens its own invisible window;
it exercises bone clicks, real gizmo drags, center/plane placement and undo.
Set `WORKSHOP_EXE` to a portable executable to run the same checks on a release.

Build a fresh backend and portable folder (both scripts refuse existing targets):

```powershell
python scripts/build_backend.py --output ../../_work/jiggle-workshop-build-0.1.6
python scripts/package_portable.py --backend ../../_work/jiggle-workshop-build-0.1.6/backend/workshop-backend.exe --output ../../_work/jiggle-workshop-release/JiggleWorkshop-0.1.6
```

Backend packaging uses PyInstaller with `backend/convert.lua` and `rbxmk.exe`.
Project-authored Lua is comment-stripped in generated/staged delivery copies;
local explanatory comments and original SmartBone/vendor notices are retained.
`scripts/package_portable.py` assembles a fresh candidate under repository `_work`
and refuses to replace any existing build. Electron, Chromium, Three, Luau,
SmartBone, rbxmk, Python and PyInstaller license notices accompany the build.
