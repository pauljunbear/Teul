import { useEffect, useRef, useState } from 'react';
import { FigmaReadClient } from '../../../services/guideline-intake/src/figmaReadClient';
import {
  FIGMA_READ_LIMITS,
  FigmaReadError,
  parseFigmaLink,
  type FigmaCapturePacket,
  type FigmaOutline,
} from '../../../services/guideline-intake/src/figmaProtocol';
import { IntakeError } from '../../../services/guideline-intake/src/protocol';
import { Button } from './ui/button';
import { Input } from './ui/input';

const client = new FigmaReadClient({ authentication: 'personal-token' });
function failure(error: unknown): string {
  if (error instanceof FigmaReadError && error.code === 'FIGMA_RATE_LIMITED')
    return `Figma has paused API reads.${error.retryAfterSeconds === null ? '' : ` Try again after ${error.retryAfterSeconds} seconds.`} No automatic retry was sent.`;
  if (error instanceof IntakeError) {
    const messages: Record<string, string> = {
      INVALID_FIGMA_URL: 'Paste a Figma design file, page or frame link.',
      FIGMA_CONNECTION_REQUIRED: 'Enter a valid read-only personal access token.',
      FIGMA_AUTH_REJECTED:
        'Your token is expired or invalid. Create a new read-only token in Figma.',
      FIGMA_ACCESS_UNAVAILABLE:
        'Figma denied access. Check that your token is current, has file_content:read, and belongs to an account that can open this file.',
      FIGMA_NOT_FOUND: 'This file or selection could not be found. Check the link and your access.',
      FIGMA_READ_ABORTED: 'The read timed out. Try a smaller selection.',
      FIGMA_NODE_LIMIT:
        'This selection is too large. Choose individual color frames instead of a whole page.',
      FIGMA_OUTLINE_LIMIT:
        'This file has too many pages or frames for this reader. Use a smaller source file or a PDF export.',
      FIGMA_RESPONSE_LIMIT: 'The response is too large. Choose fewer or smaller frames.',
      FIGMA_RESPONSE_LIMIT_OR_TYPE:
        'Figma returned an unsupported or oversized response. Try a smaller selection.',
      FIGMA_REVISION_MISMATCH: 'The file changed. Find its pages again before reading.',
    };
    if (messages[error.code]) return messages[error.code];
  }
  return 'The library could not be read. Check your connection and try again. Your current project is unchanged.';
}

export function GuidelineFigmaLibrary({
  disabled,
  onBusy,
  onCapture,
}: {
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onCapture: (packet: FigmaCapturePacket) => void;
}) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [outline, setOutline] = useState<FigmaOutline | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [variables, setVariables] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const current = (controller: AbortController) =>
    operation.current === controller && !controller.signal.aborted;
  const forget = () => {
    operation.current?.abort();
    operation.current = null;
    setToken('');
    setOutline(null);
    setSelected([]);
    setBusy(false);
    onBusy(false);
    setError('');
    setStatus('Token forgotten. Your current project is unchanged.');
  };
  const run = async (capture: boolean) => {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    onBusy(true);
    setError('');
    setStatus(capture ? 'Reading selected colors and source text…' : 'Finding pages and frames…');
    try {
      const link = parseFigmaLink(url.trim());
      if (capture) {
        if (!outline || outline.fileKey !== link.fileKey) throw new Error('Selection changed');
        const packet = await client.capture(
          {
            schemaVersion: 'teul.figma-rest-request.v1',
            fileKey: outline.fileKey,
            version: outline.version,
            nodeIds: selected,
            includeVariables: variables,
          },
          token.trim(),
          controller.signal,
          variables
        );
        if (!current(controller)) return;
        onCapture(packet);
        setToken('');
        setOutline(null);
        setSelected([]);
        setStatus('Library read. Review its colors below. Your token has been forgotten.');
      } else {
        const result = await client.outline(link.fileKey, token.trim(), controller.signal);
        if (!current(controller)) return;
        setOutline(result);
        setSelected(link.nodeId ? [link.nodeId] : []);
        setStatus(
          `${result.entries.length} pages and frames found. Choose the color section to read.`
        );
      }
    } catch (reason) {
      if (current(controller)) {
        setStatus('');
        setError(failure(reason));
        if (
          reason instanceof FigmaReadError &&
          ['FIGMA_AUTH_REJECTED', 'FIGMA_ACCESS_UNAVAILABLE'].includes(reason.code)
        ) {
          setToken('');
          setOutline(null);
          setSelected([]);
        }
      }
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
        onBusy(false);
      }
    }
  };
  const linkedNode = outline ? parseFigmaLink(url.trim()).nodeId : null;
  const choices = outline
    ? [
        ...(linkedNode && !outline.entries.some(entry => entry.id === linkedNode)
          ? [{ id: linkedNode, name: 'Frame from your link', type: 'FRAME' }]
          : []),
        ...outline.entries,
      ]
    : [];
  return (
    <section aria-label="Add a Figma library" className="guideline-figma-library">
      <h2>Add a Figma library</h2>
      <p className="guideline-muted">
        Paste the source file link, then choose its color pages or frames. Read native paints,
        gradients, style names and source text without changing the Figma file.
      </p>
      <form
        className="guideline-figma-link"
        onSubmit={event => {
          event.preventDefault();
          void run(false);
        }}
      >
        <label htmlFor="figma-library-link">Figma library link</label>
        <Input
          id="figma-library-link"
          value={url}
          placeholder="https://www.figma.com/design/…"
          disabled={disabled || busy}
          onChange={event => {
            setUrl(event.target.value);
            setOutline(null);
            setSelected([]);
          }}
        />
        <label htmlFor="figma-library-token">Read-only Figma token</label>
        <Input
          id="figma-library-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="figma-library-privacy"
          value={token}
          disabled={disabled || busy}
          onChange={event => {
            setToken(event.target.value);
            setOutline(null);
            setSelected([]);
          }}
        />
        <Button type="submit" disabled={disabled || busy || !url.trim() || !token.trim()}>
          Find library pages
        </Button>
      </form>
      <p id="figma-library-privacy" className="guideline-muted">
        Your token goes directly to Figma. Teul keeps it only in this open page and clears it after
        a successful read or cancellation. It is never saved in projects or sent to our server.
      </p>
      <details>
        <summary>How to get a read-only token</summary>
        <p>
          In Figma, open Settings → Security → Personal access tokens. Create a short-lived token
          with <code>file_content:read</code>. For related variables and modes, also enable{' '}
          <code>file_variables:read</code>; Figma limits this API to eligible Enterprise accounts.
          Paste the token above.
        </p>
        <a
          href="https://developers.figma.com/docs/rest-api/personal-access-tokens/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Figma token instructions
        </a>
      </details>
      {outline && (
        <fieldset className="guideline-figma-selection" disabled={disabled || busy}>
          <legend>
            {outline.name} · choose up to {FIGMA_READ_LIMITS.selectedNodes} pages or frames
          </legend>
          <p className="guideline-muted">
            A page includes its descendants. Start with the color section. Revision{' '}
            {outline.version}.
          </p>
          <div className="guideline-figma-options">
            {choices.map(entry => (
              <label className="guideline-figma-choice" key={entry.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(entry.id)}
                  disabled={
                    !selected.includes(entry.id) &&
                    selected.length >= FIGMA_READ_LIMITS.selectedNodes
                  }
                  onChange={event =>
                    setSelected(before =>
                      event.target.checked
                        ? [...before, entry.id]
                        : before.filter(id => id !== entry.id)
                    )
                  }
                />
                <span>
                  {entry.name || 'Unnamed'}
                  <small>
                    {entry.type.toLowerCase()} · {entry.id}
                  </small>
                </span>
              </label>
            ))}
          </div>
          {!choices.length && (
            <p>No pages or frames were returned. Choose another source file or use a PDF export.</p>
          )}
          <label className="guideline-figma-choice">
            <input
              type="checkbox"
              checked={variables}
              onChange={event => setVariables(event.target.checked)}
            />
            Read related variables and modes when permitted
          </label>
          <p className="guideline-muted">
            Reads only the selection and its related variables. Unused library variables are not
            included. Review happens on this device; no AI service is called.
          </p>
          <Button onClick={() => void run(true)} disabled={!selected.length}>
            Read library colors
          </Button>
        </fieldset>
      )}
      {(token || busy) && (
        <Button variant="outline" onClick={forget}>
          {busy ? 'Cancel and forget token' : 'Forget token'}
        </Button>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p role="alert" className="guideline-notice">
          {error}
        </p>
      )}
    </section>
  );
}
