// Reproduce the affected Studio checks without re-running unchanged plugin math or service tests.
import {
  runLocalVerification,
  LOCAL_GATE_STEPS,
  GUIDELINE_GATE_STEPS,
} from '../../../scripts/verify-local.mjs';
const normal = LOCAL_GATE_STEPS.filter(
  step =>
    step.scope === 'studio' &&
    ['audit', 'lint', 'test', 'build', 'test:browser', 'test:authoring'].includes(step.script)
);
const guidelines = GUIDELINE_GATE_STEPS.filter(
  step =>
    step.scope === 'studio' &&
    !['test:guideline-capacity', 'test:guideline-gradient-performance'].includes(step.script)
);
let steps = [...normal, ...guidelines];
if (process.env.TEUL_RESUME_FROM) {
  const index = steps.findIndex(step => step.script === process.env.TEUL_RESUME_FROM);
  if (index < 0) throw new Error('Unknown resume step.');
  steps = steps.slice(index);
}
const controller = new AbortController();
process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());
const result = await runLocalVerification({
  steps,
  studioOnly: true,
  env: { ...process.env, VITEST_MAX_WORKERS: '4' },
  guidelines: true,
  signal: controller.signal,
});
console.log(JSON.stringify({ status: result.status, directory: result.directory }));
process.exitCode = result.exitCode;
