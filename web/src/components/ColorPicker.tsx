import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { Dialog, Tabs } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getStudioTextColor,
  libraryEntries,
  normalizeHex,
  sourceDisclosures,
  type StudioLibraryEntry,
} from '@/lib/teul';
import { suggestStudioCompanions, type StudioCompanionResult } from '@/lib/companions';
import './ColorPicker.css';

type Category = 'suggested' | 'wada' | 'werner' | 'radix' | 'custom';
const CATEGORIES: [Category, string][] = [
  ['suggested', 'Suggested'],
  ['wada', 'Wada'],
  ['werner', 'Werner'],
  ['radix', 'Radix'],
  ['custom', 'Custom'],
];
const PAGE_SIZE = 24;

export interface ColorPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colors: string[];
  onSelect: (hex: string) => void;
  initialColor?: string;
  title: string;
}

function LibraryColor({
  hex,
  label,
  duplicate,
  full,
  onSelect,
  step,
}: {
  hex: string;
  label: string;
  duplicate: boolean;
  full: boolean;
  onSelect: (hex: string) => void;
  step?: number;
}) {
  const description = `${label} · ${hex}${duplicate ? ' · Already in your palette' : ''}`;
  return (
    <button
      type="button"
      className="picker-swatch"
      style={{ backgroundColor: hex, color: getStudioTextColor(hex) }}
      title={description}
      aria-label={description}
      disabled={duplicate || full}
      onClick={() => onSelect(hex)}
    >
      {duplicate ? <Check size={16} aria-hidden="true" /> : step}
    </button>
  );
}

function PickerBody({
  colors,
  onSelect,
  initialColor,
}: Omit<ColorPickerProps, 'open' | 'onOpenChange' | 'title'>) {
  const [category, setCategory] = useState<Category>(
    initialColor && colors.length === 0 ? 'custom' : 'suggested'
  );
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [custom, setCustom] = useState(initialColor ?? '');
  const [retry, setRetry] = useState(0);
  const [suggestions, setSuggestions] = useState<{
    key: string;
    result?: StudioCompanionResult;
    error?: string;
  } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const colorsKey = colors.join('|');
  const selected = new Set(colors.map(normalizeHex).filter(hex => hex !== null));
  const full = colors.length >= 6;
  const normalizedCustom = normalizeHex(custom);
  const duplicateCustom = normalizedCustom ? selected.has(normalizedCustom) : false;
  const librarySource = category === 'wada' || category === 'werner' || category === 'radix';
  const entries = librarySource
    ? libraryEntries.filter(
        entry =>
          entry.source === category &&
          `${entry.name} ${entry.description} ${entry.colors.join(' ')}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
      )
    : [];
  const hasMore = entries.length > visible;
  const pending = suggestions?.key !== colorsKey || (!suggestions.result && !suggestions.error);
  const result = suggestions?.key === colorsKey ? suggestions.result : undefined;
  const failure = suggestions?.key === colorsKey ? suggestions.error : undefined;

  useEffect(() => {
    const controller = new AbortController();
    setSuggestions({ key: colorsKey });
    void suggestStudioCompanions(colors, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setSuggestions({ key: colorsKey, result });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSuggestions({
            key: colorsKey,
            error:
              'Suggestions could not load. You can still choose a library color or enter a hex.',
          });
      });
    return () => controller.abort();
    // The key tracks the ordered color values, without rerunning for a new array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorsKey, retry]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [category, query]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!hasMore || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      records => {
        if (records.some(record => record.isIntersecting))
          setVisible(count => Math.min(count + PAGE_SIZE, entries.length));
      },
      { root: bodyRef.current, rootMargin: '160px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [category, query, visible, hasMore, entries.length]);

  function choose(hex: string) {
    if (!full && !selected.has(hex)) onSelect(hex);
  }

  function changeCategory(value: string) {
    setCategory(value as Category);
    setQuery('');
    setVisible(PAGE_SIZE);
  }

  function renderLibraryEntry(entry: StudioLibraryEntry) {
    const radix = entry.source === 'radix';
    return (
      <article className="picker-library-entry" key={entry.id}>
        <div className="picker-entry-heading">
          <h3>{entry.name}</h3>
          {radix && <span>Light · 12 steps</span>}
        </div>
        <div className={radix ? 'picker-swatches picker-radix-swatches' : 'picker-swatches'}>
          {entry.colors.map((hex, index) => (
            <LibraryColor
              key={`${entry.id}-${index}`}
              hex={hex}
              label={`${entry.name}${radix ? ` step ${index + 1}` : ''}`}
              step={radix ? index + 1 : undefined}
              duplicate={selected.has(hex)}
              full={full}
              onSelect={choose}
            />
          ))}
        </div>
        <p>{entry.description}</p>
      </article>
    );
  }

  return (
    <>
      {selected.size > 0 && (
        <div className="picker-context">
          <span>Alongside</span>
          <div className="picker-context-colors" aria-label="Current palette colors">
            {[...selected].map(hex => (
              <span key={hex} title={hex} style={{ backgroundColor: hex }}>
                <span className="sr-only">{hex}</span>
              </span>
            ))}
          </div>
          <span className="picker-context-note">Your other colors stay in place.</span>
        </div>
      )}
      {full && (
        <p className="picker-limit" role="status">
          Your palette has six colors. Replace or remove a color first.
        </p>
      )}
      <Tabs.Root value={category} onValueChange={changeCategory} className="picker-tabs">
        <Tabs.List className="picker-tab-list" aria-label="Color sources">
          {CATEGORIES.map(([value, label]) => (
            <Tabs.Trigger value={value} key={value}>
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="picker-body" ref={bodyRef}>
          <Tabs.Content value={category} className="picker-tab-content">
            {category === 'suggested' && (
              <>
                <p className="picker-intro">
                  Companions from Wada combinations near your colors. Choose one to try alongside
                  them.
                </p>
                {pending ? (
                  <div className="picker-state" role="status">
                    <LoaderCircle size={18} className="picker-loading" aria-hidden="true" />
                    <p>Finding nearby Wada combinations…</p>
                  </div>
                ) : failure ? (
                  <div className="picker-state" role="status">
                    <p>{failure}</p>
                    <Button variant="outline" onClick={() => setRetry(value => value + 1)}>
                      Try again
                    </Button>
                  </div>
                ) : result?.status === 'ready' && result.suggestions.length > 0 ? (
                  <>
                    <div className="picker-suggestion-grid">
                      {result.suggestions.map(suggestion => (
                        <article
                          className="picker-suggestion"
                          key={`${suggestion.combinationId}-${suggestion.hex}`}
                        >
                          <button
                            className="picker-suggestion-select"
                            onClick={() => choose(suggestion.hex)}
                            disabled={full || selected.has(suggestion.hex)}
                            aria-label={`Choose ${suggestion.name} ${suggestion.hex} from Wada ${suggestion.combinationId}`}
                          >
                            <span className="picker-suggestion-palette" aria-hidden="true">
                              {[...selected].map(hex => (
                                <span key={hex} style={{ backgroundColor: hex }} />
                              ))}
                              <span
                                className="picker-suggestion-color"
                                style={{ backgroundColor: suggestion.hex }}
                              />
                            </span>
                            <span className="picker-suggestion-label">
                              <strong>{suggestion.name}</strong>
                              <span>{suggestion.hex}</span>
                            </span>
                            {selected.has(suggestion.hex) && (
                              <Check size={16} aria-label="Already in your palette" />
                            )}
                          </button>
                          <p className="picker-suggestion-source">
                            From Wada {String(suggestion.combinationId).padStart(3, '0')}
                          </p>
                          <details className="picker-suggestion-details">
                            <summary>Why this color</summary>
                            <p className="picker-suggestion-reason">
                              {suggestion.references.map((reference, index) => (
                                <span key={`${reference.inputHex}-${index}`}>
                                  {reference.inputHex === reference.referenceHex
                                    ? `Includes your ${reference.inputHex}.`
                                    : `${reference.referenceHex} is near your ${reference.inputHex}.`}
                                </span>
                              ))}
                            </p>
                          </details>
                        </article>
                      ))}
                    </div>
                    <p className="picker-footnote">
                      Wada values are digital sRGB approximations. Similarity is a starting point
                      for exploration; check contrast in the intended use.
                    </p>
                  </>
                ) : (
                  <div className="picker-state" role="status">
                    <p>
                      {colors.length === 0
                        ? 'Add another color to get suggestions for this palette.'
                        : result?.status === 'invalid-input'
                          ? 'Enter a valid source color to get suggestions.'
                          : result?.status === 'full'
                            ? 'Your palette has six colors. Replace or remove a color to try a companion.'
                            : 'No close Wada suggestions for these colors.'}
                    </p>
                    <p>Browse the library or enter a color of your own.</p>
                    <div className="picker-state-actions">
                      <Button variant="outline" onClick={() => changeCategory('wada')}>
                        Browse Wada
                      </Button>
                      <Button variant="ghost" onClick={() => changeCategory('custom')}>
                        Enter a hex
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            {librarySource && (
              <>
                <Input
                  aria-label="Search picker library"
                  placeholder={
                    category === 'radix'
                      ? 'Search families or hex values…'
                      : 'Search colors, combinations, or hex values…'
                  }
                  value={query}
                  onChange={event => {
                    setQuery(event.target.value);
                    setVisible(PAGE_SIZE);
                  }}
                />
                <div className="picker-library-description">
                  <p>
                    {category === 'radix'
                      ? 'Choose any step from an exact published Radix light scale.'
                      : category === 'werner'
                        ? 'Choose an individual color from Werner’s Nomenclature.'
                        : 'Choose an individual color from a Wada combination.'}
                  </p>
                  <details>
                    <summary>About this source</summary>
                    <p>{sourceDisclosures[category as 'wada' | 'werner' | 'radix']}</p>
                  </details>
                </div>
                {entries.length ? (
                  <>
                    <div
                      className={
                        category === 'werner'
                          ? 'picker-library-list picker-werner-list'
                          : 'picker-library-list'
                      }
                    >
                      {entries.slice(0, visible).map(renderLibraryEntry)}
                    </div>
                    <div ref={sentinelRef} className="picker-pagination">
                      <span aria-live="polite">
                        {Math.min(visible, entries.length)} of {entries.length}
                      </span>
                      {hasMore && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            setVisible(count => Math.min(count + PAGE_SIZE, entries.length))
                          }
                        >
                          Load more colors
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="picker-state">
                    <p>No colors match “{query}”.</p>
                    <Button variant="outline" onClick={() => setQuery('')}>
                      Clear search
                    </Button>
                  </div>
                )}
              </>
            )}
            {category === 'custom' && (
              <form
                className="picker-custom"
                onSubmit={event => {
                  event.preventDefault();
                  if (normalizedCustom) choose(normalizedCustom);
                }}
              >
                <label htmlFor="picker-custom-hex">Hex color</label>
                <div className="picker-custom-input">
                  <label
                    className="picker-native-color"
                    style={{ backgroundColor: normalizedCustom ?? '#FFFFFF' }}
                  >
                    <span className="sr-only">Choose a custom color</span>
                    <input
                      type="color"
                      aria-label="Choose a custom color"
                      value={normalizedCustom ?? '#FFFFFF'}
                      onChange={event => setCustom(event.target.value.toUpperCase())}
                    />
                  </label>
                  <Input
                    id="picker-custom-hex"
                    value={custom}
                    placeholder="#3257DC"
                    maxLength={7}
                    spellCheck={false}
                    aria-invalid={Boolean(custom && !normalizedCustom)}
                    aria-describedby="picker-custom-help"
                    onChange={event => setCustom(event.target.value)}
                  />
                </div>
                <p id="picker-custom-help">
                  {custom && !normalizedCustom
                    ? 'Enter a valid 3- or 6-digit hex, such as #3257DC.'
                    : duplicateCustom
                      ? 'This color is already in your palette.'
                      : 'Enter an exact hex or use the color picker.'}
                </p>
                <Button type="submit" disabled={!normalizedCustom || duplicateCustom || full}>
                  Use this color
                </Button>
              </form>
            )}
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </>
  );
}

export function ColorPicker({ open, onOpenChange, title, ...props }: ColorPickerProps) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="color-picker-overlay" />
        <Dialog.Content
          className="color-picker-dialog"
          onOpenAutoFocus={event => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            event.preventDefault();
            titleRef.current?.focus();
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
        >
          <div className="picker-header">
            <div>
              <Dialog.Title ref={titleRef} tabIndex={-1}>
                {title}
              </Dialog.Title>
              <Dialog.Description>
                Choose a library swatch or enter your own color.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close color picker">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          {open && <PickerBody {...props} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
