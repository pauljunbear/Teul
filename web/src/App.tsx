import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Copy,
  LoaderCircle,
  Moon,
  Plus,
  Save,
  Shuffle,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  analyzeStudioContrast,
  getStudioTextColor,
  exportStudioSystem,
  generateStudioSystem,
  libraryEntries,
  normalizeHex,
  sourceDisclosures,
  type StudioSystem,
  type StudioMethod,
  type StudioFamily,
  type StudioRadixFamily,
} from '@/lib/teul';
import {
  savedPaletteStore,
  type StoredSavedPalette,
  type SavedPaletteReference,
  type SavedPaletteSnapshot,
} from '@/lib/savedStore';
import { useProductSystem } from '@/lib/useProductSystem';
import type { StudioAuthoringSettings } from '@/lib/authoring';
import { downloadText } from '@/lib/download';
import { ColorPicker } from '@/components/ColorPicker';
import './App.css';

type Mode = 'light' | 'dark';
type ExportFormat = 'css' | 'json' | 'tailwind';
const START_COLORS = ['#3257DC', '#CB7252'];
const INITIAL = { name: 'Untitled palette', colors: START_COLORS, method: 'authored' as const };
let initialResult: Promise<StudioSystem> | undefined;
const ratio = (fg: string, bg: string) => analyzeStudioContrast(fg, bg).wcag.ratio;
const inkFor = getStudioTextColor;
const ProductSystemView = lazy(() => import('@/components/ProductSystemView'));
const GuidelineWorkspace = lazy(() => import('@/components/GuidelineWorkspace'));
const GUIDELINES_ENABLED = import.meta.env.DEV || import.meta.env.VITE_GUIDELINE_IMPORT === 'true';
const INITIAL_PRODUCT: StudioAuthoringSettings = {
  ...INITIAL,
  anchorIndex: 0,
  purpose: 'product-ui',
  neutrals: 'neutral',
};

function ColorInput({
  value,
  onChange,
  label,
  onRemove,
  onPick,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  onRemove?: () => void;
  onPick: () => void;
  disabled?: boolean;
}) {
  const normalized = normalizeHex(value);
  return (
    <div className="color-input">
      <button
        type="button"
        className="color-well"
        style={{ backgroundColor: normalized || '#EEEEEE' }}
        aria-label={`Choose ${label.toLowerCase()} from library`}
        disabled={disabled}
        onClick={onPick}
      />
      <Input
        aria-label={label}
        aria-invalid={!normalized}
        spellCheck={false}
        maxLength={7}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className="hex-input"
      />
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${label.toLowerCase()}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}

function ContrastBadge({
  fg,
  bg,
  label,
  minimum = 4.5,
}: {
  fg: string;
  bg: string;
  label: string;
  minimum?: number;
}) {
  const value = ratio(fg, bg);
  return (
    <div className="pair-row">
      <span>{label}</span>
      <span className="pair-value">
        {value.toFixed(2)}:1{' '}
        <Badge variant="outline" className={value >= minimum ? 'pass' : 'fail'}>
          {value >= minimum ? 'Pass' : 'Fail'}
        </Badge>
      </span>
    </div>
  );
}

function ComponentPreview({
  family,
  neutral,
  mode,
  step,
  onCheck,
}: {
  family: StudioFamily;
  neutral: StudioFamily;
  mode: Mode;
  step: number;
  onCheck: (foreground: string, background: string) => void;
}) {
  const scale = family[mode];
  const base = neutral[mode];
  const accent = scale[step];
  const onAccent = inkFor(accent);
  const link = [...scale].reverse().find(color => ratio(color, base[1]) >= 4.5) || scale[11];
  return (
    <section className="preview-section" aria-label="Component preview">
      <div className="section-heading">
        <h2>See it in use</h2>
        <span>
          {family.name} · Step {step + 1}
        </span>
      </div>
      <div className="preview-grid">
        <div className="preview-canvas" style={{ background: base[0], color: base[11] }}>
          <article className="sample-card" style={{ background: base[1], borderColor: base[5] }}>
            <div className="sample-eyebrow" style={{ color: base[10] }}>
              YOUR WORKSPACE
            </div>
            <div className="sample-art" aria-hidden="true">
              <div style={{ background: accent }} />
              <div style={{ background: scale[3] }} />
              <div style={{ background: scale[6] }} />
            </div>
            <h3>Good things take shape.</h3>
            <p style={{ color: base[10] }}>
              A little structure. Room to explore. Make something that feels like you.
            </p>
            <div className="sample-actions">
              <span className="sample-button" style={{ background: accent, color: onAccent }}>
                Create project <Plus size={14} />
              </span>
              <span className="sample-link" style={{ color: link }}>
                View details <ArrowUpRight size={14} />
              </span>
            </div>
          </article>
        </div>
        <div className="preview-checks">
          <div className="eyebrow">WCAG 2.2 · ACTUAL PAIRS</div>
          <ContrastBadge fg={onAccent} bg={accent} label="Button label" />
          <ContrastBadge fg={base[11]} bg={base[1]} label="Heading" />
          <ContrastBadge fg={base[10]} bg={base[1]} label="Body text" />
          <ContrastBadge fg={link} bg={base[1]} label="Link text" />
          <ContrastBadge fg={accent} bg={base[1]} label="Button boundary" minimum={3} />
          <p className="fine-print">
            Text checks use 4.5:1. The button boundary uses 3:1. These checks apply to this preview;
            review every state in your product.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="check-pair"
            onClick={() => onCheck(onAccent, accent)}
          >
            Check button colors <ArrowUpRight size={14} />
          </Button>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [tab, setTab] = useState('create');
  const [guidelineVisited, setGuidelineVisited] = useState(false);
  const [name, setName] = useState(INITIAL.name);
  const [colors, setColors] = useState<string[]>(START_COLORS);
  const [method, setMethod] = useState<StudioMethod>('authored');
  const [radixFamily, setRadixFamily] = useState<StudioRadixFamily | undefined>();
  const [system, setSystem] = useState<StudioSystem | null>(null);
  const [scaleBusy, setBusy] = useState(true);
  const [creationKind, setCreationKind] = useState<'product' | 'scales'>('product');
  const [anchorIndex, setAnchorIndex] = useState(0);
  const [purpose, setPurpose] = useState<StudioAuthoringSettings['purpose']>('product-ui');
  const [neutrals, setNeutrals] = useState<StudioAuthoringSettings['neutrals']>('neutral');
  const product = useProductSystem(INITIAL_PRODUCT);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [familyIndex, setFamilyIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('light');
  const [step, setStep] = useState(8);
  const [format, setFormat] = useState<ExportFormat>('css');
  const [source, setSource] = useState('wada');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(36);
  const [pickerTarget, setPickerTarget] = useState<
    number | 'add' | 'foreground' | 'background' | null
  >(null);
  const [librarySentinel, setLibrarySentinel] = useState<HTMLDivElement | null>(null);
  const [saved, setSaved] = useState<StoredSavedPalette[]>([]);
  const [retainedCount, setRetainedCount] = useState(0);
  const [savedLoading, setSavedLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const busy = scaleBusy || product.busy || saving;
  const [savedReference, setSavedReference] = useState<
    (SavedPaletteReference & { kind: 'product' | 'scales' }) | null
  >(null);
  const [foreground, setForeground] = useState('#FFFFFF');
  const [background, setBackground] = useState('#3257DC');
  const generation = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    initialResult ??= generateStudioSystem(INITIAL);
    initialResult
      .then(result => {
        if (active && generation.current === 0) setSystem(result);
      })
      .catch(err => {
        if (active)
          setError(err instanceof Error ? err.message : 'Could not generate the palette.');
      })
      .finally(() => {
        if (active && generation.current === 0) setBusy(false);
      });
    return () => {
      active = false;
      clearTimeout(noticeTimer.current);
    };
  }, []);

  function applySnapshot(snapshot: SavedPaletteSnapshot) {
    setSaved(snapshot.palettes);
    setRetainedCount(snapshot.retainedCount);
  }

  useEffect(() => {
    let active = true;
    let revision = 0;
    async function refresh() {
      const request = ++revision;
      const result = await savedPaletteStore.list();
      if (!active || request !== revision) return;
      if (result.status === 'listed') applySnapshot(result.snapshot);
      else setError(result.message);
      setSavedLoading(false);
    }
    void refresh();
    const unsubscribe = savedPaletteStore.subscribe(snapshot => {
      if (snapshot) {
        revision++;
        applySnapshot(snapshot);
      } else void refresh();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function notify(message: string) {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(''), 3500);
  }

  async function copy(text: string, message = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      setError('Clipboard access is unavailable. Use Download to save the export.');
    }
  }

  async function generateScales(input = { name, colors, method, radixFamily }) {
    if (input.colors.some(color => !normalizeHex(color))) {
      setError('Use a valid 3- or 6-digit hex color for every source.');
      return;
    }
    const request = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const result = await generateStudioSystem(input);
      if (request !== generation.current) return;
      setSystem(result);
      setFamilyIndex(0);
      setStep((result.families[0]?.radixMatch?.step ?? 9) - 1);
      setMode(result.families[0]?.radixMatch?.mode ?? 'light');
      setColors(result.sourceColors);
      setName(result.name);
      setMethod(result.method);
      setRadixFamily(result.radixFamily);
      return true;
    } catch (err) {
      if (request === generation.current)
        setError(
          err instanceof Error
            ? err.message
            : 'Generation failed. Your previous result is still available.'
        );
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }

  async function generate() {
    setError('');
    if (creationKind === 'scales') return generateScales();
    const input = { name, colors, anchorIndex, purpose, neutrals };
    if (await product.run(input)) {
      setName(name.trim() || 'Untitled system');
      setColors(colors.map(color => normalizeHex(color)!));
    }
  }

  async function openPalette(
    palette: {
      name: string;
      colors: string[];
      method?: StudioMethod;
      radixFamily?: StudioRadixFamily;
    },
    stored?: StoredSavedPalette
  ) {
    if (busy) return;
    const input = {
      name: palette.name,
      colors:
        palette.radixFamily && palette.colors.length === 12
          ? [palette.colors[8]]
          : palette.colors.slice(0, 6),
      method: palette.method || ('authored' as StudioMethod),
      radixFamily: palette.radixFamily,
    };
    setName(input.name);
    setColors(input.colors);
    setError('');
    setMethod(input.method);
    setRadixFamily(input.radixFamily);
    setTab('create');
    setSavedReference(null);
    if (stored?.applicationSettings && stored.recipeJson) {
      const settings = stored.applicationSettings;
      setCreationKind('product');
      setAnchorIndex(settings.anchorIndex);
      setPurpose(settings.purpose);
      setNeutrals(settings.neutrals);
      if (await product.run(settings, stored.recipeJson))
        setSavedReference({ id: stored.id, revision: stored.revision, kind: 'product' });
    } else if (stored || input.method === 'radix' || creationKind === 'scales') {
      setCreationKind('scales');
      product.cancel();
      if (await generateScales(input))
        if (stored) setSavedReference({ id: stored.id, revision: stored.revision, kind: 'scales' });
    } else {
      setAnchorIndex(0);
      await product.run({ ...input, anchorIndex: 0, purpose, neutrals });
    }
  }

  async function save(asCopy = false) {
    if (dirty || busy || saving) return;
    setSaving(true);
    try {
      const input =
        creationKind === 'product' && product.selected && product.result
          ? {
              name: product.result.settings.name,
              colors: product.result.settings.colors,
              method: 'authored' as const,
              recipeJson: (await import('@/lib/authoring')).serializeStudioAuthoring(
                product.selected.recipe
              ),
              applicationSettings: product.result.settings,
            }
          : creationKind === 'scales' && system
            ? {
                name: system.name,
                colors: system.sourceColors,
                method: system.method,
                radixFamily: system.radixFamily,
              }
            : null;
      if (!input) return;
      const previous =
        !asCopy && savedReference?.kind === creationKind ? savedReference : undefined;
      const result = await savedPaletteStore.save(input, previous);
      if (result.status !== 'saved') {
        setError(result.message);
        return;
      }
      applySnapshot(result.snapshot);
      setError('');
      setSavedReference({
        id: result.palette.id,
        revision: result.palette.revision,
        kind: creationKind,
      });
      notify('Saved to Library → Saved on this device');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not save this system. Download a copy to keep your work.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteSaved(item: StoredSavedPalette) {
    const result = await savedPaletteStore.delete(item.id, item.revision);
    if (result.status === 'deleted') applySnapshot(result.snapshot);
    else setError(result.message);
  }

  async function recoverSaved() {
    const result = await savedPaletteStore.exportRecovery();
    if (result.status === 'exported') downloadText('teul-saved-recovery', result.json, 'json');
    else setError(result.message);
  }

  function download() {
    if (!system || dirty || busy) return;
    const text = exportStudioSystem(system, format);
    downloadText(system.name, text, format === 'tailwind' ? 'tailwind.js' : format);
    notify('Export downloaded');
  }

  const invalid = colors.some(color => !normalizeHex(color));
  const scaleDirty =
    system &&
    (name !== system.name ||
      method !== system.method ||
      radixFamily !== system.radixFamily ||
      colors.join(',').toUpperCase() !== system.sourceColors.join(','));
  const productDirty =
    !!product.result &&
    (name !== product.result.settings.name ||
      colors.join(',').toUpperCase() !== product.result.settings.colors.join(',') ||
      anchorIndex !== product.result.settings.anchorIndex ||
      purpose !== product.result.settings.purpose ||
      neutrals !== product.result.settings.neutrals);
  const dirty = creationKind === 'product' ? productDirty : !!scaleDirty;
  const hasResult = creationKind === 'product' ? !!product.selected : !!system;
  const family = system?.families[familyIndex] || system?.families[0];
  const entries = libraryEntries.filter(
    entry =>
      entry.source === source &&
      `${entry.name} ${entry.description} ${entry.colors.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  const fg = normalizeHex(foreground),
    bg = normalizeHex(background);
  const contrast = fg && bg ? analyzeStudioContrast(fg, bg) : null;

  useEffect(() => {
    const target = librarySentinel;
    if (
      tab !== 'library' ||
      source === 'saved' ||
      !target ||
      visible >= entries.length ||
      !('IntersectionObserver' in window)
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(count => Math.min(count + 36, entries.length));
      },
      { rootMargin: '240px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [tab, source, query, visible, entries.length, librarySentinel]);

  function openSaved() {
    setTab('library');
    setSource('saved');
    setQuery('');
  }
  function checkPair(foreground: string, background: string) {
    setForeground(foreground);
    setBackground(background);
    setTab('contrast');
  }
  function selectColor(hex: string) {
    if (pickerTarget === 'foreground') setForeground(hex);
    else if (pickerTarget === 'background') setBackground(hex);
    else if (pickerTarget === 'add' && colors.length < 6) {
      setColors(previous => [...previous, hex]);
      setRadixFamily(undefined);
    } else if (typeof pickerTarget === 'number') {
      setColors(previous => previous.map((color, index) => (index === pickerTarget ? hex : color)));
      setRadixFamily(undefined);
    }
    setPickerTarget(null);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          href="#"
          className="wordmark"
          aria-label="Teul Studio home"
          onClick={event => {
            event.preventDefault();
            setTab('create');
          }}
        >
          <span className="teul-mark" aria-hidden="true">
            틀
          </span>
          teul<span className="wordmark-label">Color studio</span>
        </a>
        <span className="header-note">
          <span className="status-dot" />
          Made for exploration
        </span>
      </header>
      <Tabs
        value={tab}
        onValueChange={value => {
          setTab(value);
          if (value === 'guidelines') setGuidelineVisited(true);
        }}
        className="main-tabs"
      >
        <div className="navigation">
          <TabsList variant="line" aria-label="Studio views">
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="contrast">Contrast</TabsTrigger>
            {GUIDELINES_ENABLED && <TabsTrigger value="guidelines">Guidelines</TabsTrigger>}
          </TabsList>
          <Button variant="ghost" size="sm" aria-label="Open saved palettes" onClick={openSaved}>
            <Save size={14} /> Saved <span className="saved-count">{saved.length}</span>
          </Button>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss error"
              onClick={() => setError('')}
            >
              <X size={14} />
            </Button>
          </div>
        )}
        {GUIDELINES_ENABLED && guidelineVisited && (
          <TabsContent value="guidelines" forceMount hidden={tab !== 'guidelines'}>
            <Suspense
              fallback={
                <p role="status" style={{ padding: 48 }}>
                  Opening guideline workspace…
                </p>
              }
            >
              <GuidelineWorkspace />
            </Suspense>
          </TabsContent>
        )}
        <TabsContent value="create" className="create-layout">
          <aside className="controls-panel">
            <div className="eyebrow">START WITH YOUR COLORS</div>
            <h1>{creationKind === 'product' ? 'Build a color system.' : 'Build a palette.'}</h1>
            <p className="intro">Start with your colors. Find their companions. See them in use.</p>
            <label className="field-label" htmlFor="creation-kind">
              Create
            </label>
            <select
              id="creation-kind"
              className="select-control creation-kind"
              disabled={saving}
              value={creationKind}
              onChange={event => {
                product.cancel();
                setCreationKind(event.target.value as 'product' | 'scales');
              }}
            >
              <option value="product">Product system</option>
              <option value="scales">Color scales</option>
            </select>
            <label className="field-label" htmlFor="palette-name">
              Palette name
            </label>
            <Input
              id="palette-name"
              value={name}
              maxLength={80}
              disabled={busy}
              onChange={event => setName(event.target.value)}
            />
            <div className="field-heading">
              <span className="field-label">Source colors</span>
              <span>{colors.length} / 6</span>
            </div>
            <div className="source-inputs">
              {colors.map((color, index) => (
                <ColorInput
                  key={index}
                  label={`Source color ${index + 1}`}
                  value={color}
                  disabled={busy}
                  onPick={() => setPickerTarget(index)}
                  onChange={value => {
                    setRadixFamily(undefined);
                    setColors(prev => prev.map((item, i) => (i === index ? value : item)));
                  }}
                  onRemove={
                    colors.length > 1
                      ? () => {
                          setRadixFamily(undefined);
                          setColors(prev => prev.filter((_, i) => i !== index));
                          setAnchorIndex(prev =>
                            prev === index ? 0 : prev > index ? prev - 1 : prev
                          );
                        }
                      : undefined
                  }
                />
              ))}
            </div>
            {invalid && <p className="input-error">Enter a valid hex, such as #3257DC.</p>}
            <Button
              variant="ghost"
              className="add-color"
              disabled={busy || colors.length >= 6}
              onClick={() => setPickerTarget('add')}
            >
              <Plus size={14} />
              Add color
            </Button>
            {creationKind === 'product' ? (
              <div className="product-controls">
                <label className="field-label" htmlFor="product-accent">
                  Primary accent
                </label>
                <select
                  id="product-accent"
                  className="select-control"
                  disabled={busy}
                  value={anchorIndex}
                  onChange={event => setAnchorIndex(Number(event.target.value))}
                >
                  {colors.map((color, index) => (
                    <option key={index} value={index}>
                      Color {index + 1} · {color}
                    </option>
                  ))}
                </select>
                <label className="field-label" htmlFor="product-purpose">
                  Use the accent
                </label>
                <select
                  id="product-purpose"
                  className="select-control"
                  disabled={busy}
                  value={purpose}
                  onChange={event => setPurpose(event.target.value as typeof purpose)}
                >
                  <option value="product-ui">Adapt for accessible controls</option>
                  <option value="exact-accent">Keep exact resting color</option>
                </select>
                <p className="control-note">
                  {purpose === 'product-ui'
                    ? 'Keep the original in the scale. Select usable shades for each component state.'
                    : 'Require the exact accent for buttons and links in both modes. Some colors cannot meet these constraints.'}
                </p>
                <label className="field-label" htmlFor="product-neutrals">
                  Supporting neutrals
                </label>
                <select
                  id="product-neutrals"
                  className="select-control"
                  disabled={busy}
                  value={neutrals}
                  onChange={event => setNeutrals(event.target.value as typeof neutrals)}
                >
                  <option value="neutral">Neutral</option>
                  <option value="warm">Warm</option>
                  <option value="cool">Cool</option>
                </select>
              </div>
            ) : (
              <>
                <label className="field-label" htmlFor="scale-method">
                  Build with
                </label>
                <select
                  id="scale-method"
                  className="select-control"
                  value={method}
                  disabled={busy}
                  onChange={event => {
                    setMethod(event.target.value as StudioMethod);
                    setRadixFamily(undefined);
                  }}
                >
                  <option value="authored">Preserve my colors</option>
                  <option value="radix">Match to Radix</option>
                </select>
                <p className="control-note">
                  {method === 'authored'
                    ? 'Originals stay pinned. Teul builds the steps around them.'
                    : radixFamily
                      ? `Using the exact ${radixFamily} family selected from the library. Editing the source returns to nearest-family matching.`
                      : 'Choose an existing Radix accent scale by its closest swatch. This can change your color; the match is shown beside the result.'}
                </p>
              </>
            )}
            <Button
              className="generate-button"
              disabled={busy || invalid}
              onClick={() => void generate()}
            >
              {busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
              {busy ? 'Building your system…' : 'Generate system'}
            </Button>
            {product.busy && (
              <Button variant="ghost" className="cancel-generation" onClick={product.cancel}>
                Cancel generation
              </Button>
            )}
            <div className="sidebar-bottom">
              <span className="eyebrow">NEED A STARTING POINT?</span>
              <button onClick={() => setTab('library')}>
                Explore the color library <ArrowUpRight size={14} />
              </button>
              <p>Wada, Werner, and exact Radix families.</p>
            </div>
          </aside>
          <main className="workspace" aria-busy={busy}>
            <div className="workspace-heading">
              <div>
                <span className="eyebrow">
                  {creationKind === 'product' ? 'YOUR PRODUCT SYSTEM' : 'YOUR PALETTE'}
                </span>
                <h2>
                  {(creationKind === 'product' ? product.result?.settings.name : system?.name) ||
                    'Building a starting point'}
                </h2>
                {creationKind === 'product' && product.selected && (
                  <p className="workspace-summary">
                    Originals preserved · Complete light and dark states
                  </p>
                )}
                {creationKind === 'scales' && system && (
                  <p className="workspace-summary">
                    {system.sourceColors.length} source colors ·{' '}
                    {system.method === 'authored'
                      ? 'Originals preserved'
                      : system.radixFamily
                        ? 'Exact Radix library'
                        : 'Matched Radix scales'}
                  </p>
                )}
              </div>
              <div className="save-actions">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasResult || busy || dirty || saving}
                  onClick={() => void save()}
                  title={
                    dirty
                      ? 'Generate the updated palette before saving'
                      : 'Save to Library → Saved on this device'
                  }
                >
                  <Save size={14} />
                  Save
                </Button>
                {savedReference?.kind === creationKind && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!hasResult || busy || dirty || saving}
                    onClick={() => void save(true)}
                  >
                    Save as copy
                  </Button>
                )}
              </div>
            </div>
            {dirty && (
              <div className="draft-note" role="status">
                <span>
                  Preview shows your last generated{' '}
                  {creationKind === 'product' ? 'product system' : 'palette'}.
                </span>
                <strong>Generate to apply your changes before saving or exporting.</strong>
              </div>
            )}
            {creationKind === 'product' && product.message && (
              <p className="diagnostic" role="status">
                {product.message}
              </p>
            )}
            {creationKind === 'product' ? (
              <Suspense fallback={<div className="empty-state">Preparing product controls…</div>}>
                <ProductSystemView
                  result={product.result}
                  selected={product.selected}
                  busy={busy}
                  dirty={dirty}
                  onSelect={product.select}
                  onCopy={copy}
                  onError={setError}
                  onNotice={notify}
                />
              </Suspense>
            ) : system && family ? (
              <>
                <div className="source-swatches">
                  {system.sourceColors.map((color, index) => (
                    <button
                      key={`${color}-${index}`}
                      className="source-swatch"
                      onClick={() => void copy(color, `${color} copied`)}
                      style={{ background: color, color: inkFor(color) }}
                      aria-label={`Copy original color ${color}`}
                    >
                      <span>
                        {system.method === 'radix' ? 'REFERENCE' : 'ORIGINAL'}{' '}
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <strong>{color}</strong>
                      <Copy size={14} />
                    </button>
                  ))}
                </div>
                <div className="scale-toolbar">
                  <div className="family-tabs" aria-label="Color families">
                    {system.families.map((item, index) => (
                      <button
                        key={item.id}
                        className={familyIndex === index ? 'active' : ''}
                        aria-pressed={familyIndex === index}
                        onClick={() => {
                          setFamilyIndex(index);
                          setStep((item.radixMatch?.step ?? 9) - 1);
                          setMode(item.radixMatch?.mode ?? mode);
                        }}
                      >
                        <i style={{ background: item.light[8] }} />
                        {item.name}
                      </button>
                    ))}
                  </div>
                  <div className="mode-switch" role="group" aria-label="Scale mode">
                    <Button
                      size="icon-sm"
                      variant={mode === 'light' ? 'secondary' : 'ghost'}
                      aria-label="Light mode"
                      aria-pressed={mode === 'light'}
                      onClick={() => setMode('light')}
                    >
                      <Sun size={15} />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant={mode === 'dark' ? 'secondary' : 'ghost'}
                      aria-label="Dark mode"
                      aria-pressed={mode === 'dark'}
                      onClick={() => setMode('dark')}
                    >
                      <Moon size={15} />
                    </Button>
                  </div>
                </div>
                {family.radixMatch && (
                  <div className="match-explanation">
                    <div className="match-swatches">
                      <span>
                        <i style={{ background: family.sourceHex }} />
                        Your color <code>{family.sourceHex}</code>
                      </span>
                      <ArrowUpRight size={14} aria-hidden="true" />
                      <span>
                        <i style={{ background: family.radixMatch.hex }} />
                        {family.name} {family.radixMatch.step}
                        <code>{family.radixMatch.hex}</code>
                      </span>
                    </div>
                    <p>
                      Closest swatch in Radix's accent scales · {family.radixMatch.mode} step{' '}
                      {family.radixMatch.step}. A library match, with its own hue and intensity.
                    </p>
                    <Button
                      variant="link"
                      size="sm"
                      disabled={busy || !!dirty}
                      onClick={() =>
                        void generateScales({
                          name,
                          colors,
                          method: 'authored',
                          radixFamily: undefined,
                        })
                      }
                    >
                      Keep my exact colors instead
                    </Button>
                  </div>
                )}
                <div className="scale-grid" aria-label={`${family.name} ${mode} scale`}>
                  {family[mode].map((color, index) => (
                    <button
                      key={index}
                      aria-label={`Step ${index + 1}: ${color}`}
                      aria-pressed={step === index}
                      className={step === index ? 'scale-step selected' : 'scale-step'}
                      onClick={() => setStep(index)}
                    >
                      <span
                        className="step-color"
                        style={{ background: color, color: inkFor(color) }}
                      >
                        {step === index && <Check size={16} />}
                      </span>
                      <span className="step-number">
                        {index + 1}
                        {system.method === 'authored' && index === 8 ? (
                          <i title="Original source color" />
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
                {system.method === 'radix' && (
                  <div className="scale-roles" aria-label="Radix step roles">
                    <span>1–2 · Backgrounds</span>
                    <span>3–5 · Surfaces</span>
                    <span>6–8 · Borders</span>
                    <span>9–10 · Accents</span>
                    <span>11–12 · Text</span>
                  </div>
                )}
                <div className="scale-caption">
                  <span>
                    {system.method === 'authored'
                      ? 'Teul authored · original at step 9'
                      : 'Exact Radix · published values'}
                    <span className="caption-dot">·</span>12 steps
                  </span>
                  <button
                    className="copy-hex"
                    onClick={() => void copy(family[mode][step], `${family[mode][step]} copied`)}
                  >
                    {family[mode][step]}
                    <Copy size={13} />
                  </button>
                </div>
                <ComponentPreview
                  family={family}
                  neutral={system.neutral}
                  mode={mode}
                  step={step}
                  onCheck={checkPair}
                />
                {system.diagnostics
                  .filter(item => item.level !== 'info')
                  .map((item, index) => (
                    <p className="diagnostic" role="status" key={index}>
                      {item.message}
                    </p>
                  ))}
                <div className="export-bar">
                  <div>
                    <h2>Export your system</h2>
                    <p>All families, both modes, and a companion neutral.</p>
                  </div>
                  <div className="export-actions">
                    <select
                      className="select-control"
                      value={format}
                      aria-label="Export format"
                      onChange={event => setFormat(event.target.value as ExportFormat)}
                    >
                      <option value="css">CSS variables</option>
                      <option value="json">JSON</option>
                      <option value="tailwind">Tailwind</option>
                    </select>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Copy export"
                      disabled={busy || !!dirty}
                      onClick={() => void copy(exportStudioSystem(system, format))}
                    >
                      <Copy size={15} />
                    </Button>
                    <Button onClick={download} disabled={busy || !!dirty}>
                      <ArrowDownToLine size={15} />
                      Download
                    </Button>
                  </div>
                </div>
                <details className="source-details">
                  <summary>About this system</summary>
                  <p>{sourceDisclosures[system.method]}</p>
                  <p>{system.sourcePreservation.scope}</p>
                  <p>
                    Companion neutral: {system.neutral.name}, exact Radix. No brand guidelines were
                    imported. The preview is a starting point for review.
                  </p>
                </details>
              </>
            ) : (
              <div className="empty-state">
                <LoaderCircle className={busy ? 'spin' : ''} size={28} />
                <p>
                  {busy
                    ? 'Building light and dark scales around your colors.'
                    : 'Enter your colors and generate a system.'}
                </p>
              </div>
            )}
          </main>
        </TabsContent>
        <TabsContent value="library" className="library-page">
          <div className="page-title">
            <div>
              <span className="eyebrow">THE COLOR LIBRARY</span>
              <h1>{source === 'saved' ? 'Your saved palettes.' : 'Find your starting point.'}</h1>
              <p>
                {source === 'saved'
                  ? 'Pick up where you left off, on this device.'
                  : 'Explore a century of color. Choose a palette and make it your own.'}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const options = libraryEntries.filter(item => item.source === 'wada');
                const chosen = options[Math.floor(Math.random() * options.length)];
                openPalette(chosen);
              }}
            >
              <Shuffle size={15} />
              Surprise me
            </Button>
          </div>
          <div className="library-toolbar">
            <div className="filter-tabs" role="group" aria-label="Library source">
              {[
                ['wada', 'Sanzo Wada'],
                ['werner', 'Werner'],
                ['radix', 'Radix'],
                ['saved', `Saved (${saved.length})`],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  variant={source === value ? 'secondary' : 'ghost'}
                  aria-pressed={source === value}
                  onClick={() => {
                    setSource(value);
                    setVisible(36);
                    setQuery('');
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Input
              aria-label="Search library"
              placeholder="Search colors or combinations…"
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setVisible(36);
              }}
            />
          </div>
          <div className="library-context">
            <span>
              {source === 'saved'
                ? `${saved.length} saved palettes`
                : `${entries.length} ${source === 'radix' ? 'scales' : source === 'werner' ? 'colors' : 'combinations'}`}
            </span>
            <span>
              {source === 'saved'
                ? 'This browser only'
                : source === 'radix'
                  ? 'Exact published values'
                  : 'Historical digital approximations'}
            </span>
          </div>
          <p className="library-disclosure">
            {source === 'saved'
              ? 'Saved in this browser. Product recipes reopen only after the current engine reproduces their selected colors and states. Legacy palettes rebuild their scales.'
              : sourceDisclosures[source as 'wada' | 'werner' | 'radix']}
          </p>
          {source === 'saved' && (
            <div className="saved-recovery">
              {retainedCount > 0 && (
                <p role="status">
                  {retainedCount} unrecognized {retainedCount === 1 ? 'record is' : 'records are'}{' '}
                  retained unchanged. Download a recovery archive to keep the original data.
                </p>
              )}
              <Button variant="ghost" size="sm" onClick={() => void recoverSaved()}>
                <ArrowDownToLine size={14} />
                Download saved-data archive
              </Button>
            </div>
          )}
          <div className="library-grid">
            {source === 'saved'
              ? saved
                  .filter(item =>
                    `${item.name} ${item.colors.join(' ')}`
                      .toLowerCase()
                      .includes(query.toLowerCase())
                  )
                  .map(item => (
                    <article className="library-card" key={item.id}>
                      <button
                        className="library-open"
                        disabled={busy}
                        onClick={() => void openPalette(item, item)}
                      >
                        <div className="library-swatches">
                          {item.colors.map((color, i) => (
                            <span key={i} style={{ background: color }} />
                          ))}
                        </div>
                        <div className="library-card-meta">
                          <h2>{item.name}</h2>
                          <span>
                            {item.colors.length} colors ·{' '}
                            {item.recipeJson
                              ? 'Product system'
                              : item.method === 'radix'
                                ? 'Radix'
                                : 'Teul'}
                          </span>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="remove-saved"
                        aria-label={`Delete ${item.name}`}
                        onClick={() => void deleteSaved(item)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </article>
                  ))
              : entries.slice(0, visible).map(item => (
                  <button
                    key={item.id}
                    className="library-card library-open"
                    disabled={busy}
                    onClick={() =>
                      openPalette({
                        ...item,
                        method: item.source === 'radix' ? 'radix' : 'authored',
                      })
                    }
                  >
                    {item.source === 'radix' ? (
                      <>
                        <div
                          className="radix-specimen"
                          style={{ background: item.colors[8], color: inkFor(item.colors[8]) }}
                        >
                          <span>RADIX · STEP 9</span>
                          <strong>{item.colors[8]}</strong>
                        </div>
                        <div className="library-mini-scale">
                          {item.colors.map((color, index) => (
                            <span
                              key={index}
                              style={{ background: color }}
                              title={`Step ${index + 1}: ${color}`}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="library-swatches">
                        {item.colors.map((color, index) => (
                          <span key={index} style={{ background: color }} />
                        ))}
                      </div>
                    )}
                    <div className="library-card-meta">
                      <h2>{item.name}</h2>
                      <span>
                        {item.radixFamily === 'gold'
                          ? 'Muted brown-gold. For a brighter golden yellow, explore Amber.'
                          : item.description}
                      </span>
                    </div>
                  </button>
                ))}
          </div>
          {source !== 'saved' && !entries.length && (
            <div className="empty-state">
              No matches. Try a color name, hex, or combination number.
            </div>
          )}
          {source === 'saved' && !saved.length && (
            <div className="empty-state">
              {savedLoading
                ? 'Loading your saved work…'
                : 'Save a generated palette and it will appear here.'}
            </div>
          )}
          {source !== 'saved' && entries.length > visible && (
            <div className="library-sentinel" ref={setLibrarySentinel} aria-hidden="true" />
          )}
          {source !== 'saved' && entries.length > visible && (
            <Button
              variant="outline"
              className="show-more"
              onClick={() => setVisible(prev => prev + 36)}
            >
              Show more · {entries.length - visible} remaining
            </Button>
          )}
          {source !== 'saved' && entries.length > 0 && (
            <p className="library-progress" role="status">
              {Math.min(visible, entries.length)} of {entries.length}
              {visible >= entries.length
                ? ' · You have reached the end'
                : ' · More appear as you scroll'}
            </p>
          )}
        </TabsContent>
        <TabsContent value="contrast" className="contrast-page">
          <div className="page-title">
            <div>
              <span className="eyebrow">CHECK THE PAIR, NOT JUST THE COLOR</span>
              <h1>Check readability.</h1>
              <p>
                See whether text has enough contrast against its background. Test a pair from your
                palette or enter your own.
              </p>
            </div>
          </div>
          {family && creationKind === 'scales' && (
            <Button
              className="use-selected-pair"
              variant="outline"
              disabled={busy || !!dirty}
              onClick={() => checkPair(inkFor(family[mode][step]), family[mode][step])}
            >
              Use selected palette color{' '}
              <span className="inline-swatch" style={{ background: family[mode][step] }} />
              {family[mode][step]}
            </Button>
          )}
          <div className="contrast-layout">
            <div className="contrast-controls">
              <label className="field-label">Foreground</label>
              <ColorInput
                label="Foreground color"
                value={foreground}
                onChange={setForeground}
                onPick={() => setPickerTarget('foreground')}
              />
              <Button
                variant="ghost"
                className="swap-button"
                onClick={() => {
                  setForeground(background);
                  setBackground(foreground);
                }}
              >
                <ArrowLeftRight size={15} />
                Swap colors
              </Button>
              <label className="field-label">Background</label>
              <ColorInput
                label="Background color"
                value={background}
                onChange={setBackground}
                onPick={() => setPickerTarget('background')}
              />
              {!contrast && (
                <p className="input-error" role="alert">
                  Enter two valid hex colors to calculate contrast.
                </p>
              )}
              <p className="control-note">
                Normal text needs 4.5:1 for AA; large text needs 3:1. Large means at least 24px
                regular or about 18.7px bold.
              </p>
            </div>
            <div
              className="contrast-sample"
              style={{ color: fg || '#151515', background: bg || '#F0F0F0' }}
            >
              <span className="contrast-aa">Aa</span>
              <h2>A clearer point of view.</h2>
              <p>
                This is normal body text. Read it at a comfortable size, on the actual background
                where it will live.
              </p>
            </div>
          </div>
          {contrast && (
            <p className="contrast-verdict" role="status">
              {contrast.wcag.aa
                ? 'This pair passes WCAG AA for normal text.'
                : contrast.wcag.aaLarge
                  ? 'This pair passes for large text only. Increase contrast for body text.'
                  : 'This pair does not pass WCAG AA for text. Try a lighter background or darker text.'}
            </p>
          )}
          {contrast && (
            <div className="contrast-results">
              <div className="ratio-result">
                <strong>
                  {contrast.wcag.ratio.toFixed(2)}
                  <span>:1</span>
                </strong>
                <span>WCAG contrast ratio</span>
              </div>
              {[
                ['AA · Normal text', contrast.wcag.aa, '4.5:1 minimum'],
                ['AA · Large text', contrast.wcag.aaLarge, '3:1 minimum'],
                ['AAA · Normal text', contrast.wcag.aaa, '7:1 minimum'],
              ].map(([label, passes, threshold]) => (
                <div className="contrast-result" key={String(label)}>
                  <span>{label}</span>
                  <Badge className={passes ? 'pass' : 'fail'} variant="outline">
                    {passes ? 'Pass' : 'Fail'}
                  </Badge>
                  <small>{threshold}</small>
                </div>
              ))}
            </div>
          )}
          {contrast && (
            <details className="source-details">
              <summary>Supplemental APCA reading</summary>
              <p>
                Lc {contrast.apca.lc.toFixed(1)}. APCA is an experimental supplemental metric here;
                WCAG results above determine the stated pass/fail checks.
              </p>
            </details>
          )}
        </TabsContent>
      </Tabs>
      <ColorPicker
        open={pickerTarget !== null}
        onOpenChange={open => {
          if (!open) setPickerTarget(null);
        }}
        title={
          pickerTarget === 'add'
            ? 'Add a color'
            : pickerTarget === 'foreground'
              ? 'Choose text color'
              : pickerTarget === 'background'
                ? 'Choose background color'
                : 'Replace color'
        }
        colors={
          typeof pickerTarget === 'number'
            ? colors.filter((_, index) => index !== pickerTarget)
            : pickerTarget === 'foreground'
              ? [background]
              : pickerTarget === 'background'
                ? [foreground]
                : colors
        }
        initialColor={
          typeof pickerTarget === 'number'
            ? colors[pickerTarget]
            : pickerTarget === 'foreground'
              ? foreground
              : pickerTarget === 'background'
                ? background
                : undefined
        }
        onSelect={selectColor}
      />
      <footer className="app-footer">
        <span>
          Teul <span aria-hidden="true">/</span> A place to work with color.
        </span>
        <span>Source-aware. Made to be explored.</span>
      </footer>
      <div className={notice ? 'toast visible' : 'toast'} role="status" aria-live="polite">
        {notice && (
          <>
            <Check size={15} />
            {notice}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
