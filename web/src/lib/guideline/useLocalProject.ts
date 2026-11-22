import { useEffect, useRef, useState } from 'react';
import { downloadText } from '../download';
import {
  guidelineProjectStore as store,
  GuidelineStorageError,
  type GuidelineProjectReference,
  type GuidelineLibrarySnapshot,
  type LocalGuidelineProject,
} from './projectStore';
import type { LibraryProjectKind } from './libraryProjectCodec';
function message(error: unknown) {
  return error instanceof GuidelineStorageError
    ? error.message
    : 'Local storage could not complete this action. Your current work is unchanged; download the project to keep a copy.';
}
export function useGuidelineLocalProject(
  kind: LibraryProjectKind,
  onOpen: (project: LocalGuidelineProject) => void
) {
  const [reference, setReference] = useState<GuidelineProjectReference>();
  const [openedRevision, setOpenedRevision] = useState<number>();
  const [workspaceId, setWorkspaceId] = useState<string>(() => crypto.randomUUID());
  const [snapshot, setSnapshot] = useState<GuidelineLibrarySnapshot | null>(null);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const lifecycle = useRef({
    generation: 0,
    projectGeneration: 0,
    refresh: 0,
    controller: null as AbortController | null,
  });
  const refresh = async () => {
    const id = ++lifecycle.current.refresh;
    try {
      const result = await store.list();
      if (id === lifecycle.current.refresh) setSnapshot(result);
    } catch (reason) {
      if (id === lifecycle.current.refresh) setError(message(reason));
    }
  };
  useEffect(() => {
    const generation = lifecycle.current;
    const load = () => {
      const id = ++generation.refresh;
      void store.list().then(
        result => {
          if (id === generation.refresh) setSnapshot(result);
        },
        reason => {
          if (id === generation.refresh) setError(message(reason));
        }
      );
    };
    load();
    const stop = store.subscribe(load);
    return () => {
      stop();
      generation.controller?.abort();
      generation.generation++;
      generation.projectGeneration++;
      generation.refresh++;
    };
  }, []);
  const cancelPending = () => {
    lifecycle.current.controller?.abort();
    lifecycle.current.generation++;
    setBusy(false);
  };
  const reset = () => {
    cancelPending();
    lifecycle.current.projectGeneration++;
    setReference(undefined);
    setOpenedRevision(undefined);
    setWorkspaceId(crypto.randomUUID());
    setNotice('');
    setError('');
  };
  const run = async (
    operation: (current: () => boolean, signal: AbortSignal) => Promise<void>,
    replacesProject = false
  ) => {
    // A new open invalidates source-dependent work before its asynchronous read completes.
    // Saving, downloading or deleting stored copies does not change the open source/design.
    if (replacesProject) lifecycle.current.projectGeneration++;
    lifecycle.current.controller?.abort();
    const controller = new AbortController();
    lifecycle.current.controller = controller;
    const id = ++lifecycle.current.generation;
    setBusy(true);
    setError('');
    setNotice('');
    const current = () => lifecycle.current.generation === id;
    try {
      await operation(current, controller.signal);
      return current() && !controller.signal.aborted;
    } catch (reason) {
      if (current()) setError(message(reason));
      return false;
    } finally {
      if (current()) setBusy(false);
    }
  };
  return {
    kind,
    reference,
    workspaceId,
    snapshot,
    busy,
    notice,
    error,
    reset,
    restoreWorkspace: (id: string) => {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))
        throw new Error('Invalid recovery workspace.');
      cancelPending();
      lifecycle.current.projectGeneration++;
      setReference(undefined);
      setOpenedRevision(undefined);
      setWorkspaceId(id);
      setNotice('Restored the earlier workspace. Save as a new project to keep it.');
      setError('');
    },
    cancelPending,
    captureOperation: () => {
      const generation = lifecycle.current.generation;
      return () => lifecycle.current.generation === generation;
    },
    captureProject: () => {
      const generation = lifecycle.current.projectGeneration;
      return () => lifecycle.current.projectGeneration === generation;
    },
    refresh,
    open: (ref: GuidelineProjectReference) =>
      run(async (current, signal) => {
        const project = await store.open(ref, signal);
        if (!current()) return;
        if (project.value.kind !== kind)
          throw new GuidelineStorageError(
            'invalid',
            `Open this file in its ${project.value.kind} section.`
          );
        onOpen(project);
        setReference(ref);
        setOpenedRevision(project.revision);
        setWorkspaceId(project.workspaceId);
        setNotice(
          project.assetNotice ||
            'Reopened the saved evidence, review and selected designs on this device.'
        );
      }, true),
    openRevision: (ref: GuidelineProjectReference, revision: number) =>
      run(async (current, signal) => {
        const project = await store.openRevision(ref, revision, signal);
        if (!current()) return;
        if (project.value.kind !== kind)
          throw new GuidelineStorageError(
            'invalid',
            `Download this revision and open it in its ${project.value.kind} section.`
          );
        onOpen(project);
        setReference(ref);
        setOpenedRevision(project.revision);
        setWorkspaceId(project.workspaceId);
        setNotice(
          `Opened revision ${revision}. Saved revision ${project.latestRevision} is unchanged. Updating saves a new revision and preserves both snapshots.${project.assetNotice ? ` ${project.assetNotice}` : ''}`
        );
      }, true),
    downloadRevision: (ref: GuidelineProjectReference, revision: number) =>
      run(async current => {
        const json = await store.downloadRevision(ref, revision);
        if (current()) downloadText(`teul-guideline-revision-${revision}`, json, 'json');
      }),
    save: (build: (signal: AbortSignal) => Promise<string> | string, pdf?: File, copy = false) =>
      run(async (current, signal) => {
        const json = await build(signal);
        if (!current()) return;
        const saved = await store.save(
          {
            json,
            workspaceId,
            pdf,
            ...(reference && !copy && openedRevision !== undefined
              ? { fromSavedRevision: openedRevision }
              : {}),
          },
          copy ? undefined : reference,
          signal
        );
        if (!current()) return;
        setReference(saved);
        setOpenedRevision(undefined);
        setNotice(
          'Saved a new revision on this device. Earlier revisions, selected designs and their recorded decisions are retained.'
        );
      }),
    delete: (ref: GuidelineProjectReference) =>
      run(async current => {
        await store.delete(ref);
        if (current()) {
          if (reference?.id === ref.id) {
            setReference(undefined);
            setOpenedRevision(undefined);
          }
          setNotice(
            'Deleted the saved project and its revision history. Your open work and original source files are retained.'
          );
        }
      }),
    download: (ref: GuidelineProjectReference) =>
      run(async current => {
        const json = await store.download(ref);
        if (current()) downloadText('teul-recovered-project', json, 'json');
      }),
    backup: () =>
      run(async current => {
        const json = await store.exportRecovery();
        if (current()) downloadText('teul-guideline-library-recovery', json, 'json');
      }),
    deletePdf: (hash: string, affected: GuidelineProjectReference[]) =>
      run(async current => {
        await store.deletePdf(hash, affected);
        if (current())
          setNotice(
            'Deleted the saved original PDF. Reviewed evidence and saved designs are retained. Full-page previews remain available in the open editor until you close it.'
          );
      }),
  };
}
export type GuidelineLocalEditor = ReturnType<typeof useGuidelineLocalProject>;
