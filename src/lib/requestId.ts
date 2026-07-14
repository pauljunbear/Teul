let nextRequestId = 0;
const pendingRequestIds = new Set<string>();

export function createRequestId(prefix: string): string {
  nextRequestId += 1;
  const requestId = `${prefix}-${Date.now()}-${nextRequestId}`;
  pendingRequestIds.add(requestId);
  return requestId;
}

export function consumeRequestId(requestId: string): boolean {
  return pendingRequestIds.delete(requestId);
}
