let nextRequestId = 0;
const pendingRequestIds = new Set<string>();

/** Unique within this interface lifetime, without registering an expected response. */
export function createLocalId(prefix: string): string {
  nextRequestId += 1;
  return `${prefix}-${Date.now()}-${nextRequestId}`;
}

export function createRequestId(prefix: string): string {
  const requestId = createLocalId(prefix);
  pendingRequestIds.add(requestId);
  return requestId;
}

export function consumeRequestId(requestId: string): boolean {
  return pendingRequestIds.delete(requestId);
}
