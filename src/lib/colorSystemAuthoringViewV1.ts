import type { ColorSystemAuthoringViewV1 } from '../types/colorSystemAuthoringViewV1';

type Data = Record<string, unknown>;
const record = (value: unknown): value is Data =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const texts = (value: unknown): boolean => Array.isArray(value) && value.every(text);
const fields = (value: unknown, keys: string[]): value is Data =>
  record(value) && keys.every(key => text(value[key]));
const list = (value: unknown, predicate: (item: unknown) => boolean): boolean =>
  Array.isArray(value) && value.every(predicate);
const named = (value: unknown) => fields(value, ['id', 'label']);
/** Only the bounded numeric forms emitted by colorSystemSrgbToCssV1, never arbitrary CSS. */
const css = (value: unknown) => {
  if (!text(value) || value.length > 128) return false;
  if (/^#[0-9A-F]{6}$/.test(value)) return true;
  const parts = /^(rgb\(|color\(srgb )(\S+) (\S+) (\S+) \/ (\S+)\)$/.exec(value);
  return (
    !!parts &&
    parts.slice(2).every((part, index) => {
      const number = Number(part);
      const unit = parts[1] === 'color(srgb ' || index === 3;
      return (
        String(number) === part &&
        number >= 0 &&
        number <= (unit ? 1 : 255) &&
        (unit || Number.isInteger(number))
      );
    })
  );
};
const colors = (value: unknown) =>
  list(
    value,
    color =>
      named(color) &&
      record(color) &&
      list(color.values, paint => fields(paint, ['modeId', 'native']) && css(paint.css))
  );
const locked = (value: unknown) =>
  named(value) && record(value) && typeof value.locked === 'boolean';
const scaleForm = (value: unknown) =>
  value === null ||
  (fields(value, ['id', 'label', 'contextId']) &&
    typeof value.lockRest === 'boolean' &&
    list(
      value.modes,
      mode =>
        fields(mode, [
          'modeId',
          'anchorColorId',
          'surfaceColorId',
          'textColorId',
          'focusColorId',
        ]) &&
        (mode.polarity === 'light' || mode.polarity === 'dark')
    ));
const source = (value: unknown): boolean =>
  value === null ||
  (fields(value, ['modelHash', 'summary']) &&
    ['current-file', 'guideline-json'].includes(String(value.intake)) &&
    list(value.contexts, context => named(context) && record(context) && texts(context.modeIds)) &&
    list(value.modes, named) &&
    colors(value.colors) &&
    list(value.families, named) &&
    list(value.scales, named) &&
    list(value.rules, rule => fields(rule, ['id', 'label', 'status', 'scope', 'description'])));
const recipe = (value: unknown): boolean =>
  value === null ||
  (fields(value, ['id', 'label', 'recipeHash', 'sourceFreshness']) &&
    (value.contentHash === null || text(value.contentHash)) &&
    typeof value.saved === 'boolean' &&
    typeof value.readOnly === 'boolean' &&
    texts(value.headRevisionHashes) &&
    texts(value.conflictHeads) &&
    list(value.families, locked) &&
    list(value.scales, locked) &&
    colors(value.colors) &&
    list(
      value.applications,
      application =>
        fields(application, ['id', 'contextId', 'modeId']) &&
        list(
          application.uses,
          use => fields(use, ['id', 'role', 'colorId', 'label']) && css(use.css)
        ) &&
        list(
          application.pairs,
          pair =>
            fields(pair, ['id', 'assessment']) &&
            (pair.ratio === null ||
              (typeof pair.ratio === 'number' && Number.isFinite(pair.ratio))) &&
            typeof pair.minimum === 'number' &&
            Number.isFinite(pair.minimum)
        )
    ));
const review = (value: unknown) =>
  value === null ||
  (fields(value, ['proposalHash']) &&
    list(
      value.rules,
      rule =>
        fields(rule, ['id', 'label', 'force', 'origin', 'scope', 'meaning']) && texts(rule.evidence)
    ));
const selector = (value: unknown) =>
  fields(value, ['id', 'kind']) && ['color', 'family', 'scale'].includes(String(value.kind));
const radix = (value: unknown) =>
  value === undefined ||
  (record(value) &&
    ['accent', 'neutral', 'either'].includes(String(value.category)) &&
    list(
      value.modes,
      mode => fields(mode, ['modeId', 'scheme']) && ['light', 'dark'].includes(String(mode.scheme))
    ));
const refinement = (value: unknown) =>
  value === null ||
  (fields(value, ['recipeHash']) &&
    list(value.contexts, named) &&
    list(value.modes, named) &&
    list(value.selectors, item => selector(item) && named(item)) &&
    list(
      value.catalogs,
      item =>
        fields(item, ['id', 'candidateId', 'provider']) &&
        ['wada', 'werner', 'radix'].includes(String(item.provider)) &&
        list(item.modes, named)
    ) &&
    list(
      value.roles,
      item =>
        fields(item, ['fragmentId', 'id', 'label', 'role']) &&
        texts(item.contextIds) &&
        texts(item.modeIds) &&
        list(item.members, selector)
    ));
const catalog = (value: unknown) =>
  value === null ||
  (fields(value, ['recipeHash', 'fragmentId', 'discoveryHash']) &&
    fields(value.request, ['recipeHash', 'fragmentId', 'provider']) &&
    ['wada', 'werner', 'radix'].includes(String(value.request.provider)) &&
    radix(value.request.radix) &&
    list(
      value.references,
      ref =>
        selector(ref) &&
        named(ref) &&
        record(ref) &&
        texts(ref.paths) &&
        typeof ref.editable === 'boolean'
    ) &&
    list(
      value.candidates,
      item =>
        fields(item, ['id', 'hash', 'label', 'disclosure']) &&
        colors(item.colors) &&
        list(item.targets, target => selector(target) && named(target))
    ));

/** SVG is displayed only as an image. Permit only the fixed renderer's inert element set. */
function authoredSvg(value: unknown): boolean {
  if (
    !text(value) ||
    value.length > 2 * 1024 * 1024 ||
    !value.startsWith('<svg ') ||
    !value.endsWith('</svg>')
  )
    return false;
  let valid = true;
  const residual = value.replace(/<[^>]*>/g, tag => {
    if (['</svg>', '<title>', '</title>', '</path>'].includes(tag)) return '';
    if (
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[0-9.]+" height="[0-9.]+" viewBox="0 0 [0-9.]+ [0-9.]+" role="img">$/.test(
        tag
      )
    )
      return '';
    const path = /^<path d="([MLZ0-9. ]+)" fill="([^"]+)" fill-rule="evenodd">$/.exec(tag);
    if (!path || !css(path[2])) valid = false;
    return '';
  });
  return valid && !/[<>]/.test(residual);
}
const delivery = (value: unknown): boolean =>
  value === undefined ||
  (record(value) &&
    typeof value.creating === 'boolean' &&
    (value.receipt === null ||
      (fields(value.receipt, ['status', 'receiptHash']) &&
        [
          'created',
          'verified-existing-output',
          'blocked',
          'rolled-back',
          'cleanup-incomplete',
        ].includes(String(value.receipt.status)) &&
        (value.receipt.message === undefined || text(value.receipt.message)))) &&
    (value.review === null ||
      (fields(value.review, ['reviewHash', 'recipeHash', 'deliveryBlueprintHash', 'sourceKind']) &&
        ['current-file', 'imported-snapshot'].includes(String(value.review.sourceKind)) &&
        typeof value.review.expiresAt === 'number' &&
        Number.isFinite(value.review.expiresAt) &&
        fields(value.review.destination, [
          'name',
          'currentFileIdentityHash',
          'documentType',
          'colorProfile',
        ]) &&
        typeof value.review.destination.editable === 'boolean' &&
        record(value.review.counts) &&
        [
          'collections',
          'variables',
          'styles',
          'frames',
          'components',
          'pages',
          'estimatedNodes',
        ].every(
          key =>
            typeof (value.review as Data).counts === 'object' &&
            Number.isSafeInteger(((value.review as Data).counts as Data)[key]) &&
            Number(((value.review as Data).counts as Data)[key]) >= 0
        ) &&
        fields(value.review.preview, ['rendererVersion', 'layoutHash', 'previewHash']) &&
        value.review.preview.rendererVersion === 'teul.authored-svg.v1' &&
        list(
          value.review.preview.boards,
          board =>
            fields(board, ['applicationId', 'name', 'svgHash']) &&
            authoredSvg(board.svg) &&
            typeof board.width === 'number' &&
            board.width > 0 &&
            board.width <= 8192 &&
            typeof board.height === 'number' &&
            board.height > 0 &&
            board.height <= 8192
        ))));

/** JSON is inert. Validate every rendered field before it reaches a component or CSS property. */
export function readColorSystemAuthoringViewV1(json: string): ColorSystemAuthoringViewV1 {
  const value: unknown = JSON.parse(json);
  if (
    !fields(value, ['message', 'status', 'storageMessage']) ||
    value.version !== 'teul.authoring-view.v1' ||
    !source(value.source) ||
    !scaleForm(value.designerScale) ||
    !refinement(value.refinement) ||
    !catalog(value.catalog) ||
    !recipe(value.recipe) ||
    !review(value.pendingReview) ||
    !delivery(value.delivery) ||
    typeof value.readOnly !== 'boolean' ||
    !texts(value.changes) ||
    !list(
      value.savedRecipes,
      saved =>
        fields(saved, ['id', 'status']) &&
        texts(saved.heads) &&
        list(
          saved.revisions,
          revision => fields(revision, ['hash', 'label']) && typeof revision.head === 'boolean'
        )
    ) ||
    !list(value.readOnlyEntries, entry => fields(entry, ['key', 'reason'])) ||
    (value.exportJson !== undefined && !text(value.exportJson))
  )
    throw new Error('The backend returned an unsupported authoring view.');
  return value as unknown as ColorSystemAuthoringViewV1;
}
