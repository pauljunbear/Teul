import {
  canonicalIntakeJson,
  IntakeError,
  parseIntakeProfile,
  type JsonValue,
  type IntakeProfile,
  type IntakeResult,
  type IntakeSubmission,
} from '../../../../services/guideline-intake/src/protocol';
import {
  parseFigmaCapturePacket,
  parseFigmaCaptureRequest,
  parseFigmaOutline,
  parseFigmaLink,
  type FigmaCapturePacket,
  type FigmaOutline,
} from '../../../../services/guideline-intake/src/figmaProtocol';
import { hashCanonical, prepareIntakeSubmission } from './intakeClient';

/** Local preparation; selecting a frame does not dispatch a read. */
export async function prepareFigmaCapture(
  outline: FigmaOutline,
  selectedIds: string[],
  includeVariables: boolean,
  workspaceId: string,
  profile: IntakeProfile,
  linkedUrl?: string
): Promise<IntakeSubmission> {
  const source = parseFigmaOutline(outline);
  profile = parseIntakeProfile(profile);
  const linked = linkedUrl ? parseFigmaLink(linkedUrl) : null;
  if (linked && linked.fileKey !== source.fileKey) throw new IntakeError('FIGMA_SELECTION_CHANGED');
  if (
    profile.id !== 'figma-native-capture' ||
    profile.version !== '1' ||
    profile.kind !== 'figma' ||
    profile.operation !== 'capture'
  )
    throw new IntakeError('FIGMA_CAPTURE_NOT_CONFIGURED');
  if (
    selectedIds.some(id => id !== linked?.nodeId && !source.entries.some(entry => entry.id === id))
  )
    throw new IntakeError('FIGMA_SELECTION_CHANGED');
  const payload = parseFigmaCaptureRequest({
    schemaVersion: 'teul.figma-rest-request.v1',
    fileKey: source.fileKey,
    version: source.version,
    nodeIds: selectedIds,
    includeVariables,
  });
  const captureHash = await hashCanonical(canonicalIntakeJson(payload));
  return prepareIntakeSubmission(
    {
      profileId: profile.id,
      profileVersion: profile.version,
      kind: 'figma',
      binding: { workspaceId, sourceRevision: captureHash },
      captureHash,
      scope: payload.nodeIds,
      parserVersion: 'figma-native-1',
      payload: JSON.parse(canonicalIntakeJson(payload)),
    },
    profile
  );
}

export async function readFigmaCapture(raw: unknown): Promise<FigmaCapturePacket> {
  const packet = parseFigmaCapturePacket(raw);
  const { contentHash, ...content } = packet;
  if ((await hashCanonical(canonicalIntakeJson(content))) !== contentHash)
    throw new IntakeError('FIGMA_CAPTURE_HASH_MISMATCH');
  return packet;
}

export async function acceptFigmaCapture(
  result: IntakeResult,
  prepared: IntakeSubmission
): Promise<FigmaCapturePacket> {
  const expected = parseFigmaCaptureRequest(prepared.payload);
  const packet = await readFigmaCapture(result.value);
  if (canonicalIntakeJson(packet.request) !== canonicalIntakeJson(expected))
    throw new IntakeError('FIGMA_SELECTION_CHANGED');
  return packet;
}

export interface FigmaCapturedItem {
  id: string;
  name: string;
  type: string;
  text: string | null;
  paints: number;
  gradients: number;
  nativePaints: JsonValue[];
}
/** A bounded inspection list, never a statement that a node fill is a token or Paint Style. */
export function inspectFigmaCapture(packet: FigmaCapturePacket): FigmaCapturedItem[] {
  const items: FigmaCapturedItem[] = [],
    seen = new Set<string>();
  const visit = (raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new IntakeError('FIGMA_RESPONSE_INVALID');
    const node = raw as Record<string, unknown>;
    if (
      typeof node.id !== 'string' ||
      typeof node.name !== 'string' ||
      typeof node.type !== 'string'
    )
      throw new IntakeError('FIGMA_RESPONSE_INVALID');
    if (seen.has(node.id)) return;
    seen.add(node.id);
    if (seen.size > 5000) throw new IntakeError('FIGMA_NODE_LIMIT');
    const paints = [
      ...(Array.isArray(node.fills) ? node.fills : []),
      ...(Array.isArray(node.strokes) ? node.strokes : []),
    ];
    items.push({
      id: node.id,
      name: node.name,
      type: node.type,
      text: typeof node.characters === 'string' ? node.characters : null,
      paints: paints.length,
      gradients: paints.filter(
        paint => paint && typeof paint.type === 'string' && paint.type.startsWith('GRADIENT_')
      ).length,
      nativePaints: paints,
    });
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  packet.roots.forEach(root => visit(root.document));
  return items;
}

/** Appearance-only swatch; raw channels and their unverified profile remain the evidence. */
export function figmaPaintPreview(raw: JsonValue): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.type !== 'SOLID') return null;
  const color = raw.color;
  if (!color || typeof color !== 'object' || Array.isArray(color)) return null;
  const channels = [color.r, color.g, color.b, color.a ?? 1, raw.opacity ?? 1];
  if (
    channels.some(
      value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1
    )
  )
    return null;
  const [r, g, b, a, opacity] = channels as number[];
  return `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a * opacity})`;
}
