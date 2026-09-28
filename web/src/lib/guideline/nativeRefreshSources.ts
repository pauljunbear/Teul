import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { guidelineHash } from './review';
import { assertFigmaNativeInventory, type FigmaNativeInventory } from './figmaInventory';
import { assertWebsiteInventory, type WebsiteInventory } from './websiteInventory';
import {
  figmaSourceStatements,
  parseFigmaReviewDraft,
  suggestFigmaReview,
  type FigmaReviewDraft,
} from './figmaReview';
import { websiteSourceStatements } from './websiteModel';
import {
  parseWebsiteReviewDraft,
  suggestWebsiteReview,
  type WebsiteReviewDraft,
} from './websiteReview';
import {
  compareNativeReview,
  type NativeRefreshRecord,
  type NativeRefreshSnapshot,
} from './nativeRefresh';

type Data = Record<string, unknown>;
const object = (value: unknown): Data =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : {};
const tuple = (...items: unknown[]) => canonicalJson(['teul.refresh-key.v1', ...items]);
const sorted = <T>(items: readonly T[]) =>
  [...items].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
const without = (value: Data, ...keys: string[]) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

/** Comparison-only identities. Existing capture and working-model IDs remain unchanged. */
const figmaModeKey = (file: string, mode: FigmaNativeInventory['modes'][number]) =>
  mode.collectionId
    ? tuple('figma-mode', file, mode.collectionId, mode.nativeModeId)
    : tuple('figma-paints-mode', file);
function figmaSnapshot(
  inventory: FigmaNativeInventory,
  selectedModeKeys: Set<string>
): NativeRefreshSnapshot {
  assertFigmaNativeInventory(inventory);
  const { packet } = inventory,
    file = packet.request.fileKey;
  const nodes = new Map<
    string,
    { own: Data; context: string; styles: Data; parents: readonly string[]; ambiguous: boolean }
  >();
  const visit = (raw: unknown, parents: readonly string[], styles: Data) => {
    const node = object(raw),
      id = String(node.id),
      own = without(node, 'children');
    const context = guidelineHash(parents);
    const seen = nodes.get(id);
    // Consistent overlapping selections expose suffixes of one ancestry, not competing parents.
    let ambiguous = seen?.ambiguous ?? false;
    if (seen) {
      const shorter = parents.length < seen.parents.length ? parents : seen.parents;
      const longer = parents.length < seen.parents.length ? seen.parents : parents;
      ambiguous ||= shorter.some(
        (item, index) => item !== longer[longer.length - shorter.length + index]
      );
      seen.ambiguous = ambiguous;
    }
    if (!seen || parents.length > seen.parents.length)
      nodes.set(id, { own, context, styles, parents, ambiguous });
    const descriptors = Object.values(object(own.styles)).map(id => styles[String(id)] ?? null);
    const parentSignature = guidelineHash({ own, descriptors });
    if (Array.isArray(node.children))
      node.children.forEach(child => visit(child, [...parents, parentSignature], styles));
  };
  packet.roots.forEach(root => visit(root.document, [], root.styles));
  const modes = new Map(
    inventory.modes.map(mode => {
      const key = figmaModeKey(file, mode);
      const collection = mode.collectionId
        ? object(packet.variables.collections[mode.collectionId])
        : {};
      const native = Array.isArray(collection.modes)
        ? collection.modes.find(value => object(value).modeId === mode.nativeModeId)
        : null;
      return [
        mode.id,
        {
          id: mode.id,
          kind: 'mode' as const,
          key,
          signature: guidelineHash({
            label: mode.label,
            collection: without(collection, 'modes'),
            native: native ?? null,
          }),
          label: mode.label,
          locator: key,
        },
      ];
    })
  );
  const records: NativeRefreshRecord[] = [...modes.values()];
  const nativeModes = new Map(inventory.modes.map(mode => [mode.id, mode]));
  const nodeContexts = new Map(
    [...nodes].map(([id, entry]) => {
      const styles = Object.values(object(entry.own.styles)).map(
        id => entry.styles[String(id)] ?? null
      );
      return [
        id,
        {
          digest: guidelineHash({ own: entry.own, parents: entry.context, styles }),
          ambiguous: entry.ambiguous,
        },
      ];
    })
  );
  const nodeContext = (nodeId: string) => {
    const entry = nodeContexts.get(nodeId);
    if (!entry) throw new Error('A native comparison references an uncaptured node.');
    return entry;
  };
  for (const declaration of inventory.declarations) {
    const key = tuple('figma-declaration', file, declaration.kind, declaration.locator);
    const match = declaration.locator.match(/^node:(.+)\/(fills|strokes|background)\/(\d+)$/);
    const own = match ? nodeContext(match[1]) : null;
    const variable =
      declaration.kind === 'variable'
        ? object(packet.variables.values[declaration.locator.slice('variable:'.length)])
        : null;
    const values = declaration.observations
      .filter(
        observation =>
          !selectedModeKeys.size || selectedModeKeys.has(modes.get(observation.modeId)?.key ?? '')
      )
      .map(observation => {
        const mode = nativeModes.get(observation.modeId)!;
        return {
          mode: modes.get(observation.modeId)?.key ?? observation.modeId,
          modeSignature: modes.get(observation.modeId)?.signature ?? null,
          value: observation.value,
          gap: observation.gap,
          aliasPath: observation.aliasPath,
          aliases: observation.aliasPath.map(id => {
            const alias = object(packet.variables.values[id]);
            return {
              metadata: without(alias, 'valuesByMode'),
              value: object(alias.valuesByMode)[mode.nativeModeId ?? ''] ?? null,
            };
          }),
        };
      });
    records.push({
      id: declaration.id,
      kind: 'color',
      key,
      signature: guidelineHash({
        label: declaration.label,
        notices: declaration.notices,
        own,
        variable: variable ? without(variable, 'valuesByMode') : null,
        values: sorted(values),
      }),
      label: `${declaration.label}: ${declaration.observations
        .map(observation => {
          const mode = nativeModes.get(observation.modeId)!;
          return `${mode.label} ${observation.value ? `RGB ${observation.value.r}, ${observation.value.g}, ${observation.value.b}; alpha ${observation.value.alpha}` : (observation.gap ?? 'unresolved')}`;
        })
        .join(' / ')}`,
      locator: declaration.locator,
      ambiguous: own?.ambiguous ?? false,
    });
  }
  for (const statement of figmaSourceStatements(inventory)) {
    const match = statement.locator.match(/^node:(.+)\/characters\/characters\/(\d+)-\d+$/);
    if (!match) throw new Error('Unsupported native text locator for comparison.');
    records.push({
      id: statement.id,
      kind: 'statement',
      key: tuple('figma-text', file, match[1], Number(match[2])),
      signature: guidelineHash({ text: statement.text, context: nodeContext(match[1]) }),
      label: statement.text,
      locator: statement.locator,
      ambiguous: nodeContext(match[1]).ambiguous,
    });
  }
  return {
    captureHash: packet.contentHash,
    records,
    constraints: {
      'Source file': file,
      'File name': packet.file.name,
      'Selected nodes': sorted(packet.request.nodeIds),
      'Variable scope': {
        requested: packet.request.includeVariables,
        status: packet.variables.status,
        relationship: packet.variables.relationship,
      },
      'Source profile': packet.profile,
      'Capture gaps': sorted(packet.gaps.map(({ retryAfterSeconds: _retry, ...gap }) => gap)),
      'Source authority': inventory.sources.map(source => source.status),
    },
    revision: {
      requested: packet.file.requestedVersion,
      returned: packet.file.returnedVersion,
      // Current-read variables are not pinned to the node revision; include all modes in no-op detection.
      nativeEvidence: guidelineHash({ roots: packet.roots, variables: packet.variables }),
    },
  };
}

function websiteSnapshot(inventory: WebsiteInventory): NativeRefreshSnapshot {
  assertWebsiteInventory(inventory);
  const { packet } = inventory,
    lineage = [packet.request.url, packet.finalUrl];
  const elements = new Map(packet.elements.map(item => [item.id, item]));
  const appearances = new Map<string, unknown[]>();
  for (const usage of packet.usages) {
    const list = appearances.get(usage.elementId) ?? [];
    list.push(without(usage as unknown as Data, 'id', 'elementId'));
    appearances.set(usage.elementId, list);
  }
  const properties = new Map<string, unknown[]>();
  for (const property of packet.customProperties) {
    const list = properties.get(property.elementId) ?? [];
    list.push(without(property as unknown as Data, 'id', 'elementId'));
    properties.set(property.elementId, list);
  }
  const contexts = new Map(
    packet.elements.map(element => [
      element.id,
      {
        ...without(element as unknown as Data, 'id', 'locator'),
        appearance: sorted(appearances.get(element.id) ?? []),
        properties: sorted(properties.get(element.id) ?? []),
      },
    ])
  );
  const contextDigests = new Map([...contexts].map(([id, value]) => [id, guidelineHash(value)]));
  const ownSemantics = new Map(
    [...contexts].map(([id, value]) => [id, guidelineHash(without(value, 'bounds'))])
  );
  // Captured ancestry is part of meaning. Positional paths are candidates, not native IDs.
  const byLocator = new Map(packet.elements.map(element => [element.locator, element]));
  const ancestors = new Map<string, string[]>();
  const parentSemantics = new Map<string, string[]>();
  for (const element of packet.elements) {
    let locator = element.locator;
    const chain: string[] = [],
      meanings: string[] = [];
    while (locator.includes(' > ')) {
      locator = locator.slice(0, locator.lastIndexOf(' > '));
      const parent = byLocator.get(locator);
      if (parent) {
        chain.push(contextDigests.get(parent.id)!);
        meanings.push(ownSemantics.get(parent.id)!);
      }
    }
    ancestors.set(element.id, chain);
    parentSemantics.set(element.id, meanings);
  }
  const semanticCounts = new Map<string, number>();
  const semantic = new Map(
    packet.elements.map(element => [
      element.id,
      guidelineHash({
        self: ownSemantics.get(element.id),
        parents: parentSemantics.get(element.id),
      }),
    ])
  );
  for (const hash of semantic.values())
    semanticCounts.set(hash, (semanticCounts.get(hash) ?? 0) + 1);
  const ambiguous = (id: string) =>
    (semanticCounts.get(semantic.get(id)!) ?? 0) > 1 ||
    !/^:nth-child\(\d+\)( > :nth-child\(\d+\))*$/.test(elements.get(id)!.locator);
  const fullContexts = new Map(
    packet.elements.map(element => [
      element.id,
      guidelineHash({ self: contextDigests.get(element.id), parents: ancestors.get(element.id) }),
    ])
  );
  const context = (id: string) => fullContexts.get(id)!;
  const mode = inventory.modes[0];
  const modeKey = tuple(
    'website-environment',
    ...lineage,
    packet.request.viewport,
    packet.request.colorScheme
  );
  const records: NativeRefreshRecord[] = [
    {
      id: mode.id,
      kind: 'mode',
      key: modeKey,
      signature: guidelineHash({ label: mode.label, environment: packet.renderer }),
      label: mode.label,
      locator: modeKey,
    },
  ];
  for (const declaration of inventory.declarations) {
    const element = elements.get(declaration.elementId)!;
    const key = tuple(
      'website-color',
      ...lineage,
      element.locator,
      declaration.kind,
      declaration.pseudo,
      declaration.property
    );
    records.push({
      id: declaration.id,
      kind: 'color',
      key,
      signature: guidelineHash({
        literal: declaration.literal,
        value: declaration.value,
        gap: declaration.gap,
        context: context(element.id),
        notices: declaration.notices,
      }),
      label: `${declaration.property}: ${declaration.literal}`,
      locator: `${element.locator} / ${declaration.pseudo} / ${declaration.property}`,
      ambiguous: ambiguous(element.id),
    });
  }
  const textElements = new Map(
    packet.elements.map(element => [`${element.locator} / direct-text / ${element.id}`, element])
  );
  for (const statement of websiteSourceStatements(inventory)) {
    const match = statement.locator.match(/^(.*)\/characters\/(\d+)-\d+$/);
    const element = match ? textElements.get(match[1]) : null;
    if (!element || !match) throw new Error('Unsupported website text locator for comparison.');
    records.push({
      id: statement.id,
      kind: 'statement',
      key: tuple('website-text', ...lineage, element.locator, Number(match[2])),
      signature: guidelineHash({ text: statement.text, context: context(element.id) }),
      label: statement.text,
      locator: `${element.locator} / direct-text`,
      ambiguous: ambiguous(element.id),
    });
  }
  return {
    captureHash: packet.contentHash,
    records,
    constraints: {
      'Source URL': lineage,
      'Capture selection': {
        selector: packet.request.selector,
        excluded: sorted(packet.request.excludedSelectors),
        incidental: sorted(packet.request.includedIncidentalSelectors),
      },
      'Observed environment': {
        viewport: packet.request.viewport,
        colorScheme: packet.request.colorScheme,
        renderer: packet.renderer,
      },
      'Scope coverage': { matched: packet.scope.matched, truncated: packet.scope.truncated },
      'Capture gaps': sorted(packet.gaps),
      Redirects: packet.redirects,
      'Source authority': inventory.sources.map(source => source.status),
    },
    revision: {
      document: packet.documentHash,
      screenshot: guidelineHash(packet.screenshot),
      stylesheets: sorted(packet.stylesheetEvidence),
      inspected: packet.scope.inspected,
    },
  };
}

export function proposeFigmaRefresh(
  previous: FigmaNativeInventory,
  rawDraft: FigmaReviewDraft,
  next: FigmaNativeInventory
) {
  const draft = parseFigmaReviewDraft(previous, rawDraft);
  const selectedModeKeys = new Set(
    previous.modes
      .filter(mode => draft.modeIds.includes(mode.id))
      .map(mode => figmaModeKey(previous.packet.request.fileKey, mode))
  );
  return compareNativeReview(
    figmaSnapshot(previous, selectedModeKeys),
    figmaSnapshot(next, selectedModeKeys),
    draft,
    suggestFigmaReview(next),
    value => parseFigmaReviewDraft(next, value)
  );
}
export function proposeWebsiteRefresh(
  previous: WebsiteInventory,
  rawDraft: WebsiteReviewDraft,
  next: WebsiteInventory
) {
  const draft = parseWebsiteReviewDraft(previous, rawDraft);
  return compareNativeReview(
    websiteSnapshot(previous),
    websiteSnapshot(next),
    draft,
    suggestWebsiteReview(next),
    value => parseWebsiteReviewDraft(next, value)
  );
}
