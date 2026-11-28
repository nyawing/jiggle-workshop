import * as THREE from 'three';
import stockData from './generated/fitting-r6.json';
type Frame = {
    time: number;
    poses: Record<string, number[]>;
};
type AccessoryAttachment = {
    name: string;
    frame: number[];
};
type Stock = {
    meshes: Record<string, {
        positions: number[];
        normals: number[];
        uv: number[];
        indices: number[];
    }>;
    joints: {
        name: string;
        parent: string;
        child: string;
        c0: number[];
        c1: number[];
    }[];
    attachments: Record<string, {
        part: string;
        frame: number[];
    }>;
    animations: Record<string, Frame[]>;
};
const stock = stockData as Stock;
const walkSpeed = 16;
const slotAttachments: Record<string, string[]> = {
    hat: ['HatAttachment'], hair: ['HairAttachment'], face: ['FaceFrontAttachment', 'FaceCenterAttachment'],
    back: ['BodyBackAttachment'], front: ['BodyFrontAttachment'],
    waist: ['WaistCenterAttachment', 'WaistBackAttachment', 'WaistFrontAttachment'],
    neck: ['NeckAttachment'], shoulder: ['RightShoulderAttachment', 'LeftShoulderAttachment', 'RightCollarAttachment', 'LeftCollarAttachment'],
};
function matrix(a: number[]) { return new THREE.Matrix4().set(a[3], a[4], a[5], a[0], a[6], a[7], a[8], a[1], a[9], a[10], a[11], a[2], 0, 0, 0, 1); }
function interpolate(a: THREE.Matrix4, b: THREE.Matrix4, t: number) {
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), scale = new THREE.Vector3();
    a.decompose(pa, qa, scale);
    b.decompose(pb, qb, scale);
    return new THREE.Matrix4().compose(pa.lerp(pb, t), qa.slerp(qb, t), new THREE.Vector3(1, 1, 1));
}
// Манекен использует размеры R6 и воспроизводимое движение. Вместе с ним движется корень аксессуара; дополнительных декоративных сил для костей и правок экспортируемого меша нет.
export class TryOn {
    readonly rig = new THREE.Group();
    readonly environment = new THREE.Group();
    readonly position = new THREE.Vector3();
    readonly keys = new Set<string>();
    yaw = 0;
    height = 0;
    velocity = 0;
    time = 0;
    enabled = false;
    moving = false;
    shiftLock = false;
    private parts: Record<string, THREE.Object3D> = {};
    private readonly torsoBounds = new THREE.Box3().setFromArray(stock.meshes.Torso.positions);
    private readonly headBounds = new THREE.Box3().setFromArray(stock.meshes.Head.positions);
    hairNeckHeight() { return stock.attachments.NeckAttachment.frame[1] - this.torsoBounds.getCenter(new THREE.Vector3()).y; }
    hairContactFrames() {
        return ([['Head', this.headBounds], ['Torso', this.torsoBounds]] as const).map(([name, bounds]) => {
            const part = this.parts[name];
            part.updateWorldMatrix(true, false);
            return { bounds, world: part.matrixWorld };
        });
    }
    hairTorso(mesh: THREE.SkinnedMesh) {
        const torso = this.parts.Torso;
        torso.updateWorldMatrix(true, false);
        mesh.updateWorldMatrix(true, false);
        return { bounds: this.torsoBounds, fromMesh: torso.matrixWorld.clone().invert().multiply(mesh.matrixWorld) };
    }
    hairHeadCenter(mesh: THREE.SkinnedMesh) {
        const head = this.parts.Head;
        head.updateWorldMatrix(true, false);
        return mesh.worldToLocal(new THREE.Box3().setFromArray(stock.meshes.Head.positions)
            .getCenter(new THREE.Vector3()).applyMatrix4(head.matrixWorld));
    }
    private animation = 'idle';
    private animationTime = 0;
    private blend = 1;
    private pose: Record<string, THREE.Matrix4> = {};
    private blendFrom: Record<string, THREE.Matrix4> = {};
    private material = new THREE.MeshStandardMaterial({ color: 0x8295ac, roughness: .85 });
    constructor(scene: THREE.Scene) {
        // Из установленного клиента читаются меши R6 и системы координат Motor6D. Для показа используются проверенные ключевые кадры, а импортированные скрипты аватара не исполняются.
        for (const [name, data] of Object.entries(stock.meshes)) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
            geometry.setIndex(data.indices);
            const part = new THREE.Group(), mesh = new THREE.Mesh(geometry, this.material);
            if (name === 'Head')
                mesh.scale.setScalar(1);
            part.name = name;
            part.add(mesh);
            this.parts[name] = part;
            this.rig.add(part);
        }
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x292f36, roughness: 1 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -.02;
        this.environment.add(floor);
        this.environment.add(new THREE.GridHelper(240, 120, 0x526372, 0x39434d));
        scene.add(this.rig, this.environment);
        this.animate(0);
        this.show(false);
    }
    show(value: boolean) { this.enabled = value; this.rig.visible = this.environment.visible = value; this.keys.clear(); if (!value)
        this.shiftLock = false; }
    reset() { this.position.set(0, 0, 0); this.height = this.velocity = this.yaw = this.time = 0; this.keys.clear(); this.animation = 'idle'; this.animationTime = 0; this.blend = 1; this.pose = {}; this.blendFrom = {}; this.update(0, 0); }
    jump() { if (this.enabled && this.height === 0)
        this.velocity = 50; }
    update(dt: number, cameraYaw: number) {
        dt = THREE.MathUtils.clamp(dt, 0, .05);
        this.time += dt;
        const x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
        const z = Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
        const direction = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
        const previousX = this.position.x, previousZ = this.position.z;
        if (direction.lengthSq() > 0) {
            direction.normalize();
            this.position.addScaledVector(direction, dt * walkSpeed);
            const goal = Math.atan2(-direction.x, -direction.z), angle = Math.atan2(Math.sin(goal - this.yaw), Math.cos(goal - this.yaw));
            this.yaw += THREE.MathUtils.clamp(angle, -dt * 10, dt * 10);
        }
        if (this.shiftLock)
            this.yaw = cameraYaw;
        // Граница видимой зоны ограничивает перемещение аватара, не телепортируя его на противоположный край.
        this.position.x = THREE.MathUtils.clamp(this.position.x, -100, 100);
        this.position.z = THREE.MathUtils.clamp(this.position.z, -100, 100);
        // Скорость шага берётся из реального перемещения, в том числе при движении вдоль края зоны.
        const distance = Math.hypot(this.position.x - previousX, this.position.z - previousZ);
        this.moving = distance > 1e-6;
        if (this.keys.has('Space'))
            this.jump();
        if (this.height > 0 || this.velocity > 0) {
            this.velocity -= 196.2 * dt;
            this.height = Math.max(0, this.height + this.velocity * dt);
            if (this.height === 0)
                this.velocity = 0;
        }
        this.rig.position.copy(this.position);
        this.rig.position.y = this.height;
        this.rig.rotation.y = this.yaw;
        this.animate(dt, distance);
    }
    private animate(dt: number, distance = 0) {
        const name = this.height > 0 ? (this.velocity > 0 ? 'jump' : 'fall') : this.moving ? 'walk' : 'idle';
        if (name !== this.animation) {
            this.animation = name;
            this.animationTime = 0;
            this.blend = 0;
            this.blendFrom = Object.fromEntries(Object.entries(this.pose).map(([n, m]) => [n, m.clone()]));
        }
        this.animationTime += name === 'walk' ? distance / 14.5 : dt;
        this.blend = Math.min(1, this.blend + dt / .12);
        const frames = stock.animations[name], duration = frames[frames.length - 1].time;
        const time = name === 'walk' || name === 'idle' ? this.animationTime % duration : Math.min(this.animationTime, duration);
        const hi = frames.findIndex(f => f.time >= time), b = frames[hi < 0 ? frames.length - 1 : hi], a = frames[Math.max(0, (hi < 0 ? frames.length - 1 : hi) - 1)];
        const t = b.time > a.time ? (time - a.time) / (b.time - a.time) : 0;
        const resolved: Record<string, THREE.Matrix4> = { HumanoidRootPart: new THREE.Matrix4().makeTranslation(0, 3, 0) };
        const resolve = (child: string): THREE.Matrix4 => {
            if (resolved[child])
                return resolved[child];
            const joint = stock.joints.find(j => j.child === child);
            if (!joint)
                return new THREE.Matrix4();
            let pose = interpolate(a.poses[child] ? matrix(a.poses[child]) : new THREE.Matrix4(), b.poses[child] ? matrix(b.poses[child]) : new THREE.Matrix4(), t);
            if (this.blend < 1 && this.blendFrom[child])
                pose = interpolate(this.blendFrom[child], pose, this.blend);
            this.pose[child] = pose;
            return resolved[child] = resolve(joint.parent).clone().multiply(matrix(joint.c0)).multiply(pose).multiply(matrix(joint.c1).invert());
        };
        for (const [name, part] of Object.entries(this.parts))
            resolve(name).decompose(part.position, part.quaternion, part.scale);
    }
    mount(slot: string, attachments: readonly AccessoryAttachment[] = []) {
        this.rig.updateMatrixWorld(true);
        const mounts: Record<string, number[]> = { hat: [0, 5, 0], hair: [0, 5, 0], face: [0, 4.5, -.5], neck: [0, 4, 0], shoulder: [1.5, 3.8, 0], back: [0, 3, .5], front: [0, 3, -.5], waist: [0, 2, 0] };
        const names = slotAttachments[slot] ?? slotAttachments.hat;
        let attachment: AccessoryAttachment | undefined;
        for (const candidate of attachments) {
            if (!candidate || !Object.hasOwn(stock.attachments, candidate.name) || !Array.isArray(candidate.frame) ||
                candidate.frame.length !== 12 || !candidate.frame.every(n => Number.isFinite(n) && Math.abs(n) < 10000))
                continue;
            if (names.includes(candidate.name)) {
                attachment = candidate;
                break;
            }
            attachment ??= candidate;
        }
        // Совмещаются крепления с одинаковыми именами. Переднее, заднее и центральное поясные крепления имеют разные позиции.
        const definition = stock.attachments[attachment?.name ?? names[0]];
        const target = definition && this.parts[definition.part] ? this.parts[definition.part].matrix.clone().multiply(matrix(definition.frame)) : new THREE.Matrix4().makeTranslation(...(mounts[slot] ?? mounts.hat) as [
            number,
            number,
            number
        ]);
        if (attachment)
            target.multiply(matrix(attachment.frame).invert());
        return this.rig.matrixWorld.clone().multiply(target);
    }
}
