import { describe, it, expect } from 'vitest';
import legacy from '../../../fixtures/guidelines/legacy-projects.json';
import numeric from '../../../fixtures/guidelines/legacy-project-v3.json';
import figma from '../../../fixtures/guidelines/figma-project-v1.json';
import {
  readAnyGuidelineProject,
  guidelineProjectName,
  guidelineProjectPdfHash,
} from './projectCodec';
import { buildGuidelineProjectV4 } from './projectV4';
import { parseCaptureAny } from './evidenceV2';
import { parseGuidelineDraftV4 } from './reviewV4';

describe('local project codec boundary', () => {
  it('dispatches old PDF and native Figma formats without changing source values', async () => {
    for (const value of [legacy.project, legacy.project2, numeric, figma]) {
      const opened = await readAnyGuidelineProject(JSON.stringify(value));
      expect(opened.status).toBe('opened');
      if (opened.status !== 'opened') throw new Error('Expected open');
      expect(opened.value.project).toEqual(value);
      expect(guidelineProjectName(opened.value)).toBeTruthy();
      expect(guidelineProjectPdfHash(opened.value)).toBe(
        opened.value.kind === 'pdf' ? opened.value.project.capture.identity.sha256 : null
      );
    }
  });
  it('accepts the current PDF review format through the same reader', async () => {
    const capture = parseCaptureAny(numeric.capture);
    const input = {
      capture,
      draft: parseGuidelineDraftV4(capture, {
        ...numeric.draft,
        reviewedValues: { witnesses: [], candidates: [], confirmations: [] },
      }),
      review: null,
      selection: null,
    };
    const project = buildGuidelineProjectV4(input),
      opened = await readAnyGuidelineProject(JSON.stringify(project));
    expect(opened.status).toBe('opened');
    if (opened.status === 'opened') expect(opened.value.project).toEqual(project);
  });
  it.each(['teul.guideline-project.v999', 'teul.figma-project.v999', 'teul.website-project.v999'])(
    'retains future format %s as read-only',
    async schemaVersion => {
      expect(await readAnyGuidelineProject(JSON.stringify({ schemaVersion }))).toEqual({
        status: 'read-only',
        version: schemaVersion,
      });
    }
  );
  it('rejects corruption before activating source evidence or selection', async () => {
    const altered = structuredClone(figma);
    altered.capture.file.name = 'Changed source';
    await expect(readAnyGuidelineProject(JSON.stringify(altered))).rejects.toThrow();
    await expect(readAnyGuidelineProject('{bad')).rejects.toThrow();
    await expect(readAnyGuidelineProject(' '.repeat(16 * 1024 * 1024 + 1))).rejects.toThrow(
      '16 MiB'
    );
  });
});
