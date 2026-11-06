import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {getExample} = createRequire(import.meta.url)('../electron/mcp-examples.cjs');
const counts = {'cherry': [2], 'curved-ears': [5, 5], 'curved-tail': [4]};

test('list and whitelist are static and reject path traversal', () => {
  const result = getExample();
  assert.equal(result.content.length, 1);
  assert.deepEqual(JSON.parse(result.content[0].text).examples.map(x => x.id), Object.keys(counts));
  for (const id of ['../package', '', null, {}, 'toString']) assert.throws(() => getExample(id), RangeError);
});

for (const [id, expected] of Object.entries(counts)) test(`${id}: bounded geometry, full-width envelope, PNG response`, () => {
  const {content} = getExample(id);
  assert.equal(content.length, 2);
  assert.equal(content[0].type, 'text');
  const data = JSON.parse(content[0].text);
  assert.equal(data.id, id);
  assert.equal(data.provenance, 'synthetic authored reference');
  assert.deepEqual(data.validation, {static: true, userApproved: false, physicsSimulated: false});
  assert.match(data.coordinates.warning, /never blindly copy/);
  assert.deepEqual(data.chains.map(c => c.pointCount), expected);
  for (const c of data.chains) {
    assert.equal(c.controlPoints.length, c.pointCount);
    assert.equal(c.createChainSegments, c.pointCount-1);
    assert.ok(Number.isFinite(c.halfWidth) && c.halfWidth > 0);
    for (const p of c.controlPoints) {
      assert.equal(p.length, 3);
      p.forEach((v, axis) => assert.ok(Number.isFinite(v) && v >= data.coordinates.bounds.min[axis] && v <= data.coordinates.bounds.max[axis]));
    }
    for (let i=1; i<c.pointCount; i++) assert.notDeepEqual(c.controlPoints[i], c.controlPoints[i-1]);
  }
  assert.ok(data.rigidRegions.length);
  assert.ok(data.rigidRegions.every(r => r.weight === 0));
  const envelope = data.desiredEnvelope;
  assert.equal(envelope.acrossWidth, 'uniform');
  assert.equal(envelope.interpolation, 'smoothstep');
  let previous = -1;
  for (const sample of envelope.longitudinalSamples) {
    assert.ok(Number.isFinite(sample.t) && sample.t >= 0 && sample.t <= 1);
    assert.equal(sample.weight, sample.t*sample.t*(3-2*sample.t));
    assert.ok(sample.weight >= previous);
    previous = sample.weight;
    assert.equal(sample.widthWeights.length, envelope.widthCoordinates.length);
    assert.ok(sample.widthWeights.every(w => Number.isFinite(w) && w === sample.weight));
  }
  assert.equal(envelope.longitudinalSamples[0].weight, 0);
  assert.equal(envelope.longitudinalSamples.at(-1).weight, 1);
  assert.equal(content[1].type, 'image');
  assert.equal(content[1].mimeType, 'image/png');
  const png = Buffer.from(content[1].data, 'base64');
  assert.equal(png.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 880);
  if (id === 'curved-ears') {
    assert.deepEqual(data.symmetry, {axis: 'Z', axisIndex: 2, plane: 0});
    data.chains[0].controlPoints.forEach(([x,y,z], i) => assert.deepEqual(data.chains[1].controlPoints[i], [x,y,-z]));
    assert.match(data.workflow.join(' '), /one ear first/);
    assert.match(data.workflow.join(' '), /not weights/);
  }
});
