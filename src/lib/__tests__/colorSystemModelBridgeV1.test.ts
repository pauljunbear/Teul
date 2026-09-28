import { describe, expect, it } from 'vitest';
import {
  isColorSystemModelRequestV1,
  isColorSystemModelResultV1,
} from '../colorSystemModelBridgeV1';
import { validateUIToPluginMessage, validatePluginToUIMessage } from '../messageValidation';

describe('source-model transport bounds', () => {
  const read = {
    type: 'read-color-system-model-v1',
    requestId: 'read:1',
    source: 'guideline-json',
    json: '{}',
  };
  it('accepts a bounded transport without pretending transport validation is model validation', () => {
    expect(isColorSystemModelRequestV1(read)).toBe(true);
    expect(validateUIToPluginMessage(read).valid).toBe(true);
    expect(isColorSystemModelRequestV1({ ...read, ownerApproved: true })).toBe(false);
    expect(isColorSystemModelRequestV1({ ...read, json: '𐍈'.repeat(600000) })).toBe(false);
    expect(isColorSystemModelRequestV1({ ...read, json: '<script>never executed</script>' })).toBe(
      true
    );
  });
  it('validates result bounds and blocks accessors or unexpected authority fields', () => {
    const message = {
      type: 'color-system-model-result-v1',
      requestId: 'read:1',
      success: false,
      code: 'INVALID',
      error: 'Malformed model',
    };
    expect(isColorSystemModelResultV1(message)).toBe(true);
    expect(validatePluginToUIMessage(message).valid).toBe(true);
    expect(isColorSystemModelResultV1({ ...message, createAuthorized: true })).toBe(false);
    let called = false;
    const getter = Object.defineProperty({ ...message }, 'error', {
      enumerable: true,
      get() {
        called = true;
        return 'bad';
      },
    });
    expect(isColorSystemModelResultV1(getter)).toBe(false);
    expect(called).toBe(false);
  });
});
