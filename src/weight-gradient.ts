/**
 * Распределяет веса вдоль экранного отрезка. Результат не зависит от частоты
 * событий мыши или плотности сетки. Доступные вершины заранее выбирает редактор.
 */
export function linearGradient(start: {
    x: number;
    y: number;
}, end: {
    x: number;
    y: number;
}, points: Iterable<[
    number,
    {
        x: number;
        y: number;
    }
]>, weights: Float32Array, owners: string[], activeChain: string, from = 0, to = 1, strength = 1) {
    const coordinates = [start.x, start.y, end.x, end.y, from, to, strength];
    const outsideRange = [from, to, strength].some(value => value < 0 || value > 1);
    if (!coordinates.every(Number.isFinite) || outsideRange || owners.length !== weights.length) {
        throw new Error('Проверьте координаты, диапазон весов и силу градиента.');
    }
    const horizontal = end.x - start.x, vertical = end.y - start.y;
    const squaredLength = horizontal * horizontal + vertical * vertical;
    const updates = new Map<number, number>();
    if (squaredLength < 16)
        return updates;
    for (const [vertexIndex, screenPoint] of points) {
        if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= weights.length ||
            !Number.isFinite(screenPoint.x + screenPoint.y)) {
            throw new Error('Не найдены корректные экранные координаты вершины.');
        }
        if (owners[vertexIndex] && owners[vertexIndex] !== activeChain)
            continue;
        const projection = ((screenPoint.x - start.x) * horizontal +
            (screenPoint.y - start.y) * vertical) / squaredLength;
        const fraction = Math.max(0, Math.min(1, projection));
        const previous = weights[vertexIndex];
        updates.set(vertexIndex, previous + (from + (to - from) * fraction - previous) * strength);
    }
    return updates;
}
