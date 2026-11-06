import type {SurfaceGraph} from './brush';

export type WeightOperation = 'set' | 'erase' | 'smooth';
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Radial coverage: hardness is the full-coverage fraction of radius (0..1).
 * The remaining ring uses smoothstep; the center is always fully covered.
 * A nonpositive radius or nonfinite argument produces no coverage. */
export function falloff(distance: number, radius: number, hardness = 0): number {
  if (![distance, radius, hardness].every(Number.isFinite) || radius <= 0) return 0;
  distance = Math.max(0, distance);
  if (distance >= radius) return 0;
  const inner = clamp01(hardness) * radius;
  if (distance <= inner) return 1;
  const t = (distance - inner) / (radius - inner);
  return 1 - t * t * (3 - 2 * t);
}

/** One immutable-baseline stroke. Construct a new instance on pointer-down.
 * apply accepts vertex-index coverage in [0,1] and returns absolute weights to
 * write to the live mask. Coverage accumulates by maximum, never by event count.
 * Inputs (weights and owners) are copied; this class never mutates the mask.
 * Other chains are protected. Empty-string owners are free vertices.
 *
 * Seam copies receive the maximum coverage of their welded node. Smooth targets
 * average eligible adjacent graph nodes, counting each node once, from the
 * pointer-down snapshot. No spatial search or cross-component averaging occurs.
 * Each vertex retains its own baseline: equal seam weights remain equal, and
 * protected seam copies remain untouched. Returned maps contain only changed
 * vertices for this call; retain the previously written live values otherwise.
 */
export class WeightStroke {
  private readonly start: Float32Array;
  private readonly owners: string[];
  private readonly maxima: Float64Array;
  private readonly smoothTargets: Float64Array;
  private readonly strength: number;
  private readonly target: number;

  constructor(startWeights: Float32Array, owners: string[], private readonly activeChain: string,
    private readonly graph: SurfaceGraph, private readonly operation: WeightOperation,
    target: number, strength: number) {
    if (owners.length !== startWeights.length || graph.nodes.length !== startWeights.length)
      throw new RangeError('Weights, owners and graph vertices must have equal lengths');
    if (!['set', 'erase', 'smooth'].includes(operation)) throw new TypeError('Unknown stroke operation');
    if (!Number.isFinite(target) || !Number.isFinite(strength)) throw new RangeError('Target and strength must be finite');
    this.start = startWeights.slice();
    this.owners = owners.slice();
    this.maxima = new Float64Array(startWeights.length);
    this.strength = clamp01(strength);
    this.target = clamp01(target);
    this.smoothTargets = new Float64Array(startWeights.length);
    // Reduce welded nodes first so duplicate UV vertices cannot bias smoothing.
    const means = graph.vertices.map(vertices => {
      const eligible = vertices.filter(index => this.editable(index));
      return eligible.length ? eligible.reduce((sum, index) => sum + this.start[index], 0) / eligible.length : NaN;
    });
    for (let index = 0; index < this.start.length; index++) {
      const node = graph.nodes[index];
      const neighbors = [...graph.edges[node].keys()].filter(next =>
        graph.components[next] === graph.components[node] && Number.isFinite(means[next]));
      this.smoothTargets[index] = neighbors.length
        ? neighbors.reduce((sum, next) => sum + means[next], 0) / neighbors.length : this.start[index];
    }
  }

  private editable(index: number): boolean {
    return !this.owners[index] || this.owners[index] === this.activeChain;
  }

  apply(coverage: Map<number, number>): Map<number, number> {
    const nodes = new Map<number, number>();
    for (const [index, amount] of coverage) {
      if (!Number.isInteger(index) || index < 0 || index >= this.start.length || !Number.isFinite(amount) || !this.editable(index)) continue;
      const node = this.graph.nodes[index];
      nodes.set(node, Math.max(nodes.get(node) ?? 0, clamp01(amount)));
    }
    const updates = new Map<number, number>();
    for (const [node, amount] of nodes) for (const index of this.graph.vertices[node]) {
      if (!this.editable(index) || amount <= this.maxima[index]) continue;
      this.maxima[index] = amount;
      const end = this.operation === 'erase' ? 0 : this.operation === 'smooth' ? this.smoothTargets[index] : this.target;
      const value = this.start[index] + (end - this.start[index]) * amount * this.strength;
      if (value !== this.start[index]) updates.set(index, value);
    }
    return updates;
  }
}

export {WeightStroke as Stroke};

/** Structural point type: THREE.Vector3 can be passed directly. Outputs are
 * independent plain objects, with no dependency on Three or DOM events. */
export interface StrokePoint {x: number; y: number; z: number}
const distance = (a: StrokePoint, b: StrokePoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function copy(point: StrokePoint): StrokePoint {
  if (![point.x, point.y, point.z].every(Number.isFinite)) throw new RangeError('Point must be finite');
  return {x: point.x, y: point.y, z: point.z};
}

/** Uniform arc-length stamps, spacing <= radius * .1. add(point) emits the
 * first point immediately and subsequent stamps on a persistent spacing grid.
 * finalize(optionalLastPoint) emits the exact endpoint once and closes the path.
 * Subdividing the same polyline into more input events does not change stamps.
 * Corners describe the supplied polyline; missing corners cannot be inferred.
 */
export class StrokePathResampler {
  readonly spacing: number;
  private last?: StrokePoint;
  private lastStamp?: StrokePoint;
  private remaining: number;
  private closed = false;

  constructor(radius: number, spacing = radius * .1) {
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(spacing) || spacing <= 0)
      throw new RangeError('Radius and spacing must be finite and positive');
    this.spacing = Math.min(spacing, radius * .1);
    this.remaining = this.spacing;
  }

  add(point: StrokePoint): StrokePoint[] {
    if (this.closed) throw new Error('Stroke path is finalized');
    const end = copy(point);
    if (!this.last) {
      this.last = end;
      this.lastStamp = copy(end);
      return [copy(end)];
    }
    const start = this.last, length = distance(start, end), stamps: StrokePoint[] = [];
    let offset = this.remaining;
    const epsilon = this.spacing * 1e-10;
    while (length > 0 && offset <= length + epsilon) {
      const t = Math.min(1, offset / length);
      const stamp = {x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, z: start.z + (end.z - start.z) * t};
      stamps.push(stamp);
      this.lastStamp = copy(stamp);
      offset += this.spacing;
    }
    this.remaining = offset - length;
    this.last = end;
    return stamps;
  }

  finalize(point?: StrokePoint): StrokePoint[] {
    if (this.closed) return [];
    const stamps = point ? this.add(point) : [];
    if (this.last && (!this.lastStamp || distance(this.last, this.lastStamp) > this.spacing * 1e-10)) stamps.push(copy(this.last));
    this.closed = true;
    return stamps;
  }
}

export {StrokePathResampler as StrokePath};

/** Exact maximum radial coverage along a Euclidean segment (including ends).
 * Useful when stamp approximation is undesirable. Callers must enforce surface
 * component/visibility constraints before using this on a surface graph. */
export function segmentCoverage(point: StrokePoint, start: StrokePoint, end: StrokePoint, radius: number, hardness = 0): number {
  const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
  const squared = dx * dx + dy * dy + dz * dz;
  const t = squared > 0 ? clamp01(((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / squared) : 0;
  return falloff(distance(point, {x: start.x + t * dx, y: start.y + t * dy, z: start.z + t * dz}), radius, hardness);
}
