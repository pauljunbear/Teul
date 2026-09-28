// Assertion view only: source bytes and strict runtime readers remain the authority.
export function guidelineProjectView(value) {
  const envelope = typeof value === 'string' ? JSON.parse(value) : value;
  const source = envelope.sourceProjectJson ? JSON.parse(envelope.sourceProjectJson) : envelope;
  return { ...source, selection: envelope.gradientSelection ?? source.selection };
}
