import { lookup } from 'node:dns/promises';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { BlockList, isIP } from 'node:net';
import { IntakeError } from './protocol.js';
import { parseWebsiteUrl, WEBSITE_LIMITS } from './websiteProtocol.js';

type Address = { address: string; family: 4 | 6 };
type Response = { url: string; status: number; headers: Record<string, string>; body: Buffer };
const HEADER_BYTES = 16 * 1024;
const HEADER_PAIRS = 100;
const EXPOSED_HEADERS = [
  'content-type',
  'content-length',
  'content-security-policy',
  'content-security-policy-report-only',
  'access-control-allow-origin',
  'cross-origin-resource-policy',
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
  'referrer-policy',
  'x-content-type-options',
];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const denied = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  denied.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  denied.addSubnet(address, prefix, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

/** Conservatively exclude special-use ranges, including IPv4-mapped IPv6 and zone IDs. */
export function isPublicWebsiteAddress(address: string): boolean {
  if (typeof address !== 'string' || address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) return !denied.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
}

function host(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '');
}
function checkedUrl(raw: string): URL {
  const url = new URL(parseWebsiteUrl(raw));
  const hostname = host(url);
  if (isIP(hostname) && !isPublicWebsiteAddress(hostname))
    throw new IntakeError('WEBSITE_ADDRESS_DENIED', 403);
  return url;
}
function responseHeaders(response: IncomingMessage, url: URL): Record<string, string> {
  const raw = response.rawHeaders;
  if (!Array.isArray(raw) || raw.length % 2 || raw.length > HEADER_PAIRS * 2)
    throw new IntakeError('WEBSITE_RESPONSE_INVALID', 502);
  let bytes = 0;
  const headers = new Map<string, string>();
  for (let index = 0; index < raw.length; index += 2) {
    const name = raw[index],
      value = raw[index + 1];
    if (
      typeof name !== 'string' ||
      typeof value !== 'string' ||
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      /[^\t\x20-\x7E\x80-\xFF]/.test(value)
    )
      throw new IntakeError('WEBSITE_RESPONSE_INVALID', 502);
    bytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4;
    if (bytes > HEADER_BYTES) throw new IntakeError('WEBSITE_RESPONSE_INVALID', 502);
    const key = name.toLowerCase();
    if (headers.has(key)) {
      if (key === 'content-security-policy' || key === 'content-security-policy-report-only') {
        headers.set(key, `${headers.get(key)}, ${value.trim()}`);
        continue;
      }
      if ([...EXPOSED_HEADERS, 'content-encoding', 'location', 'transfer-encoding'].includes(key))
        throw new IntakeError('WEBSITE_RESPONSE_INVALID', 502);
    }
    headers.set(key, value.trim());
  }
  const encoding = headers.get('content-encoding');
  if (encoding !== undefined && encoding.toLowerCase() !== 'identity')
    throw new IntakeError('WEBSITE_CONTENT_ENCODING_UNSUPPORTED', 502);
  const length = headers.get('content-length');
  if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))))
    throw new IntakeError('WEBSITE_RESPONSE_INVALID', 502);
  if (length !== undefined && headers.has('transfer-encoding'))
    throw new IntakeError('WEBSITE_RESPONSE_INVALID', 502);
  if (length !== undefined && Number(length) > WEBSITE_LIMITS.responseBytes)
    throw new IntakeError('WEBSITE_RESPONSE_LIMIT', 413);
  const result: Record<string, string> = {};
  for (const name of EXPOSED_HEADERS) if (headers.has(name)) result[name] = headers.get(name)!;
  if (headers.has('location')) {
    try {
      result.location = checkedUrl(new URL(headers.get('location')!, url).href).href;
    } catch {
      throw new IntakeError('WEBSITE_REDIRECT_INVALID', 502);
    }
  }
  return result;
}

/** One capture's transport. Its resolver and request injection are host configuration only. */
export class WebsiteNetwork {
  private readonly resolve: (hostname: string) => Promise<Address[]>;
  private readonly request: typeof httpsRequest;
  private readonly deadline = performance.now() + WEBSITE_LIMITS.timeoutMs;
  private readonly stopped = new AbortController();
  private requests = 0;
  private redirects = 0;
  private receivedBytes = 0;

  constructor(
    options: {
      resolve?: (hostname: string) => Promise<Address[]>;
      request?: typeof httpsRequest;
    } = {}
  ) {
    this.resolve =
      options.resolve ??
      (async hostname => (await lookup(hostname, { all: true, verbatim: true })) as Address[]);
    this.request = options.request ?? httpsRequest;
  }

  private stop(code: string, status: number): IntakeError {
    if (!this.stopped.signal.aborted) this.stopped.abort(new IntakeError(code, status));
    return this.stopped.signal.reason as IntakeError;
  }
  private abortError(): IntakeError {
    return this.stopped.signal.aborted
      ? (this.stopped.signal.reason as IntakeError)
      : new IntakeError('WEBSITE_NETWORK_ABORTED', 408);
  }
  private addresses(hostname: string, signal: AbortSignal): Promise<Address[]> {
    return new Promise((resolve, reject) => {
      const abort = () => reject(this.abortError());
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
      const family = isIP(hostname);
      const pending = family
        ? Promise.resolve([{ address: hostname, family: family as 4 | 6 }])
        : Promise.resolve().then(() => {
            if (signal.aborted) throw this.abortError();
            return this.resolve(hostname);
          });
      pending.then(
        addresses => {
          signal.removeEventListener('abort', abort);
          if (signal.aborted) {
            abort();
            return;
          }
          if (
            !Array.isArray(addresses) ||
            !addresses.length ||
            addresses.length > 128 ||
            addresses.some(
              item =>
                !item || !isPublicWebsiteAddress(item.address) || isIP(item.address) !== item.family
            )
          )
            reject(new IntakeError('WEBSITE_ADDRESS_DENIED', 403));
          else resolve(addresses.map(({ address, family }) => ({ address, family })));
        },
        () => {
          signal.removeEventListener('abort', abort);
          reject(
            signal.aborted ? this.abortError() : new IntakeError('WEBSITE_NETWORK_UNAVAILABLE', 502)
          );
        }
      );
    });
  }

  async get(raw: string, callerSignal: AbortSignal): Promise<Response> {
    const signal = AbortSignal.any([callerSignal, this.stopped.signal]);
    if (signal.aborted) throw this.abortError();
    const remaining = this.deadline - performance.now();
    if (remaining <= 0) throw this.stop('WEBSITE_NETWORK_TIMEOUT', 408);
    if (++this.requests > WEBSITE_LIMITS.requests) throw this.stop('WEBSITE_REQUEST_LIMIT', 413);
    const timeout = setTimeout(() => this.stop('WEBSITE_NETWORK_TIMEOUT', 408), remaining);
    try {
      const url = checkedUrl(raw);
      const hostname = host(url);
      const [pinned] = await this.addresses(hostname, signal);
      if (signal.aborted) throw this.abortError();
      if (performance.now() >= this.deadline) throw this.stop('WEBSITE_NETWORK_TIMEOUT', 408);
      const options: RequestOptions & { autoSelectFamily: false } = {
        protocol: 'https:',
        hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        agent: false,
        family: pinned.family,
        autoSelectFamily: false,
        servername: isIP(hostname) ? '' : hostname,
        rejectUnauthorized: true,
        maxHeaderSize: HEADER_BYTES,
        insecureHTTPParser: false,
        headers: {
          Host: url.host,
          'User-Agent': 'Teul-Guideline-Capture/1.0',
          Accept: '*/*',
          'Accept-Encoding': 'identity',
          Connection: 'close',
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ ...pinned }]);
          else callback(null, pinned.address, pinned.family);
        },
      };
      return await this.receive(url, options, signal);
    } catch (error) {
      if (signal.aborted) throw this.abortError();
      if (error instanceof IntakeError) throw error;
      throw new IntakeError('WEBSITE_NETWORK_UNAVAILABLE', 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  private receive(url: URL, options: RequestOptions, signal: AbortSignal): Promise<Response> {
    return new Promise((resolve, reject) => {
      let request: ClientRequest | undefined;
      let response: IncomingMessage | undefined;
      let settled = false;
      let size = 0;
      let buffer: Buffer | undefined;
      const finish = (error?: IntakeError, value?: Response) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        buffer = undefined;
        if (error) {
          response?.destroy();
          request?.destroy();
          reject(error);
        } else resolve(value!);
      };
      const abort = () => finish(this.abortError());
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
      try {
        request = this.request(options, incoming => {
          response = incoming;
          response.on('error', () => finish(new IntakeError('WEBSITE_NETWORK_UNAVAILABLE', 502)));
          if (settled || signal.aborted) {
            response.destroy();
            abort();
            return;
          }
          let headers: Record<string, string>;
          const status = response.statusCode;
          try {
            if (!Number.isInteger(status) || status! < 200 || status! > 599)
              throw new IntakeError('WEBSITE_RESPONSE_INVALID', 502);
            headers = responseHeaders(response, url);
            if (REDIRECT_STATUSES.has(status!)) {
              if (++this.redirects > WEBSITE_LIMITS.redirects)
                throw this.stop('WEBSITE_REDIRECT_LIMIT', 413);
              if (!headers.location) throw new IntakeError('WEBSITE_REDIRECT_INVALID', 502);
            }
          } catch (error) {
            finish(error as IntakeError);
            return;
          }
          // Bound retained memory independently of the number of incoming data events.
          buffer = Buffer.allocUnsafe(WEBSITE_LIMITS.responseBytes);
          response.on('data', (chunk: Buffer) => {
            if (settled) return;
            this.receivedBytes += chunk.byteLength;
            size += chunk.byteLength;
            if (this.receivedBytes > WEBSITE_LIMITS.receivedBytes) {
              finish(this.stop('WEBSITE_RECEIVED_LIMIT', 413));
              return;
            }
            if (size > WEBSITE_LIMITS.responseBytes) {
              finish(new IntakeError('WEBSITE_RESPONSE_LIMIT', 413));
              return;
            }
            buffer!.set(chunk, size - chunk.byteLength);
          });
          response.once('aborted', () =>
            finish(new IntakeError('WEBSITE_NETWORK_UNAVAILABLE', 502))
          );
          response.once('end', () => {
            if (settled) return;
            if (signal.aborted) {
              abort();
              return;
            }
            if (performance.now() >= this.deadline) {
              finish(this.stop('WEBSITE_NETWORK_TIMEOUT', 408));
              return;
            }
            if (
              headers['content-length'] !== undefined &&
              Number(headers['content-length']) !== size
            ) {
              finish(new IntakeError('WEBSITE_RESPONSE_INVALID', 502));
              return;
            }
            finish(undefined, {
              url: url.href,
              status: status!,
              headers,
              body: Buffer.from(buffer!.subarray(0, size)),
            });
          });
          response.once('close', () => {
            if (!settled) finish(new IntakeError('WEBSITE_NETWORK_UNAVAILABLE', 502));
          });
        });
        request.on('error', () => finish(new IntakeError('WEBSITE_NETWORK_UNAVAILABLE', 502)));
        if (settled || signal.aborted) {
          request.destroy();
          abort();
          return;
        }
        request.end();
      } catch {
        finish(new IntakeError('WEBSITE_NETWORK_UNAVAILABLE', 502));
      }
    });
  }
}
