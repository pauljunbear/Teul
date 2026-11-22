import type { GuidelineNativeGradientSource } from '../lib/guideline/nativeGradientWorkspace';
import type { GuidelineGradientSelection } from '../lib/guideline/gradientExport';
import { captureColorSystemModelV1 } from '../../../src/lib/colorSystemModelV1';
import { canonicalJson } from '../../../src/lib/colorSystemHashing';
import {
  createGuidelineAuthoringDraft,
  EMPTY_GUIDELINE_AUTHORING,
  type GuidelineAuthoringInputs,
  type GuidelineGradientDraft,
  type GuidelineNativeGradientDraft,
  type GuidelineDesignTask,
} from '../lib/guideline/authoringDraft';
import { useRef, useState, useMemo, type ReactNode } from 'react';
import type { ReviewedGuideline } from '../lib/guideline/review';
import {
  EMPTY_GUIDELINE_OUTPUTS,
  type GuidelineSelectedOutputs,
} from '../lib/guideline/selectedOutputs';
import { GuidelineExtensionPreview } from './GuidelineExtensionPreview';
import { GuidelineApplicationStudio } from './GuidelineApplicationStudio';
import { GuidelineSupportingStudio } from './GuidelineSupportingStudio';
import { applicationDraftFromRequest } from '../lib/guideline/applicationDraft';

type GradientDraftProps = {
  initialDraft: GuidelineGradientDraft | null;
  onDraftChange: (draft: GuidelineGradientDraft) => void;
  initialNativeDraft: GuidelineNativeGradientDraft | null;
  onNativeDraftChange: (draft: GuidelineNativeGradientDraft) => void;
};
function GradientSlot({
  render,
  ...props
}: GradientDraftProps & { render: (props: GradientDraftProps) => ReactNode }) {
  return render(props);
}

export function GuidelineDesignWorkspace({
  review,
  initialOutputs = EMPTY_GUIDELINE_OUTPUTS,
  onOutputsChange,
  captureContext,
  gradient,
  hasGradientResult,
  selectedGradient = null,
  loadNativeSources,
}: {
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
  initialOutputs?: GuidelineSelectedOutputs;
  onOutputsChange: (outputs: GuidelineSelectedOutputs) => void;
  captureContext: () => () => boolean;
  gradient: (props: GradientDraftProps) => ReactNode;
  hasGradientResult: boolean;
  selectedGradient?: GuidelineGradientSelection | null;
  loadNativeSources?: (signal?: AbortSignal) => Promise<readonly GuidelineNativeGradientSource[]>;
}) {
  const capturedReview = useMemo(
    () => ({ model: captureColorSystemModelV1(review.model), reviewHash: review.reviewHash }),
    [review.model, review.reviewHash]
  );
  const [task, setTask] = useState<GuidelineDesignTask>(() => {
    if (initialOutputs.authoring) return initialOutputs.authoring.activeTask;
    if (hasGradientResult) return 'gradient';
    if (initialOutputs.application) return 'application';
    if (initialOutputs.supporting) return 'supporting';
    if (initialOutputs.extension) return 'extension';
    return '';
  });
  const [outputs, setOutputs] = useState(initialOutputs);
  const [applicationSession, setApplicationSession] = useState(0);
  const current = useRef(initialOutputs);
  const publish = (next: GuidelineSelectedOutputs) => {
    current.current = next;
    setOutputs(next);
    onOutputsChange(next);
  };
  const authoringInputs = (): GuidelineAuthoringInputs => {
    const saved = current.current.authoring ?? EMPTY_GUIDELINE_AUTHORING;
    return {
      activeTask: current.current.authoring?.activeTask ?? task,
      extension: saved.extension,
      supporting: saved.supporting,
      gradient: saved.gradient,
      ...(saved.nativeGradient !== undefined ? { nativeGradient: saved.nativeGradient } : {}),
      application: saved.application ?? null,
      ...(saved.supportingFeedback !== undefined
        ? { supportingFeedback: saved.supportingFeedback }
        : {}),
    };
  };
  const edit = (patch: Partial<GuidelineAuthoringInputs>) => {
    const previous = authoringInputs();
    const next = { ...previous, ...patch };
    if (current.current.authoring && canonicalJson(previous) === canonicalJson(next)) return;
    const authoring = createGuidelineAuthoringDraft(capturedReview, next);
    if (current.current.authoring?.draftHash !== authoring.draftHash)
      publish({ ...current.current, authoring });
  };
  const activeBrief =
    task !== '' &&
    !(task === 'gradient' && outputs.authoring?.nativeGradient?.activeMethod === 'native')
      ? outputs.authoring?.briefs[task]
      : null;
  return (
    <section
      aria-label="Design with reviewed colors"
      className="guideline-design-workspace guideline-result"
    >
      <div className="guideline-section-heading">
        <h2>Choose what to make</h2>
      </div>
      <label>
        What would you like to make?
        <select
          value={task}
          onChange={event => {
            const next = event.target.value as GuidelineDesignTask;
            setTask(next);
            edit({ activeTask: next });
          }}
        >
          <option value="">Choose a task</option>
          <option value="extension">
            Make or extend a scale{outputs.extension ? ' · Retained result' : ''}
          </option>
          <option value="supporting">
            Find supporting colors{outputs.supporting ? ' · Retained result' : ''}
          </option>
          <option value="gradient">
            Make a gradient{hasGradientResult ? ' · Retained result' : ''}
          </option>
          <option value="application">
            Test colors in a layout{outputs.application ? ' · Retained result' : ''}
          </option>
        </select>
      </label>
      <p className="guideline-muted">
        Existing source colors stay locked. Save the project to keep unfinished edits and the last
        generated results.
      </p>
      {activeBrief && (
        <div role="group" aria-label="Current design brief" className="guideline-muted">
          {activeBrief.input.context === 'chart'
            ? activeBrief.input.categoryMeaning === 'sequential'
              ? 'Sequential chart'
              : 'Categorical chart'
            : activeBrief.input.context === 'brand'
              ? 'Brand artwork'
              : 'Product UI'}{' '}
          ·{' '}
          {review.model.modes.find(m => m.id === activeBrief.input.modeId)?.label ??
            activeBrief.input.modeId}{' '}
          · {activeBrief.lockedValues.length} exact source colors
          {activeBrief.input.backgrounds.length ? ' · Background included in checks' : ''}. Source
          rules still apply.
        </div>
      )}
      <div hidden={task !== 'extension'}>
        <GuidelineExtensionPreview
          review={review}
          initialExtension={initialOutputs.extension}
          initialDraft={initialOutputs.authoring?.extension}
          onDraftChange={extension => edit({ extension })}
          captureContext={captureContext}
          onExtensionChange={extension => {
            publish({ ...current.current, extension });
          }}
        />
      </div>
      <div hidden={task !== 'supporting'}>
        <GuidelineSupportingStudio
          review={review}
          selection={outputs.supporting ?? null}
          initialDraft={initialOutputs.authoring?.supporting}
          onDraftChange={supporting => edit({ supporting })}
          feedback={outputs.authoring?.supportingFeedback ?? []}
          onRefine={({ request: supporting, feedback: supportingFeedback }) =>
            edit({ supporting, supportingFeedback })
          }
          onFeedbackChange={supportingFeedback => edit({ supportingFeedback })}
          captureContext={captureContext}
          onSelect={supporting => publish({ ...current.current, supporting })}
          onUseSource={application => {
            const authoring = createGuidelineAuthoringDraft(capturedReview, {
              ...authoringInputs(),
              activeTask: 'application',
              application: applicationDraftFromRequest(application.request),
            });
            publish({ ...current.current, application, authoring });
            setTask('application');
            setApplicationSession(value => value + 1);
          }}
        />
      </div>
      <div hidden={task !== 'gradient'}>
        <GradientSlot
          render={gradient}
          initialDraft={outputs.authoring?.gradient ?? null}
          onDraftChange={gradient => edit({ gradient })}
          initialNativeDraft={outputs.authoring?.nativeGradient ?? null}
          onNativeDraftChange={nativeGradient => edit({ nativeGradient })}
        />
      </div>
      <div hidden={task !== 'application'}>
        <GuidelineApplicationStudio
          loadNativeSources={loadNativeSources}
          key={applicationSession}
          focusOnMount={applicationSession > 0}
          review={review}
          extension={outputs.extension}
          selectedGradient={selectedGradient}
          captureContext={captureContext}
          initialResult={outputs.application}
          initialDraft={outputs.authoring?.application}
          onDraftChange={application => edit({ application })}
          onResultChange={application => publish({ ...current.current, application })}
        />
      </div>
    </section>
  );
}
