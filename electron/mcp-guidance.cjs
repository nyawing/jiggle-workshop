'use strict';

const workflowInstructions = `Call get_state once before editing; reuse mesh-local bounds, chain indices and component IDs. If simulation is running, ask the user to stop with Space before editing. Inspect 1–2 screenshots by default, choosing the clearest axis from the bounds; one orthogonal view can resolve curvature. Preserve useful existing rigs. Small straight/cherry parts need 2 total control points; curved ears usually need 4–6, placed by shape, never six segments automatically. create_chain.segments = point_count - 1; RigidRoot is separate. Move interior bones along the actual curve. Mirror only symmetric geometry: mirror_chain copies bones only; assign weights after mirroring. Run automatic_weights once after positioning all chains. Inspect weights across the whole ear, including side edges, tip, back and separate shells; repair evidenced blue holes outside the rigid mounting region. If the request is animate ONLY a named part, identify target and non-target regions before editing. After automatic weighting and mirroring, verify no new influence reached any non-target region (hat, body, handle, adjacent decorations), across ALL chain owners. Selection alone changes no weights. For an initially rigid identified non-target region: select_surfaces then set_weights(operation="erase",allChains=true), and require cleanupSummary.remainingNonzero=0; verify both sides. Preserve pre-existing user animation outside the request. Do not clear a whole connected component if it also contains the intended moving part; use explicit non-target vertices instead. Preserve rigid mounting and other chains. A heavy middle with weak sides is a spatial issue: histograms or owner counts cannot prove or locate holes. Use targeted owner/surface selection and paint, not repeated automatic weighting. Leave physics unchanged unless requested. Do not run simulation by default or loop over simulation frames/tuning. Finish by handing motion testing to the user: press Space in the test tab and move the item; wait for feedback. Save/export only when requested. Use only the listed tools, no arbitrary evaluation or external service code.`;

const handoff = 'Hand off to the user: press Space in the test tab and move the item; wait for feedback. Do not start simulation by default.';
const repair = 'Inspect weights across the whole flexible part (for ears: sides, tip, back and shells); repair visible blue holes outside the rigid mounting region with targeted owner/surface painting.';
const toolGuides = Object.freeze({
 get_examples: {next:'Choose only the relevant reference and adapt shape/scale to the live mesh; do not load every image or copy coordinates blindly.',note:'These are authored static design examples; user still reviews physical motion.'},
 mirror_weights: {next:'Verify both requested moving sides and non-target regions; mirroring can copy spill too. Clear non-target weights across all owners before handing motion testing to the user.',note:'Use the same symmetry axis as mirror_chain. Asymmetric unmatched vertices need a targeted correction, not repeated mirroring.'},
 get_state: {next:'Reuse bounds/chain IDs; inspect 1–2 useful screenshots, then preserve or build a minimal shape-based rig.',note:'Positions are mesh-local. If simulation is running, ask the user to stop with Space before editing.'},
 get_vertices: {next:'Use this bounded page to resolve a coordinate ambiguity, then continue rigging.',note:'Do not scan the full mesh or repeatedly fetch unchanged pages.'},
 import_accessory: {next:'Read the imported bounds and inspect a useful bones/material screenshot.',note:'Replacement and discardChanges require user intent; preserve a useful existing rig.'},
 set_view: {next:'Use the chosen view for inspection or painting; avoid cycling through every direction.'},
 screenshot: {next:'Use this live viewport image to choose shape-based points or inspect weight coverage.',note:'Image-capable model required. Use 1–2 images by default; scale image pixels to viewport CSS pixels for painting.'},
 create_chain: {next:'Use returned bone indices to move interior points along the curve; finish all chains before one automatic_weights pass.',note:'Small straight/cherry: 2 total points; curved ears: 4–6 by shape. segments = points - 1, not automatically six; RigidRoot is separate.'},
 mirror_chain: {next:'Position mirrored bones as needed, then assign weights after mirroring.',note:'Mirror copies bones only; after tuning one side use mirror_weights to copy its weights onto the mirrored chain on the same axis.'},
 move_bone: {next:'Finish shape-based placement using mesh-local positions, then run automatic_weights once.'},
 select_chain: {next:'Select intended surfaces before correcting this owner’s weights.',note:'Gray belongs to other chains; protect it. Do not reassign simply to bypass ownership.'},
 select_surfaces: {next:'Selection alone edits no weights. For an identified initially rigid non-target region, call set_weights(operation=erase,allChains=true), then require remainingNonzero=0. Do not finish after merely highlighting it.',note:'Components are connected surfaces, not semantic ears. Empty selection does not mean everything.'},
 brush_stroke: {next:'Check targeted coverage once; if ineffective, check owner, selection, strength and visibility before retrying.',note:'Use live viewport-local CSS pixels: xCSS=xImage*viewport.width/imageSize.width, likewise y. Radius is CSS pixels. through can reach parts behind; preserve rigid mounting.'},
 set_weights: {next:'For non-target cleanup require remainingNonzero=0 across all owners; verify the other side too. Ordinary brushes protect other owners. Only after scope is clean, hand testing to the user with Space.',note:'Protect gray owners and rigid mounting. Smooth stays within a surface/owner; it cannot bridge detached shells. Reassign requires user intent.'},
 automatic_weights: {next:'Check requested moving parts AND all non-target regions. Erase spill on identified rigid regions across ALL owners; highlighting is not cleanup. Check both sides before handoff.',note:'Automatic weights are a starting pass, not task completion. Keep mounting rigid. A heavy middle with weak sides needs spatial inspection; histogram/owner counts cannot prove holes. Do not rerun automatic weights or start a simulation loop; hand testing to the user with Space.'},
 configure_physics: {next:handoff,note:'Change physics only for the user’s requested feel; do not iterate arbitrary tuning.'},
 simulate: {next:handoff,note:'Automated motion review requires an explicit user request; do not inspect frames in a default tuning loop.'},
 undo: {next:'Inspect the restored result only as needed, then continue the specific correction or hand off with Space.'},
 save_project: {next:'Report the save result and hand motion testing to the user with Space.',note:'Save only when requested.'},
 export_accessory: {next:'Report the export result and hand motion testing to the user with Space.',note:'Export only when requested.'},
});

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Only known numeric diagnostics enter guidance; never echo labels, args, errors or secrets.
function diagnostics(value) {
 const source = value.weightsSummary ?? value.owners ?? value.ownerStats;
 if (!record(source)) return '';
 const fields = ['total','count','vertexCount','weighted','weightedCount','rigid','rigidCount','unassigned','zero','zeroCount','min','max','mean'];
 const stats = fields.filter(key => typeof source[key] === 'number' && Number.isFinite(source[key])).map(key => `${key}=${source[key]}`);
 if (stats.length) return `Reported ${value.weightsSummary != null ? 'weights' : 'owner'} stats: ${stats.join(', ')}. `;
 if (value.weightsSummary != null) return 'Weight summary available in result; inspect spatial coverage. ';
 const counts = Object.values(source).filter(n => typeof n === 'number' && Number.isFinite(n) && n >= 0);
 return counts.length ? `Owner stats: ${counts.length} groups, ${counts.reduce((a,b)=>a+b,0)} vertices. ` : '';
}

function guideFor(name, value, args, isError) {
 const guide = {...(Object.hasOwn(toolGuides,name) ? toolGuides[name] : {next:'Inspect the result; use get_state before further edits. Do not start simulation by default.'})};
 if (isError || (record(value) && (value.error || value.ok === false || value.success === false))) {
  // Classify locally without copying potentially sensitive error text into the guide.
  const message = typeof value === 'string' ? value : typeof value?.error === 'string' ? value.error : typeof value?.message === 'string' ? value.message : '';
  guide.next = /busy|timeout|timed out/i.test(message) ? 'Wait for the current operation to settle before retrying; do not repeat unchanged commands.'
   : /simulation|running/i.test(message) ? 'Ask the user to stop simulation with Space before editing.'
   : /chain|owner|bone/i.test(message) ? 'Use get_state for actual chain names/bone indices, then select the intended owner before retrying.'
   : /surface|selection|vertices/i.test(message) ? 'Select nonempty intended surfaces or explicit vertices for the active chain before retrying.'
   : 'Check current state and tool arguments once; correct the cause before retrying, or ask for user feedback.';
 } else if(name==='set_weights'&&args?.allChains===true&&record(value?.cleanupSummary)){guide.next=value.cleanupSummary.remainingNonzero===0?'Explicit region is zero across all chains. Verify the other non-target side once, then hand testing to the user with Space.':'Cleanup still has nonzero weights; do not claim this region is clean.';}
 else if (name === 'automatic_weights' && record(value)) guide.note = diagnostics(value) + guide.note;
 else if (name === 'get_state' && value?.simulation === true) guide.next = 'Ask the user to stop simulation with Space before editing; do not interrupt their test.';
 else if(name==='get_state'&&Array.isArray(value?.chains)&&value.chains.length)guide.next='Reuse this rig. Before final handoff, confirm requested-part-only scope: identified non-target regions must have no new weights across all owners. A selected/highlighted region is not proof of cleanup. Avoid repeated views.';
 else if (name === 'simulate' && args?.running === true) guide.next = 'If explicitly requested, let the user review motion; do not loop over frames or tune repeatedly. Otherwise hand testing back with Space.';
 return guide;
}

function enhanceToolResult(name, value, args = {}) {
 const envelope = record(value) && Array.isArray(value.content) ? value : {content:[{type:'text',text:JSON.stringify(value ?? null)}]};
 let firstJSON = -1, parsed;
 for (let i=0;i<envelope.content.length;i++) {
  const block = envelope.content[i];
  if (block.type !== 'text') continue;
  try { parsed=JSON.parse(block.text); firstJSON=i; break; } catch { /* Keep non-JSON text intact. */ }
 }
 const context = firstJSON >= 0 ? parsed : envelope.content.find(b=>b.type==='text')?.text;
 const guide = guideFor(name,context,args,envelope.isError);
 const content = [...envelope.content];
 if (firstJSON >= 0 && record(parsed)) {
  content[firstJSON] = {...content[firstJSON],text:JSON.stringify({...parsed,_guide:guide})};
 } else {
  // Arrays and primitives must keep their original schema; use a separate guide block.
  content.push({type:'text',text:JSON.stringify({_guide:guide})});
 }
 return {...envelope,content};
}

module.exports = {workflowInstructions,toolGuides,enhanceToolResult};
