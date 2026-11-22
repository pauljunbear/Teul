import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  BracketsCurly,
  Check,
  CheckCircle,
  Copy,
  DownloadSimple,
  Eye,
  FloppyDisk,
  GearSix,
  GridFour,
  MagicWand,
  MagnifyingGlass,
  Palette,
  Plus,
  SlidersHorizontal,
  SquaresFour,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { colorGroups, contrastBetween, contrastLabel, getWadaCombinations, grids, isDark, readableContrast, rgbFor, wadaColors, wernerColors } from "./data.js";

const directionNotes = {
  rail: {
    label: "Direction A",
    name: "Studio Rail + Inspector",
    summary: "Keep the library visible and move details into a persistent inspector. Back navigation disappears entirely.",
    wins: ["One-click destinations", "No lost library context", "Shared inspector for colors and grids"],
  },
  focus: {
    label: "Direction B",
    name: "Unified Library + Focus Header",
    summary: "Flatten the product into three spaces and use one fixed back pattern for every detail view.",
    wins: ["Three top-level destinations", "Wada and Werner stay visible", "One predictable focus header"],
  },
};

function IconButton({ label, children, onClick, quiet = false }) {
  return (
    <button className={`icon-button${quiet ? " quiet" : ""}`} type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function PrototypeChrome({ children, concept }) {
  return (
    <section className="plugin-window" aria-label={`${concept} interactive prototype`}>
      <header className="plugin-chrome">
        <div className="chrome-title"><span className="chrome-mark">틀</span><strong>Teul</strong></div>
        <span className="prototype-label">Interactive prototype</span>
        <X size={17} aria-hidden="true" />
      </header>
      <div className="plugin-body">{children}</div>
    </section>
  );
}

function FilterBar({ value, onChange, groups = colorGroups }) {
  return (
    <div className="filter-row" role="group" aria-label="Color family">
      {groups.map((group) => (
        <button key={group} type="button" className={value === group ? "selected" : ""} onClick={() => onChange(group)}>
          {group}
        </button>
      ))}
    </div>
  );
}

function SearchField({ value, onChange, placeholder = "Search colors…" }) {
  return (
    <label className="search-field">
      <MagnifyingGlass size={16} aria-hidden="true" />
      <span className="sr-only">Search</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value ? <button type="button" aria-label="Clear search" onClick={() => onChange("")}><X size={14} /></button> : null}
    </label>
  );
}

function Provenance({ source, count }) {
  return (
    <div className="provenance">
      <span>{source === "Wada" ? "Digital approximation · names qualified · sRGB approximate" : "Sampled from the public-domain 1821 second edition"}</span>
      <strong>{count} results</strong>
    </div>
  );
}

function ColorCard({ color, active, onSelect, compact = false }) {
  const contrast = readableContrast(color.hex);
  const trailing = color.combinations ? `${color.combinations.length} ${color.combinations.length === 1 ? "set" : "sets"}` : contrast.label;
  return (
    <button
      type="button"
      className={`color-card${active ? " active" : ""}${compact ? " compact" : ""}`}
      style={{ backgroundColor: color.hex, color: isDark(color.hex) ? "#fff" : "#171717" }}
      onClick={() => onSelect(color)}
      aria-pressed={active}
    >
      <strong>{color.name}</strong>
      <span><span>{color.hex}</span><span>{trailing}</span></span>
      {active ? <CheckCircle className="selected-check" weight="fill" size={18} /> : null}
    </button>
  );
}

function ActionButton({ children, onClick, primary = false }) {
  return <button type="button" className={`action-button${primary ? " primary" : ""}`} onClick={onClick}>{children}</button>;
}

function ColorInspector({ color, onAction, onClose, onCreateSystem, onViewCombinations, source }) {
  if (!color) {
    return <aside className="inspector inspector-empty"><Palette size={24} /><strong>Select a color</strong><span>Details and actions will stay here.</span></aside>;
  }

  const contrast = readableContrast(color.hex);
  const inkName = contrast.ink === "#FFFFFF" ? "white" : "near-black";
  const combinations = source === "Wada" ? getWadaCombinations(color) : [];
  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <div><span className="eyebrow">Selected color</span><h2>{color.name}</h2><p>{color.note}</p></div>
        <IconButton label="Close inspector" quiet onClick={onClose}><X size={16} /></IconButton>
      </div>
      <div className="inspector-swatch" style={{ backgroundColor: color.hex }} />
      <dl className="value-list">
        <div><dt>Hex</dt><dd>{color.hex}</dd></div>
        <div><dt>sRGB</dt><dd>{rgbFor(color.hex)}</dd></div>
        <div><dt>Best text</dt><dd>{inkName}</dd></div>
      </dl>
      <div className="accessibility-callout"><CheckCircle size={18} weight="fill" /><span><strong>{contrast.ratio.toFixed(1)}:1 · {contrast.label}</strong><br />Against {inkName} text</span></div>
      {combinations.length ? <section className="inspector-pairings"><div><span className="eyebrow">Documented pairings</span><strong>{combinations.length} combinations</strong></div>{combinations.slice(0, 3).map((combo, index) => <button type="button" key={combo.id} onClick={onViewCombinations}><span>Set {index + 1}</span><span className="mini-palette">{combo.colors.map((item) => <i key={item.hex} style={{ background: item.hex }} />)}</span></button>)}<ActionButton onClick={onViewCombinations}>View all {combinations.length} pairings</ActionButton></section> : null}
      {source === "Werner" ? <section className="werner-references"><span className="eyebrow">Natural references</span><div><strong>Animal</strong><p>{color.animal}</p></div><div><strong>Vegetable</strong><p>{color.vegetable}</p></div><div><strong>Mineral</strong><p>{color.mineral}</p></div></section> : null}
      <div className="inspector-actions">
        <ActionButton primary onClick={() => onAction(`${color.name} applied as fill`)}>Use as fill</ActionButton>
        <ActionButton onClick={() => onAction(`${color.name} applied as stroke`)}>Use as stroke</ActionButton>
        <ActionButton onClick={() => onAction(`${color.name} style created`)}>Create color style</ActionButton>
        <ActionButton onClick={onCreateSystem}><MagicWand size={15} /> {source === "Wada" ? "Choose pairing for system" : "Create system"}</ActionButton>
        <ActionButton onClick={() => onAction(`${color.hex} copied`)}><Copy size={15} /> Copy value</ActionButton>
      </div>
      <p className="source-footnote">Historical digital colors are documented approximations of print sources.</p>
    </aside>
  );
}

const systemMethods = [
  { id: "generated", name: "Teul Generated", detail: "Source-preserving scale from your selected historical color." },
  { id: "radix", name: "Exact Radix Colors", detail: "Use an exact Radix family as the system foundation." },
  { id: "wcag", name: "WCAG-Constrained Tokens", detail: "Block semantic output until required contrast pairs pass." },
];

function Stepper({ step, labels }) {
  return <ol className="stepper">{labels.map((label, index) => <li key={label} className={index + 1 === step ? "active" : index + 1 < step ? "done" : ""}><span>{index + 1 < step ? <Check size={11} weight="bold" /> : index + 1}</span><strong>{label}</strong></li>)}</ol>;
}

function SwitchRow({ label, detail, value, onChange }) {
  return <button type="button" className="switch-row" onClick={() => onChange(!value)} aria-pressed={value}><span><strong>{label}</strong><small>{detail}</small></span><i className={value ? "on" : ""}><b /></i></button>;
}

function PaletteExport({ color, combination, onClose, onAction }) {
  const [format, setFormat] = useState("CSS");
  const css = combination.colors.map((item, index) => `--${color.name.toLowerCase().replaceAll(" ", "-")}-${index + 1}: ${item.hex};`).join("\n");
  const json = JSON.stringify(combination.colors.map(({ name, hex }) => ({ name, hex })), null, 2);
  return <div className="task-workspace"><header className="task-header"><div><span className="eyebrow">Export documented pairing</span><h1>{color.name} · Set {combination.index + 1}</h1></div><IconButton label="Close palette export" quiet onClick={onClose}><X size={17} /></IconButton></header><div className="task-scroll export-workspace"><div className="export-palette-strip">{combination.colors.map((item) => <i key={item.hex} style={{ background: item.hex }} />)}</div><section className="task-section"><h2>Export palette</h2><p>Names and sRGB approximations are preserved from Teul’s Wada corpus.</p></section><div className="collection-switch"><button className={format === "CSS" ? "active" : ""} onClick={() => setFormat("CSS")}>CSS</button><button className={format === "JSON" ? "active" : ""} onClick={() => setFormat("JSON")}>JSON</button></div><pre className="code-preview">{format === "CSS" ? css : json}</pre><dl className="value-list"><div><dt>Combination ID</dt><dd>{combination.id}</dd></div><div><dt>Colors</dt><dd>{combination.colors.length}</dd></div><div><dt>Profile</dt><dd>sRGB approximation</dd></div></dl></div><footer className="task-footer"><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton primary onClick={() => { onAction(`${format} palette copied`); onClose(); }}><Copy size={15} /> Copy {format}</ActionButton></footer></div>;
}

function CombinationWorkspace({ color, onClose, onCreateSystem, onAction }) {
  const combinations = getWadaCombinations(color);
  const [activeId, setActiveId] = useState(combinations[0]?.id);
  const [exporting, setExporting] = useState(false);
  const activeIndex = Math.max(0, combinations.findIndex((combo) => combo.id === activeId));
  const active = { ...combinations[activeIndex], index: activeIndex };
  if (exporting) return <PaletteExport color={color} combination={active} onClose={() => setExporting(false)} onAction={onAction} />;
  return <div className="task-workspace combination-workspace"><header className="task-header"><div><span className="eyebrow">Wada combinations</span><h1>{color.name}</h1><p>{combinations.length} documented pairings</p></div><IconButton label="Return to color library" quiet onClick={onClose}><X size={17} /></IconButton></header><div className="combination-layout"><div className="combination-list" aria-label={`${color.name} pairings`}>{combinations.map((combo, index) => <button type="button" key={combo.id} className={combo.id === activeId ? "active" : ""} onClick={() => setActiveId(combo.id)}><span><strong>Set {index + 1}</strong><small>ID {combo.id} · {combo.colors.length === 2 ? "Duo" : combo.colors.length === 3 ? "Trio" : "Quad"}</small></span><span className="mini-palette">{combo.colors.map((item) => <i key={item.hex} style={{ background: item.hex }} />)}</span></button>)}</div><div className="combination-detail"><span className="eyebrow">Set {activeIndex + 1} · Corpus ID {active.id}</span><div className="pairing-hero">{active.colors.map((item) => <i key={item.hex} style={{ background: item.hex }} />)}</div><div className="pairing-names">{active.colors.map((item) => <div key={item.hex}><i style={{ background: item.hex }} /><span><strong>{item.name}</strong><small>{item.hex}</small></span></div>)}</div><section className="pairing-contrast"><span className="eyebrow">Contrast with {color.name}</span>{active.colors.filter((item) => item.hex !== color.hex).map((item) => { const ratio = contrastBetween(color.hex, item.hex); return <div key={item.hex}><span>{item.name}</span><strong>{ratio.toFixed(1)}:1</strong></div>; })}</section><div className="inspector-actions pairing-actions"><ActionButton primary onClick={() => onCreateSystem(active.colors, `${color.name} · Set ${activeIndex + 1}`)}><MagicWand size={15} /> Create system from this pairing</ActionButton><ActionButton onClick={() => setExporting(true)}><DownloadSimple size={15} /> Export palette</ActionButton></div><span className="eyebrow gradient-label">Apply pairing as gradient</span><div className="gradient-actions">{["Linear", "Radial", "Angular", "Diamond"].map((type) => <button key={type} onClick={() => onAction(`${type} gradient applied`)}>{type}</button>)}</div></div></div></div>;
}

function SystemBuilder({ color, palette = [color], initialName, onClose, onComplete }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(initialName || `${color.name} System`);
  const [method, setMethod] = useState("generated");
  const [darkMode, setDarkMode] = useState(true);
  const [styles, setStyles] = useState(true);
  const [variables, setVariables] = useState(true);
  const [format, setFormat] = useState("CSS");
  const [complete, setComplete] = useState(false);
  const [sourceColors, setSourceColors] = useState(palette);
  const preview = ["#FFF8FA", "#FDE8ED", color.hex, "#D97991", "#7A2F43", "#34151D"];
  const chosenMethod = systemMethods.find((item) => item.id === method);

  if (complete) {
    return <div className="task-workspace success-workspace"><div className="success-icon"><Check size={22} weight="bold" /></div><span className="eyebrow">System created</span><h1>{name}</h1><p>{variables ? "Variables" : "No variables"} · {styles ? "Color styles" : "No styles"} · {format} export prepared</p><div className="success-summary"><span><strong>12</strong> light tokens</span><span><strong>{darkMode ? "12" : "0"}</strong> dark tokens</span><span><strong>0</strong> blocked pairs</span></div><ActionButton primary onClick={() => onComplete(`${name} created in Figma`)}>Return to library</ActionButton></div>;
  }

  return (
    <div className="task-workspace has-steps">
      <header className="task-header"><div><span className="eyebrow">Create color system</span><h1>{color.name}</h1></div><IconButton label="Close system builder" quiet onClick={onClose}><X size={17} /></IconButton></header>
      <Stepper step={step} labels={["Palette", "Method", "Review"]} />
      <div className="task-scroll">
        {step === 1 ? <>
          <section className="task-section"><h2>Name and roles</h2><p>{sourceColors.length > 1 ? "This documented pairing is already loaded. Adjust roles only if needed." : "This color is loaded as the system foundation. Additional colors are optional."}</p><label className="field-label">System name<input value={name} onChange={(event) => setName(event.target.value)} /></label></section>
          {sourceColors.map((item, index) => <section className={`role-card${index ? " second-role" : ""}`} key={item.hex}><span className="role-swatch" style={{ background: item.hex }} /><span><strong>{item.name}</strong><small>{item.hex} · historical approximation</small></span><select aria-label={`${item.name} role`} defaultValue={["Primary", "Secondary", "Tertiary", "Accent"][index] || "Accent"}><option>Primary</option><option>Secondary</option><option>Tertiary</option><option>Accent</option></select></section>)}
          {sourceColors.length < 4 ? <button className="add-source" type="button" onClick={() => setSourceColors([...sourceColors, wadaColors.find((item) => !sourceColors.some((source) => source.hex === item.hex))])}><Plus size={14} /> Add optional color</button> : null}
        </> : null}
        {step === 2 ? <>
          <section className="task-section"><h2>Choose a system method</h2><p>Each method keeps its own provenance and validation rules.</p></section>
          <div className="method-list">{systemMethods.map((item) => <button type="button" key={item.id} className={method === item.id ? "active" : ""} onClick={() => setMethod(item.id)}><span className="radio-dot" /><span><strong>{item.name}</strong><small>{item.detail}</small></span></button>)}</div>
          <SwitchRow label="Include dark mode" detail="Generate a paired dark appearance." value={darkMode} onChange={setDarkMode} />
          <section className="scale-preview"><div><span>1</span><span>3</span><span>6</span><span>9</span><span>11</span><span>12</span></div><div>{preview.map((value) => <i key={value} style={{ background: value }} />)}</div><p>{method === "radix" ? "Exact Radix family preview" : method === "wcag" ? "Contrast-constrained semantic preview" : "Generated preview · sRGB approximation"}</p></section>
        </> : null}
        {step === 3 ? <>
          <section className="task-section"><h2>Review and create</h2><p>{chosenMethod.name}. Existing local names will be updated; remote collisions create a copy.</p></section>
          <div className="review-card"><div><span className="review-palette">{sourceColors.map((item) => <i key={item.hex} style={{ background: item.hex }} />)}</span><span><strong>{name}</strong><small>{sourceColors.length} source colors · roles assigned</small></span></div><dl><div><dt>Method</dt><dd>{chosenMethod.name}</dd></div><div><dt>Modes</dt><dd>{darkMode ? "Light + Dark" : "Light"}</dd></div><div><dt>Validation</dt><dd className="pass-text">Ready</dd></div></dl></div>
          <SwitchRow label="Create Figma Variables" detail="Create collections, modes, and semantic aliases." value={variables} onChange={setVariables} />
          <SwitchRow label="Create Figma Color Styles" detail="Create local paint styles for direct use." value={styles} onChange={setStyles} />
          <div className="export-row"><span><BracketsCurly size={17} /><span><strong>Export code</strong><small>Prepare tokens with this run.</small></span></span><div>{["CSS", "Tailwind", "JSON"].map((item) => <button key={item} className={format === item ? "active" : ""} onClick={() => setFormat(item)}>{item}</button>)}</div></div>
        </> : null}
      </div>
      <footer className="task-footer"><ActionButton onClick={() => step === 1 ? onClose() : setStep(step - 1)}>{step === 1 ? "Cancel" : "Back"}</ActionButton><ActionButton primary onClick={() => step < 3 ? setStep(step + 1) : setComplete(true)}>{step < 3 ? "Continue" : "Create system"}</ActionButton></footer>
    </div>
  );
}

function GridPreview({ columns }) {
  return <div className="grid-preview" aria-label={`${columns} column preview`}>{Array.from({ length: columns }, (_, index) => <i key={index} />)}</div>;
}

function GridBuilder({ grid, onClose, onSave }) {
  const [columns, setColumns] = useState(grid?.columns || 12);
  const [gutter, setGutter] = useState(grid?.gutter || 24);
  const [margin, setMargin] = useState(grid?.margin || 32);
  const [responsive, setResponsive] = useState(true);
  return <div className="task-workspace"><header className="task-header"><div><span className="eyebrow">Grid builder</span><h1>{grid ? `Edit ${grid.name}` : "New saved grid"}</h1></div><IconButton label="Close grid builder" quiet onClick={onClose}><X size={17} /></IconButton></header><div className="task-scroll grid-builder"><GridPreview columns={Math.min(columns, 12)} /><div className="geometry-grid"><label>Columns<input type="number" value={columns} onChange={(e) => setColumns(Number(e.target.value))} /></label><label>Gutter<input type="number" value={gutter} onChange={(e) => setGutter(Number(e.target.value))} /></label><label>Margin<input type="number" value={margin} onChange={(e) => setMargin(Number(e.target.value))} /></label></div><SwitchRow label="Responsive width" detail="Resolve percentages against each selected frame." value={responsive} onChange={setResponsive} /><section className="task-section"><h2>Application preview</h2><p>{responsive ? "Fits each eligible target independently." : "Uses these fixed pixel values on every target."}</p></section><div className="fit-card"><CheckCircle size={18} weight="fill" /><span><strong>3 eligible frames</strong><small>Preflight passed · existing grids will be replaced</small></span></div></div><footer className="task-footer"><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton primary onClick={() => onSave(grid ? `${grid.name} updated` : "New grid saved")}>Save grid</ActionButton></footer></div>;
}

function GridWorkspace({ selected, setSelected, onAction, inspector = false, onBuild }) {
  const [mode, setMode] = useState("Library");
  const [applyMode, setApplyMode] = useState(false);
  const saved = grids.slice(0, 3);
  const choose = (grid) => { setSelected(grid); setApplyMode(false); };
  return (
    <div className={`grid-workspace${inspector ? " has-inspector" : ""}`}>
      <div className="grid-list-pane">
        <div className="content-header"><div><span className="eyebrow">Layout systems</span><h1>{mode === "Library" ? "Grid library" : "My grids"}</h1></div><span className="count-label">{mode === "Library" ? "65 presets" : "3 saved"}</span></div>
        <div className="collection-switch" role="group" aria-label="Grid collection"><button className={mode === "Library" ? "active" : ""} onClick={() => setMode("Library")}>Library</button><button className={mode === "Saved" ? "active" : ""} onClick={() => setMode("Saved")}>My grids</button></div>
        {mode === "Saved" ? <div className="grid-toolbar"><IconButton label="New grid" onClick={() => onBuild(null)}><Plus size={16} /></IconButton><IconButton label="Capture selected frame" onClick={() => onAction("Grid captured from selected frame")}><SquaresFour size={16} /></IconButton><IconButton label="Import grids" onClick={() => onAction("Grid import ready") }><UploadSimple size={16} /></IconButton><IconButton label="Export grids" onClick={() => onAction("3 saved grids exported")}><DownloadSimple size={16} /></IconButton></div> : null}
        <SearchField value="" onChange={() => {}} placeholder="Search grids…" />
        <div className="grid-card-list">
          {(mode === "Library" ? grids : saved).map((grid) => (
            <button type="button" key={grid.name} className={`grid-card${selected?.name === grid.name ? " active" : ""}`} onClick={() => choose(grid)}>
              <GridPreview columns={Math.min(grid.columns, 12)} />
              <span><strong>{grid.name}</strong><small>{grid.columns} columns · {grid.gutter}px gutter</small></span>
            </button>
          ))}
        </div>
      </div>
      {inspector ? (
        <aside className="inspector grid-inspector">
          <span className="eyebrow">Selected grid</span><h2>{selected.name}</h2><p>{selected.source}</p>
          <GridPreview columns={Math.min(selected.columns, 12)} />
          <dl className="value-list"><div><dt>Columns</dt><dd>{selected.columns}</dd></div><div><dt>Gutter</dt><dd>{selected.gutter}px</dd></div><div><dt>Margin</dt><dd>{selected.margin}px</dd></div></dl>
          {applyMode ? <div className="apply-panel"><strong>Apply to 3 frames</strong><p>Existing grids were found. Choose how Teul should proceed.</p><label><input type="radio" name="apply" defaultChecked /> Replace existing grids</label><label><input type="radio" name="apply" /> Add alongside existing</label><ActionButton primary onClick={() => { setApplyMode(false); onAction(`${selected.name} applied to 3 frames`); }}>Confirm apply</ActionButton><button onClick={() => setApplyMode(false)}>Cancel</button></div> : <div className="inspector-actions"><ActionButton primary onClick={() => setApplyMode(true)}>Apply to selection</ActionButton>{mode === "Library" ? <ActionButton onClick={() => onAction(`${selected.name} saved to My Grids`)}><FloppyDisk size={15} /> Save to My Grids</ActionButton> : <><ActionButton onClick={() => onBuild(selected)}>Edit geometry</ActionButton><ActionButton onClick={() => onAction(`${selected.name} duplicated`)}>Duplicate</ActionButton><ActionButton onClick={() => onAction(`${selected.name} deleted`)}>Delete</ActionButton></>}</div>}
        </aside>
      ) : null}
    </div>
  );
}

function CheckWorkspace({ onAction }) {
  const [mode, setMode] = useState("Contrast");
  const [foreground, setForeground] = useState("#171717");
  const [background, setBackground] = useState("#F9C1CE");
  const [condition, setCondition] = useState("Deuteranomaly");
  const [severity, setSeverity] = useState(70);
  const ratio = contrastBetween(foreground, background);
  const label = contrastLabel(ratio);
  const normalText = ratio !== null && ratio >= 4.5 ? (ratio >= 7 ? "AAA" : "AA") : "Fail";
  const largeText = ratio !== null && ratio >= 3 ? (ratio >= 4.5 ? "AAA" : "AA") : "Fail";
  return (
    <div className="check-workspace">
      <div className="content-header"><div><span className="eyebrow">Accessibility</span><h1>{mode === "Contrast" ? "Contrast checker" : "Color vision"}</h1></div>{mode === "Contrast" ? <span className={`status-pass${label === "Fails WCAG" || label === "Check values" ? " fail" : ""}`}><Check size={14} weight="bold" /> {label}</span> : <Eye size={22} />}</div>
      <div className="collection-switch check-switch"><button className={mode === "Contrast" ? "active" : ""} onClick={() => setMode("Contrast")}>Contrast</button><button className={mode === "Vision" ? "active" : ""} onClick={() => setMode("Vision")}>Color vision</button></div>
      {mode === "Contrast" ? <>
        <div className="contrast-preview" style={{ color: foreground, backgroundColor: background }}><strong>Readable color is useful color.</strong><span>Preview text at 16px / 24px.</span></div>
        <div className="color-input-row"><label>Foreground<input value={foreground} onChange={(e) => setForeground(e.target.value)} /></label><label>Background<input value={background} onChange={(e) => setBackground(e.target.value)} /></label></div>
        <ActionButton onClick={() => { setForeground("#171717"); setBackground("#F9C1CE"); onAction("Colors read from selection"); }}>Use selection</ActionButton>
        <div className="contrast-result"><span><small>Contrast ratio</small><strong>{ratio === null ? "—" : `${ratio.toFixed(1)}:1`}</strong></span><span><small>Normal text</small><strong>{normalText}</strong></span><span><small>Large text</small><strong>{largeText}</strong></span></div>
        <div className="apca-note"><span><strong>APCA · experimental</strong><small>Lc 71 · body text guidance</small></span><span>Supplemental only</span></div>
        <ActionButton primary onClick={() => onAction("Contrast pair copied")}>Copy color pair</ActionButton>
      </> : <>
        <div className="vision-controls"><label>Condition<select value={condition} onChange={(e) => setCondition(e.target.value)}><option>Deuteranomaly</option><option>Protanomaly</option><option>Tritanomaly</option><option>Achromatopsia</option></select></label><label>Severity · {severity}%<input type="range" min="0" max="100" value={severity} onChange={(e) => setSeverity(e.target.value)} /></label></div>
        <div className="vision-comparison"><div><span>Original</span><i style={{ background: "#F27291" }} /><i style={{ background: "#3A6F68" }} /><i style={{ background: "#4B6F91" }} /></div><div><span>{condition}</span><i style={{ background: "#B68D89" }} /><i style={{ background: "#65715E" }} /><i style={{ background: "#4F6885" }} /></div></div>
        <p className="vision-copy">Simulation helps reveal reliance on hue. It does not replace testing contrast, labels, and real use.</p>
        <ActionButton onClick={() => onAction("Selection colors added to simulation")}>Add colors from selection</ActionButton>
      </>}
    </div>
  );
}

function Toast({ message }) {
  return message ? <div className="toast" role="status"><CheckCircle size={16} weight="fill" />{message}</div> : null;
}

function SettingsWorkspace({ onAction }) {
  const [theme, setTheme] = useState("Auto");
  return <div className="settings-workspace"><div className="content-header"><div><span className="eyebrow">Preferences</span><h1>Settings</h1></div><GearSix size={21} /></div><section className="settings-card"><span><strong>Document color profile</strong><small>Reported by the current Figma document.</small></span><div className="profile-value"><i />sRGB</div></section><section className="settings-card vertical"><span><strong>Appearance</strong><small>Match Figma or choose a fixed theme.</small></span><div className="theme-options">{["Auto", "Light", "Dark"].map((item) => <button className={theme === item ? "active" : ""} onClick={() => setTheme(item)} key={item}>{item}</button>)}</div></section><section className="settings-card vertical"><span><strong>Color handling</strong><small>Historical and generated hex/RGB values remain labeled sRGB. They are not remapped when a document reports Display P3.</small></span><ActionButton onClick={() => onAction("Source provenance opened")}>View source provenance</ActionButton></section><section className="settings-card vertical"><span><strong>About Teul</strong><small>Historical color, tested color systems, and documented layout grids.</small></span><dl className="value-list"><div><dt>Version</dt><dd>Prototype</dd></div><div><dt>Wada</dt><dd>159 colors</dd></div><div><dt>Werner</dt><dd>110 colors</dd></div><div><dt>Grids</dt><dd>65 presets</dd></div></dl></section></div>;
}

function RailDirection() {
  const [section, setSection] = useState("Wada");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All");
  const [selectedColor, setSelectedColor] = useState(wadaColors[0]);
  const [selectedGrid, setSelectedGrid] = useState(grids[0]);
  const [message, setMessage] = useState("");
  const [task, setTask] = useState(null);
  const source = section === "Werner" ? "Werner" : "Wada";
  const colors = source === "Werner" ? wernerColors : wadaColors;
  const groups = source === "Werner" ? ["All", ...new Set(wernerColors.map((color) => color.group))] : colorGroups;
  const filtered = useMemo(() => colors.filter((color) => (group === "All" || color.group === group) && color.name.toLowerCase().includes(search.toLowerCase())), [colors, group, search]);
  const act = (text) => { setMessage(text); window.setTimeout(() => setMessage(""), 1800); };
  const changeSection = (next) => {
    setSection(next);
    setTask(null);
    setSearch("");
    setGroup("All");
    if (next === "Wada") setSelectedColor(wadaColors[0]);
    if (next === "Werner") setSelectedColor(wernerColors[0]);
  };

  return (
    <PrototypeChrome concept="Studio Rail and Inspector">
      <div className="rail-layout">
        <nav className="side-rail" aria-label="Primary">
          <div className="rail-group">
            <button className={section === "Wada" ? "active" : ""} onClick={() => changeSection("Wada")}><Palette size={19} /><span>Wada</span></button>
            <button className={section === "Werner" ? "active" : ""} onClick={() => changeSection("Werner")}><BookOpenText size={19} /><span>Werner</span></button>
            <button className={section === "Grids" ? "active" : ""} onClick={() => changeSection("Grids")}><GridFour size={19} /><span>Grids</span></button>
            <button className={section === "Check" ? "active" : ""} onClick={() => changeSection("Check")}><CheckCircle size={19} /><span>Check</span></button>
          </div>
          <button className={section === "Settings" ? "rail-settings active" : "rail-settings"} onClick={() => changeSection("Settings")}><GearSix size={18} /><span>Settings</span></button>
        </nav>
        {task?.type === "system" ? <SystemBuilder color={selectedColor} palette={task.palette} initialName={task.name} onClose={() => setTask(task.returnTo === "combinations" ? { type: "combinations" } : null)} onComplete={(text) => { setTask(null); act(text); }} /> : task?.type === "combinations" ? <CombinationWorkspace color={selectedColor} onClose={() => setTask(null)} onAction={act} onCreateSystem={(palette, name) => setTask({ type: "system", palette, name, returnTo: "combinations" })} /> : task?.type === "grid" ? <GridBuilder grid={task.grid} onClose={() => setTask(null)} onSave={(text) => { setTask(null); act(text); }} /> : section === "Grids" ? <GridWorkspace selected={selectedGrid} setSelected={setSelectedGrid} onAction={act} onBuild={(grid) => setTask({ type: "grid", grid })} inspector /> : section === "Check" ? <CheckWorkspace onAction={act} /> : section === "Settings" ? <SettingsWorkspace onAction={act} /> : (
          <div className="rail-color-workspace">
            <main className="library-pane">
              <div className="content-header"><div><span className="eyebrow">Historical colors</span><h1>{source === "Wada" ? "Sanzo Wada" : "Werner’s Nomenclature"}</h1></div><div className="header-meta"><strong>{source === "Wada" ? "159" : "110"}</strong><span>colors · sRGB</span></div></div>
              <SearchField value={search} onChange={setSearch} />
              <FilterBar value={group} onChange={setGroup} groups={groups} />
              <Provenance source={source} count={filtered.length} />
              <div className="color-grid">
                {filtered.map((color) => <ColorCard key={color.name} color={color} active={selectedColor?.name === color.name} onSelect={setSelectedColor} />)}
              </div>
              {!filtered.length ? <div className="empty-state"><MagnifyingGlass size={22} /><strong>No matching colors</strong><button onClick={() => { setSearch(""); setGroup("All"); }}>Clear filters</button></div> : null}
            </main>
            <ColorInspector color={selectedColor} source={source} onAction={act} onClose={() => setSelectedColor(null)} onViewCombinations={() => setTask({ type: "combinations" })} onCreateSystem={() => setTask(source === "Wada" ? { type: "combinations" } : { type: "system", palette: [selectedColor] })} />
          </div>
        )}
      </div>
      <Toast message={message} />
    </PrototypeChrome>
  );
}

function FocusHeader({ title, source, onBack, onNext }) {
  return (
    <div className="focus-header">
      <button type="button" onClick={onBack}><ArrowLeft size={17} />Back to {source === "Grid" ? "grids" : "colors"}</button>
      <div><strong>{title}</strong><span>{source}</span></div>
      <button type="button" onClick={onNext}>Next<ArrowRight size={17} /></button>
    </div>
  );
}

function FocusColorDetail({ color, source, colors, onBack, onSelect, onAction }) {
  const index = colors.findIndex((item) => item.name === color.name);
  const next = colors[(index + 1) % colors.length];
  const contrast = readableContrast(color.hex);
  const inkName = contrast.ink === "#FFFFFF" ? "white" : "near-black";
  return (
    <div className="focus-detail">
      <FocusHeader title={color.name} source={source} onBack={onBack} onNext={() => onSelect(next)} />
      <div className="focus-main">
        <div className="focus-swatch" style={{ backgroundColor: color.hex }} />
        <div className="focus-copy">
          <span className="eyebrow">{source} collection</span><h1>{color.name}</h1><p>{color.note}</p>
          <dl className="value-list"><div><dt>Hex</dt><dd>{color.hex}</dd></div><div><dt>sRGB</dt><dd>{rgbFor(color.hex)}</dd></div><div><dt>Contrast</dt><dd>{contrast.label} · {contrast.ratio.toFixed(1)}:1 on {inkName}</dd></div></dl>
          <div className="focus-actions"><ActionButton primary onClick={() => onAction(`${color.name} added to library`)}>Add to library</ActionButton><ActionButton onClick={() => onAction(`${color.hex} copied`)}><Copy size={15} />Copy</ActionButton></div>
        </div>
      </div>
      <div className="related-row"><div className="related-heading"><strong>Related in {source}</strong><span>{colors.length} colors</span></div><div className="related-swatches">{colors.slice(0, 7).map((item) => <ColorCard key={item.name} color={item} active={item.name === color.name} onSelect={onSelect} compact />)}</div></div>
    </div>
  );
}

function FocusGridDetail({ grid, onBack, onNext, onAction }) {
  return (
    <div className="focus-detail">
      <FocusHeader title={grid.name} source="Grid" onBack={onBack} onNext={onNext} />
      <div className="grid-focus-body"><GridPreview columns={Math.min(grid.columns, 12)} /><span className="eyebrow">Documented layout preset</span><h1>{grid.name}</h1><p>{grid.source}</p><dl className="value-list"><div><dt>Columns</dt><dd>{grid.columns}</dd></div><div><dt>Gutter</dt><dd>{grid.gutter}px</dd></div><div><dt>Margin</dt><dd>{grid.margin}px</dd></div></dl><ActionButton primary onClick={() => onAction(`${grid.name} applied`)}>Apply to selection</ActionButton></div>
    </div>
  );
}

function FocusDirection() {
  const [section, setSection] = useState("Colors");
  const [source, setSource] = useState("Wada");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All");
  const [selectedColor, setSelectedColor] = useState(wadaColors[1]);
  const [selectedGrid, setSelectedGrid] = useState(null);
  const [message, setMessage] = useState("");
  const colors = source === "Wada" ? wadaColors : wernerColors;
  const groups = source === "Wada" ? colorGroups : ["All", ...new Set(wernerColors.map((color) => color.group))];
  const filtered = colors.filter((color) => (group === "All" || color.group === group) && color.name.toLowerCase().includes(search.toLowerCase()));
  const act = (text) => { setMessage(text); window.setTimeout(() => setMessage(""), 1800); };
  const changeSource = (next) => { setSource(next); setSelectedColor(next === "Wada" ? wadaColors[1] : wernerColors[0]); setGroup("All"); setSearch(""); };
  const nextGrid = () => setSelectedGrid(grids[(grids.findIndex((item) => item.name === selectedGrid.name) + 1) % grids.length]);

  return (
    <PrototypeChrome concept="Unified Library and Focus Header">
      <div className="focus-layout">
        <header className="focus-topbar">
          <nav aria-label="Primary">
            <button className={section === "Colors" ? "active" : ""} onClick={() => setSection("Colors")}><Palette size={18} />Colors</button>
            <button className={section === "Grids" ? "active" : ""} onClick={() => setSection("Grids")}><GridFour size={18} />Grids</button>
            <button className={section === "Check" ? "active" : ""} onClick={() => setSection("Check")}><CheckCircle size={18} />Check</button>
          </nav>
          <button className="utility-button"><span>Profile</span><strong>sRGB</strong><GearSix size={17} /></button>
        </header>
        {section === "Colors" ? (
          <>
            <div className="source-toolbar">
              <div className="segmented" role="group" aria-label="Color source"><button className={source === "Wada" ? "active" : ""} onClick={() => changeSource("Wada")}>Wada</button><button className={source === "Werner" ? "active" : ""} onClick={() => changeSource("Werner")}>Werner</button></div>
              <SearchField value={search} onChange={setSearch} />
              <IconButton label="Filter colors"><SlidersHorizontal size={17} /></IconButton>
            </div>
            <FilterBar value={group} onChange={setGroup} groups={groups} />
            <Provenance source={source} count={filtered.length} />
            {selectedColor ? <FocusColorDetail color={selectedColor} source={source} colors={colors} onBack={() => setSelectedColor(null)} onSelect={setSelectedColor} onAction={act} /> : <div className="focus-library-grid">{filtered.map((color) => <ColorCard key={color.name} color={color} onSelect={setSelectedColor} />)}</div>}
          </>
        ) : section === "Grids" ? selectedGrid ? <FocusGridDetail grid={selectedGrid} onBack={() => setSelectedGrid(null)} onNext={nextGrid} onAction={act} /> : <GridWorkspace selected={null} setSelected={setSelectedGrid} onAction={act} /> : <CheckWorkspace onAction={act} />}
      </div>
      <Toast message={message} />
    </PrototypeChrome>
  );
}

function ReviewPanel({ direction, setDirection }) {
  const note = directionNotes[direction];
  return (
    <aside className="review-panel">
      <div><span className="review-kicker">Teul navigation study</span><h1>Two simpler ways through the plugin.</h1><p>These prototypes keep the visual character you like while reducing navigation depth and standardizing component behavior.</p></div>
      <div className="direction-switcher" role="group" aria-label="Prototype direction">
        {Object.entries(directionNotes).map(([key, item]) => <button key={key} className={direction === key ? "active" : ""} onClick={() => setDirection(key)}><span>{item.label}</span><strong>{item.name}</strong></button>)}
      </div>
      <div className="concept-note"><span>{note.label}</span><h2>{note.name}</h2><p>{note.summary}</p><ul>{note.wins.map((win) => <li key={win}><Check size={14} weight="bold" />{win}</li>)}</ul></div>
      <div className="system-note"><span>Shared system</span><div className="token-row"><i>4</i><i>8</i><i>12</i><i>16</i><i>24</i></div><p>Current 560px width · five spacing steps · 8px controls · 12px panels · 36px minimum targets.</p></div>
      <p className="prototype-disclaimer">Exploration only. Production code has not been changed.</p>
    </aside>
  );
}

export function App() {
  const initialDirection = new URLSearchParams(window.location.search).get("direction") === "b" ? "focus" : "rail";
  const [direction, setDirection] = useState(initialDirection);
  const chooseDirection = (next) => {
    setDirection(next);
    const url = new URL(window.location.href);
    url.searchParams.set("direction", next === "focus" ? "b" : "a");
    window.history.replaceState({}, "", url);
  };
  return (
    <main className="review-shell">
      <ReviewPanel direction={direction} setDirection={chooseDirection} />
      <div className="prototype-stage">
        <div className="stage-heading"><span>Live prototype</span><strong>{directionNotes[direction].name}</strong><small>Click through the interface</small></div>
        {direction === "rail" ? <RailDirection /> : <FocusDirection />}
      </div>
    </main>
  );
}
