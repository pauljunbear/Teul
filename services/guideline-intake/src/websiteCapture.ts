import { createHash } from 'node:crypto';
import type { Browser, CDPSession, Route } from 'playwright-core';
import { canonicalIntakeJson, IntakeError, type JsonValue } from './protocol.js';
import { intakeHash, ProcessorFailure, type IntakeProcessor } from './service.js';
import { WebsiteNetwork } from './websiteNetwork.js';
import {
  WEBSITE_CAPTURE_VERSION,
  WEBSITE_LIMITS as L,
  parseWebsiteCapturePacket,
  parseWebsiteCaptureRequest,
  parseWebsiteUrl,
  type WebsiteCapturePacket,
  type WebsiteCaptureRequest,
  type WebsiteGap,
} from './websiteProtocol.js';
import { inspectWebsiteDom, type WebsiteDomEvidence } from './websiteDom.js';

export interface WebsiteBrowserLease {
  browser: Browser;
  /** Host watchdog: immediately terminate this job's isolated process/container, including descendants. */
  terminate: () => void;
}
export interface WebsiteCaptureHost {
  /** No default launcher: untrusted sites require independently verified OS isolation and a kill boundary. */
  launch: (signal: AbortSignal) => Promise<WebsiteBrowserLease>;
  network?: () => Pick<WebsiteNetwork, 'get'>;
}
const hashBytes = (value: Uint8Array) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;
const withoutHash = (value: string) => {
  const url = new URL(value);
  url.hash = '';
  return url.href;
};

function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => {});
    return Promise.reject(new IntakeError('WEBSITE_CAPTURE_ABORTED', 408));
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new IntakeError('WEBSITE_CAPTURE_ABORTED', 408));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) abort();
        else resolve(value);
      },
      error => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}
async function evaluate<T>(session: CDPSession, contextId: number, expression: string): Promise<T> {
  const result = await session.send('Runtime.evaluate', {
    expression,
    contextId,
    returnByValue: true,
    awaitPromise: false,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description ?? '';
    const code = description.match(/\bWEBSITE_[A-Z0-9_]+\b/)?.[0] ?? 'WEBSITE_DOM_UNAVAILABLE';
    throw new IntakeError(code, 422);
  }
  return result.result.value as T;
}

/** Rendered capture. The host owns OS confinement; this module never launches a user's browser. */
export async function captureWebsite(
  raw: WebsiteCaptureRequest,
  host: WebsiteCaptureHost,
  signal: AbortSignal
): Promise<WebsiteCapturePacket> {
  const request = parseWebsiteCaptureRequest(raw);
  const abort = new AbortController();
  const combined = AbortSignal.any([signal, abort.signal, AbortSignal.timeout(L.timeoutMs)]);
  const network = host.network?.() ?? new WebsiteNetwork();
  let lease: WebsiteBrowserLease | null = null;
  const kill = () => {
    try {
      lease?.terminate();
    } catch {
      /* Host failure cannot publish a result. */
    }
  };
  combined.addEventListener('abort', kill, { once: true });
  try {
    combined.throwIfAborted();
    let document = await bounded(network.get(request.url, combined), combined);
    const redirects: string[] = [];
    while ([301, 302, 303, 307, 308].includes(document.status)) {
      if (redirects.length >= L.redirects || !document.headers.location)
        throw new IntakeError('WEBSITE_REDIRECT_LIMIT', 422);
      const next = parseWebsiteUrl(document.headers.location);
      redirects.push(next);
      document = await bounded(network.get(next, combined), combined);
    }
    if (
      document.status !== 200 ||
      !/^text\/html(?:\s*;|$)/i.test(document.headers['content-type'] ?? '')
    )
      throw new IntakeError('WEBSITE_MAIN_DOCUMENT_UNAVAILABLE', 422);
    const finalUrl = redirects.at(-1) ?? request.url;
    const pendingLease = host.launch(combined);
    pendingLease.then(
      late => {
        if (combined.aborted) late.terminate();
      },
      () => {}
    );
    lease = await bounded(pendingLease, combined);
    const browser = lease.browser;
    if (browser.browserType().name() !== 'chromium')
      throw new IntakeError('WEBSITE_RENDERER_UNSUPPORTED');
    const context = await bounded(
      browser.newContext({
        viewport: request.viewport,
        deviceScaleFactor: 1,
        colorScheme: request.colorScheme,
        serviceWorkers: 'block',
        acceptDownloads: false,
        permissions: [],
        javaScriptEnabled: true,
        ignoreHTTPSErrors: false,
        reducedMotion: 'reduce',
      }),
      combined
    );
    const gaps: WebsiteGap[] = [];
    const gapKeys = new Set<string>();
    const gap = (scope: string, code: string) => {
      const key = `${scope}:${code}`;
      if (gapKeys.has(key) || gaps.length >= 20) return;
      gapKeys.add(key);
      gaps.push({ scope: scope.slice(0, 4096), code });
    };
    await bounded(
      context.routeWebSocket('**/*', socket => {
        gap('network', 'WEBSITE_WEBSOCKET_BLOCKED');
        socket.close();
      }),
      combined
    );
    const page = await bounded(context.newPage(), combined);
    page.on('dialog', dialog => {
      gap('document', 'WEBSITE_DIALOG_DISMISSED');
      void dialog.dismiss().catch(() => {});
    });
    page.on('download', download => {
      gap('document', 'WEBSITE_DOWNLOAD_BLOCKED');
      void download.cancel().catch(() => {});
    });
    page.on('pageerror', () => gap('document', 'WEBSITE_PAGE_SCRIPT_ERROR'));
    page.on('requestfailed', () => gap('network', 'WEBSITE_RENDER_RESOURCE_FAILED'));
    context.on('page', popup => {
      if (popup !== page) {
        gap('document', 'WEBSITE_POPUP_BLOCKED');
        void popup.close().catch(() => {});
      }
    });
    let servedDocument = false;
    let active = 0;
    let sealed = false;
    const resources = new AbortController();
    const resourceSignal = AbortSignal.any([combined, resources.signal]);
    const pendingRoutes = new Set<Promise<void>>();
    const route = async (route: Route) => {
      const incoming = route.request();
      try {
        if (combined.aborted || sealed) return await route.abort();
        const url = parseWebsiteUrl(incoming.url());
        if (incoming.method() !== 'GET') throw new IntakeError('WEBSITE_NON_GET_BLOCKED');
        if (incoming.isNavigationRequest()) {
          if (
            incoming.frame() !== page.mainFrame() ||
            servedDocument ||
            withoutHash(url) !== withoutHash(finalUrl)
          )
            throw new IntakeError('WEBSITE_EXTRA_NAVIGATION_BLOCKED');
          servedDocument = true;
          return await route.fulfill({
            status: 200,
            headers: document.headers,
            body: document.body,
          });
        }
        if (
          !['stylesheet', 'script', 'image', 'font', 'xhr', 'fetch'].includes(
            incoming.resourceType()
          )
        )
          throw new IntakeError('WEBSITE_RESOURCE_TYPE_BLOCKED');
        if (active >= 8) throw new IntakeError('WEBSITE_RESOURCE_CONCURRENCY_LIMIT');
        active++;
        try {
          const response = await bounded(network.get(url, resourceSignal), resourceSignal);
          if (sealed) throw new IntakeError('WEBSITE_RESOURCE_UNFINISHED_AT_CAPTURE');
          if (response.status >= 300 && response.status < 400)
            throw new IntakeError('WEBSITE_SUBRESOURCE_REDIRECT_UNSUPPORTED');
          if (response.status < 200 || response.status >= 300)
            throw new IntakeError('WEBSITE_SUBRESOURCE_UNAVAILABLE');
          // Never pass a remote redirect to Chromium: it may bypass the next route handler.
          await route.fulfill({
            status: response.status,
            headers: response.headers,
            body: response.body,
          });
        } finally {
          active--;
        }
      } catch (error) {
        gap(
          'network',
          error instanceof IntakeError && error.code.startsWith('WEBSITE_')
            ? error.code
            : 'WEBSITE_RESOURCE_UNAVAILABLE'
        );
        await route.abort('blockedbyclient').catch(() => {});
      }
    };
    await bounded(
      context.route('**/*', incoming => {
        const pending = route(incoming);
        pendingRoutes.add(pending);
        void pending.finally(() => pendingRoutes.delete(pending)).catch(() => {});
        return pending;
      }),
      combined
    );
    page.setDefaultTimeout(L.timeoutMs);
    await bounded(page.goto(finalUrl, { waitUntil: 'load', timeout: L.timeoutMs }), combined);
    await bounded(page.waitForTimeout(150), combined);
    const session = await bounded(context.newCDPSession(page), combined);
    const tree = await bounded(session.send('Page.getFrameTree'), combined);
    const world = await bounded(
      session.send('Page.createIsolatedWorld', {
        frameId: tree.frameTree.frame.id,
        worldName: 'teul-color-evidence',
        grantUniveralAccess: false,
      }),
      combined
    );
    await bounded(session.send('Emulation.setScriptExecutionDisabled', { value: true }), combined);
    sealed = true;
    if (pendingRoutes.size) gap('network', 'WEBSITE_RESOURCE_UNFINISHED_AT_CAPTURE');
    resources.abort();
    await bounded(Promise.allSettled([...pendingRoutes]), combined);
    await bounded(
      evaluate(
        session,
        world.executionContextId,
        `(() => {
      const animations = document.getAnimations();
      const svgRoots = document.getElementsByTagName('svg');
      if (animations.length + svgRoots.length > 10000) throw new Error('WEBSITE_ANIMATION_LIMIT');
      for (const animation of animations) animation.cancel();
      for (const svg of svgRoots) svg.pauseAnimations();
      return true;
    })()`
      ),
      combined
    );
    const evidence = await bounded(
      evaluate<WebsiteDomEvidence>(
        session,
        world.executionContextId,
        `(${inspectWebsiteDom.toString()})(${JSON.stringify({ request, maximumElements: L.elements, maximumUsages: L.usages, maximumProperties: L.customProperties })})`
      ),
      combined
    );
    const scroll = await bounded(
      evaluate<{ x: number; y: number }>(
        session,
        world.executionContextId,
        '({x:scrollX,y:scrollY})'
      ),
      combined
    );
    const screenshot = await bounded(
      page.screenshot({ type: 'png', fullPage: false, caret: 'hide', timeout: L.timeoutMs }),
      combined
    );
    if (screenshot.byteLength > L.screenshotBytes)
      throw new IntakeError('WEBSITE_SCREENSHOT_LIMIT', 413);
    combined.throwIfAborted();
    const content = {
      schemaVersion: WEBSITE_CAPTURE_VERSION,
      request,
      capturedAt: new Date().toISOString(),
      documentHash: hashBytes(document.body),
      finalUrl,
      redirects,
      renderer: {
        name: 'chromium' as const,
        version: browser.version(),
        pageScripts: 'enabled' as const,
        state: 'rest' as const,
        animations: 'css-cancelled-svg-paused' as const,
        deviceScaleFactor: 1 as const,
      },
      ...evidence,
      gaps: [...evidence.gaps, ...gaps],
      screenshot: {
        mimeType: 'image/png' as const,
        width: request.viewport.width,
        height: request.viewport.height,
        scrollX: scroll.x,
        scrollY: scroll.y,
        dataBase64: screenshot.toString('base64'),
      },
    };
    return parseWebsiteCapturePacket({ ...content, contentHash: intakeHash(content) });
  } catch (error) {
    if (combined.aborted) throw new IntakeError('WEBSITE_CAPTURE_ABORTED', 408);
    if (error instanceof IntakeError) throw error;
    throw new IntakeError('WEBSITE_CAPTURE_UNAVAILABLE', 502);
  } finally {
    abort.abort();
    combined.removeEventListener('abort', kill);
    if (lease) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          lease.browser.close().catch(() => {}),
          new Promise(resolve => {
            timer = setTimeout(resolve, 1000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

export function createWebsiteCaptureProcessor(host: WebsiteCaptureHost): IntakeProcessor {
  if (typeof host.launch !== 'function') throw new IntakeError('WEBSITE_ISOLATED_HOST_REQUIRED');
  return {
    profile: {
      id: 'website-capture',
      version: '1',
      kind: 'website',
      operation: 'capture',
      destination: 'Teul isolated public website renderer',
      consentPolicyVersion: 'website-capture-1',
      maximumAttemptCostMicros: 0,
      maximumJobCostMicros: 0,
    },
    validateInput: submission => {
      const request = parseWebsiteCaptureRequest(submission.payload);
      if (
        submission.parserVersion !== 'website-capture-1' ||
        submission.captureHash !== intakeHash(request) ||
        submission.binding.sourceRevision !== intakeHash(request) ||
        canonicalIntakeJson(submission.scope) !== canonicalIntakeJson([request.selector])
      )
        throw new IntakeError('WEBSITE_CAPTURE_BINDING_MISMATCH');
    },
    validateOutput: raw => {
      const packet = parseWebsiteCapturePacket(raw);
      const { contentHash, ...content } = packet;
      if (contentHash !== intakeHash(content))
        throw new IntakeError('WEBSITE_CAPTURE_HASH_MISMATCH');
    },
    execute: async (submission, { signal }) => {
      try {
        const value = await captureWebsite(
          parseWebsiteCaptureRequest(submission.payload),
          host,
          signal
        );
        return { value: value as unknown as JsonValue, actualCostMicros: 0 };
      } catch (error) {
        throw new ProcessorFailure(
          error instanceof IntakeError ? error.code : 'WEBSITE_CAPTURE_UNAVAILABLE',
          'confirmed-final',
          0
        );
      }
    },
  };
}
