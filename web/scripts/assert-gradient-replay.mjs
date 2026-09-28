import assert from 'node:assert/strict';

/** Paint and source identity are exact; independently recomputed receipt bounds may vary by runtime. */
export function assertGradientReplay(nodeJson, browserJson) {
  const node = JSON.parse(nodeJson),
    browser = JSON.parse(browserJson),
    differences = [];
  for (const value of [node, browser]) {
    assert.equal(value.fidelity.status, 'pass');
    assert.ok(value.fidelity.maximumDeltaEOKUpperBound >= 0);
    assert.ok(value.fidelity.maximumDeltaEOKUpperBound <= value.fidelity.toleranceDeltaEOK);
    assert.ok(value.fidelity.toleranceDeltaEOK <= 0.005);
    if (value.policy.use.kind === 'text') {
      assert.equal(value.assessment.contrast.status, 'pass');
      assert.ok(value.assessment.contrast.minimumRatioLowerBound >= value.policy.use.minimumRatio);
    }
  }
  for (const [key, left, right] of [
    ['fidelity.maximumDeltaEOKUpperBound', node.fidelity, browser.fidelity],
    [
      'assessment.contrast.minimumRatioLowerBound',
      node.assessment.contrast,
      browser.assessment.contrast,
    ],
    [
      'assessment.contrast.minimumRatioObserved',
      node.assessment.contrast,
      browser.assessment.contrast,
    ],
  ]) {
    const field = key.split('.').at(-1);
    if (!left || !right || !(field in left) || !(field in right)) continue;
    assert.ok(Number.isFinite(left[field]) && Number.isFinite(right[field]));
    assert.ok(Math.abs(left[field] - right[field]) <= 1e-11, key);
    if (left[field] !== right[field])
      differences.push({ field: key, node: left[field], browser: right[field] });
    delete left[field];
    delete right[field];
  }
  assert.deepEqual(node, browser);
  return differences;
}
