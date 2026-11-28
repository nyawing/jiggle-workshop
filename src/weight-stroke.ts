import type { SurfaceGraph } from './brush';
export type WeightOperation = 'set' | 'erase' | 'smooth';
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
/** Радиальное покрытие: hardness задаёт долю радиуса с полным покрытием (0..1). На оставшемся кольце используется smoothstep; центр всегда покрыт полностью. Неположительный радиус или неконечный аргумент дают нулевое покрытие. */
export function falloff(distance: number, radius: number, hardness = 0): number {
    if (![distance, radius, hardness].every(Number.isFinite) || radius <= 0)
        return 0;
    distance = Math.max(0, distance);
    if (distance >= radius)
        return 0;
    const inner = clamp01(hardness) * radius;
    if (distance <= inner)
        return 1;
    const t = (distance - inner) / (radius - inner);
    return 1 - t * t * (3 - 2 * t);
}
/** Один мазок с неизменной исходной основой; создавайте экземпляр при нажатии указателя. apply принимает покрытие вершин [0,1] и возвращает абсолютные веса для записи в текущую маску. Покрытие накапливается по максимуму, а не по числу событий. Веса и владельцы копируются; класс не изменяет маску. Другие цепочки защищены, пустой владелец означает свободную вершину. Копии шва получают максимальное покрытие склеенного узла. Сглаживание усредняет допустимых соседей графа по снимку на начало мазка, считая каждый узел один раз; пространственный поиск и усреднение между компонентами не применяются. Каждая вершина сохраняет собственную основу: равные веса швов остаются равными, защищённые копии не меняются. Возвращаются только изменённые этим вызовом вершины; остальные текущие значения следует сохранить. */
export class WeightStroke {
    private readonly start: Float32Array;
    private readonly owners: string[];
    private readonly maxima: Float64Array;
    private readonly smoothTargets: Float64Array;
    private readonly strength: number;
    private readonly target: number;
    constructor(startWeights: Float32Array, owners: string[], private readonly activeChain: string, private readonly graph: SurfaceGraph, private readonly operation: WeightOperation, target: number, strength: number) {
        if (owners.length !== startWeights.length || graph.nodes.length !== startWeights.length)
            throw new RangeError('Weights, owners and graph vertices must have equal lengths');
        if (!['set', 'erase', 'smooth'].includes(operation))
            throw new TypeError('Unknown stroke operation');
        if (!Number.isFinite(target) || !Number.isFinite(strength))
            throw new RangeError('Target and strength must be finite');
        this.start = startWeights.slice();
        this.owners = owners.slice();
        this.maxima = new Float64Array(startWeights.length);
        this.strength = clamp01(strength);
        this.target = clamp01(target);
        this.smoothTargets = new Float64Array(startWeights.length);
        // Перед сглаживанием объединяются склеенные узлы: иначе UV-копии получили бы лишний вес.
        const means = graph.vertices.map(vertices => {
            const eligible = vertices.filter(index => this.editable(index));
            return eligible.length ? eligible.reduce((sum, index) => sum + this.start[index], 0) / eligible.length : NaN;
        });
        for (let index = 0; index < this.start.length; index++) {
            const node = graph.nodes[index];
            const neighbors = [...graph.edges[node].keys()].filter(next => graph.components[next] === graph.components[node] && Number.isFinite(means[next]));
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
            if (!Number.isInteger(index) || index < 0 || index >= this.start.length || !Number.isFinite(amount) || !this.editable(index))
                continue;
            const node = this.graph.nodes[index];
            nodes.set(node, Math.max(nodes.get(node) ?? 0, clamp01(amount)));
        }
        const updates = new Map<number, number>();
        for (const [node, amount] of nodes)
            for (const index of this.graph.vertices[node]) {
                if (!this.editable(index) || amount <= this.maxima[index])
                    continue;
                this.maxima[index] = amount;
                const end = this.operation === 'erase' ? 0 : this.operation === 'smooth' ? this.smoothTargets[index] : this.target;
                const value = this.start[index] + (end - this.start[index]) * amount * this.strength;
                if (value !== this.start[index])
                    updates.set(index, value);
            }
        return updates;
    }
}
export { WeightStroke as Stroke };
/** Структурный тип точки: можно передавать THREE.Vector3 напрямую. Результаты — независимые обычные объекты без зависимости от Three или событий DOM. */
export interface StrokePoint {
    x: number;
    y: number;
    z: number;
}
const distance = (a: StrokePoint, b: StrokePoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function copy(point: StrokePoint): StrokePoint {
    if (![point.x, point.y, point.z].every(Number.isFinite))
        throw new RangeError('Point must be finite');
    return { x: point.x, y: point.y, z: point.z };
}
/** Равномерные отпечатки по длине дуги с шагом не больше radius*.1. add(point) сразу выдаёт первую точку, затем использует постоянную сетку шага. finalize(optionalLastPoint) один раз добавляет точный конец и закрывает путь. Дополнительное дробление той же ломаной на события не меняет отпечатки. Углы определяются переданной ломаной; отсутствующие углы восстановить нельзя. */
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
        if (this.closed)
            throw new Error('Stroke path is finalized');
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
            const stamp = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, z: start.z + (end.z - start.z) * t };
            stamps.push(stamp);
            this.lastStamp = copy(stamp);
            offset += this.spacing;
        }
        this.remaining = offset - length;
        this.last = end;
        return stamps;
    }
    finalize(point?: StrokePoint): StrokePoint[] {
        if (this.closed)
            return [];
        const stamps = point ? this.add(point) : [];
        if (this.last && (!this.lastStamp || distance(this.last, this.lastStamp) > this.spacing * 1e-10))
            stamps.push(copy(this.last));
        this.closed = true;
        return stamps;
    }
}
export { StrokePathResampler as StrokePath };
/** Точное максимальное радиальное покрытие вдоль евклидова отрезка, включая концы. Полезно, когда приближение отпечатками нежелательно. При работе с графом поверхности вызывающий код должен заранее обеспечить ограничения компонентов и видимости. */
export function segmentCoverage(point: StrokePoint, start: StrokePoint, end: StrokePoint, radius: number, hardness = 0): number {
    const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
    const squared = dx * dx + dy * dy + dz * dz;
    const t = squared > 0 ? clamp01(((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / squared) : 0;
    return falloff(distance(point, { x: start.x + t * dx, y: start.y + t * dy, z: start.z + t * dz }), radius, hardness);
}
