import { useRef, useState, type ReactNode } from 'react';
import type { ReviewedGuideline } from '../lib/guideline/review';
import {
  EMPTY_GUIDELINE_OUTPUTS,
  type GuidelineSelectedOutputs,
} from '../lib/guideline/selectedOutputs';
import { GuidelineExtensionPreview } from './GuidelineExtensionPreview';
import { GuidelineApplicationStudio } from './GuidelineApplicationStudio';
import { GuidelineSupportingStudio } from './GuidelineSupportingStudio';

export function GuidelineDesignWorkspace({
  review,
  initialOutputs = EMPTY_GUIDELINE_OUTPUTS,
  onOutputsChange,
  captureContext,
  gradient,
  hasGradientResult,
}: {
  review: Pick<ReviewedGuideline, 'model' | 'reviewHash'>;
  initialOutputs?: GuidelineSelectedOutputs;
  onOutputsChange: (outputs: GuidelineSelectedOutputs) => void;
  captureContext: () => () => boolean;
  gradient: ReactNode;
  hasGradientResult: boolean;
}) {
  const [task, setTask] = useState(() => {
    if (hasGradientResult) return 'gradient';
    if (initialOutputs.application) return 'application';
    if (initialOutputs.supporting) return 'supporting';
    if (initialOutputs.extension) return 'extension';
    return '';
  });
  const [outputs, setOutputs] = useState(initialOutputs);
  const current = useRef(initialOutputs);
  const [applicationRevision, setApplicationRevision] = useState(0);
  const publish = (next: GuidelineSelectedOutputs) => {
    current.current = next;
    setOutputs(next);
    onOutputsChange(next);
  };
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
        <select value={task} onChange={event => setTask(event.target.value)}>
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
        Existing source colors stay locked. You can switch tasks without losing unfinished edits.
      </p>
      <div hidden={task !== 'extension'}>
        <GuidelineExtensionPreview
          review={review}
          initialExtension={initialOutputs.extension}
          captureContext={captureContext}
          onExtensionChange={extension => {
            publish({ ...current.current, extension, application: null });
            setApplicationRevision(n => n + 1);
          }}
        />
      </div>
      <div hidden={task !== 'supporting'}>
        <GuidelineSupportingStudio
          review={review}
          selection={outputs.supporting ?? null}
          captureContext={captureContext}
          onSelect={supporting => publish({ ...current.current, supporting })}
        />
      </div>
      <div hidden={task !== 'gradient'}>{gradient}</div>
      <div hidden={task !== 'application'}>
        <GuidelineApplicationStudio
          key={applicationRevision}
          review={review}
          extension={outputs.extension}
          captureContext={captureContext}
          initialResult={applicationRevision === 0 ? initialOutputs.application : null}
          onResultChange={application => publish({ ...current.current, application })}
        />
      </div>
    </section>
  );
}
