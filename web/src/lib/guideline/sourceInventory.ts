import type { ColorSystemColorValueV2 } from '../../../../src/lib/colorSystemBuilderV2Contracts';
import type {
  ColorSystemClaimV1,
  ColorSystemEvidenceV1,
} from '../../../../src/lib/colorSystemModelV1';
import { canonicalJson } from '../../../../src/lib/colorSystemHashing';
import { colorSystemSrgbToCssV1 } from '../../../../src/lib/colorSystemSrgbValueV1';
import { REVIEWED_VALUE_PREFIXES } from '../../../../src/lib/colorSystemValueProvenanceV1';
import type { EvidenceLocator } from './evidence';
import {
  observationColorDescription,
  observationColorValue,
  parseCaptureAny,
  type GuidelineCaptureAny,
} from './evidenceV2';
import {
  isReviewedValueAvailable,
  parseReviewedValueDraft,
  type ReviewedValueDraft,
} from './reviewedValues';

type EntryBase = {
  id: string;
  locator: EvidenceLocator;
  description: string;
  status: 'observed' | 'inferred';
  evidenceRefs: readonly string[];
};
export type GuidelineSourceColor = EntryBase & {
  kind: 'color';
  literal: string;
  value: ColorSystemColorValueV2;
  available: boolean;
  claim: ColorSystemClaimV1 | null;
};
export type GuidelineSourceEntry =
  | GuidelineSourceColor
  | (EntryBase & { kind: 'text'; text: string })
  | (EntryBase & { kind: 'witness' });
export interface GuidelineSourceInventory {
  readonly capture: GuidelineCaptureAny;
  readonly entries: readonly GuidelineSourceEntry[];
  readonly requiredColorIds: readonly string[];
}
const trusted = new WeakSet<object>();
const baseInventories = new WeakMap<object, GuidelineSourceInventory>();
const reviewedInventories = new WeakMap<object, GuidelineSourceInventory>();
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** Validate separate numeric decisions without pretending they were extracted capture observations. */
export function createGuidelineSourceInventory(
  raw: GuidelineCaptureAny,
  rawValues?: ReviewedValueDraft
): GuidelineSourceInventory {
  const capture = parseCaptureAny(raw);
  const values = rawValues ? parseReviewedValueDraft(capture, rawValues) : undefined;
  const cached = values ? reviewedInventories.get(values) : baseInventories.get(capture);
  if (cached?.capture === capture) return cached;
  const entries: GuidelineSourceEntry[] = capture.observations.map(item =>
    item.kind === 'text'
      ? { ...item, status: 'observed', description: item.text, evidenceRefs: [] }
      : {
          id: item.id,
          kind: 'color',
          literal: item.literal,
          value: observationColorValue(item),
          locator: item.locator,
          status: 'observed',
          description: observationColorDescription(item),
          evidenceRefs: [...item.evidenceRefs],
          available: true,
          claim: null,
        }
  );
  const requiredColorIds = entries.filter(item => item.kind === 'color').map(item => item.id);
  if (values) {
    const sourceId = `source:${capture.identity.sha256.slice(7)}`;
    for (const witness of values.witnesses)
      entries.push({
        id: `reviewed-witness:${witness.witnessHash.slice(7)}`,
        kind: 'witness',
        locator: { kind: 'pdf', page: witness.page, bounds: [...witness.bounds] },
        status: 'observed',
        evidenceRefs: [],
        description: `Retained PDF region on page ${witness.page}; witness ${witness.witnessHash}; rendered by ${witness.render.engine} ${witness.render.version} in ${witness.render.colorSpace} on ${witness.render.background}. Source profile identity is not established by rendering.`,
      });
    for (const value of values.candidates) {
      const witness = values.witnesses.find(item => item.witnessHash === value.witnessHash)!;
      const confirmation = values.confirmations.find(item => item.candidateId === value.id);
      const available = isReviewedValueAvailable(values, value.id);
      const prefix = !available
        ? 'Unconfirmed or revoked reviewed value:'
        : value.method === 'transcribed-digital'
          ? REVIEWED_VALUE_PREFIXES.transcription
          : REVIEWED_VALUE_PREFIXES.sample;
      const description =
        `${prefix} ${colorSystemSrgbToCssV1(value.value)}; PDF page ${witness.page}; ${value.method === 'transcribed-digital' ? `literal ${value.literal}` : 'opaque sampled appearance on white; original digital paint, alpha and profile remain unknown'}; witness ${witness.witnessHash}; user ${confirmation?.actor.ref ?? '(not confirmed)'}.`.slice(
          0,
          4096
        );
      const evidenceRefs = [`reviewed-witness:${value.witnessHash.slice(7)}`];
      entries.push({
        id: value.id,
        kind: 'color',
        literal:
          value.method === 'transcribed-digital'
            ? value.literal
            : colorSystemSrgbToCssV1(value.value),
        value: value.value,
        locator: { kind: 'pdf', page: witness.page, bounds: [...witness.bounds] },
        description,
        status: 'inferred',
        evidenceRefs,
        available,
        claim: {
          id: `reviewed-claim:${value.candidateHash.slice(7)}`,
          sourceId,
          text: description,
          status: 'inferred',
          evidenceRefs: [value.id, ...evidenceRefs],
          contextIds: [],
          ruleIds: [],
          modeIds: ['Source'],
        },
      });
    }
  }
  if (new Set(entries.map(item => item.id)).size !== entries.length)
    throw new Error('Reviewed evidence identity collides with captured source evidence.');
  const inventory = freeze({ capture, entries, requiredColorIds });
  trusted.add(inventory);
  if (values) reviewedInventories.set(values, inventory);
  else baseInventories.set(capture, inventory);
  return inventory;
}
export function assertGuidelineSourceInventory(value: GuidelineSourceInventory): void {
  if (!trusted.has(value)) throw new Error('Compile only a validated source inventory.');
}
export function inventoryEvidence(
  inventory: GuidelineSourceInventory,
  ids: Iterable<string>
): ColorSystemEvidenceV1[] {
  assertGuidelineSourceInventory(inventory);
  const byId = new Map(inventory.entries.map(item => [item.id, item]));
  return [...ids].map(id => {
    const item = byId.get(id);
    if (!item) throw new Error('Source evidence reference is missing.');
    return {
      id,
      sourceId: `source:${inventory.capture.identity.sha256.slice(7)}`,
      locator: canonicalJson(item.locator),
      status: item.status,
      description: item.description.slice(0, 4096),
    };
  });
}
