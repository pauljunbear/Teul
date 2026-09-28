import {
  GuidelineSourceSetProvider,
  GuidelineSourceSetPanel,
  GuidelineAddToSourceSet,
} from './GuidelineSourceSet';
import { GuidelineModeGradientEditor } from './GuidelineModeGradientEditor';
import { GuidelineStatementGroup } from './GuidelineStatementGroup';
import {
  groupReviewStatements,
  copyStatementExclusion,
  indexPdfStatementText,
  nearbyPdfStatementText,
} from '../lib/guideline/statementReview';
import {
  isGuidelineAuthoredGradient,
  type GuidelineAuthoredGradientSelection,
} from '../lib/guideline/authoredGradient';
import { GuidelineRefreshRestore } from './GuidelineRefreshRestore';
import {
  createGuidelineRefreshLineage,
  type GuidelineRefreshLineage,
} from '../lib/guideline/refreshLineage';
import { replayGuidelineRefresh } from '../lib/guideline/refreshReplay';
import { readSourceProject } from '../lib/guideline/sourceProjectCodec';
import {
  EMPTY_GUIDELINE_OUTPUTS,
  type GuidelineSelectedOutputs,
} from '../lib/guideline/selectedOutputs';
import {
  readAnyGuidelineProject,
  serializeGuidelineWorkspace,
  type OpenedGuidelineProject,
} from '../lib/guideline/projectCodec';
import { useGuidelineLocalProject } from '../lib/guideline/useLocalProject';
import { GuidelineLocalProjects, GuidelineLocalSave } from './GuidelineLocalProjects';
import { GuidelineRecovery } from './GuidelineRecovery';
import { GuidelineIntakeClient } from '../lib/guideline/intakeClient';
import { openOwnedRecovery } from '../lib/guideline/recovery';
import { assistanceFromRecovery } from '../lib/guideline/assistanceRecovery';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, FileUp } from 'lucide-react';
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { openGuidelinePdf, type GuidelinePdf } from '../lib/guideline/pdf';
import { CAPTURE_LIMITS, type EvidenceLocator } from '../lib/guideline/evidence';
import { CAPTURE_V2_VERSION, type GuidelineCaptureAny } from '../lib/guideline/evidenceV2';
import { capturePdfPagesV2 } from '../lib/guideline/pdfV2';
import { parseGuidelinePages } from '../lib/guideline/pdfPages';
import { GuidelinePdfRefresh } from './GuidelinePdfRefresh';
import {
  compileGuidelineReviewV3,
  suggestGuidelineReviewV3,
  type ReviewedGuidelineV3,
} from '../lib/guideline/reviewV3';
import { buildGuidelineProjectV3 } from '../lib/guideline/projectV3';
import { buildGuidelineProjectV4 } from '../lib/guideline/projectV4';
import {
  compileGuidelineReviewV4,
  type GuidelineReviewDraftV4,
  type ReviewedGuidelineV4,
} from '../lib/guideline/reviewV4';
import { createGuidelineSourceInventory } from '../lib/guideline/sourceInventory';
import { GuidelineManualColorPanel } from './GuidelineManualColorPanel';
import {
  suggestGuidelineReviewFromCapture,
  guidelineHash,
  type GuidelineReviewDraft,
  type ReviewedGuideline,
  type ReviewScope,
} from '../lib/guideline/review';
import {
  upgradeGuidelineDraftV2,
  compileGuidelineReviewV2,
  type GuidelineReviewDraftV2,
  type ReviewedGuidelineV2,
  type ReviewRuleV2,
} from '../lib/guideline/reviewV2';
import { buildGuidelineProjectV2 } from '../lib/guideline/projectV2';
import { GuidelineScalesEditor, GuidelineRuleDefinitionEditor } from './GuidelineStructureEditor';
import { GuidelineDesignWorkspace } from './GuidelineDesignWorkspace';
import { GuidelineFigmaPanel } from './GuidelineFigmaPanel';
import { GuidelineWebsitePanel } from './GuidelineWebsitePanel';
import { GuidelineAssistancePanel, type AssistanceRecovery } from './GuidelineAssistancePanel';
import type { AssistanceReceipt } from '../lib/guideline/assistance';
import { colorSystemSrgbToCssV1 } from '../../../src/lib/colorSystemSrgbValueV1';
import { COLOR_SYSTEM_MODEL_V1_LIMITS } from '../../../src/lib/colorSystemModelV1';
import { downloadBlob, downloadText } from '../lib/download';
import {
  buildGuidelineProject,
  PROJECT_BYTES,
  type GuidelineSelection,
} from '../lib/guideline/project';
import './GuidelineWorkspace.css';

function PdfPage({
  pdf,
  number,
  highlight,
}: {
  pdf: GuidelinePdf;
  number: number;
  highlight: EvidenceLocator | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let render: { cancel: () => void; promise: Promise<unknown> } | undefined;
    let activePage: Awaited<ReturnType<GuidelinePdf['document']['getPage']>> | undefined;
    void (async () => {
      const page = await pdf.document.getPage(number);
      activePage = page;
      if (disposed || !canvas.current) {
        page.cleanup();
        return;
      }
      setError('');
      const source = page.getViewport({ scale: 1 });
      setSize({ width: source.width, height: source.height });
      const viewport = page.getViewport({
        scale: Math.min(1.5, 1200 / source.width, 1600 / source.height),
      });
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      const task = page.render({ canvas: canvas.current, viewport });
      render = task;
      await task.promise;
    })().catch(reason => {
      if (!disposed)
        setError(reason instanceof Error ? reason.message : 'Page preview unavailable.');
    });
    return () => {
      disposed = true;
      render?.cancel();
      if (render) void render.promise.catch(() => {}).finally(() => activePage?.cleanup());
      else activePage?.cleanup();
    };
  }, [pdf, number]);
  const box = highlight?.kind === 'pdf' && highlight.page === number ? highlight.bounds : null;
  return (
    <div className="guideline-pdf-page">
      <canvas
        ref={canvas}
        aria-label={`Source page ${number}. Extracted text is available in the source text panel.`}
      />
      {box && (
        <span
          className="guideline-highlight"
          aria-hidden="true"
          style={{
            left: `${(box[0] / size.width) * 100}%`,
            top: `${(box[1] / size.height) * 100}%`,
            width: `${(box[2] / size.width) * 100}%`,
            height: `${(box[3] / size.height) * 100}%`,
          }}
        />
      )}
      {error && <p role="alert">Preview unavailable. {error}</p>}
    </div>
  );
}

export default function GuidelineWorkspace() {
  return (
    <GuidelineSourceSetProvider>
      <GuidelineWorkspaceContent />
    </GuidelineSourceSetProvider>
  );
}
function GuidelineWorkspaceContent() {
  const contextEpochRef = useRef(0);
  // A rejected open or an unrelated output edit cancels work without changing verified source paint.
  const sourceEpochRef = useRef(0);
  const [contextEpoch, setContextEpoch] = useState(0);
  const advanceContext = () => {
    const epoch = ++contextEpochRef.current;
    setContextEpoch(epoch);
    return epoch;
  };
  const advanceSource = () => {
    sourceEpochRef.current++;
    return advanceContext();
  };
  const [assistanceReceipt, setAssistanceReceipt] = useState<AssistanceReceipt | null>(null);
  const [assistanceRecovery, setAssistanceRecovery] = useState<AssistanceRecovery | null>(null);
  const [pdf, setPdf] = useState<GuidelinePdf | null>(null);
  const pdfRef = useRef<GuidelinePdf | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const job = useRef<{
    controller: AbortController;
    kind: 'pdf-open' | 'pdf-capture' | 'project-open' | 'project-save';
  } | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState('1');
  const [capture, setCapture] = useState<GuidelineCaptureAny | null>(null);
  const [storedDraft, setDraft] = useState<
    GuidelineReviewDraft | GuidelineReviewDraftV2 | GuidelineReviewDraftV4 | null
  >(null);
  const draft = useMemo<GuidelineReviewDraftV2 | GuidelineReviewDraftV4 | null>(
    () =>
      storedDraft
        ? 'scales' in storedDraft
          ? storedDraft
          : upgradeGuidelineDraftV2(storedDraft)
        : null,
    [storedDraft]
  );
  const [review, setReview] = useState<
    ReviewedGuideline | ReviewedGuidelineV2 | ReviewedGuidelineV3 | ReviewedGuidelineV4 | null
  >(null);
  const draftHash = useMemo(
    () => (draft && assistanceReceipt && !('reviewedValues' in draft) ? guidelineHash(draft) : ''),
    [draft, assistanceReceipt]
  );
  const [refreshLineage, setRefreshLineage] = useState<GuidelineRefreshLineage | null>(null);
  const [outputs, setOutputs] = useState<GuidelineSelectedOutputs>(EMPTY_GUIDELINE_OUTPUTS);
  const [selection, setSelection] = useState<GuidelineSelection | null>(null);
  const [gradientSelection, setGradientSelection] =
    useState<GuidelineAuthoredGradientSelection | null>(null);
  const [openedRevision, setOpenedRevision] = useState(0);
  const [openRuleId, setOpenRuleId] = useState<string | null>(null);
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [importNotice, setImportNotice] = useState('');
  const [highlight, setHighlight] = useState<EvidenceLocator | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [textOpen, setTextOpen] = useState(false);
  const [textCount, setTextCount] = useState(100);
  const overlay =
    draft && 'reviewedValues' in draft
      ? (draft as GuidelineReviewDraftV4).reviewedValues
      : undefined;
  const assistanceDraft = useMemo(
    () =>
      draft && capture
        ? 'reviewedValues' in draft
          ? upgradeGuidelineDraftV2(suggestGuidelineReviewFromCapture(capture))
          : draft
        : null,
    [capture, draft]
  );
  const manualDraft = useMemo<GuidelineReviewDraftV4 | null>(
    () =>
      draft
        ? {
            ...draft,
            reviewedValues: overlay ?? { witnesses: [], candidates: [], confirmations: [] },
          }
        : null,
    [draft, overlay]
  );
  const observations = useMemo(
    () =>
      new Map(
        capture
          ? createGuidelineSourceInventory(capture, overlay).entries.map(item => [item.id, item])
          : []
      ),
    [capture, overlay]
  );
  const sourceText = useMemo(
    () => capture?.observations.filter(item => item.kind === 'text') ?? [],
    [capture]
  );
  const statementTextIndex = useMemo(() => indexPdfStatementText(sourceText), [sourceText]);
  const ruleGroups = useMemo(
    () => groupReviewStatements(draft?.rules ?? [], statementTextIndex.byId),
    [draft?.rules, statementTextIndex]
  );
  const [error, setError] = useState('');
  const local = useGuidelineLocalProject('pdf', saved => {
    if (saved.value.kind !== 'pdf') return;
    installProject(saved.value);
    setImportedFile(
      new File([saved.json], 'teul-local-project.json', { type: 'application/json' })
    );
    setImportNotice('Saved source evidence, review and selected designs reopened.');
    if (saved.pdf) void open(saved.pdf, saved.value.project.capture.identity.sha256);
  });
  const workspaceId = local.workspaceId;
  useEffect(
    () => () => {
      sourceEpochRef.current++;
      job.current?.controller.abort();
      void pdfRef.current?.close();
    },
    []
  );
  const locate = (id: string) => {
    const locator = observations.get(id)?.locator;
    if (locator?.kind === 'pdf') {
      setPage(locator.page);
      setHighlight(locator);
    }
  };
  const beginJob = (kind: NonNullable<typeof job.current>['kind']) => {
    local.cancelPending();
    if (kind !== 'project-save') advanceContext();
    const previous = job.current;
    previous?.controller.abort();
    if (previous?.kind === 'pdf-capture') {
      // Aborting text extraction destroys that PDF; retain the last File for explicit reopening.
      pdfRef.current = null;
      setPdf(null);
    }
    const controller = new AbortController();
    job.current = { kind, controller };
    setBusy(true);
    return controller;
  };
  const finishJob = (controller: AbortController) => {
    if (job.current?.controller === controller) {
      job.current = null;
      setBusy(false);
    }
  };
  const cancelJob = () => {
    const active = job.current;
    active?.controller.abort();
    job.current = null;
    setBusy(false);
    if (active?.kind === 'pdf-open' || active?.kind === 'pdf-capture') {
      void pdfRef.current?.close();
      setPdf(null);
      pdfRef.current = null;
    }
    return active?.kind;
  };
  async function open(file: File, restoredHash?: string) {
    const controller = beginJob('pdf-open');
    void pdfRef.current?.close();
    pdfRef.current = null;
    setPdf(null);
    setError('');
    setStatus('Opening PDF…');
    try {
      if (file.size > CAPTURE_LIMITS.pdfBytes) throw new Error('Choose a PDF smaller than 50 MiB.');
      const opened = await openGuidelinePdf(new Uint8Array(await file.arrayBuffer()), file.name, {
        workerSrc,
        standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-fonts/`,
        signal: controller.signal,
      });
      if (controller.signal.aborted || job.current?.controller !== controller) {
        await opened.close();
        return;
      }
      pdfRef.current = opened;
      setLastFile(file);
      setPdf(opened);
      if ((restoredHash ?? capture?.identity.sha256) !== opened.sha256) {
        advanceSource();
        local.reset();
        setCapture(null);
        setRefreshLineage(null);
        setDraft(null);
        setReview(null);
        setSelection(null);
        setGradientSelection(null);
        setOutputs(EMPTY_GUIDELINE_OUTPUTS);
        setPage(1);
        setPages('1');
        setHighlight(null);
      }
      setStatus(`${opened.pageCount} pages. Choose the color and usage sections to inspect.`);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : 'PDF could not be opened.');
    } finally {
      finishJob(controller);
    }
  }
  const extract = async () => {
    if (!pdf) return;
    const controller = beginJob('pdf-capture');
    setError('');
    setStatus('Reading selected pages…');
    try {
      const result = await capturePdfPagesV2(pdf, parseGuidelinePages(pages, pdf.pageCount), {
        signal: controller.signal,
        onProgress: (done, total) => {
          if (job.current?.controller === controller)
            setStatus(`Read ${done} of ${total} selected pages.`);
        },
      });
      if (controller.signal.aborted || job.current?.controller !== controller) return;
      const nextDraft = suggestGuidelineReviewV3(result);
      advanceSource();
      setCapture(result);
      setRefreshLineage(null);
      setDraft(nextDraft);
      setTextCount(100);
      setReview(null);
      setSelection(null);
      setGradientSelection(null);
      setOutputs(EMPTY_GUIDELINE_OUTPUTS);
      setStatus('Review the printed colors and possible rules below.');
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : 'Source could not be read.');
    } finally {
      finishJob(controller);
    }
  };
  const edit = (change: GuidelineReviewDraftV2 | GuidelineReviewDraftV4) => {
    advanceSource();
    local.cancelPending();
    if (job.current) {
      cancelJob();
      setStatus('Pending work cancelled because you edited the review.');
    }
    setDraft(change);
    setReview(null);
    setSelection(null);
    setGradientSelection(null);
    setOutputs(EMPTY_GUIDELINE_OUTPUTS);
    setError('');
  };
  const confirm = () => {
    try {
      if (capture && draft) {
        advanceSource();
        setSelection(null);
        setGradientSelection(null);
        setOpenedRevision(n => n + 1);
        setOutputs(EMPTY_GUIDELINE_OUTPUTS);
        setReview(
          'reviewedValues' in draft
            ? compileGuidelineReviewV4(capture, draft as GuidelineReviewDraftV4, {
                kind: 'user',
                ref: 'studio:confirm-source-review',
              })
            : capture.schemaVersion === CAPTURE_V2_VERSION
              ? compileGuidelineReviewV3(capture, draft, {
                  kind: 'user',
                  ref: 'studio:confirm-source-review',
                })
              : compileGuidelineReviewV2(capture, draft, {
                  kind: 'user',
                  ref: 'studio:confirm-source-review',
                })
        );
        setDraft(draft);
        setStatus('Your review is applied. Source restrictions remain attached.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Review could not be applied.');
    }
  };
  const currentProject = () => {
    if (!capture || !storedDraft) throw new Error('Read and review a source first.');
    // An untouched V1 file remains byte-for-byte replayable. Editing adopts the richer V2 draft.
    return 'reviewedValues' in storedDraft
      ? buildGuidelineProjectV4({
          capture,
          draft: storedDraft,
          review: review as ReviewedGuidelineV4 | null,
          selection,
        })
      : capture.schemaVersion === CAPTURE_V2_VERSION
        ? buildGuidelineProjectV3({
            capture,
            draft: storedDraft as GuidelineReviewDraftV2,
            review: review as ReviewedGuidelineV3 | null,
            selection,
          })
        : 'scales' in storedDraft
          ? buildGuidelineProjectV2({
              capture,
              draft: storedDraft,
              review: review as ReviewedGuidelineV2 | null,
              selection,
            })
          : buildGuidelineProject({
              capture,
              draft: storedDraft,
              review: review as ReviewedGuideline | null,
              selection,
            });
  };
  const serializeProject = (signal?: AbortSignal) =>
    serializeGuidelineWorkspace(
      JSON.stringify(currentProject()),
      outputs,
      assistanceReceipt?.sourceCaptureHash === capture?.captureHash ? assistanceReceipt : null,
      signal,
      refreshLineage,
      gradientSelection
    );
  const changeOutputs = (next: GuidelineSelectedOutputs) => {
    local.cancelPending();
    cancelJob();
    advanceContext();
    setOutputs(next);
  };
  const saveProject = async () => {
    if (!capture || !storedDraft) return;
    const controller = beginJob('project-save');
    setStatus('Preparing project download…');
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (controller.signal.aborted || job.current?.controller !== controller) return;
      const json = await serializeProject(controller.signal);
      if (controller.signal.aborted || job.current?.controller !== controller) return;
      downloadText('teul-guideline-project', json, 'json');
      setStatus(
        'Project download prepared. Confirmed page values include their retained source regions. Keep the original PDF separately for full page previews.'
      );
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Project could not be prepared.');
    } finally {
      finishJob(controller);
    }
  };
  function installProject(opened: Extract<OpenedGuidelineProject, { kind: 'pdf' }>) {
    const epoch = advanceSource();
    const project = opened.project;
    setOutputs(opened.outputs);
    setRefreshLineage(opened.refreshLineage);
    setGradientSelection(opened.gradientSelection);
    setAssistanceReceipt(opened.assistanceReceipt);
    // Publish only after the complete packet passes. A malformed file cannot replace current work.
    if (pdfRef.current?.sha256 !== project.capture.identity.sha256) {
      void pdfRef.current?.close();
      pdfRef.current = null;
      setPdf(null);
      setLastFile(null);
    }
    setCapture(project.capture);
    setDraft(project.draft);
    setReview(project.review);
    setOpenRuleId(null);
    setSelection(project.selection);
    setOpenedRevision(n => n + 1);
    setHighlight(null);
    setTextCount(100);
    const importedPages = project.capture.scope.requested.map(item =>
      Number(item.replace('page:', ''))
    );
    setPages(importedPages.join(', '));
    setPage(importedPages[0] ?? 1);
    return epoch;
  }
  const reopenProject = async (file: File) => {
    const controller = beginJob('project-open');
    setError('');
    setStatus('Checking project evidence and selected design…');
    try {
      if (file.size > PROJECT_BYTES) throw new Error('Choose a project smaller than 16 MiB.');
      const text = await file.text();
      if (controller.signal.aborted || job.current?.controller !== controller) return;
      await new Promise(resolve => setTimeout(resolve, 0));
      if (controller.signal.aborted || job.current?.controller !== controller) return;
      const result = await readAnyGuidelineProject(text, controller.signal);
      if (controller.signal.aborted || job.current?.controller !== controller) return;
      setImportedFile(file);
      if (result.status === 'read-only') {
        setImportNotice(
          `${result.version} is read-only here. Its original bytes are retained for download; your open work is unchanged.`
        );
        setStatus('Imported file retained read-only.');
        return;
      }
      if (result.value.kind !== 'pdf')
        throw new Error('Open this project in its Figma or Website source panel.');
      local.reset();
      installProject(result.value);
      setImportNotice(
        result.value.format === 'legacy-review'
          ? 'Earlier source-review format reopened. Its original file remains available; future downloads use the project format.'
          : 'Project reopened. Recorded decisions are retained; this file does not authenticate its source or reviewer.'
      );
      setStatus('Source evidence, review and selected design reopened.');
    } catch (reason) {
      if (!controller.signal.aborted) {
        if (file.size <= PROJECT_BYTES) {
          setImportedFile(file);
          setImportNotice(
            'This file could not be opened. Its original bytes are retained read-only; your open work is unchanged.'
          );
        }
        setError(reason instanceof Error ? reason.message : 'Project could not be opened.');
        setStatus('Project was not opened. Previous work is unchanged.');
      }
    } finally {
      finishJob(controller);
    }
  };
  return (
    <div className="guideline-workspace">
      <header className="guideline-heading">
        <div>
          <span className="eyebrow">GUIDELINES</span>
          <h1>Start with your brand.</h1>
          <p>Read a guideline, review its colors and rules, then explore what can come next.</p>
        </div>
        <div className="guideline-file-actions">
          <label className="guideline-file">
            <FileUp size={18} />
            Choose PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Choose guideline PDF"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void open(file);
                e.target.value = '';
              }}
            />
          </label>
          <label className="guideline-file">
            <FileUp size={18} />
            Open project
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Open guideline project"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void reopenProject(file);
                e.target.value = '';
              }}
            />
          </label>
          {capture && draft && (
            <Button variant="outline" disabled={busy} onClick={saveProject}>
              <ArrowDownToLine size={16} /> Download project
            </Button>
          )}
        </div>
      </header>
      <p className="guideline-muted">
        Read selected PDF pages on your device, or connect a Figma library below. Website capture
        and optional assisted review require a configured service; assistance also asks for your
        consent. Saved captures work offline. Save on this device or download a project to keep the
        evidence, your review and selected designs across sessions. Projects with confirmed page
        values include the selected source crops; they do not embed the full PDF.
      </p>
      <GuidelineLocalProjects local={local} disabled={busy} />
      <GuidelineRecovery
        kind="pdf"
        disabled={busy}
        onOpen={async (ownerBinding, reference) => {
          const controller = beginJob('project-open');
          try {
            const saved = await openOwnedRecovery(
              new GuidelineIntakeClient(),
              ownerBinding,
              reference,
              controller.signal
            );
            if (!saved.project) throw new Error('This request does not contain a PDF workspace.');
            if (controller.signal.aborted || job.current?.controller !== controller) return;
            local.restoreWorkspace(saved.payload.submission.binding.workspaceId);
            const epoch = installProject(saved.project);
            setAssistanceRecovery(assistanceFromRecovery(saved, epoch));
            setImportNotice(
              'Restored the workspace from before assistance. Its saved request can be checked without another submission.'
            );
            setImportedFile(
              new File([saved.payload.projectJson!], 'teul-recovered-workspace.json', {
                type: 'application/json',
              })
            );
            setStatus(
              'Earlier source, draft and selected designs restored. Check the submitted request to inspect its result.'
            );
          } finally {
            finishJob(controller);
          }
        }}
      />
      {capture && storedDraft && (
        <GuidelineLocalSave local={local} disabled={busy} build={serializeProject} pdf={lastFile} />
      )}
      {capture && draft && (
        <GuidelinePdfRefresh
          key={contextEpoch}
          capture={capture}
          draft={draft}
          disabled={busy || local.busy}
          onAccept={async (proposal, file, signal) => {
            const epoch = contextEpochRef.current;
            if (
              proposal.previousCaptureHash !== capture.captureHash ||
              proposal.previousDraftHash !== guidelineHash(draft)
            )
              return false;
            const projectInput = {
              capture: proposal.capture,
              draft: proposal.draft,
              review: null,
              selection: null,
            };
            const nextProject =
              proposal.capture.schemaVersion === CAPTURE_V2_VERSION
                ? buildGuidelineProjectV3({ ...projectInput, capture: proposal.capture })
                : buildGuidelineProjectV2({ ...projectInput, capture: proposal.capture });
            let lineage: GuidelineRefreshLineage | null = null;
            const saved = await local.save(async saveSignal => {
              const active = AbortSignal.any([signal, saveSignal]);
              active.throwIfAborted();
              const next = await readSourceProject(JSON.stringify(nextProject));
              if (next.status !== 'opened') throw new Error('The updated source is read-only.');
              lineage = await createGuidelineRefreshLineage(
                JSON.stringify(currentProject()),
                outputs,
                next.value,
                active,
                gradientSelection
              );
              await serializeGuidelineWorkspace(
                JSON.stringify(nextProject),
                EMPTY_GUIDELINE_OUTPUTS,
                null,
                active,
                lineage
              );
              return serializeProject(active);
            });
            if (!saved || !lineage || signal.aborted || contextEpochRef.current !== epoch)
              return false;
            advanceSource();
            setCapture(proposal.capture);
            setRefreshLineage(lineage);
            setDraft(proposal.draft);
            setReview(null);
            setSelection(null);
            setGradientSelection(null);
            setOutputs(EMPTY_GUIDELINE_OUTPUTS);
            setAssistanceReceipt(null);
            setOpenRuleId(null);
            setHighlight(null);
            setTextCount(100);
            setPages(
              proposal.capture.scope.requested.map(item => item.replace('page:', '')).join(', ')
            );
            setPage(Number(proposal.capture.scope.requested[0]?.replace('page:', '')) || 1);
            setImportedFile(null);
            setImportNotice('');
            setStatus(
              'Previous project saved. Review the updated source before making new designs.'
            );
            void open(file, proposal.capture.identity.sha256);
            return true;
          }}
        />
      )}
      {capture && refreshLineage && (
        <GuidelineRefreshRestore
          key={`${contextEpoch}:${review?.reviewHash ?? 'pending'}:${gradientSelection?.design.designHash ?? selection?.design.designHash ?? ''}`}
          lineage={refreshLineage}
          enabled={!!review && !busy && !local.busy}
          prepare={async signal => {
            const next = await readSourceProject(JSON.stringify(currentProject()));
            if (next.status !== 'opened') throw new Error('The current source is read-only.');
            return replayGuidelineRefresh(refreshLineage, next.value, signal);
          }}
          onRestore={result => {
            local.cancelPending();
            cancelJob();
            advanceContext();
            if (isGuidelineAuthoredGradient(result.selection)) {
              setSelection(null);
              setGradientSelection(result.selection);
            } else if (result.selection && !('modeId' in result.selection)) {
              setSelection(result.selection);
              setGradientSelection(null);
            }
            setOutputs({
              extension: result.outputs.extension ?? outputs.extension,
              application: result.outputs.application ?? outputs.application,
              supporting: result.outputs.supporting ?? outputs.supporting,
            });
            setOpenedRevision(n => n + 1);
            setStatus(
              'Restored verified paint under the current source review. Pending extension rules still require review.'
            );
          }}
        />
      )}
      <GuidelineSourceSetPanel />
      <GuidelineFigmaPanel />
      <GuidelineWebsitePanel />
      {importedFile && (
        <div role="group" className="guideline-notice" aria-label="Imported project file">
          <p>{importNotice}</p>
          <Button variant="outline" onClick={() => downloadBlob(importedFile.name, importedFile)}>
            Download original imported file
          </Button>
        </div>
      )}
      <div className="guideline-status" role="status" aria-live="polite">
        {status}
      </div>
      {error && (
        <div className="guideline-notice" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <Button
          variant="outline"
          onClick={() => {
            const kind = cancelJob();
            if (kind === 'pdf-open' || kind === 'pdf-capture') {
              setStatus('Cancelled. Reopen the PDF to continue; the previous capture is retained.');
            } else {
              setStatus('Cancelled. Your current source, review and design are unchanged.');
            }
          }}
        >
          Cancel
        </Button>
      )}
      <fieldset disabled={local.busy} className="guideline-local-guard">
        {(pdf || capture) && (
          <div className="guideline-columns">
            {pdf ? (
              <section className="guideline-source" aria-label="Source document">
                <div className="guideline-section-heading">
                  <h2>{pdf.name}</h2>
                  <span>{pdf.pageCount} pages</span>
                </div>
                <div className="guideline-page-controls">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous source page"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ArrowLeft size={16} />
                  </Button>
                  <label>
                    Page{' '}
                    <input
                      type="number"
                      min={1}
                      max={pdf.pageCount}
                      value={page}
                      onChange={e => {
                        const value = Number(e.target.value);
                        if (Number.isInteger(value) && value >= 1 && value <= pdf.pageCount)
                          setPage(value);
                      }}
                    />
                  </label>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next source page"
                    disabled={page === pdf.pageCount}
                    onClick={() => setPage(page + 1)}
                  >
                    <ArrowRight size={16} />
                  </Button>
                </div>
                <PdfPage
                  key={`${pdf.sha256}:${page}`}
                  pdf={pdf}
                  number={page}
                  highlight={highlight}
                />
                <form
                  className="guideline-extract"
                  onSubmit={e => {
                    e.preventDefault();
                    void extract();
                  }}
                >
                  <label>
                    Pages to read
                    <Input
                      value={pages}
                      placeholder="For example: 4, 8-12"
                      disabled={busy}
                      onChange={e => setPages(e.target.value)}
                    />
                  </label>
                  <Button disabled={busy} type="submit">
                    Read selected pages
                  </Button>
                </form>
                <p className="guideline-muted">
                  Include usage and restriction pages alongside the palette. Up to 20 pages per
                  capture.
                </p>
              </section>
            ) : (
              <section className="guideline-source">
                <h2>Source preview is closed</h2>
                <p className="guideline-muted">
                  Source text, locations and review remain available. Choose the same original PDF
                  to restore page previews; it is not embedded in the project file.
                </p>
                {lastFile && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (lastFile) void open(lastFile);
                    }}
                  >
                    Reopen source preview
                  </Button>
                )}
              </section>
            )}
            <section className="guideline-review" aria-label="Review source interpretation">
              {!capture || !draft ? (
                <div className="guideline-empty">
                  <h2>Find the color section.</h2>
                  <p>
                    Preview the source on the left, then select its palette and usage pages. Stated
                    HEX, RGB and sRGB values appear here with their source positions.
                  </p>
                </div>
              ) : (
                <>
                  <div className="guideline-section-heading">
                    <h2>Review what we found</h2>
                    <span>
                      {capture.observations.filter(item => item.kind === 'color').length} stated
                      colors
                      {overlay?.candidates.length
                        ? ` · ${draft.colors.filter(item => item.include && item.observationId.startsWith('reviewed-value:')).length} confirmed values`
                        : ''}
                    </span>
                  </div>
                  {capture.scope.gaps.length > 0 && (
                    <details className="guideline-coverage">
                      <summary>
                        Coverage · {capture.scope.inspected.length} of {capture.scope.total} pages
                        inspected
                      </summary>
                      <ul>
                        {capture.scope.gaps.map((gap, i) => (
                          <li key={i}>{gap.message}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p className="guideline-muted">
                    Exclude examples that are not part of the palette. Names and families are your
                    interpretation; the printed values stay unchanged.
                  </p>
                  {'reviewedValues' in draft && (
                    <p className="guideline-muted">
                      Assisted suggestions currently cover automatically extracted values. Your
                      confirmed page values, families and rules remain editable below.
                    </p>
                  )}
                  {(!('reviewedValues' in draft) || assistanceRecovery) && (
                    <GuidelineAssistancePanel
                      key={'reviewedValues' in draft ? 'manual-recovery' : 'source-assistance'}
                      workspaceId={workspaceId}
                      contextEpoch={contextEpoch}
                      snapshotProject={serializeProject}
                      recovery={assistanceRecovery}
                      onRecovery={setAssistanceRecovery}
                      capture={capture}
                      draft={assistanceDraft!}
                      pdf={pdf}
                      disabled={busy}
                      onLocate={locate}
                      onApply={(next, receipt) => {
                        if ('reviewedValues' in draft) return;
                        edit(next);
                        setAssistanceReceipt(receipt);
                        setStatus(
                          'Suggestions added to your editable draft. Review them, then apply your review.'
                        );
                      }}
                    />
                  )}
                  {assistanceReceipt?.sourceCaptureHash === capture.captureHash && (
                    <div className="guideline-muted">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          downloadText(
                            'teul-assistance-receipt',
                            JSON.stringify(assistanceReceipt, null, 2),
                            'json'
                          )
                        }
                      >
                        Download last assistance receipt
                      </Button>
                      <p>
                        This historical record is included in your project. It does not authenticate
                        the provider or replay the earlier draft and image inputs.
                        {assistanceReceipt.afterDraftHash !== draftHash &&
                          ' You have edited the draft since these suggestions were added.'}
                      </p>
                    </div>
                  )}
                  {capture.schemaVersion === CAPTURE_V2_VERSION && (
                    <p className="guideline-muted">
                      Automatically extracted values come from printed HEX, RGB or sRGB notation.
                      Fractional channels and transparency stay intact. Confirmed transcriptions and
                      approximate rendered samples are labeled separately. CMYK, Pantone and Display
                      P3 specifications remain in the source text; rendered swatches are not treated
                      as exact digital values.
                    </p>
                  )}
                  <div className="guideline-color-list">
                    {draft.colors.map((color, i) => {
                      const observation = observations.get(color.observationId);
                      if (observation?.kind !== 'color') return null;
                      const value = observation.value;
                      const original = capture.observations.find(
                        item => item.id === observation.id
                      );
                      const candidate = overlay?.candidates.find(
                        item => item.id === color.observationId
                      );
                      const label =
                        candidate?.method === 'rendered-srgb-sample' ||
                        (original?.kind === 'color' &&
                          (original.method === 'stated-hex' ||
                            ('syntax' in original && original.syntax === 'hex')))
                          ? value.hex
                          : observation.literal;
                      return (
                        <div className="guideline-color-row" key={color.observationId}>
                          <label className="guideline-include">
                            <input
                              type="checkbox"
                              checked={color.include}
                              disabled={!observation.available}
                              aria-label={`Include ${label}`}
                              onChange={e =>
                                edit({
                                  ...draft,
                                  colors: draft.colors.map((item, j) =>
                                    j === i ? { ...item, include: e.target.checked } : item
                                  ),
                                })
                              }
                            />
                          </label>
                          <button
                            className="guideline-swatch"
                            style={{ background: colorSystemSrgbToCssV1(value) }}
                            aria-label={`View ${label} in source`}
                            onClick={() => locate(color.observationId)}
                          />
                          <div>
                            <Input
                              aria-label={`Name for ${label}`}
                              value={color.label}
                              maxLength={160}
                              onChange={e =>
                                edit({
                                  ...draft,
                                  colors: draft.colors.map((item, j) =>
                                    j === i ? { ...item, label: e.target.value } : item
                                  ),
                                })
                              }
                            />
                            <button
                              className="guideline-source-link"
                              onClick={() => locate(color.observationId)}
                            >
                              {label} · page{' '}
                              {observation.locator.kind === 'pdf' ? observation.locator.page : ''}
                            </button>
                            {candidate && (
                              <p className="guideline-muted">
                                {candidate.method === 'transcribed-digital'
                                  ? 'User-confirmed transcription'
                                  : 'Rendered sample · approximate'}
                                {!observation.available ? ' · no longer accepted' : ''}
                              </p>
                            )}
                          </div>
                          <Input
                            aria-label={`Family for ${label}`}
                            placeholder="Family (optional)"
                            value={color.family}
                            maxLength={160}
                            onChange={e =>
                              edit({
                                ...draft,
                                colors: draft.colors.map((item, j) =>
                                  j === i ? { ...item, family: e.target.value } : item
                                ),
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                  {!draft.colors.length && (
                    <p>
                      No stated HEX, RGB or sRGB values were readable. Add a color from this page
                      below to confirm a printed value or accept a rendered sample.
                    </p>
                  )}
                  {manualDraft && (
                    <GuidelineManualColorPanel
                      key={capture.captureHash}
                      pdf={pdf}
                      capture={capture}
                      draft={manualDraft}
                      previousSourceProjectJson={refreshLineage?.previousSourceProjectJson}
                      sessionKey={`${workspaceId}:${openedRevision}`}
                      captureContext={() => {
                        const epoch = contextEpochRef.current;
                        const current = local.captureOperation();
                        return () => contextEpochRef.current === epoch && current();
                      }}
                      page={page}
                      disabled={busy}
                      onChange={edit}
                      onHighlight={locator => {
                        if (locator.kind === 'pdf') setPage(locator.page);
                        setHighlight(locator);
                      }}
                    />
                  )}
                  <GuidelineScalesEditor
                    draft={draft}
                    capture={capture}
                    onChange={edit}
                    onLocate={locate}
                  />
                  <h3>Possible usage rules</h3>
                  <p className="guideline-muted">
                    These are text matches to review, not a complete reading of the guideline.
                    Unresolved statements block affected designs.
                  </p>
                  <p className="guideline-muted">
                    {draft.rules.length} statements · {ruleGroups.length} distinct text blocks.
                    Identical wording is grouped; each location keeps its own decision.
                  </p>
                  {ruleGroups.map(group => (
                    <GuidelineStatementGroup
                      key={group.items[0].observationId}
                      group={group}
                      label={id => {
                        const source = statementTextIndex.byId.get(id)!;
                        return source.locator.kind === 'pdf'
                          ? `Page ${source.locator.page}`
                          : 'Source text';
                      }}
                      onLocate={locate}
                      onCopyExclusion={id => {
                        const rules = copyStatementExclusion(
                          draft.rules,
                          statementTextIndex.byId,
                          id
                        );
                        if (rules !== draft.rules) edit({ ...draft, rules });
                      }}
                      context={id => {
                        const lines = nearbyPdfStatementText(statementTextIndex, id);
                        if (lines.length < 2) return null;
                        return (
                          <details className="guideline-statement-context" open>
                            <summary>Nearby source text</summary>
                            <p className="guideline-muted">
                              A partial view of nearby lines. Check the source page for full
                              context.
                            </p>
                            {lines.map(line => (
                              <button
                                key={line.id}
                                aria-current={line.id === id ? 'true' : undefined}
                                onClick={() => locate(line.id)}
                              >
                                {line.text}
                              </button>
                            ))}
                          </details>
                        );
                      }}
                    >
                      {rule => (
                        <>
                          <div className="guideline-rule-fields">
                            <label>
                              Meaning
                              <select
                                aria-label="Meaning"
                                value={rule.meaning}
                                onChange={e => {
                                  setOpenRuleId(rule.observationId);
                                  edit({
                                    ...draft,
                                    rules: draft.rules.map(item =>
                                      item.observationId === rule.observationId
                                        ? {
                                            ...item,
                                            meaning: e.target.value as ReviewRuleV2['meaning'],
                                            definition: null,
                                          }
                                        : item
                                    ),
                                  });
                                }}
                              >
                                <option value="needs-interpretation">Needs interpretation</option>
                                <option value="closed-palette">Use only existing colors</option>
                                <option value="no-gradients">Gradients prohibited</option>
                                <option value="relationship">Color relationship or role</option>
                                <option value="not-a-rule">Not a governing rule</option>
                              </select>
                            </label>
                            <label>
                              Applies to
                              <select
                                aria-label="Applies to"
                                value={rule.scope}
                                onChange={e =>
                                  edit({
                                    ...draft,
                                    rules: draft.rules.map(item =>
                                      item.observationId === rule.observationId
                                        ? { ...item, scope: e.target.value as ReviewScope }
                                        : item
                                    ),
                                  })
                                }
                              >
                                <option value="all">All uses</option>
                                <option value="brand">Brand artwork</option>
                                <option value="product">Product UI</option>
                              </select>
                            </label>
                          </div>
                          {rule.meaning === 'relationship' && (
                            <details
                              open={openRuleId === rule.observationId}
                              onToggle={event => {
                                if (event.currentTarget.open) setOpenRuleId(rule.observationId);
                                else
                                  setOpenRuleId(current =>
                                    current === rule.observationId ? null : current
                                  );
                              }}
                            >
                              <summary>Edit color relationship</summary>
                              {openRuleId === rule.observationId && (
                                <GuidelineRuleDefinitionEditor
                                  rule={rule}
                                  draft={draft}
                                  onChange={next =>
                                    edit({
                                      ...draft,
                                      rules: draft.rules.map(item =>
                                        item.observationId === rule.observationId ? next : item
                                      ),
                                    })
                                  }
                                />
                              )}
                            </details>
                          )}
                          {rule.meaning === 'not-a-rule' && (
                            <Input
                              aria-label={`Reason for excluding statement ${draft.rules.indexOf(rule) + 1}`}
                              placeholder="Why does this not govern color use?"
                              maxLength={4096}
                              value={rule.reason}
                              onChange={e =>
                                edit({
                                  ...draft,
                                  rules: draft.rules.map(item =>
                                    item.observationId === rule.observationId
                                      ? { ...item, reason: e.target.value }
                                      : item
                                  ),
                                })
                              }
                            />
                          )}
                        </>
                      )}
                    </GuidelineStatementGroup>
                  ))}
                  <details
                    className="guideline-source-text"
                    onToggle={event => setTextOpen(event.currentTarget.open)}
                  >
                    <summary>All extracted source text</summary>
                    {textOpen &&
                      sourceText.slice(0, textCount).map(item => (
                        <div className="guideline-text-item" key={item.id}>
                          <button onClick={() => locate(item.id)}>{item.text}</button>
                          {!draft.rules.some(rule => rule.observationId === item.id) && (
                            <Button
                              variant="outline"
                              disabled={
                                draft.rules.length >= COLOR_SYSTEM_MODEL_V1_LIMITS.maximumRules
                              }
                              onClick={() =>
                                edit({
                                  ...draft,
                                  rules: [
                                    ...draft.rules,
                                    {
                                      observationId: item.id,
                                      meaning: 'needs-interpretation',
                                      scope: 'all',
                                      reason: '',
                                      definition: null,
                                    },
                                  ],
                                })
                              }
                            >
                              Review as a rule
                            </Button>
                          )}
                        </div>
                      ))}
                    {textOpen && textCount < sourceText.length && (
                      <Button variant="outline" onClick={() => setTextCount(count => count + 100)}>
                        Show 100 more text items
                      </Button>
                    )}
                  </details>
                  <div className="guideline-actions">
                    <Button
                      disabled={busy || !draft.colors.some(color => color.include)}
                      onClick={confirm}
                    >
                      Apply my review
                    </Button>
                    {review && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          downloadText(
                            'teul-reviewed-source',
                            JSON.stringify({ capture, review }, null, 2),
                            'json'
                          )
                        }
                      >
                        Download source review
                      </Button>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
        {review && (
          <GuidelineAddToSourceSet
            serialize={serializeProject}
            disabled={busy || local.busy}
            captureContext={() => {
              const epoch = contextEpochRef.current;
              const current = local.captureOperation();
              return () => contextEpochRef.current === epoch && current();
            }}
          />
        )}
        {review && (
          <GuidelineDesignWorkspace
            captureContext={() => {
              const epoch = contextEpochRef.current;
              const current = local.captureOperation();
              return () => contextEpochRef.current === epoch && current();
            }}
            initialOutputs={outputs}
            onOutputsChange={changeOutputs}
            key={`extension:${openedRevision}:${review.reviewHash}`}
            review={review}
            hasGradientResult={!!(gradientSelection ?? selection)}
            gradient={
              <GuidelineModeGradientEditor
                kind="pdf"
                captureContext={() => {
                  const epoch = contextEpochRef.current;
                  const current = local.captureOperation();
                  return () => contextEpochRef.current === epoch && current();
                }}
                captureSourceContext={() => {
                  const epoch = sourceEpochRef.current;
                  return () => sourceEpochRef.current === epoch;
                }}
                colorOrder={review.decision.draft.colors
                  .filter(item => item.include)
                  .flatMap(item =>
                    review.model.colors
                      .filter(color => color.evidenceRefs.includes(item.observationId))
                      .map(color => color.id)
                  )}
                key={`${openedRevision}:${review.reviewHash}`}
                review={review}
                selection={gradientSelection ?? selection}
                onSelect={next => {
                  local.cancelPending();
                  cancelJob();
                  advanceContext();
                  setSelection(null);
                  setGradientSelection(next);
                }}
              />
            }
          />
        )}
      </fieldset>
    </div>
  );
}
