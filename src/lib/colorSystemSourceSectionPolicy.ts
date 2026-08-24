import {
  type SourceColorSection,
  type SourceColorSectionKind,
} from '../types/colorSystemAudit';

export function normalizeSourceSectionHeading(value: string): string {
  return value.trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
}

export function sourceSectionKindForHeading(value: string): SourceColorSectionKind | null {
  const heading =
    /\bcolors?\s*\(\s*(primary|secondary|product graphics?|data (?:vis|visualization)|typography)\s*\)$/.exec(
      normalizeSourceSectionHeading(value)
    )?.[1];
  if (!heading) return null;
  if (heading === 'product graphic' || heading === 'product graphics') {
    return 'product-graphics';
  }
  if (heading === 'data vis' || heading === 'data visualization') {
    return 'data-visualization';
  }
  return heading as 'primary' | 'secondary' | 'typography';
}

type SectionProvenance = Pick<
  SourceColorSection,
  'kind' | 'title' | 'sourceNodeId' | 'extractionMethod'
>;

export function isValidSourceSectionCollectionProvenance(
  sourceLocator: string,
  sections: readonly SectionProvenance[]
): boolean {
  return sections.every(section => isValidSourceSectionProvenance(sourceLocator, section));
}

export function isValidSourceSectionProvenance(
  _sourceLocator: string,
  section: SectionProvenance
): boolean {
  return (
    section.extractionMethod === 'explicit-heading' &&
    sourceSectionKindForHeading(section.title) === section.kind
  );
}
