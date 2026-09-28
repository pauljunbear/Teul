/**
 * Exact application regions shared by preview and native delivery; never write authority.
 * Positive-alpha leaves require an explicit opaque ground. Areas partition geometric footprints,
 * not opacity-weighted paint contributions; translucent applications cannot assess prominence.
 * Coordinates multiply by 64 without rounding. Integer coordinates are at most 2^19, so
 * determinants fit within 2^39 and each board's 2^14-vertex shoelace sum within 2^52, exact JS integers.
 * There is no epsilon: polygon boundary contacts fail closed; rectangle containment and sibling
 * edge/corner contact are exact and permitted. The separate plan limit bounds total work;
 * both vertex limits include the four corners of rects.
 */
import {
  buildColorSystemContextApplicationV1,
  type ColorSystemContextApplicationV1,
} from './colorSystemRelationshipsV1';
import { captureColorSystemModelV1 } from './colorSystemModelV1';
import {
  serializeColorSystemInertJsonV1,
  snapshotColorSystemInertJsonV1,
} from './colorSystemInertJsonV1';
import { deterministicContentHash } from './colorSystemHashing';

export const COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION = 'teul.application-geometry.v1' as const;
export const COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_LIMITS = Object.freeze({
  maximumBoards: 64,
  maximumNodes: 1024,
  maximumVertices: 16384,
  maximumTotalVertices: 32768,
  maximumDepth: 16,
  maximumCoordinate: 8192,
  gridScale: 64,
  maximumComparisons: 8000000,
  maximumBytes: 2 * 1024 * 1024,
});

export interface ColorSystemGeometryPointV1 {
  readonly x: number;
  readonly y: number;
}
export type ColorSystemGeometryShapeV1 =
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly kind: 'compound-polygon';
      readonly fillRule: 'evenodd';
      readonly contours: readonly (readonly ColorSystemGeometryPointV1[])[];
    };
export interface ColorSystemApplicationGeometryNodeV1 {
  readonly id: string;
  readonly useId: string;
  readonly shape: ColorSystemGeometryShapeV1;
  readonly textAlternative?: string;
  readonly children: readonly ColorSystemApplicationGeometryNodeV1[];
}
export interface ColorSystemApplicationGeometryBoardV1 {
  readonly applicationId: string;
  readonly width: number;
  readonly height: number;
  readonly root: ColorSystemApplicationGeometryNodeV1;
}
export interface ColorSystemApplicationGeometryPlanV1 {
  readonly version: typeof COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION;
  readonly modelHash: string;
  readonly applicationsHash: string;
  readonly boards: readonly ColorSystemApplicationGeometryBoardV1[];
  /** Retained attribution only; it does not establish source authority or verify font outlines. */
  readonly artwork?: {
    readonly status: 'provided-artwork-metadata';
    readonly sources: readonly {
      readonly label: string;
      readonly identity: string;
      readonly sha256: string;
    }[];
    readonly notes: readonly string[];
  };
}
export interface ColorSystemGeometryBoundsV1 {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface ColorSystemApplicationGeometryRegionV1 {
  readonly applicationId: string;
  readonly nodeId: string;
  readonly useId: string;
  readonly parentNodeId: string | null;
  readonly bounds: ColorSystemGeometryBoundsV1;
  readonly contours: readonly (readonly ColorSystemGeometryPointV1[])[];
  readonly fillRule: 'evenodd';
  readonly svgPath: string;
  readonly area: number;
  /** Exclusive topmost geometric footprint; does not weight parent contribution through alpha. */
  readonly visibleArea: number;
}
export interface ColorSystemApplicationGeometryAssessmentV1 {
  readonly version: typeof COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION;
  readonly qualified: false;
  readonly modelHash: string;
  readonly applicationsHash: string;
  /** Board geometry, node/use identities and text alternatives, independent of paint/model identity. */
  readonly layoutHash: string;
  readonly geometryHash: string;
  readonly plan: ColorSystemApplicationGeometryPlanV1;
  /** Detached exact application data, including the original presence or absence of area fields. */
  readonly applications: readonly ColorSystemContextApplicationV1[];
  /** Separate projection: absent areas become measurements; mismatched declared areas are rejected. */
  readonly measuredApplications: readonly ColorSystemContextApplicationV1[];
  /** Present only for used translucent paints; opaque assessment identities remain unchanged. */
  readonly translucentApplications?: readonly {
    readonly applicationId: string;
    readonly areaBasis: 'exclusive-geometric-footprint';
    readonly prominence: 'unsupported';
  }[];
  readonly areas: readonly {
    readonly applicationId: string;
    readonly useId: string;
    readonly area: number;
  }[];
  readonly regions: readonly ColorSystemApplicationGeometryRegionV1[];
}

const LIMITS = COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_LIMITS;
const AREA_SCALE = 2 * LIMITS.gridScale ** 2;
const SNAPSHOT = { maximumBytes: LIMITS.maximumBytes, maximumDepth: 40, maximumNodes: 100000 };
type Data = Record<string, unknown>;
type Point = { x: number; y: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
type Ring = { points: Point[]; bounds: Bounds; twiceArea: number; depth: number };
type Region = { rings: Ring[]; bounds: Bounds; twiceArea: number; rect: boolean };
type ParsedNode = {
  node: ColorSystemApplicationGeometryNodeV1;
  region: Region;
  children: ParsedNode[];
};
type Budget = { comparisons: number; vertices: number; nodes: number; boardStart: number };
const budget = (): Budget => ({ comparisons: 0, vertices: 0, nodes: 0, boardStart: 0 });
function fail(reason: string): never {
  throw new Error(`Application geometry: ${reason}`);
}
function spend(work: Budget): void {
  if (++work.comparisons > LIMITS.maximumComparisons)
    fail('GEOMETRY_COMPARISON_BUDGET_EXCEEDED; topology has not been established.');
}
function record(value: unknown, required: string[], optional: string[] = []): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Expected a geometry record.');
  const data = value as Data;
  if (
    required.some(key => !Object.prototype.hasOwnProperty.call(data, key)) ||
    Object.keys(data).some(key => !required.includes(key) && !optional.includes(key))
  )
    fail('Missing or unsupported geometry fields.');
  return data;
}
function text(value: unknown, maximum = 128): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    fail('Expected bounded nonblank geometry text.');
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value))
    fail('Expected an exact content hash.');
  return value;
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    fail('Geometry collection exceeds its bound.');
  return value;
}
function coordinate(value: unknown, positive = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > LIMITS.maximumCoordinate ||
    !Number.isSafeInteger(value * LIMITS.gridScale) ||
    (positive && value === 0)
  )
    fail(
      'Coordinates must be on the exact 1/64 CSSpx grid within 0..8192; dimensions must be positive.'
    );
  return value;
}
function bounds(points: Point[]): Bounds {
  return points.reduce(
    (box, point) => ({
      left: Math.min(box.left, point.x),
      top: Math.min(box.top, point.y),
      right: Math.max(box.right, point.x),
      bottom: Math.max(box.bottom, point.y),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  );
}
const boxesMeet = (a: Bounds, b: Bounds) =>
  a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
const boxesOverlap = (a: Bounds, b: Bounds) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const boxContains = (a: Bounds, b: Bounds) =>
  a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom;
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const onSegment = (point: Point, a: Point, b: Point) =>
  cross(a, b, point) === 0 &&
  point.x >= Math.min(a.x, b.x) &&
  point.x <= Math.max(a.x, b.x) &&
  point.y >= Math.min(a.y, b.y) &&
  point.y <= Math.max(a.y, b.y);
function segmentsMeet(a: Point, b: Point, c: Point, d: Point, work: Budget): boolean {
  spend(work);
  if (
    Math.min(a.x, b.x) > Math.max(c.x, d.x) ||
    Math.min(c.x, d.x) > Math.max(a.x, b.x) ||
    Math.min(a.y, b.y) > Math.max(c.y, d.y) ||
    Math.min(c.y, d.y) > Math.max(a.y, b.y)
  )
    return false;
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  return (
    (abC === 0 && onSegment(c, a, b)) ||
    (abD === 0 && onSegment(d, a, b)) ||
    (cdA === 0 && onSegment(a, c, d)) ||
    (cdB === 0 && onSegment(b, c, d)) ||
    (abC !== 0 && abD !== 0 && cdA !== 0 && cdB !== 0 && abC > 0 !== abD > 0 && cdA > 0 !== cdB > 0)
  );
}
/** Exact integer ray test: -1 outside, 0 boundary, 1 inside. No epsilon or input rounding. */
function inRing(point: Point, ring: Ring, work: Budget): -1 | 0 | 1 {
  if (!boxContains(ring.bounds, { left: point.x, right: point.x, top: point.y, bottom: point.y }))
    return -1;
  let inside = false;
  for (let i = 0; i < ring.points.length; i++) {
    spend(work);
    const a = ring.points[i],
      b = ring.points[(i + 1) % ring.points.length];
    if (onSegment(point, a, b)) return 0;
    if (a.y > point.y !== b.y > point.y && cross(a, b, point) > 0 === b.y > a.y) inside = !inside;
  }
  return inside ? 1 : -1;
}
function inRegion(point: Point, region: Region, work: Budget): -1 | 0 | 1 {
  let inside = false;
  for (const ring of region.rings) {
    const location = inRing(point, ring, work);
    if (location === 0) return 0;
    if (location === 1) inside = !inside;
  }
  return inside ? 1 : -1;
}
function ringsMeet(a: Ring, b: Ring, work: Budget): boolean {
  spend(work);
  if (!boxesMeet(a.bounds, b.bounds)) return false;
  for (let i = 0; i < a.points.length; i++)
    for (let j = 0; j < b.points.length; j++)
      if (
        segmentsMeet(
          a.points[i],
          a.points[(i + 1) % a.points.length],
          b.points[j],
          b.points[(j + 1) % b.points.length],
          work
        )
      )
        return true;
  return false;
}
function parseShape(
  value: unknown,
  work: Budget
): { shape: ColorSystemGeometryShapeV1; region: Region } {
  const discriminator = record(
    value,
    ['kind'],
    ['x', 'y', 'width', 'height', 'fillRule', 'contours']
  );
  let shape: ColorSystemGeometryShapeV1, contours: ColorSystemGeometryPointV1[][];
  if (discriminator.kind === 'rect') {
    const data = record(value, ['kind', 'x', 'y', 'width', 'height']);
    const x = coordinate(data.x),
      y = coordinate(data.y),
      width = coordinate(data.width, true),
      height = coordinate(data.height, true);
    if (x + width > LIMITS.maximumCoordinate || y + height > LIMITS.maximumCoordinate)
      fail('Rectangle extents exceed 8192 CSSpx.');
    shape = { kind: 'rect', x, y, width, height };
    contours = [
      [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ],
    ];
  } else if (discriminator.kind === 'compound-polygon') {
    const data = record(value, ['kind', 'fillRule', 'contours']);
    if (data.fillRule !== 'evenodd')
      fail('Compound regions require the explicit evenodd fill rule.');
    contours = list(data.contours, LIMITS.maximumVertices / 3).map(contour => {
      const points = list(contour, LIMITS.maximumVertices);
      if (points.length < 3) fail('A contour requires at least three distinct vertices.');
      return points.map(point => {
        const data = record(point, ['x', 'y']);
        return { x: coordinate(data.x), y: coordinate(data.y) };
      });
    });
    if (!contours.length) fail('A compound region requires a contour.');
    shape = { kind: 'compound-polygon', fillRule: 'evenodd', contours };
  } else fail('Unsupported geometry shape; only rectangles and compound polygons are supported.');
  const rings: Ring[] = contours.map(contour => {
    work.vertices += contour.length;
    if (
      work.vertices - work.boardStart > LIMITS.maximumVertices ||
      work.vertices > LIMITS.maximumTotalVertices
    )
      fail('Geometry exceeds its board or total vertex bound.');
    const points = contour.map(point => ({
      x: point.x * LIMITS.gridScale,
      y: point.y * LIMITS.gridScale,
    }));
    let twiceArea = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        c = points[(i + 2) % points.length];
      if (same(a, b)) fail('A contour has repeated adjacent vertices.');
      if (cross(a, b, c) === 0 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0)
        fail('A contour doubles back along its boundary.');
      twiceArea += a.x * b.y - b.x * a.y;
      for (let j = i + 2; j < points.length; j++) {
        if (i === 0 && j === points.length - 1) continue;
        if (segmentsMeet(a, b, points[j], points[(j + 1) % points.length], work))
          fail('A contour self-intersects or has an ambiguous self-contact.');
      }
    }
    if (twiceArea === 0) fail('A contour must enclose positive area.');
    return { points, bounds: bounds(points), twiceArea: Math.abs(twiceArea), depth: 0 };
  });
  for (let i = 0; i < rings.length; i++)
    for (let j = i + 1; j < rings.length; j++)
      if (ringsMeet(rings[i], rings[j], work))
        fail('Compound contours cross or touch ambiguously.');
  for (const ring of rings)
    ring.depth = rings.filter(
      other => other !== ring && inRing(ring.points[0], other, work) === 1
    ).length;
  const twiceArea = rings.reduce(
    (sum, ring) => sum + (ring.depth % 2 ? -ring.twiceArea : ring.twiceArea),
    0
  );
  if (twiceArea <= 0 || !Number.isSafeInteger(twiceArea))
    fail('Region area must be positive and exactly representable.');
  return {
    shape,
    region: {
      rings,
      bounds: bounds(rings.flatMap(ring => ring.points)),
      twiceArea,
      rect: shape.kind === 'rect',
    },
  };
}

/** Parent rectangles include their boundary. Other parent/child boundary contacts fail closed. */
function contains(parent: Region, child: Region, work: Budget): boolean {
  spend(work);
  if (!boxContains(parent.bounds, child.bounds)) return false;
  if (parent.rect) return true;
  for (const a of parent.rings)
    for (const b of child.rings) if (ringsMeet(a, b, work)) return false;
  if (
    child.rings.some(ring => ring.depth % 2 === 0 && inRegion(ring.points[0], parent, work) !== 1)
  )
    return false;
  // Checking child vertices alone misses a child that encloses an entire parent hole.
  return !parent.rings.some(
    ring => ring.depth % 2 === 1 && inRegion(ring.points[0], child, work) !== -1
  );
}
/** Sibling rect edges may touch. Other boundary contacts are intentionally unsupported. */
function disjoint(a: Region, b: Region, work: Budget): boolean {
  spend(work);
  if (a.rect && b.rect) return !boxesOverlap(a.bounds, b.bounds);
  if (!boxesMeet(a.bounds, b.bounds)) return true;
  for (const first of a.rings)
    for (const second of b.rings) if (ringsMeet(first, second, work)) return false;
  return (
    !a.rings.some(ring => inRegion(ring.points[0], b, work) !== -1) &&
    !b.rings.some(ring => inRegion(ring.points[0], a, work) !== -1)
  );
}
function parseBoards(input: unknown): {
  boards: ColorSystemApplicationGeometryBoardV1[];
  roots: ParsedNode[];
} {
  const work = budget(),
    ids = new Set<string>(),
    applicationIds = new Set<string>(),
    roots: ParsedNode[] = [];
  const parseNode = (value: unknown, depth: number): ParsedNode => {
    if (++work.nodes > LIMITS.maximumNodes || depth > LIMITS.maximumDepth)
      fail('Geometry exceeds its node or paint-tree depth bound.');
    const data = record(value, ['id', 'useId', 'shape', 'children'], ['textAlternative']);
    const id = text(data.id);
    if (ids.has(id)) fail('Geometry node identities must be unique across the plan.');
    ids.add(id);
    const { shape, region } = parseShape(data.shape, work);
    const children = list(data.children, LIMITS.maximumNodes).map(child =>
      parseNode(child, depth + 1)
    );
    for (let i = 0; i < children.length; i++) {
      if (!contains(region, children[i].region, work))
        fail(`Child ${children[i].node.id} is not wholly contained by painted parent ${id}.`);
      for (let j = i + 1; j < children.length; j++)
        if (!disjoint(children[i].region, children[j].region, work))
          fail(
            `Sibling filled regions ${children[i].node.id} and ${children[j].node.id} overlap or touch ambiguously.`
          );
    }
    return {
      node: {
        id,
        useId: text(data.useId),
        shape,
        ...(data.textAlternative === undefined
          ? {}
          : { textAlternative: text(data.textAlternative, 256) }),
        children: children.map(child => child.node),
      },
      region,
      children,
    };
  };
  const boards = list(input, LIMITS.maximumBoards).map(value => {
    const board = record(value, ['applicationId', 'width', 'height', 'root']);
    const applicationId = text(board.applicationId),
      width = coordinate(board.width, true),
      height = coordinate(board.height, true);
    if (applicationIds.has(applicationId)) fail('Every application requires exactly one board.');
    applicationIds.add(applicationId);
    work.boardStart = work.vertices;
    const parsed = parseNode(board.root, 1),
      shape = parsed.node.shape;
    if (
      shape.kind !== 'rect' ||
      shape.x !== 0 ||
      shape.y !== 0 ||
      shape.width !== width ||
      shape.height !== height
    )
      fail('Board root must be exactly the rectangle 0,0,width,height.');
    roots.push(parsed);
    return { applicationId, width, height, root: parsed.node };
  });
  if (!boards.length) fail('Geometry requires at least one application board.');
  return { boards, roots };
}

function parsePlan(input: unknown): {
  plan: ColorSystemApplicationGeometryPlanV1;
  roots: ParsedNode[];
} {
  const root = record(
    snapshotColorSystemInertJsonV1(input, SNAPSHOT),
    ['version', 'modelHash', 'applicationsHash', 'boards'],
    ['artwork']
  );
  if (root.version !== COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION)
    fail('Unsupported geometry version.');
  const { boards, roots } = parseBoards(root.boards);
  return {
    plan: {
      version: COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
      modelHash: hash(root.modelHash),
      applicationsHash: hash(root.applicationsHash),
      boards,
      ...('artwork' in root ? { artwork: parseArtwork(root.artwork) } : {}),
    },
    roots,
  };
}

function parseArtwork(
  input: unknown
): NonNullable<ColorSystemApplicationGeometryPlanV1['artwork']> {
  const data = record(input, ['status', 'sources', 'notes']);
  if (data.status !== 'provided-artwork-metadata') fail('Unsupported artwork attribution status.');
  return {
    status: 'provided-artwork-metadata',
    sources: list(data.sources, 8).map(value => {
      const source = record(value, ['label', 'identity', 'sha256']);
      if (typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256))
        fail('Artwork sources require a SHA-256 digest.');
      return {
        label: text(source.label, 256),
        identity: text(source.identity, 512),
        sha256: source.sha256,
      };
    }),
    notes: list(data.notes, 16).map(value => text(value, 1024)),
  };
}

function visibleTwiceArea(parsed: ParsedNode): number {
  const visible =
    parsed.region.twiceArea -
    parsed.children.reduce((sum, child) => sum + child.region.twiceArea, 0);
  if (visible < 0 || !Number.isSafeInteger(visible))
    fail('Child occlusion produces an invalid visible area.');
  return visible;
}

/** Pure layout measurement. This establishes no model binding, paint opacity or application eligibility. */
export function measureColorSystemApplicationGeometryBoardsV1(input: unknown): {
  readonly boards: readonly ColorSystemApplicationGeometryBoardV1[];
  readonly areas: readonly { applicationId: string; useId: string; area: number }[];
} {
  const { boards, roots } = parseBoards(snapshotColorSystemInertJsonV1(input, SNAPSHOT));
  const areas: { applicationId: string; useId: string; area: number }[] = [];
  roots.forEach((root, index) => {
    const totals = new Map<string, number>();
    const visit = (parsed: ParsedNode) => {
      totals.set(
        parsed.node.useId,
        (totals.get(parsed.node.useId) ?? 0) + visibleTwiceArea(parsed)
      );
      parsed.children.forEach(visit);
    };
    visit(root);
    totals.forEach((twiceArea, useId) =>
      areas.push({
        applicationId: boards[index].applicationId,
        useId,
        area: twiceArea / AREA_SCALE,
      })
    );
  });
  return { boards, areas };
}

/** Revalidates and detaches unknown input; no trusted parsed-data or mutation capability. */
export function parseColorSystemApplicationGeometryV1(
  input: unknown
): ColorSystemApplicationGeometryPlanV1 {
  return parsePlan(input).plan;
}
function applications(input: unknown): ColorSystemContextApplicationV1[] {
  const values = list(snapshotColorSystemInertJsonV1(input), LIMITS.maximumBoards).map(
    buildColorSystemContextApplicationV1
  );
  if (!values.length || new Set(values.map(value => value.id)).size !== values.length)
    fail('Applications must have unique identities and cannot be empty.');
  return values;
}
export function hashColorSystemGeometryApplicationsV1(input: unknown): string {
  return deterministicContentHash(serializeColorSystemInertJsonV1(applications(input)));
}
const cssContours = (region: Region): ColorSystemGeometryPointV1[][] =>
  region.rings.map(ring =>
    ring.points.map(point => ({ x: point.x / LIMITS.gridScale, y: point.y / LIMITS.gridScale }))
  );
const path = (contours: readonly (readonly ColorSystemGeometryPointV1[])[]) =>
  contours
    .map(
      points =>
        points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ') + ' Z'
    )
    .join(' ');
/** Consumers must render these contours with evenodd fill; winding is deliberately not normalized. */
export function colorSystemGeometryShapeToContoursV1(
  input: unknown
): readonly (readonly ColorSystemGeometryPointV1[])[] {
  return cssContours(parseShape(snapshotColorSystemInertJsonV1(input, SNAPSHOT), budget()).region);
}
export function colorSystemGeometryShapeToSvgPathV1(input: unknown): string {
  return path(colorSystemGeometryShapeToContoursV1(input));
}

/** Establish geometric evidence only. The complete source/application requirements gate remains separate. */
export function assessColorSystemApplicationGeometryV1(
  modelInput: unknown,
  applicationsInput: unknown,
  planInput: unknown
): ColorSystemApplicationGeometryAssessmentV1 {
  const model = captureColorSystemModelV1(modelInput),
    original = applications(applicationsInput),
    { plan, roots } = parsePlan(planInput);
  const applicationsHash = deterministicContentHash(serializeColorSystemInertJsonV1(original));
  if (plan.modelHash !== model.modelHash || plan.applicationsHash !== applicationsHash)
    fail('STALE_GEOMETRY_BINDING: model or exact application identity differs.');
  const byId = new Map(original.map(application => [application.id, application]));
  if (
    plan.boards.length !== original.length ||
    plan.boards.some(board => !byId.has(board.applicationId))
  )
    fail('Every application must have exactly one matching board.');
  const areas: { applicationId: string; useId: string; area: number }[] = [],
    regions: ColorSystemApplicationGeometryRegionV1[] = [],
    translucentApplications: NonNullable<
      ColorSystemApplicationGeometryAssessmentV1['translucentApplications']
    >[number][] = [];
  const colors = new Map(model.colors.map(color => [color.id, color]));
  const measuredApplications = original.map(application => {
    const context = model.contexts.find(item => item.id === application.contextId);
    if (
      !context ||
      !model.modes.some(mode => mode.id === application.modeId) ||
      !context.modeIds.includes(application.modeId)
    )
      fail('Application context or mode is not declared by the model.');
    const paints = new Map(
      application.uses.map(use => {
        const value = colors.get(use.colorId)?.valuesByMode[application.modeId];
        if (!value || value.alpha === 0)
          fail(
            `Use ${use.id} requires an exact positive-alpha paint in mode ${application.modeId}.`
          );
        return [use.id, value] as const;
      })
    );
    if ([...paints.values()].some(value => value.alpha < 1)) {
      if (
        model.rules.some(
          rule =>
            rule.kind === 'prominence' &&
            rule.contextIds.includes(application.contextId) &&
            rule.modeIds.includes(application.modeId)
        )
      )
        fail(
          `Application ${application.id} cannot assess scoped prominence with translucent paints.`
        );
      translucentApplications.push({
        applicationId: application.id,
        areaBasis: 'exclusive-geometric-footprint',
        prominence: 'unsupported',
      });
    }
    const totals = new Map<string, number>();
    const visit = (
      parsed: ParsedNode,
      parent: ParsedNode | null,
      grandparent: ParsedNode | null
    ) => {
      const { node, region, children } = parsed;
      if (!paints.has(node.useId)) fail(`Node ${node.id} references an unknown application use.`);
      const pairs = application.pairs.filter(pair => pair.foregroundUseId === node.useId);
      if (
        paints.get(node.useId)!.alpha < 1 &&
        (children.length > 0 ||
          !parent ||
          paints.get(parent.node.useId)?.alpha !== 1 ||
          pairs.length === 0)
      )
        fail(
          `Translucent occurrence ${node.id} requires a leaf and a declared opaque immediate ground.`
        );
      const visible = visibleTwiceArea(parsed);
      totals.set(node.useId, (totals.get(node.useId) ?? 0) + visible);
      if (visible > 0)
        for (const pair of pairs) {
          if (parent?.node.useId !== pair.backgroundUseId)
            fail(
              `Pair ${pair.id} does not match foreground occurrence ${node.id}'s nearest painted parent.`
            );
          if (pair.underlayUseId && grandparent?.node.useId !== pair.underlayUseId)
            fail(`Pair ${pair.id} does not match its declared painted underlay.`);
        }
      const contours = cssContours(region),
        box = region.bounds;
      regions.push({
        applicationId: application.id,
        nodeId: node.id,
        useId: node.useId,
        parentNodeId: parent?.node.id ?? null,
        bounds: {
          x: box.left / LIMITS.gridScale,
          y: box.top / LIMITS.gridScale,
          width: (box.right - box.left) / LIMITS.gridScale,
          height: (box.bottom - box.top) / LIMITS.gridScale,
        },
        contours,
        fillRule: 'evenodd',
        svgPath: path(contours),
        area: region.twiceArea / AREA_SCALE,
        visibleArea: visible / AREA_SCALE,
      });
      children.forEach(child => visit(child, parsed, parent));
    };
    visit(
      roots[plan.boards.findIndex(board => board.applicationId === application.id)],
      null,
      null
    );
    return {
      ...application,
      uses: application.uses.map(use => {
        const area = (totals.get(use.id) ?? 0) / AREA_SCALE;
        if (area <= 0) fail(`Use ${use.id} must have positive aggregate visible geometric area.`);
        if (use.area !== undefined && use.area !== area)
          fail(`Declared area for ${use.id} differs from measured visible geometry.`);
        areas.push({ applicationId: application.id, useId: use.id, area });
        return { ...use, area };
      }),
      pairs: application.pairs.map(pair => ({
        ...pair,
        ...(pair.contrast ? { contrast: { ...pair.contrast } } : {}),
      })),
    };
  });
  const layoutHash = deterministicContentHash(
    serializeColorSystemInertJsonV1({ version: plan.version, boards: plan.boards }, SNAPSHOT)
  );
  return {
    version: COLOR_SYSTEM_APPLICATION_GEOMETRY_V1_VERSION,
    qualified: false,
    modelHash: model.modelHash,
    applicationsHash,
    layoutHash,
    geometryHash: deterministicContentHash(serializeColorSystemInertJsonV1(plan, SNAPSHOT)),
    plan,
    applications: original,
    measuredApplications,
    ...(translucentApplications.length ? { translucentApplications } : {}),
    areas,
    regions,
  };
}
