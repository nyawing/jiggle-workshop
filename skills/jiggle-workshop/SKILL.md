---
name: jiggle-workshop
description: Quickly rig ears, hair, tails and accessories in Jiggle Workshop through its MCP. Use for creating or correcting jiggle chains and weights; leave motion testing to the user.
---

# Jiggle Workshop

Build a useful first pass, not an exhaustive rigging investigation. Prefer a few
well-placed control points and one automatic-weight pass over many screenshots
and vertex-by-vertex painting. Use the connected Workshop MCP; tool prefixes may vary. Tool descriptions and
returned `_guide` fields carry the current workflow; use them instead of loading
more instructions repeatedly. `get_examples` provides an optional compact reference
index and a single relevant visual example when needed.

## Default workflow

1. Call `get_state` once. Reuse its bounds, component IDs, chain indices and active
   chain names. If simulation is already running, ask the user to stop it with
   **Space** before editing; do not interfere with their test.
2. Inspect one `screenshot` in bones or material view. Choose a useful direction
   from the bounds: a flat accessory is usually clearest looking along its
   shortest axis. Never assume that ears are separated on X or that `front`
   shows both. Take one additional orthogonal image only if depth/curvature is
   ambiguous. A model without image support must not pretend to have seen it.
3. Preserve an existing useful rig. For an unrigged part, place a chain from its
   actual attachment/base to the tip, following the bend through its thickness.
   Small straight parts need 2 control points; large curved ears usually need
   4–6. Add points where the shape changes direction, not uniformly just to
   increase bone count. These are total chain points, not extra segments:
   `create_chain.segments = point_count - 1`. `RigidRoot` is separate.
4. `create_chain` makes a straight chain: obtain its returned bone indices and
   use `move_bone` on interior points to follow the curve. Positions are mesh-local,
   not screenshot pixels. Mirror only genuinely symmetric parts and only around
   the axis that separates them; mirroring copies bones, not assigned weights. After tuning one symmetric side,
   use `mirror_weights` with the actual source/target chain IDs and the same axis;
   inspect unmatched counts rather than assuming every vertex was copied.
   Existing different label names do not justify rebuilding or renaming chains.
5. Run `automatic_weights` once after all chains are positioned. Use the current
   physics unless the user requested a different feel. Correct a specific bad
   region only when evidence identifies it; do not repaint the entire item or
   tune arbitrary numerical parameters to appear thorough.
6. Inspect the returned state and one final weights image when coverage is uncertain.
   Check side edges and tips, not just a bright middle: outside the rigid mounting
   area, blue holes can leave the rim almost stationary. Repair the evidenced area
   with the brush; smoothing alone cannot create a uniform intended envelope.
   Finish with simulation **not started by you** and a short handoff:
   «Готово: … Нажми **Space** во вкладке проверки и подвигай предмет.
   Если результат не устроит — напиши, что именно ведёт себя неправильно».
   Space is the test key, not Enter. Do not save/export unless requested.

## Avoid the slow loop

Aim for roughly 10–18 tool calls for a simple pair of ears, usually 1–2 images
and at most 3 when an extra view resolves a real ambiguity. This is an efficiency
budget, not a reason to skip necessary corrections or produce a bad rig.
Do not repeatedly request identical state, rotate through every view, page the
entire vertex buffer, build a long plan, or retry unchanged failed commands.
One bounded vertex page can resolve a coordinate ambiguity; it is not a mesh scan.

Do **not** call `simulate(running:true)`, inspect simulation frames, or start an
iterative physics-tuning loop in the ordinary “оживи уши/волосы” task. Motion
review belongs to the user. Only do an automated simulation review when explicitly
asked. After a handoff, wait for feedback rather than continuing to tinker.

## Requested-part-only scope

“Animate only the ears/cherry/pendant” means no new weights on any other region,
not merely a visually acceptable moving part. Identify the target and initially
rigid non-target surfaces before automatic weights. After auto weights, manual
edits and mirroring, check non-target regions across all chain owners, including
both sides. A highlighted cap is NOT a cleaned cap. Select the identified rigid
non-target components, then call `set_weights(operation="erase", allChains=true)`;
require `cleanupSummary.remainingNonzero=0`. Per-component `weightedVertices` and
`weightOwners` in the state include all chains, not just the active one. Do not
report success after selection alone. If a component contains both target and
non-target geometry, clear only explicit non-target vertices, not the whole
component. Preserve pre-existing intentional animation outside the request.
One bounded containment check replaces repeated screenshots, not adds a new loop.

## Weight corrections

- Active chain IDs come from `get_state`, not guessed labels. Gray regions in
  active-chain view belong to other chains and are protected. Select their owner
  before editing. Never use `reassign` or global cleanup merely to bypass this.
- Blue is rigid/zero; other colors are actual weights. More colored vertices is
  not automatically better: mounting regions should stay rigid.
- `smooth` averages neighboring scalar weights within a surface/owner. It does
  not smear paint through empty space, bridge detached shells, or manufacture
  geometry. A flat field can legitimately remain unchanged.
- Select only intended component IDs for `set_weights`; empty selection is not
  permission to affect everything. Components are connected surfaces, not
  semantic ears: an outline shell and core may be separate components.
- `brush_stroke` uses viewport-local CSS pixels. Scale coordinates from the
  returned image dimensions to `viewport.width/height`. Radius is CSS pixels;
  `weight`, `strength`, `hardness` are 0–1. Enable `through` deliberately when
  both shells need editing; it can also reach another part behind the first.
- If a correction has no effect, check owner, selection, strength and visibility
  once. Explain the concrete reason or stop for feedback; do not repeat loops.
- Use `undo` for a failed edit. `discardChanges:true`, reassign, save and export
  require the corresponding user intent; do not silently replace their project.
