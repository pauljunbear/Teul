import * as React from 'react';
import {
  isColorSystemModelRequestV1,
  isColorSystemModelResultV1,
  COLOR_SYSTEM_MODEL_MAX_JSON_BYTES_V1,
} from '../lib/colorSystemModelBridgeV1';
import { createRequestId, createLocalId, consumeRequestId } from '../lib/requestId';
import type { ColorSystemModelRequestV1 } from '../types/colorSystemModelMessagesV1';

/** Lightweight candidate view. Source parsing and model authority remain in the backend. */
export function ColorSystemModelIntakeV1({
  isDark,
  onSourceRead,
}: {
  isDark: boolean;
  onSourceRead: () => void;
}) {
  const [json, setJson] = React.useState('');
  const [scope, setScope] = React.useState<'selection' | 'current-page' | 'whole-file'>(
    'selection'
  );
  const [wholeFile, setWholeFile] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [readingFile, setReadingFile] = React.useState(false);
  const fileRead = React.useRef(0);
  const request = React.useRef<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const post = (message: ColorSystemModelRequestV1) =>
    parent.postMessage({ pluginMessage: message }, '*');
  const cancel = React.useCallback(() => {
    if (request.current) {
      consumeRequestId(request.current);
      post({
        type: 'cancel-color-system-model-v1',
        requestId: createLocalId('model-cancel'),
        targetRequestId: request.current,
      });
    }
    request.current = null;
    if (timer.current) clearTimeout(timer.current);
    setPending(false);
  }, []);
  React.useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== parent) return;
      const message: unknown = event.data?.pluginMessage;
      if (!isColorSystemModelResultV1(message) || message.requestId !== request.current) return;
      consumeRequestId(message.requestId);
      request.current = null;
      if (timer.current) clearTimeout(timer.current);
      setPending(false);
      if (message.success) {
        setError(null);
        onSourceRead();
      } else setError(message.error);
    };
    window.addEventListener('message', receive);
    return () => {
      fileRead.current += 1;
      window.removeEventListener('message', receive);
      cancel();
    };
  }, [cancel, onSourceRead]);
  const submit = (message: ColorSystemModelRequestV1) => {
    const submittedId = message.requestId;
    if (
      readingFile &&
      message.type === 'read-color-system-model-v1' &&
      message.source === 'guideline-json'
    ) {
      consumeRequestId(message.requestId);
      return;
    }
    if (!isColorSystemModelRequestV1(message)) {
      consumeRequestId(submittedId);
      setError('Use a valid source scope or guideline JSON of at most 2 MiB.');
      return;
    }
    cancel();
    fileRead.current += 1;
    setReadingFile(false);
    request.current = message.requestId;
    setPending(true);
    setError(null);
    post(message);
    timer.current = setTimeout(() => {
      cancel();
      setError(
        'The source read did not finish. Your previous model is retained; retry when ready.'
      );
    }, 120000);
  };
  const readFile = async (file: File | undefined) => {
    const sequence = ++fileRead.current;
    setReadingFile(false);
    if (!file) return;
    if (file.size > COLOR_SYSTEM_MODEL_MAX_JSON_BYTES_V1) {
      setError('Guideline JSON must be at most 2 MiB.');
      return;
    }
    setReadingFile(true);
    try {
      const contents = await file.text();
      if (sequence !== fileRead.current) return;
      setJson(contents);
      setError(null);
    } catch {
      if (sequence === fileRead.current) setError('The selected file could not be read.');
    } finally {
      if (sequence === fileRead.current) setReadingFile(false);
    }
  };
  return (
    <section
      aria-label="Brand color sources"
      style={{
        padding: 18,
        color: isDark ? '#F5F5F5' : '#171717',
        background: isDark ? '#141414' : '#FFFFFF',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <h2 style={{ fontSize: 16 }}>Start with your color system</h2>
      <p>
        Read source colors from Figma or import a guideline model. Contexts and rules stay attached
        to their evidence.
      </p>
      <label htmlFor="model-source-scope">Figma source scope</label>{' '}
      <select
        id="model-source-scope"
        value={scope}
        disabled={pending}
        onChange={event => {
          setScope(event.target.value as typeof scope);
          setWholeFile(false);
        }}
      >
        <option value="selection">Selection</option>
        <option value="current-page">Current page</option>
        <option value="whole-file">Whole file</option>
      </select>
      {scope === 'whole-file' && (
        <p>
          <label>
            <input
              type="checkbox"
              checked={wholeFile}
              onChange={event => setWholeFile(event.target.checked)}
            />{' '}
            Read all pages in this file
          </label>
        </p>
      )}
      <p>
        <button
          type="button"
          disabled={pending || (scope === 'whole-file' && !wholeFile)}
          onClick={() =>
            submit({
              type: 'read-color-system-model-v1',
              requestId: createRequestId('model-source'),
              source: 'current-file',
              scope,
              confirmWholeFile: wholeFile,
            })
          }
        >
          Read Figma colors
        </button>
      </p>
      <label htmlFor="model-source-file">Guideline model JSON (up to 2 MiB)</label>
      <input
        id="model-source-file"
        type="file"
        accept=".json,application/json"
        disabled={pending}
        onChange={event => {
          void readFile(event.target.files?.[0]);
        }}
      />
      <label htmlFor="model-source-json" style={{ display: 'block', marginTop: 12 }}>
        Or paste guideline JSON
      </label>
      <textarea
        id="model-source-json"
        value={json}
        disabled={pending}
        onChange={event => {
          fileRead.current += 1;
          setReadingFile(false);
          setJson(event.target.value);
        }}
        spellCheck={false}
        style={{ width: '100%', minHeight: 90, boxSizing: 'border-box' }}
      />
      <p>
        <button
          type="button"
          disabled={pending || readingFile || !json.trim()}
          onClick={() =>
            submit({
              type: 'read-color-system-model-v1',
              requestId: createRequestId('model-json'),
              source: 'guideline-json',
              json,
            })
          }
        >
          Import guideline model
        </button>{' '}
        {pending && (
          <button type="button" onClick={cancel}>
            Cancel read
          </button>
        )}
      </p>
      <p role="status">{pending ? 'Reading source…' : 'Choose a source to read.'}</p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
