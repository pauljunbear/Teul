import { useState } from 'react';
import { Button } from './ui/button';
import type { GuidelineLocalEditor } from '../lib/guideline/useLocalProject';
import type {
  GuidelineLibraryEntry,
  GuidelineProjectReference,
} from '../lib/guideline/projectStore';
import './GuidelineLocalProjects.css';
const label = {
  pdf: 'PDF',
  figma: 'Figma',
  website: 'Website',
  'source-set': 'combined guideline',
};
export function GuidelineLocalSave({
  local,
  build,
  pdf,
  disabled = false,
}: {
  local: GuidelineLocalEditor;
  build: (signal: AbortSignal) => Promise<string> | string;
  pdf?: File | null;
  disabled?: boolean;
}) {
  const [keepPdf, setKeepPdf] = useState(false);
  return (
    <div className="guideline-local-save">
      <Button
        variant="outline"
        disabled={disabled || local.busy}
        onClick={() => void local.save(build, keepPdf ? (pdf ?? undefined) : undefined)}
      >
        {local.reference ? 'Update saved project' : 'Save on this device'}
      </Button>
      {local.reference && (
        <Button
          variant="outline"
          disabled={disabled || local.busy}
          onClick={() => void local.save(build, keepPdf ? (pdf ?? undefined) : undefined, true)}
        >
          Save a new copy
        </Button>
      )}
      {pdf && (
        <label>
          <input
            type="checkbox"
            checked={keepPdf}
            onChange={event => setKeepPdf(event.target.checked)}
            disabled={disabled || local.busy}
          />{' '}
          Keep original PDF on this device for page previews
        </label>
      )}
    </div>
  );
}
function SavedRevisions({
  entry,
  local,
  disabled,
}: {
  entry: GuidelineLibraryEntry;
  local: GuidelineLocalEditor;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (entry.retained || !entry.revisions.length) return null;
  return (
    <details
      className="guideline-saved-revisions"
      onToggle={event => setExpanded(event.currentTarget.open)}
    >
      <summary>Saved revisions ({entry.revisions.length})</summary>
      {expanded && (
        <>
          <p className="guideline-muted">
            Opening a revision changes only the editor. Updating afterward saves a new revision;
            earlier snapshots remain unchanged. Up to 32 revisions share the library’s 8 MiB limit.
          </p>
          {entry.revisions.at(0)!.revision > 1 && (
            <p>
              Available history starts at revision {entry.revisions[0].revision}. Earlier saves were
              not retained by the previous version.
            </p>
          )}
          <ol>
            {[...entry.revisions].reverse().map(item => (
              <li key={item.revision}>
                <span>
                  Revision {item.revision}
                  {item.revision === entry.revision ? ' · current save' : ''} ·{' '}
                  {new Date(item.updatedAt).toLocaleString()}
                </span>
                <div className="guideline-local-actions">
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void local.openRevision(entry.reference, item.revision)}
                  >
                    Open revision {item.revision}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void local.downloadRevision(entry.reference, item.revision)}
                  >
                    Download revision {item.revision}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </details>
  );
}

export function GuidelineLocalProjects({
  local,
  disabled = false,
}: {
  local: GuidelineLocalEditor;
  disabled?: boolean;
}) {
  const [deleting, setDeleting] = useState<
    | { kind: 'project'; reference: GuidelineProjectReference }
    | { kind: 'pdf'; hash: string; affected: GuidelineProjectReference[] }
    | null
  >(null);
  const unavailable = disabled || local.busy;
  const entries =
    local.snapshot?.entries.filter(item => item.kind === local.kind || item.retained) ?? [];
  return (
    <div
      role="group"
      className="guideline-local"
      aria-label={`${label[local.kind]} local projects`}
    >
      <details>
        <summary>
          Saved {label[local.kind]} projects on this device <span>({entries.length})</span>
        </summary>
        <p className="guideline-muted">
          Explicit saves stay in this browser. Download a project for a portable copy. Opening a
          saved project replaces this section’s open work; save your current work first.
        </p>
        <div className="guideline-local-actions">
          <Button variant="outline" disabled={unavailable} onClick={() => void local.refresh()}>
            Refresh saved projects
          </Button>
          <Button variant="outline" disabled={unavailable} onClick={() => void local.backup()}>
            Download library recovery data
          </Button>
        </div>
        <p className="guideline-muted">
          Recovery data includes saved project records and selected source crops, but excludes
          original PDFs. Reopen individual project downloads with the existing Open project
          controls.
        </p>
        {!entries.length && <p>No saved {label[local.kind]} projects yet.</p>}
        <ul>
          {entries.map(entry => (
            <li key={entry.reference.id}>
              <div>
                <strong>{entry.name}</strong>
                <small>
                  {entry.retained
                    ? 'Retained read-only. Download before deleting.'
                    : `Revision ${entry.revision} · ${new Date(entry.updatedAt!).toLocaleString()}`}
                </small>
              </div>
              <div className="guideline-local-actions">
                {!entry.retained && (
                  <Button
                    variant="outline"
                    disabled={unavailable}
                    onClick={() => void local.open(entry.reference)}
                  >
                    Open saved project
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={unavailable}
                  onClick={() => void local.download(entry.reference)}
                >
                  Download saved project
                </Button>
                <Button
                  variant="outline"
                  disabled={unavailable}
                  onClick={() => setDeleting({ kind: 'project', reference: entry.reference })}
                >
                  Delete saved copy
                </Button>
                {deleting?.kind === 'project' && deleting.reference.id === entry.reference.id && (
                  <>
                    <span>Delete this saved project and all its revisions?</span>
                    <Button
                      disabled={unavailable}
                      onClick={() => {
                        setDeleting(null);
                        void local.delete(deleting.reference);
                      }}
                    >
                      Confirm delete
                    </Button>
                    <Button variant="outline" onClick={() => setDeleting(null)}>
                      Keep it
                    </Button>
                  </>
                )}
              </div>
              <SavedRevisions entry={entry} local={local} disabled={unavailable} />
            </li>
          ))}
        </ul>
        {local.kind === 'pdf' && !!local.snapshot?.assets.length && (
          <details>
            <summary>Original PDFs on this device</summary>
            <ul>
              {local.snapshot.assets.map(asset => (
                <li key={asset.hash}>
                  <div>
                    <strong>
                      {asset.name}
                      {!asset.valid && ' (unavailable)'}
                    </strong>
                    <small>
                      {(asset.bytes / 1024 / 1024).toFixed(1)} MiB · Deleting removes full-page
                      previews from: {asset.projects.join(', ') || 'no saved projects'}. Reviewed
                      evidence and designs stay saved.
                    </small>
                  </div>
                  <Button
                    variant="outline"
                    disabled={unavailable}
                    onClick={() =>
                      setDeleting({
                        kind: 'pdf',
                        hash: asset.hash,
                        affected: local
                          .snapshot!.entries.filter(item => item.pdfHashes.includes(asset.hash))
                          .map(item => item.reference),
                      })
                    }
                  >
                    Delete original PDF
                  </Button>
                  {deleting?.kind === 'pdf' && deleting.hash === asset.hash && (
                    <div className="guideline-local-actions">
                      <Button
                        disabled={unavailable}
                        onClick={() => {
                          setDeleting(null);
                          void local.deletePdf(deleting.hash, deleting.affected);
                        }}
                      >
                        Confirm delete original PDF
                      </Button>
                      <Button variant="outline" onClick={() => setDeleting(null)}>
                        Keep it
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        {local.snapshot && (
          <p className="guideline-muted">
            {local.snapshot.entries.length}/24 projects ·{' '}
            {(local.snapshot.projectBytes / 1024 / 1024).toFixed(1)}/8 MiB projects and revision
            history · {(local.snapshot.assetBytes / 1024 / 1024).toFixed(1)}/100 MiB original PDFs.
            Studio’s saved palette library is separate.
          </p>
        )}
      </details>
      {local.busy && <p role="status">Checking and saving local project data…</p>}
      {local.notice && <p role="status">{local.notice}</p>}
      {local.error && <p role="alert">{local.error}</p>}
    </div>
  );
}
