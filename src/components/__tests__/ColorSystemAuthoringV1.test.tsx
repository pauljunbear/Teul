import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorSystemAuthoringV1 } from '../ColorSystemAuthoringV1';
import { createColorSystemAuthoringControllerV1 } from '../../backend/colorSystemAuthoringControllerV1';
import { createColorSystemModelControllerV1 } from '../../backend/colorSystemModelControllerV1';
import {
  buildColorSystemModelV1,
  buildColorSystemRuleAdoptionsV1,
} from '../../lib/colorSystemModelV1';
import { syntheticColorSystemModelInputV1 } from '../../lib/__tests__/fixtures/colorSystemModelV1Fixture';
import { serializeColorSystemInertJsonV1 } from '../../lib/colorSystemInertJsonV1';
import type { ColorSystemAuthoringResultV1 } from '../../types/colorSystemAuthoringMessagesV1';

function model(label = 'Original complete source') {
  const input = syntheticColorSystemModelInputV1();
  const changed = {
    ...input,
    sources: input.sources.map(source => ({ ...source, label })),
  };
  return buildColorSystemModelV1({
    ...changed,
    adoptions: buildColorSystemRuleAdoptionsV1(
      changed,
      input.adoptions.map(({ ruleId, status, actor, authorityRef, decisionRef }) => ({
        ruleId,
        status,
        actor,
        authorityRef,
        decisionRef,
      }))
    ),
  });
}

describe('integrated authoring source evidence', () => {
  let container: HTMLDivElement;
  let root: Root;
  let post: ReturnType<typeof vi.spyOn>;
  let controller: ReturnType<typeof createColorSystemAuthoringControllerV1>;
  let intake: ReturnType<typeof createColorSystemModelControllerV1>;
  let replies: ColorSystemAuthoringResultV1[];
  let handled: number;
  let inventory = vi.fn<() => Promise<never>>();
  let checkSource = vi.fn<() => Promise<never>>();
  let write = vi.fn<() => Promise<void>>();
  const reply = (message: unknown) =>
    window.dispatchEvent(
      new MessageEvent('message', { source: parent, data: { pluginMessage: message } })
    );
  const button = (name: string) =>
    Array.from(container.querySelectorAll('button')).find(item => item.textContent === name)!;
  const click = (name: string) => act(() => button(name).click());
  const edit = (field: HTMLTextAreaElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field,
        value
      );
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const flush = async () => {
    for (let pass = 0; pass < 10; pass++) {
      const waiting = post.mock.calls.slice(handled);
      handled = post.mock.calls.length;
      if (!waiting.length) return;
      await act(async () => {
        for (const [envelope] of waiting) {
          const message = envelope.pluginMessage;
          if (message.type.includes('color-system-authoring')) await controller.handle(message);
          else if (message.source === 'guideline-json') {
            const result = await intake.handle(message);
            const source = result?.success ? intake.getCurrentSource() : null;
            if (source) controller.setSource(source);
            if (result) reply(result);
          }
        }
      });
    }
    throw new Error('Authoring did not settle.');
  };
  const importModel = async (value = model()) => {
    if (!container.querySelector('#model-source-json')) click('Read or replace source');
    edit(
      container.querySelector<HTMLTextAreaElement>('#model-source-json')!,
      JSON.stringify(value)
    );
    click('Import guideline model');
    await flush();
  };
  const inspect = async () => {
    click('Inspect source evidence');
    await flush();
    const result = replies[replies.length - 1];
    expect(result).toMatchObject({ success: true, fileName: 'teul-authored.source.json' });
    if (!result.success || !('artifactText' in result)) throw new Error('Missing source artifact');
    expect(Array.from(container.querySelectorAll('pre')).map(item => item.textContent)).toContain(
      result.artifactText
    );
    const evidence = Array.from(container.querySelectorAll('pre')).find(
      item => item.textContent === result.artifactText
    )!;
    expect(evidence.closest('[role="status"], [aria-live]')).toBeNull();
    expect(
      Array.from(container.querySelectorAll('[role="status"]')).map(item => item.textContent)
    ).toContain('teul-authored.source.json is ready.');
    expect(button('Copy teul-authored.source.json')).toBeDefined();
    expect(button('Download teul-authored.source.json')).toBeDefined();
    return result;
  };
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    post = vi.spyOn(parent, 'postMessage').mockImplementation(() => {});
    handled = 0;
    replies = [];
    inventory = vi.fn();
    checkSource = vi.fn();
    write = vi.fn();
    controller = createColorSystemAuthoringControllerV1({
      clientStorage: {
        keysAsync: async () => [],
        getAsync: async () => undefined,
        setAsync: write,
        deleteAsync: write,
      },
      checkSource,
      postMessage(message) {
        replies.push(message);
        reply(message);
      },
    });
    intake = createColorSystemModelControllerV1({
      inventory,
      sourceLocator: () => null,
      postMessage: () => {},
    });
    act(() => root.render(<ColorSystemAuthoringV1 isDark={false} />));
    await flush();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('keeps summary and exact evidence reachable after intake unmounts, before construction', async () => {
    const original = model();
    await importModel(original);
    expect(container.querySelector('#model-source-json')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Build from your color system');
    expect(container.textContent).toContain('Original complete source');
    expect(container.textContent).toContain('synthetic:source');
    expect(container.textContent).toContain('0 unresolved source conflicts.');
    const before = serializeColorSystemInertJsonV1(controller.getView());
    const artifact = await inspect();
    const source = JSON.parse(artifact.artifactText);
    expect(source.model).toEqual(original);
    expect(source.summary).toBe(controller.getView().source!.summary);
    expect(source.intake).toBe('guideline-json');
    expect(serializeColorSystemInertJsonV1(controller.getView())).toBe(before);
    expect(inventory).not.toHaveBeenCalled();
    expect(checkSource).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('clears old evidence on confirmed replacement and ignores a late earlier inspection', async () => {
    await importModel();
    const prior = await inspect();
    const replacement = model('Replacement complete source');
    click('Read or replace source');
    click('Read Figma colors');
    const read = post.mock.calls.at(-1)![0].pluginMessage;
    controller.setSource({ model: replacement, intake: 'current-file' });
    act(() =>
      reply({
        type: 'color-system-model-result-v1',
        requestId: read.requestId,
        success: true,
        modelHash: replacement.modelHash,
        modelJson: JSON.stringify(replacement),
        summary: 'Replacement complete source',
      })
    );
    expect(container.textContent).not.toContain('Original complete source');
    expect(button('Inspect source evidence')).toBeUndefined();
    await flush();
    act(() => reply(prior));
    expect(container.textContent).not.toContain('Original complete source');
    expect(button('Copy teul-authored.source.json')).toBeUndefined();
    const next = await inspect();
    expect(JSON.parse(next.artifactText).model).toEqual(replacement);
    expect(post.mock.calls.at(-1)![0].pluginMessage).toMatchObject({
      action: 'inspect',
      payloadJson: JSON.stringify({ kind: 'source', modelHash: replacement.modelHash }),
    });
  });

  it('retains confirmed evidence after failed and cancelled replacement reads', async () => {
    await importModel();
    const original = await inspect();
    click('Read or replace source');
    edit(container.querySelector<HTMLTextAreaElement>('#model-source-json')!, '{invalid');
    click('Import guideline model');
    await flush();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain(original.artifactText);
    click('Read Figma colors');
    const request = post.mock.calls.at(-1)![0].pluginMessage;
    click('Cancel read');
    act(() =>
      reply({
        type: 'color-system-model-result-v1',
        requestId: request.requestId,
        success: true,
        modelHash: model('late').modelHash,
        modelJson: JSON.stringify(model('late')),
        summary: 'Late replacement',
      })
    );
    expect(container.textContent).toContain(original.artifactText);
    expect(controller.getView().source!.modelHash).toBe(model().modelHash);
    expect(inventory).not.toHaveBeenCalled();
  });

  it('hides unrelated active-source evidence when an unsupported recipe is opened', async () => {
    await importModel();
    await inspect();
    const field = Array.from(container.querySelectorAll('label'))
      .find(item => item.textContent?.startsWith('Or paste recipe JSON'))!
      .querySelector('textarea')!;
    edit(field, '{"schemaVersion":"future.recipe.v99","private":"unsupported source"}');
    click('Recompute and open recipe');
    await flush();
    expect(controller.getView().readOnly).toBe(true);
    expect(button('Inspect source evidence')).toBeUndefined();
    expect(button('Copy teul-authored.source.json')).toBeUndefined();
    expect(container.textContent).not.toContain('Original complete source');
    expect(button('Prepare recipe export')).toBeDefined();
  });

  it('rejects mismatched artifact kinds for the pending inspection', async () => {
    await importModel();
    click('Inspect source evidence');
    const request = post.mock.calls.at(-1)![0].pluginMessage;
    act(() =>
      reply({
        type: 'color-system-authoring-result-v1',
        requestId: request.requestId,
        success: true,
        fileName: 'teul-authored.tokens.json',
        artifactText: '{"wrong":"artifact"}',
      })
    );
    expect(container.textContent).toContain('Unexpected artifact response.');
    expect(button('Copy teul-authored.tokens.json')).toBeUndefined();
  });
});
