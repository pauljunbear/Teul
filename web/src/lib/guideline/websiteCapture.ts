import {
  canonicalIntakeJson,
  IntakeError,
  parseIntakeProfile,
  type IntakeProfile,
  type IntakeResult,
  type IntakeSubmission,
} from '../../../../services/guideline-intake/src/protocol';
import {
  parseWebsiteCapturePacket,
  parseWebsiteCaptureRequest,
  type WebsiteCapturePacket,
  type WebsiteCaptureRequest,
} from '../../../../services/guideline-intake/src/websiteProtocol';
import { hashCanonical, prepareIntakeSubmission } from './intakeClient';

export async function prepareWebsiteCapture(
  raw: WebsiteCaptureRequest,
  workspaceId: string,
  rawProfile: IntakeProfile
): Promise<IntakeSubmission> {
  const request = parseWebsiteCaptureRequest(raw);
  const profile = parseIntakeProfile(rawProfile);
  if (
    profile.id !== 'website-capture' ||
    profile.version !== '1' ||
    profile.kind !== 'website' ||
    profile.operation !== 'capture'
  )
    throw new IntakeError('WEBSITE_CAPTURE_NOT_CONFIGURED');
  const captureHash = await hashCanonical(canonicalIntakeJson(request));
  return prepareIntakeSubmission(
    {
      profileId: profile.id,
      profileVersion: profile.version,
      kind: 'website',
      binding: { workspaceId, sourceRevision: captureHash },
      captureHash,
      scope: [request.selector],
      parserVersion: 'website-capture-1',
      payload: JSON.parse(canonicalIntakeJson(request)),
    },
    profile
  );
}
export async function readWebsiteCapture(raw: unknown): Promise<WebsiteCapturePacket> {
  const packet = parseWebsiteCapturePacket(raw);
  const { contentHash, ...content } = packet;
  if ((await hashCanonical(canonicalIntakeJson(content))) !== contentHash)
    throw new IntakeError('WEBSITE_CAPTURE_HASH_MISMATCH');
  return packet;
}
export async function acceptWebsiteCapture(
  result: IntakeResult,
  prepared: IntakeSubmission
): Promise<WebsiteCapturePacket> {
  const expected = parseWebsiteCaptureRequest(prepared.payload);
  const packet = await readWebsiteCapture(result.value);
  if (canonicalIntakeJson(packet.request) !== canonicalIntakeJson(expected))
    throw new IntakeError('WEBSITE_SELECTION_CHANGED');
  return packet;
}
