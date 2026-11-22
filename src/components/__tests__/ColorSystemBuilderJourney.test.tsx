import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WadaColorsTab, combinationSystemName } from '../WadaColorsTab';
import { WernerColorsTab } from '../WernerColorsTab';
import { ColorSystemBuilder } from '../ColorSystemBuilder';
import { validateUIToPluginMessage } from '../../lib/messageValidation';
import wadaColors from '../../colors.json';
import { wernerColors } from '../../wernerColorData';

type CreateMessage = Record<string, unknown> & {
  requestId: string;
  collisionPolicy: string;
  scales: { systemName: string };
};

const existsError = (name: string) =>
  `Local output already exists for "${name}". Choose Update local or Create copy.`;

describe('color-system journeys', () => {
  let container: HTMLDivElement;
  let root: Root;
  let postMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    postMessage.mockRestore();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
  const exact = (text: string) => buttons().find(button => button.textContent?.trim() === text);
  const creates = () =>
    (postMessage.mock.calls as unknown as Array<[{ pluginMessage?: CreateMessage }]>)
      .map(call => call[0]?.pluginMessage)
      .filter((message): message is CreateMessage => message?.type === 'generate-color-system');
  const lastCreate = () => {
    const all = creates();
    return all[all.length - 1];
  };
  const reply = (requestId: string, body: Record<string, unknown>) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            pluginMessage: { type: 'color-system-operation-result', requestId, ...body },
          },
        })
      );
    });
  const resolver = () => container.querySelector<HTMLElement>('[data-teul-collision-resolver]');
  const renderBuilder = (name: string) =>
    act(() =>
      root.render(
        <ColorSystemBuilder
          isOpen
          onClose={vi.fn()}
          colors={[{ hex: '#3366cc', name: 'Test Blue' }]}
          combinationName={name}
          isDark={false}
          documentColorProfile="srgb"
        />
      )
    );
  const toStep2 = () => act(() => exact('Continue')?.click());
  const back = () =>
    act(() =>
      container.querySelector<HTMLButtonElement>('[aria-label="Back to shape the system"]')?.click()
    );

  it('turns an existing-output refusal into a resolver at the row that fixes it', () => {
    renderBuilder('Refused System');
    toStep2();
    act(() => exact('Create in Figma')?.click());
    reply(lastCreate().requestId, { success: false, error: existsError('Refused System') });

    // No raw red footer error; the resolver sits at the row, holds focus, offers three ways out.
    expect(container.querySelector('#color-system-submission-error')).toBeNull();
    expect(container.textContent).not.toContain('Choose Update local or Create copy');
    expect(resolver()?.getAttribute('data-teul-collision-resolver')).toBe('exists');
    expect(resolver()?.textContent).toContain(
      'A system named “Refused System” is already in this file.'
    );
    expect(document.activeElement).toBe(resolver());
    expect(
      Array.from(resolver()!.querySelectorAll('button')).map(button => button.textContent)
    ).toEqual(['Update it', 'Create a copy', 'Rename']);
    // The resolver follows the dropdown it explains.
    const row = container.querySelector('#color-system-collision-policy')!.parentElement!;
    expect(row.nextElementSibling).toBe(resolver());

    // Update it: sets the option and creates at once.
    act(() => exact('Update it')?.click());
    expect(creates()).toHaveLength(2);
    expect(lastCreate().collisionPolicy).toBe('update-local');
    expect(validateUIToPluginMessage(lastCreate()).valid).toBe(true);
    expect(
      container.querySelector<HTMLSelectElement>('#color-system-collision-policy')?.value
    ).toBe('update-local');
    expect(resolver()).toBeNull();
    reply(lastCreate().requestId, { success: true, outputName: 'Refused System' });
    expect(container.textContent).toContain('Created “Refused System”');
  });

  it('creates a copy in one click and renames from the header', () => {
    renderBuilder('Copy System');
    toStep2();
    act(() => exact('Create in Figma')?.click());
    reply(lastCreate().requestId, { success: false, error: existsError('Copy System') });
    act(() => exact('Create a copy')?.click());
    expect(lastCreate().collisionPolicy).toBe('create-copy');
    reply(lastCreate().requestId, {
      success: false,
      error: existsError('Copy System'),
    });

    act(() => exact('Rename')?.click());
    expect(container.textContent).toContain('1 of 2');
    const name = container.querySelector<HTMLInputElement>('#color-system-name')!;
    expect(document.activeElement).toBe(name);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        name,
        'Copy System 2'
      );
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    toStep2();
    // A new name has no known collision.
    expect(resolver()).toBeNull();
  });

  it('offers only Create a copy and Rename when the output is not Teul-owned', () => {
    renderBuilder('Foreign System');
    toStep2();
    act(() => exact('Create in Figma')?.click());
    reply(lastCreate().requestId, {
      success: false,
      error:
        '"Foreign System Colors" is not marked as Teul-owned. Choose Create copy to protect unrelated local content.',
    });
    expect(resolver()?.getAttribute('data-teul-collision-resolver')).toBe('not-owned');
    expect(
      Array.from(resolver()!.querySelectorAll('button')).map(button => button.textContent)
    ).toEqual(['Create a copy', 'Rename']);
    expect(container.querySelector('#color-system-submission-error')).toBeNull();
  });

  it('warns at step 2 when this session already created the same name, without blocking', () => {
    renderBuilder('Session System');
    toStep2();
    expect(resolver()).toBeNull();
    act(() => exact('Create in Figma')?.click());
    reply(lastCreate().requestId, { success: true, outputName: 'Session System' });

    // Create another with "Cancel" would be refused: the resolver says so up front. Beside the
    // receipt it reads as the next step, not as a warning, and no second primary button.
    expect(resolver()?.getAttribute('data-teul-collision-resolver')).toBe('session');
    expect(resolver()?.textContent).toContain(
      'To create “Session System” again, update it, make a copy or rename it.'
    );
    // Leaving step 2 clears the receipt; coming back shows the notice as a warning.
    back();
    expect(container.textContent).not.toContain('Created “Session System”');
    toStep2();
    expect(resolver()?.getAttribute('data-teul-collision-resolver')).toBe('session');
    expect(resolver()?.textContent).toContain(
      'Teul created a system named “Session System” in this file earlier in this session.'
    );
    expect(exact('Create in Figma')?.disabled).toBe(false);
    // Unticking variables (the only output created) removes the known collision.
    act(() =>
      Array.from(container.querySelectorAll('label'))
        .find(label => label.textContent?.includes('Create Figma Variables'))
        ?.querySelector('input')
        ?.click()
    );
    expect(resolver()).toBeNull();
  });

  it('names each documented pairing by its set so systems from one color do not collide', () => {
    act(() => root.render(<WadaColorsTab isDark colors={wadaColors} />));
    act(() =>
      container.querySelector<HTMLElement>('[aria-label^="Open Corinthian Pink,"]')?.click()
    );
    act(() => container.querySelectorAll<HTMLButtonElement>('[data-teul-combo-size]')[4].click());
    expect(container.querySelector<HTMLInputElement>('#color-system-name')?.value).toBe(
      'Corinthian Pink Palette, Set 5'
    );
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Back to colors"]')?.click());
    act(() => exact('Build system')?.click());
    expect(container.querySelector<HTMLInputElement>('#color-system-name')?.value).toBe(
      'Corinthian Pink Palette'
    );
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Back to colors"]')?.click());
    act(() => exact('View all 12 pairings')?.click());
    act(() =>
      buttons()
        .filter(button => button.textContent?.trim() === 'System')[11]
        .click()
    );
    expect(container.querySelector<HTMLInputElement>('#color-system-name')?.value).toBe(
      'Corinthian Pink Palette, Set 12'
    );

    // Every default name stays far inside the 512-character limit.
    const longest = Math.max(
      ...wadaColors.map(color => combinationSystemName(color, color.combinations.length - 1).length)
    );
    expect(longest).toBeLessThan(64);
  });

  it('makes systems in a row across pairings, methods, detail levels, styles and Werner', () => {
    act(() =>
      root.render(<WadaColorsTab isDark colors={wadaColors} documentColorProfile="srgb" />)
    );
    const plans = [
      {
        color: 'Corinthian Pink',
        set: 0,
        method: 'Exact Radix',
        detail: 'Presentation',
        styles: true,
      },
      { color: 'Corinthian Pink', set: 4, method: 'WCAG tokens', detail: 'Minimal', styles: false },
      { color: 'Raw Sienna', set: 18, method: 'Teul generated', detail: 'Detailed', styles: true },
    ];
    for (const plan of plans) {
      act(() =>
        container.querySelector<HTMLElement>(`[aria-label^="Open ${plan.color},"]`)?.click()
      );
      act(() =>
        container.querySelectorAll<HTMLButtonElement>('[data-teul-combo-size]')[plan.set].click()
      );
      act(() => exact(plan.method)?.click());
      toStep2();
      back();
      toStep2();
      act(() => exact(plan.detail)?.click());
      if (plan.styles) {
        act(() =>
          Array.from(container.querySelectorAll('label'))
            .find(label => label.textContent?.includes('Create Figma Color Styles'))
            ?.querySelector('input')
            ?.click()
        );
      }
      act(() => exact('Create in Figma')?.click());
      const first = lastCreate();
      expect(validateUIToPluginMessage(first).valid).toBe(true);
      reply(first.requestId, { success: true, outputName: first.scales.systemName });

      act(() => exact('Create another')?.click());
      const again = lastCreate();
      expect(again.requestId).not.toBe(first.requestId);
      expect(validateUIToPluginMessage(again).valid).toBe(true);
      reply(again.requestId, { success: false, error: existsError(again.scales.systemName) });
      expect(resolver()?.getAttribute('data-teul-collision-resolver')).toBe('exists');
      act(() => exact('Create a copy')?.click());
      const copy = lastCreate();
      expect(copy.collisionPolicy).toBe('create-copy');
      expect(validateUIToPluginMessage(copy).valid).toBe(true);
      reply(copy.requestId, { success: true, outputName: `${copy.scales.systemName} Copy` });
      expect(container.textContent).toContain(`Created “${copy.scales.systemName} Copy”`);

      back();
      act(() =>
        container.querySelector<HTMLButtonElement>('[aria-label="Back to colors"]')?.click()
      );
    }
    const names = creates().map(message => message.scales.systemName);
    expect(new Set(names)).toEqual(
      new Set([
        'Corinthian Pink Palette, Set 1',
        'Corinthian Pink Palette, Set 5',
        'Raw Sienna Palette, Set 19',
      ])
    );

    act(() =>
      root.render(
        <WernerColorsTab isDark={false} colors={wernerColors} documentColorProfile="srgb" />
      )
    );
    act(() => container.querySelector<HTMLElement>('[aria-label^="Open Snow White,"]')?.click());
    act(() => exact('Build system')?.click());
    toStep2();
    act(() => exact('Create in Figma')?.click());
    expect(lastCreate().scales.systemName).toBe('Werner/Snow White');
    expect(validateUIToPluginMessage(lastCreate()).valid).toBe(true);
  });

  it('explains a request the backend rejects as invalid instead of showing the bare error', () => {
    renderBuilder('Rejected System');
    toStep2();
    act(() => exact('Create in Figma')?.click());
    reply(lastCreate().requestId, { success: false, error: 'Invalid color system request' });
    const alert = container.querySelector('#color-system-submission-error');
    expect(alert?.textContent).toContain('so nothing was created');
    expect(alert?.textContent).toContain('try Exact Radix');
    expect(resolver()).toBeNull();
    expect(exact('Create in Figma')?.disabled).toBe(false);
  });
});
