figma.showUI(__html__, {
  width: 560,
  height: 600,
  themeColors: true
});

interface GradientColor {
  hex: string;
  name: string;
}

interface ColorMessage {
  hex: string;
  name: string;
  rgb?: number[];
}

// ============================================
// Grid System Types (inline for plugin backend)
// ============================================

interface GridColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FigmaGridConfig {
  pattern: 'COLUMNS' | 'ROWS' | 'GRID';
  alignment: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH';
  gutterSize: number;
  count: number;
  sectionSize?: number;
  offset: number;
  visible: boolean;
  color: GridColor;
}

interface GridConfigMessage {
  columns?: FigmaGridConfig;
  rows?: FigmaGridConfig;
  baseline?: FigmaGridConfig;
}

// Validate hex color format
function isValidHex(hex: string): boolean {
  const cleanHex = hex.replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(cleanHex);
}

// Helper to convert hex to Figma RGB (with validation)
function hexToFigmaRgb(hex: string): RGB {
  const cleanHex = hex.replace('#', '');

  // Validate hex format - return black if invalid
  if (!isValidHex(hex)) {
    console.error(`Invalid hex color: ${hex}`);
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: parseInt(cleanHex.substring(0, 2), 16) / 255,
    g: parseInt(cleanHex.substring(2, 4), 16) / 255,
    b: parseInt(cleanHex.substring(4, 6), 16) / 255
  };
}

// Helper to get current selection with fills
function getSelectedNodesWithFills(): (SceneNode & { fills: Paint[] })[] {
  return figma.currentPage.selection.filter(
    (node): node is SceneNode & { fills: Paint[] } => 'fills' in node
  );
}

// Helper to get current selection with strokes
function getSelectedNodesWithStrokes(): (SceneNode & { strokes: Paint[] })[] {
  return figma.currentPage.selection.filter(
    (node): node is SceneNode & { strokes: Paint[] } => 'strokes' in node
  );
}

figma.ui.onmessage = async (msg) => {
  // Apply solid fill to selection
  if (msg.type === 'apply-fill') {
    const nodes = getSelectedNodesWithFills();
    
    if (nodes.length === 0) {
      figma.notify('Please select a shape or frame first');
      return;
    }

    const color = hexToFigmaRgb(msg.hex);
    
    nodes.forEach(node => {
      node.fills = [{
        type: 'SOLID',
        color: color
      }];
    });
    
    figma.notify(`Applied "${msg.name}" to ${nodes.length} element${nodes.length > 1 ? 's' : ''}`);
  }

  // Apply stroke to selection
  if (msg.type === 'apply-stroke') {
    const nodes = getSelectedNodesWithStrokes();
    
    if (nodes.length === 0) {
      figma.notify('Please select a shape or frame first');
      return;
    }

    const color = hexToFigmaRgb(msg.hex);
    
    nodes.forEach(node => {
      node.strokes = [{
        type: 'SOLID',
        color: color
      }];
      // Set stroke weight if not already set
      if ('strokeWeight' in node && (node.strokeWeight === 0 || node.strokeWeight === undefined)) {
        (node as GeometryMixin).strokeWeight = 2;
      }
    });
    
    figma.notify(`Applied stroke "${msg.name}" to ${nodes.length} element${nodes.length > 1 ? 's' : ''}`);
  }

  // Create a color style
  if (msg.type === 'create-style') {
    try {
      const color = hexToFigmaRgb(msg.hex);
      
      // Check if style already exists
      const existingStyles = await figma.getLocalPaintStylesAsync();
      const existingStyle = existingStyles.find(s => s.name === `Teul/${msg.name}`);
      
      if (existingStyle) {
        figma.notify(`Style "Teul/${msg.name}" already exists`);
        return;
      }
      
      const style = figma.createPaintStyle();
      style.name = `Teul/${msg.name}`;
      style.paints = [{
        type: 'SOLID',
        color: color
      }];
      
      figma.notify(`Created style: Teul/${msg.name}`);
    } catch (error) {
      figma.notify('Failed to create style');
      console.error(error);
    }
  }

  // Get color from selection (for "Find Closest Color" feature)
  if (msg.type === 'get-selection-color') {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.notify('Please select an element first');
      return;
    }

    const node = selection[0];
    
    if ('fills' in node) {
      const fills = node.fills as Paint[];
      
      if (fills.length > 0 && fills[0].type === 'SOLID') {
        const fill = fills[0] as SolidPaint;
        const rgb = [
          Math.round(fill.color.r * 255),
          Math.round(fill.color.g * 255),
          Math.round(fill.color.b * 255)
        ];
        
        figma.ui.postMessage({
          type: 'selection-color',
          rgb: rgb
        });
      } else {
        figma.notify('Selected element has no solid fill');
      }
    } else {
      figma.notify('Selected element has no fill property');
    }
  }

  // Create a color rectangle (legacy)
  if (msg.type === 'create-color') {
    const color = msg.color;
    const rect = figma.createRectangle();
    
    rect.resize(100, 100);
    rect.x = figma.viewport.center.x - 50;
    rect.y = figma.viewport.center.y - 50;
    
    const rgbColor = {
      r: color.rgb_array[0] / 255,
      g: color.rgb_array[1] / 255,
      b: color.rgb_array[2] / 255
    };
    
    rect.fills = [{
      type: 'SOLID',
      color: rgbColor
    }];
    
    rect.name = color.name;
    
    figma.currentPage.selection = [rect];
    figma.viewport.scrollAndZoomIntoView([rect]);
  }
  
  // Apply gradient fill
  if (msg.type === 'apply-gradient') {
    const nodes = getSelectedNodesWithFills();

    if (nodes.length === 0) {
      figma.notify('Please select a shape or frame first');
      return;
    }

    const colors: GradientColor[] = msg.colors;

    // Validate: gradients need at least 2 colors
    if (!colors || colors.length < 2) {
      figma.notify('Gradient requires at least 2 colors');
      return;
    }

    const gradientStops: ColorStop[] = colors.map((color: GradientColor, index: number) => {
      const rgb = hexToFigmaRgb(color.hex);
      return {
        position: index / (colors.length - 1),
        color: { ...rgb, a: 1 }
      };
    });

    // Different transforms for different gradient types
    let gradientTransform: Transform;
    
    switch (msg.gradientType) {
      case 'LINEAR':
        // Diagonal gradient from top-left to bottom-right
        gradientTransform = [[1, 0, 0], [0, 1, 0]];
        break;
      case 'RADIAL':
      case 'ANGULAR':
      case 'DIAMOND':
        // Centered gradient
        gradientTransform = [[0.5, 0, 0.25], [0, 0.5, 0.25]];
        break;
      default:
        gradientTransform = [[1, 0, 0], [0, 1, 0]];
    }

    const gradientType = msg.gradientType === 'LINEAR' ? 'GRADIENT_LINEAR' :
                         msg.gradientType === 'RADIAL' ? 'GRADIENT_RADIAL' :
                         msg.gradientType === 'ANGULAR' ? 'GRADIENT_ANGULAR' :
                         'GRADIENT_DIAMOND';

    const gradientFill: GradientPaint = {
      type: gradientType,
      gradientTransform,
      gradientStops
    };

    nodes.forEach(node => {
      node.fills = [gradientFill];
    });
    
    figma.notify(`Applied ${msg.gradientType.toLowerCase()} gradient with ${colors.length} colors`);
  }

  // Create palette frame
  if (msg.type === 'create-palette') {
    const colors: ColorMessage[] = msg.colors;
    const paletteName = msg.name || 'Teul Palette';
    
    // Create frame
    const frame = figma.createFrame();
    frame.name = paletteName;
    frame.layoutMode = 'HORIZONTAL';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'AUTO';
    frame.itemSpacing = 16;
    frame.paddingLeft = 24;
    frame.paddingRight = 24;
    frame.paddingTop = 24;
    frame.paddingBottom = 24;
    frame.cornerRadius = 16;
    frame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
    
    // Add color swatches
    for (const color of colors) {
      const swatch = figma.createFrame();
      swatch.name = color.name;
      swatch.resize(80, 100);
      swatch.layoutMode = 'VERTICAL';
      swatch.primaryAxisSizingMode = 'FIXED';
      swatch.counterAxisSizingMode = 'FIXED';
      swatch.fills = [];
      
      // Color rectangle
      const rect = figma.createRectangle();
      rect.resize(80, 60);
      rect.cornerRadius = 4;
      rect.fills = [{ type: 'SOLID', color: hexToFigmaRgb(color.hex) }];
      swatch.appendChild(rect);
      
      // Color name text
      const nameText = figma.createText();
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      nameText.fontName = { family: "Inter", style: "Medium" };
      nameText.characters = color.name;
      nameText.fontSize = 10;
      nameText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
      swatch.appendChild(nameText);
      
      // Hex text
      const hexText = figma.createText();
      hexText.fontName = { family: "Inter", style: "Medium" };
      hexText.characters = color.hex;
      hexText.fontSize = 9;
      hexText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
      swatch.appendChild(hexText);
      
      frame.appendChild(swatch);
    }
    
    // Position frame in viewport
    frame.x = figma.viewport.center.x - frame.width / 2;
    frame.y = figma.viewport.center.y - frame.height / 2;
    
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    
    figma.notify(`Created palette with ${colors.length} colors`);
  }

  // Show notification
  if (msg.type === 'notify') {
    figma.notify(msg.text);
  }

  // Copy text (legacy fallback)
  if (msg.type === 'copy') {
    figma.notify(`${msg.text} copied!`);
  }

  // Generate Color System Frames
  if (msg.type === 'generate-color-system') {
    try {
      await generateColorSystemFrames(msg.config, msg.scales);
    } catch (error) {
      console.error('Error generating color system:', error);
      figma.notify('Failed to generate color system');
    }
  }

  // Create Color Styles from generated system
  if (msg.type === 'create-color-styles') {
    try {
      await createColorStyles(msg.scales, msg.systemName);
    } catch (error) {
      console.error('Error creating color styles:', error);
      figma.notify('Failed to create color styles');
    }
  }

  // ============================================
  // Grid System Message Handlers
  // ============================================

  // Create a new frame with grid applied
  if (msg.type === 'create-grid-frame') {
    try {
      const { 
        config, 
        frameName, 
        width, 
        height, 
        includeImage, 
        imageData,
        positionNearSelection = true 
      } = msg;
      
      const frame = figma.createFrame();
      frame.name = frameName || 'Grid Frame';
      frame.resize(width, height);
      
      // Apply layout grids
      const layoutGrids: LayoutGrid[] = [];
      
      if (config.columns) {
        layoutGrids.push({
          pattern: config.columns.pattern,
          alignment: config.columns.alignment,
          gutterSize: config.columns.gutterSize,
          count: config.columns.count,
          offset: config.columns.offset,
          visible: config.columns.visible,
          color: config.columns.color,
        } as LayoutGrid);
      }
      
      if (config.rows) {
        layoutGrids.push({
          pattern: config.rows.pattern,
          alignment: config.rows.alignment,
          gutterSize: config.rows.gutterSize,
          count: config.rows.count,
          offset: config.rows.offset,
          visible: config.rows.visible,
          color: config.rows.color,
        } as LayoutGrid);
      }
      
      if (config.baseline) {
        layoutGrids.push({
          pattern: 'GRID',
          sectionSize: config.baseline.sectionSize || 8,
          visible: config.baseline.visible,
          color: config.baseline.color,
        } as LayoutGrid);
      }
      
      frame.layoutGrids = layoutGrids;
      
      // Include original image as reference layer if requested
      if (includeImage && imageData) {
        try {
          // Decode base64 to Uint8Array
          const binaryString = atob(imageData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Create image hash
          const imageHash = figma.createImage(bytes).hash;
          
          // Create rectangle with image fill
          const imageRect = figma.createRectangle();
          imageRect.name = "Reference Image";
          imageRect.resize(width, height);
          imageRect.x = 0;
          imageRect.y = 0;
          imageRect.fills = [{
            type: 'IMAGE',
            scaleMode: 'FILL',
            imageHash: imageHash,
          }];
          imageRect.opacity = 0.5; // Semi-transparent for reference
          imageRect.locked = true; // Lock to prevent accidental edits
          
          frame.appendChild(imageRect);
        } catch (imgError) {
          console.error('Failed to add reference image:', imgError);
          // Continue without the image
        }
      }
      
      // Position near selection or in viewport center
      const selection = figma.currentPage.selection;
      if (positionNearSelection && selection.length > 0) {
        const bounds = selection[0];
        
        // Calculate position to the right of selection with spacing
        const spacing = 48;
        frame.x = bounds.x + bounds.width + spacing;
        frame.y = bounds.y;
        
        // Check if frame would go off-canvas (beyond reasonable bounds)
        // If so, position below instead
        const maxX = 100000; // Figma's practical limit
        if (frame.x + frame.width > maxX) {
          frame.x = bounds.x;
          frame.y = bounds.y + bounds.height + spacing;
        }
      } else {
        frame.x = figma.viewport.center.x - width / 2;
        frame.y = figma.viewport.center.y - height / 2;
      }
      
      figma.currentPage.selection = [frame];
      figma.viewport.scrollAndZoomIntoView([frame]);
      
      // Build notification message
      const gridInfo: string[] = [];
      if (config.columns?.count) gridInfo.push(`${config.columns.count} columns`);
      if (config.rows?.count) gridInfo.push(`${config.rows.count} rows`);
      if (config.baseline) gridInfo.push('baseline grid');
      
      const infoStr = gridInfo.length > 0 ? ` (${gridInfo.join(', ')})` : '';
      figma.notify(`Created: ${frameName}${infoStr}`);
    } catch (error) {
      console.error('Error creating grid frame:', error);
      figma.notify('Failed to create grid frame');
    }
  }

  // Apply grid to existing frame
  if (msg.type === 'apply-grid') {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.notify('Please select a frame first');
      return;
    }

    const node = selection[0];
    
    if (!('layoutGrids' in node)) {
      figma.notify('Selected element cannot have layout grids');
      return;
    }

    try {
      const { config, replaceExisting = true, scaledToFit = false } = msg;
      const frame = node as FrameNode;
      
      // Build new layout grids
      const newGrids: LayoutGrid[] = [];
      
      if (config.columns) {
        newGrids.push({
          pattern: config.columns.pattern,
          alignment: config.columns.alignment,
          gutterSize: config.columns.gutterSize,
          count: config.columns.count,
          offset: config.columns.offset,
          visible: config.columns.visible,
          color: config.columns.color,
        } as LayoutGrid);
      }
      
      if (config.rows) {
        newGrids.push({
          pattern: config.rows.pattern,
          alignment: config.rows.alignment,
          gutterSize: config.rows.gutterSize,
          count: config.rows.count,
          offset: config.rows.offset,
          visible: config.rows.visible,
          color: config.rows.color,
        } as LayoutGrid);
      }
      
      if (config.baseline) {
        newGrids.push({
          pattern: 'GRID',
          sectionSize: config.baseline.sectionSize || 8,
          visible: config.baseline.visible,
          color: config.baseline.color,
        } as LayoutGrid);
      }
      
      // Apply grids
      const previousCount = frame.layoutGrids.length;
      
      if (replaceExisting) {
        frame.layoutGrids = newGrids;
      } else {
        frame.layoutGrids = [...frame.layoutGrids, ...newGrids];
      }
      
      // Build notification message
      const gridInfo: string[] = [];
      if (config.columns?.count) gridInfo.push(`${config.columns.count}col`);
      if (config.rows?.count) gridInfo.push(`${config.rows.count}row`);
      if (config.baseline) gridInfo.push('baseline');
      
      const action = replaceExisting 
        ? (previousCount > 0 ? 'Replaced' : 'Applied')
        : 'Added';
      
      const infoStr = gridInfo.length > 0 ? ` (${gridInfo.join(', ')})` : '';
      const scaleNote = scaledToFit ? ' [scaled]' : '';
      
      figma.notify(`${action} grid on "${frame.name}"${infoStr}${scaleNote}`);
      
      // Send success message back to UI
      figma.ui.postMessage({
        type: 'grid-applied',
        success: true,
        frameName: frame.name,
        frameWidth: frame.width,
        frameHeight: frame.height,
      });
    } catch (error) {
      console.error('Error applying grid:', error);
      figma.notify('Failed to apply grid');
      
      figma.ui.postMessage({
        type: 'grid-applied',
        success: false,
        error: 'Failed to apply grid',
      });
    }
  }
  
  // Clear all grids from selection
  if (msg.type === 'clear-grids') {
    const selection = figma.currentPage.selection;
    
    if (selection.length === 0) {
      figma.notify('Please select a frame first');
      return;
    }

    const node = selection[0];
    
    if (!('layoutGrids' in node)) {
      figma.notify('Selected element cannot have layout grids');
      return;
    }

    try {
      const frame = node as FrameNode;
      const previousCount = frame.layoutGrids.length;
      frame.layoutGrids = [];
      
      figma.notify(`Cleared ${previousCount} grid${previousCount !== 1 ? 's' : ''} from "${frame.name}"`);
    } catch (error) {
      console.error('Error clearing grids:', error);
      figma.notify('Failed to clear grids');
    }
  }
};

// ============================================
// Color System Frame Generation
// ============================================

interface ColorScaleData {
  name: string;
  role: string;
  steps: { step: number; hex: string }[];
}

interface ColorSystemData {
  systemName: string;
  detailLevel: 'minimal' | 'detailed' | 'presentation';
  includeDarkMode: boolean;
  scaleMethod: 'custom' | 'radix';
  scales: {
    light: {
      primary?: ColorScaleData;
      secondary?: ColorScaleData;
      tertiary?: ColorScaleData;
      accent?: ColorScaleData;
      neutral: ColorScaleData;
    };
    dark?: {
      primary?: ColorScaleData;
      secondary?: ColorScaleData;
      tertiary?: ColorScaleData;
      accent?: ColorScaleData;
      neutral: ColorScaleData;
    };
  };
  usageProportions: {
    primary: number;
    secondary: number;
    tertiary: number;
    accent: number;
    neutral: number;
  };
}

// Semantic labels for each step (following Radix UI conventions)
const SEMANTIC_LABELS: Record<number, { short: string; full: string }> = {
  1:  { short: 'App BG',         full: 'App Background' },
  2:  { short: 'Subtle BG',      full: 'Subtle Background' },
  3:  { short: 'Element BG',     full: 'UI Element Background' },
  4:  { short: 'Hovered',        full: 'Hovered Element BG' },
  5:  { short: 'Active',         full: 'Active/Selected Element BG' },
  6:  { short: 'Subtle Border',  full: 'Subtle Border' },
  7:  { short: 'Border',         full: 'Border' },
  8:  { short: 'Focus Ring',     full: 'Border Focus/Hover' },
  9:  { short: 'Solid',          full: 'Solid Background' },
  10: { short: 'Solid Hover',    full: 'Solid Hover' },
  11: { short: 'Text Low',       full: 'Low Contrast Text' },
  12: { short: 'Text High',      full: 'High Contrast Text' },
};

// Calculate relative luminance
function getRelativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// Calculate contrast ratio between two hex colors
function calculateContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Get accessibility rating
function getAccessibilityRating(contrast: number): { rating: string; color: RGB } {
  if (contrast >= 7) {
    return { rating: 'AAA', color: { r: 0.13, g: 0.55, b: 0.13 } };
  } else if (contrast >= 4.5) {
    return { rating: 'AA', color: { r: 0.2, g: 0.6, b: 0.86 } };
  } else if (contrast >= 3) {
    return { rating: 'AA Large', color: { r: 0.9, g: 0.65, b: 0.15 } };
  } else {
    return { rating: 'Fail', color: { r: 0.8, g: 0.2, b: 0.2 } };
  }
}

// Font loading helper with timeout
const FONT_LOAD_TIMEOUT = 5000; // 5 seconds

async function loadFontWithTimeout(
  family: string,
  style: string
): Promise<boolean> {
  try {
    await Promise.race([
      figma.loadFontAsync({ family, style }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Font load timeout: ${family} ${style}`)), FONT_LOAD_TIMEOUT)
      )
    ]);
    return true;
  } catch (error) {
    console.warn(`Failed to load font ${family} ${style}:`, error);
    return false;
  }
}

async function loadFonts(): Promise<boolean> {
  const fonts = [
    { family: "Inter", style: "Regular" },
    { family: "Inter", style: "Medium" },
    { family: "Inter", style: "Semi Bold" },
    { family: "Inter", style: "Bold" }
  ];

  const results = await Promise.all(
    fonts.map(f => loadFontWithTimeout(f.family, f.style))
  );

  const allLoaded = results.every(r => r);
  if (!allLoaded) {
    console.warn("Some fonts failed to load - text rendering may be affected");
  }
  return allLoaded;
}

// Get contrasting text color
function getContrastingColor(hex: string): RGB {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.5 ? { r: 0.1, g: 0.1, b: 0.1 } : { r: 1, g: 1, b: 1 };
}

// Create a text node with styling
function createText(
  content: string,
  fontSize: number,
  fontStyle: "Regular" | "Medium" | "Semi Bold" | "Bold" = "Regular",
  color: RGB = { r: 0.2, g: 0.2, b: 0.2 }
): TextNode {
  const text = figma.createText();
  text.fontName = { family: "Inter", style: fontStyle };
  text.characters = content;
  text.fontSize = fontSize;
  text.fills = [{ type: 'SOLID', color }];
  return text;
}

// Create a color swatch with optional label
function createColorSwatch(
  hex: string,
  width: number,
  height: number,
  cornerRadius: number = 4
): RectangleNode {
  const rect = figma.createRectangle();
  rect.resize(width, height);
  rect.cornerRadius = cornerRadius;
  rect.fills = [{ type: 'SOLID', color: hexToFigmaRgb(hex) }];
  rect.name = hex;
  return rect;
}

// Create a single scale row (horizontal strip of 12 colors)
async function createScaleRow(
  scale: ColorScaleData,
  mode: 'light' | 'dark',
  showLabels: boolean = true,
  swatchSize: number = 40
): Promise<FrameNode> {
  const row = figma.createFrame();
  row.name = `${scale.name} Scale`;
  row.layoutMode = 'VERTICAL';
  row.primaryAxisSizingMode = 'AUTO';
  row.counterAxisSizingMode = 'AUTO';
  row.itemSpacing = 4;
  row.fills = [];

  // Role label
  if (showLabels) {
    const labelColor = mode === 'dark' ? { r: 0.9, g: 0.9, b: 0.9 } : { r: 0.3, g: 0.3, b: 0.3 };
    const label = createText(scale.role.toUpperCase(), 10, "Bold", labelColor);
    label.letterSpacing = { value: 1, unit: "PIXELS" };
    row.appendChild(label);
  }

  // Color swatches container
  const swatchesContainer = figma.createFrame();
  swatchesContainer.name = "Swatches";
  swatchesContainer.layoutMode = 'HORIZONTAL';
  swatchesContainer.primaryAxisSizingMode = 'AUTO';
  swatchesContainer.counterAxisSizingMode = 'AUTO';
  swatchesContainer.itemSpacing = 2;
  swatchesContainer.fills = [];

  for (const step of scale.steps) {
    const swatchFrame = figma.createFrame();
    swatchFrame.name = `Step ${step.step}`;
    swatchFrame.layoutMode = 'VERTICAL';
    swatchFrame.primaryAxisSizingMode = 'AUTO';
    swatchFrame.counterAxisSizingMode = 'FIXED';
    swatchFrame.resize(swatchSize, swatchFrame.height);
    swatchFrame.itemSpacing = 2;
    swatchFrame.fills = [];
    swatchFrame.primaryAxisAlignItems = 'CENTER';

    const swatch = createColorSwatch(
      step.hex,
      swatchSize,
      swatchSize,
      4 // Consistent border-radius
    );
    swatchFrame.appendChild(swatch);

    if (showLabels) {
      const hexLabel = createText(
        step.hex.toUpperCase().slice(1),
        7,
        "Regular",
        mode === 'dark' ? { r: 0.6, g: 0.6, b: 0.6 } : { r: 0.5, g: 0.5, b: 0.5 }
      );
      hexLabel.textAlignHorizontal = 'CENTER';
      swatchFrame.appendChild(hexLabel);
    }

    swatchesContainer.appendChild(swatchFrame);
  }

  row.appendChild(swatchesContainer);

  // Semantic labels row
  if (showLabels) {
    const labelsContainer = figma.createFrame();
    labelsContainer.name = "Semantic Labels";
    labelsContainer.layoutMode = 'HORIZONTAL';
    labelsContainer.primaryAxisSizingMode = 'AUTO';
    labelsContainer.counterAxisSizingMode = 'AUTO';
    labelsContainer.itemSpacing = 2;
    labelsContainer.fills = [];

    for (let i = 1; i <= 12; i++) {
      const labelFrame = figma.createFrame();
      labelFrame.resize(swatchSize, 14);
      labelFrame.fills = [];
      labelFrame.layoutMode = 'VERTICAL';
      labelFrame.primaryAxisAlignItems = 'CENTER';
      labelFrame.counterAxisAlignItems = 'CENTER';
      labelFrame.primaryAxisSizingMode = 'FIXED';
      labelFrame.counterAxisSizingMode = 'FIXED';

      const semantic = SEMANTIC_LABELS[i];
      const label = createText(
        semantic.short,
        6,
        "Regular",
        mode === 'dark' ? { r: 0.5, g: 0.5, b: 0.5 } : { r: 0.6, g: 0.6, b: 0.6 }
      );
      label.textAlignHorizontal = 'CENTER';
      labelFrame.appendChild(label);
      labelsContainer.appendChild(labelFrame);
    }

    row.appendChild(labelsContainer);
  }

  // Accessibility badges for text steps (11 and 12)
  if (showLabels && scale.steps.length >= 12) {
    const accessibilityRow = figma.createFrame();
    accessibilityRow.name = "Accessibility";
    accessibilityRow.layoutMode = 'HORIZONTAL';
    accessibilityRow.primaryAxisSizingMode = 'AUTO';
    accessibilityRow.counterAxisSizingMode = 'AUTO';
    accessibilityRow.itemSpacing = 2;
    accessibilityRow.fills = [];

    // Calculate contrast of text colors (11, 12) against app background (1)
    const bgColor = scale.steps[0].hex; // Step 1 - app background
    
    for (let i = 1; i <= 12; i++) {
      const badgeFrame = figma.createFrame();
      badgeFrame.resize(swatchSize, 14);
      badgeFrame.fills = [];
      badgeFrame.layoutMode = 'VERTICAL';
      badgeFrame.primaryAxisAlignItems = 'CENTER';
      badgeFrame.counterAxisAlignItems = 'CENTER';
      badgeFrame.primaryAxisSizingMode = 'FIXED';
      badgeFrame.counterAxisSizingMode = 'FIXED';

      // Only show accessibility for text steps (11, 12) and solid (9)
      if (i === 9 || i === 11 || i === 12) {
        const contrast = calculateContrastRatio(scale.steps[i - 1].hex, bgColor);
        const { rating, color } = getAccessibilityRating(contrast);
        const badge = createText(rating, 6, "Medium", color);
        badge.textAlignHorizontal = 'CENTER';
        badgeFrame.appendChild(badge);
      }

      accessibilityRow.appendChild(badgeFrame);
    }

    row.appendChild(accessibilityRow);
  }

  return row;
}

// Create Black/White swatches
function createBWSwatches(size: number = 60): FrameNode {
  const container = figma.createFrame();
  container.name = "Black & White";
  container.layoutMode = 'HORIZONTAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 8;
  container.fills = [];

  // Black
  const blackFrame = figma.createFrame();
  blackFrame.name = "Black";
  blackFrame.layoutMode = 'VERTICAL';
  blackFrame.primaryAxisSizingMode = 'AUTO';
  blackFrame.counterAxisSizingMode = 'AUTO';
  blackFrame.itemSpacing = 4;
  blackFrame.fills = [];

  const blackSwatch = createColorSwatch('#000000', size, size, 4);
  blackFrame.appendChild(blackSwatch);

  const blackLabel = createText("Black", 10, "Medium", { r: 0.3, g: 0.3, b: 0.3 });
  blackFrame.appendChild(blackLabel);

  // White
  const whiteFrame = figma.createFrame();
  whiteFrame.name = "White";
  whiteFrame.layoutMode = 'VERTICAL';
  whiteFrame.primaryAxisSizingMode = 'AUTO';
  whiteFrame.counterAxisSizingMode = 'AUTO';
  whiteFrame.itemSpacing = 4;
  whiteFrame.fills = [];

  const whiteSwatch = createColorSwatch('#FFFFFF', size, size, 4);
  whiteSwatch.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
  whiteSwatch.strokeWeight = 1;
  whiteFrame.appendChild(whiteSwatch);

  const whiteLabel = createText("White", 10, "Medium", { r: 0.3, g: 0.3, b: 0.3 });
  whiteFrame.appendChild(whiteLabel);

  container.appendChild(blackFrame);
  container.appendChild(whiteFrame);

  return container;
}

// Create usage proportion bar
function createUsageProportionBar(
  proportions: { primary: number; secondary: number; tertiary: number; accent: number; neutral: number },
  colors: { primary?: string; secondary?: string; tertiary?: string; accent?: string; neutral: string },
  width: number = 400,
  mode: 'light' | 'dark' = 'light'
): FrameNode {
  const container = figma.createFrame();
  container.name = "Usage Proportions";
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 8;
  container.fills = [];

  const labelColor = mode === 'dark' ? { r: 0.9, g: 0.9, b: 0.9 } : { r: 0.3, g: 0.3, b: 0.3 };
  const title = createText("USAGE PROPORTIONS", 10, "Bold", labelColor);
  title.letterSpacing = { value: 1, unit: "PIXELS" };
  container.appendChild(title);

  // Bar container
  const barFrame = figma.createFrame();
  barFrame.name = "Bar";
  barFrame.layoutMode = 'HORIZONTAL';
  barFrame.primaryAxisSizingMode = 'AUTO';
  barFrame.counterAxisSizingMode = 'AUTO';
  barFrame.itemSpacing = 0;
  barFrame.fills = [];
  barFrame.cornerRadius = 4;
  barFrame.clipsContent = true;

  const total = proportions.primary + proportions.secondary + proportions.tertiary + proportions.accent + proportions.neutral;

  const segments = [
    { key: 'primary', color: colors.primary, proportion: proportions.primary },
    { key: 'secondary', color: colors.secondary, proportion: proportions.secondary },
    { key: 'tertiary', color: colors.tertiary, proportion: proportions.tertiary },
    { key: 'accent', color: colors.accent, proportion: proportions.accent },
    { key: 'neutral', color: colors.neutral, proportion: proportions.neutral },
  ].filter(s => s.color && s.proportion > 0);

  for (const segment of segments) {
    const segmentWidth = (segment.proportion / total) * width;
    const rect = figma.createRectangle();
    rect.resize(segmentWidth, 24);
    rect.fills = [{ type: 'SOLID', color: hexToFigmaRgb(segment.color!) }];
    rect.name = segment.key;
    barFrame.appendChild(rect);
  }

  container.appendChild(barFrame);

  // Legend
  const legendFrame = figma.createFrame();
  legendFrame.name = "Legend";
  legendFrame.layoutMode = 'HORIZONTAL';
  legendFrame.primaryAxisSizingMode = 'AUTO';
  legendFrame.counterAxisSizingMode = 'AUTO';
  legendFrame.itemSpacing = 16;
  legendFrame.fills = [];

  for (const segment of segments) {
    const item = figma.createFrame();
    item.layoutMode = 'HORIZONTAL';
    item.primaryAxisSizingMode = 'AUTO';
    item.counterAxisSizingMode = 'AUTO';
    item.itemSpacing = 4;
    item.fills = [];
    item.counterAxisAlignItems = 'CENTER';

    const dot = createColorSwatch(segment.color!, 8, 8, 4);
    item.appendChild(dot);

    const label = createText(
      `${segment.key.charAt(0).toUpperCase() + segment.key.slice(1)}: ${segment.proportion}%`,
      9,
      "Regular",
      mode === 'dark' ? { r: 0.7, g: 0.7, b: 0.7 } : { r: 0.4, g: 0.4, b: 0.4 }
    );
    item.appendChild(label);

    legendFrame.appendChild(item);
  }

  container.appendChild(legendFrame);

  return container;
}

// ============================================
// Color Pairing Guide Functions
// ============================================

interface ColorInfo {
  hex: string;
  name: string;
  role: string;
  luminance: number;
  saturation: number;
  hue: number;
}

// Analyze a color for pairing recommendations
function analyzeColor(hex: string, name: string, role: string): ColorInfo {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return {
    hex,
    name,
    role,
    luminance: l,
    saturation: s,
    hue: h * 360,
  };
}

// Get use case suggestion based on color properties
function getColorUseCase(color: ColorInfo): string {
  if (color.luminance > 0.7) return "Backgrounds";
  if (color.luminance < 0.3) return "Text & Details";
  if (color.saturation > 0.5) return "Accents & CTAs";
  return "Supporting Elements";
}

// Generate pairing suggestions from colors
function generatePairingSuggestions(colors: ColorInfo[]): { 
  pairs: { colors: ColorInfo[]; name: string; description: string }[];
  proportionStack: { color: ColorInfo; weight: number }[];
} {
  const pairs: { colors: ColorInfo[]; name: string; description: string }[] = [];
  
  if (colors.length < 2) {
    return { pairs: [], proportionStack: colors.map(c => ({ color: c, weight: 1 })) };
  }
  
  // Sort by luminance for contrast pairing
  const byLuminance = [...colors].sort((a, b) => b.luminance - a.luminance);
  
  // High contrast pair (lightest + darkest)
  if (colors.length >= 2) {
    pairs.push({
      colors: [byLuminance[0], byLuminance[byLuminance.length - 1]],
      name: "High Contrast",
      description: "Maximum visual impact, great for headlines and CTAs",
    });
  }
  
  // Adjacent pairs (harmonious)
  if (colors.length >= 2) {
    pairs.push({
      colors: [colors[0], colors[1]],
      name: "Harmonious Duo",
      description: "Balanced and cohesive, ideal for branded content",
    });
  }
  
  // Trio (if 3+ colors)
  if (colors.length >= 3) {
    pairs.push({
      colors: [colors[0], colors[1], colors[2]],
      name: "Core Trio",
      description: "Rich palette for illustrations and marketing",
    });
  }
  
  // Full palette
  if (colors.length >= 4) {
    pairs.push({
      colors: colors.slice(0, 4),
      name: "Full Palette",
      description: "Complete expression for maximum visual variety",
    });
  }
  
  // Calculate proportion stack - more saturated/darker colors get less weight (accents)
  const proportionStack = colors.map(c => {
    let weight: number;
    if (c.luminance > 0.65) weight = 40; // Light colors: backgrounds
    else if (c.saturation > 0.6 && c.luminance < 0.5) weight = 10; // Saturated dark: accents
    else if (c.saturation > 0.5) weight = 20; // Saturated: secondary
    else weight = 30; // Mid-tones: primary elements
    return { color: c, weight };
  });
  
  // Normalize weights to sum to 100
  const totalWeight = proportionStack.reduce((sum, p) => sum + p.weight, 0);
  proportionStack.forEach(p => p.weight = Math.round((p.weight / totalWeight) * 100));
  
  return { pairs, proportionStack };
}

// Create the Color Pairing Guide visual section
async function createColorPairingGuide(
  scales: ColorSystemData['scales']['light'],
  mode: 'light' | 'dark'
): Promise<FrameNode> {
  const textColor = mode === 'dark' ? { r: 0.95, g: 0.95, b: 0.95 } : { r: 0.1, g: 0.1, b: 0.1 };
  const mutedColor = mode === 'dark' ? { r: 0.6, g: 0.6, b: 0.6 } : { r: 0.5, g: 0.5, b: 0.5 };
  const bgColor = mode === 'dark' ? { r: 0.12, g: 0.12, b: 0.12 } : { r: 0.97, g: 0.97, b: 0.97 };

  // Extract base colors (step 9) from scales
  const scaleOrder = ['primary', 'secondary', 'tertiary', 'accent'] as const;
  const colorInfos: ColorInfo[] = [];
  
  for (const key of scaleOrder) {
    const scale = scales[key];
    if (scale && scale.steps[8]) {
      colorInfos.push(analyzeColor(scale.steps[8].hex, scale.name, scale.role));
    }
  }
  
  if (colorInfos.length === 0) {
    const emptyFrame = figma.createFrame();
    emptyFrame.name = "Color Pairing Guide";
    emptyFrame.resize(100, 100);
    return emptyFrame;
  }
  
  const { pairs, proportionStack } = generatePairingSuggestions(colorInfos);

  // Main container
  const container = figma.createFrame();
  container.name = "Color Pairing Guide";
  container.layoutMode = 'VERTICAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 24;
  container.fills = [];

  // Section title
  const sectionTitle = createText("HOW TO USE THIS PALETTE", 11, "Bold", mutedColor);
  sectionTitle.letterSpacing = { value: 1.5, unit: "PIXELS" };
  container.appendChild(sectionTitle);

  // --- Proportion Stack (like Robinhood's Jazzy Colors) ---
  const stackSection = figma.createFrame();
  stackSection.name = "Visual Proportions";
  stackSection.layoutMode = 'HORIZONTAL';
  stackSection.primaryAxisSizingMode = 'AUTO';
  stackSection.counterAxisSizingMode = 'AUTO';
  stackSection.itemSpacing = 24;
  stackSection.fills = [];

  // Stack visualization
  const stackFrame = figma.createFrame();
  stackFrame.name = "Stack";
  stackFrame.layoutMode = 'VERTICAL';
  stackFrame.primaryAxisSizingMode = 'AUTO';
  stackFrame.counterAxisSizingMode = 'AUTO';
  stackFrame.itemSpacing = 2;
  stackFrame.cornerRadius = 8;
  stackFrame.clipsContent = true;
  stackFrame.fills = [];

  // Sort by weight descending for visual hierarchy
  const sortedStack = [...proportionStack].sort((a, b) => b.weight - a.weight);
  
  for (const item of sortedStack) {
    const height = Math.max(20, (item.weight / 100) * 160); // Scale to max 160px
    const rect = figma.createRectangle();
    rect.resize(100, height);
    rect.fills = [{ type: 'SOLID', color: hexToFigmaRgb(item.color.hex) }];
    rect.name = `${item.color.name} (${item.weight}%)`;
    stackFrame.appendChild(rect);
  }

  stackSection.appendChild(stackFrame);

  // Stack legend
  const stackLegend = figma.createFrame();
  stackLegend.name = "Stack Legend";
  stackLegend.layoutMode = 'VERTICAL';
  stackLegend.primaryAxisSizingMode = 'AUTO';
  stackLegend.counterAxisSizingMode = 'AUTO';
  stackLegend.itemSpacing = 8;
  stackLegend.fills = [];

  const proportionTitle = createText("Suggested Proportions", 12, "Semi Bold", textColor);
  stackLegend.appendChild(proportionTitle);

  for (const item of sortedStack) {
    const row = figma.createFrame();
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'AUTO';
    row.counterAxisSizingMode = 'AUTO';
    row.itemSpacing = 8;
    row.fills = [];
    row.counterAxisAlignItems = 'CENTER';

    const dot = createColorSwatch(item.color.hex, 12, 12, 6);
    row.appendChild(dot);

    const label = createText(`${item.color.name}: ${item.weight}%`, 11, "Regular", textColor);
    row.appendChild(label);

    const useCase = createText(`(${getColorUseCase(item.color)})`, 10, "Regular", mutedColor);
    row.appendChild(useCase);

    stackLegend.appendChild(row);
  }

  stackSection.appendChild(stackLegend);
  container.appendChild(stackSection);

  // --- Suggested Pairings ---
  const pairingsSection = figma.createFrame();
  pairingsSection.name = "Suggested Pairings";
  pairingsSection.layoutMode = 'VERTICAL';
  pairingsSection.primaryAxisSizingMode = 'AUTO';
  pairingsSection.counterAxisSizingMode = 'AUTO';
  pairingsSection.itemSpacing = 16;
  pairingsSection.fills = [];

  const pairingsTitle = createText("Color Combinations", 12, "Semi Bold", textColor);
  pairingsSection.appendChild(pairingsTitle);

  const pairingsGrid = figma.createFrame();
  pairingsGrid.name = "Pairings Grid";
  pairingsGrid.layoutMode = 'HORIZONTAL';
  pairingsGrid.primaryAxisSizingMode = 'AUTO';
  pairingsGrid.counterAxisSizingMode = 'AUTO';
  pairingsGrid.itemSpacing = 16;
  pairingsGrid.fills = [];

  for (const pair of pairs) {
    const pairCard = figma.createFrame();
    pairCard.name = pair.name;
    pairCard.layoutMode = 'VERTICAL';
    pairCard.primaryAxisSizingMode = 'AUTO';
    pairCard.counterAxisSizingMode = 'AUTO';
    pairCard.itemSpacing = 8;
    pairCard.paddingLeft = 12;
    pairCard.paddingRight = 12;
    pairCard.paddingTop = 12;
    pairCard.paddingBottom = 12;
    pairCard.cornerRadius = 8;
    pairCard.fills = [{ type: 'SOLID', color: bgColor }];

    // Color swatches row
    const swatchesRow = figma.createFrame();
    swatchesRow.name = "Swatches";
    swatchesRow.layoutMode = 'HORIZONTAL';
    swatchesRow.primaryAxisSizingMode = 'AUTO';
    swatchesRow.counterAxisSizingMode = 'AUTO';
    swatchesRow.itemSpacing = -8; // Overlap effect
    swatchesRow.fills = [];

    for (const color of pair.colors) {
      const swatch = figma.createEllipse();
      swatch.resize(32, 32);
      swatch.fills = [{ type: 'SOLID', color: hexToFigmaRgb(color.hex) }];
      swatch.strokes = [{ type: 'SOLID', color: mode === 'dark' ? { r: 0.2, g: 0.2, b: 0.2 } : { r: 1, g: 1, b: 1 } }];
      swatch.strokeWeight = 2;
      swatchesRow.appendChild(swatch);
    }

    pairCard.appendChild(swatchesRow);

    // Pairing name
    const pairName = createText(pair.name, 11, "Semi Bold", textColor);
    pairCard.appendChild(pairName);

    // Description
    const pairDesc = createText(pair.description, 9, "Regular", mutedColor);
    pairDesc.resize(140, pairDesc.height);
    pairDesc.textAutoResize = 'HEIGHT';
    pairCard.appendChild(pairDesc);

    pairingsGrid.appendChild(pairCard);
  }

  pairingsSection.appendChild(pairingsGrid);
  container.appendChild(pairingsSection);

  // --- Use Case Suggestions ---
  const useCaseSection = figma.createFrame();
  useCaseSection.name = "Use Cases";
  useCaseSection.layoutMode = 'VERTICAL';
  useCaseSection.primaryAxisSizingMode = 'AUTO';
  useCaseSection.counterAxisSizingMode = 'AUTO';
  useCaseSection.itemSpacing = 12;
  useCaseSection.fills = [];

  const useCaseTitle = createText("Quick Reference", 12, "Semi Bold", textColor);
  useCaseSection.appendChild(useCaseTitle);

  const useCases = [
    { label: "Marketing & Social", suggestion: "Use Full Palette or Core Trio for visual energy" },
    { label: "Website Sections", suggestion: "Dominant color as background, others as accents" },
    { label: "Illustrations", suggestion: "All colors work together — vary saturation for depth" },
    { label: "UI Elements", suggestion: "High Contrast pair for buttons and interactive states" },
  ];

  for (const useCase of useCases) {
    const row = figma.createFrame();
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'AUTO';
    row.counterAxisSizingMode = 'AUTO';
    row.itemSpacing = 8;
    row.fills = [];

    const bullet = createText("→", 10, "Regular", mutedColor);
    row.appendChild(bullet);

    const labelText = createText(`${useCase.label}:`, 10, "Semi Bold", textColor);
    row.appendChild(labelText);

    const suggestionText = createText(useCase.suggestion, 10, "Regular", mutedColor);
    row.appendChild(suggestionText);

    useCaseSection.appendChild(row);
  }

  container.appendChild(useCaseSection);

  return container;
}

// Generate MINIMAL layout
async function generateMinimalLayout(
  scales: ColorSystemData['scales']['light'],
  mode: 'light' | 'dark'
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = `Color Scales (${mode})`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 16;
  frame.paddingLeft = 24;
  frame.paddingRight = 24;
  frame.paddingTop = 24;
  frame.paddingBottom = 24;
  frame.cornerRadius = 12;
  frame.fills = [{ 
    type: 'SOLID', 
    color: mode === 'dark' ? { r: 0.1, g: 0.1, b: 0.1 } : { r: 0.98, g: 0.98, b: 0.98 } 
  }];

  // Add scales
  const scaleOrder = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
  for (const key of scaleOrder) {
    const scale = scales[key];
    if (scale) {
      const row = await createScaleRow(scale, mode, true, 36);
      frame.appendChild(row);
    }
  }

  return frame;
}

// Generate DETAILED layout
async function generateDetailedLayout(
  scales: ColorSystemData['scales']['light'],
  proportions: ColorSystemData['usageProportions'],
  mode: 'light' | 'dark'
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = `Color System (${mode})`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 24;
  frame.paddingLeft = 32;
  frame.paddingRight = 32;
  frame.paddingTop = 32;
  frame.paddingBottom = 32;
  frame.cornerRadius = 16;
  frame.fills = [{ 
    type: 'SOLID', 
    color: mode === 'dark' ? { r: 0.1, g: 0.1, b: 0.1 } : { r: 0.98, g: 0.98, b: 0.98 } 
  }];

  // Usage proportions
  const colors = {
    primary: scales.primary?.steps[8]?.hex,
    secondary: scales.secondary?.steps[8]?.hex,
    tertiary: scales.tertiary?.steps[8]?.hex,
    accent: scales.accent?.steps[8]?.hex,
    neutral: scales.neutral.steps[8].hex,
  };
  const proportionBar = createUsageProportionBar(proportions, colors, 500, mode);
  frame.appendChild(proportionBar);

  // Divider
  const divider = figma.createRectangle();
  divider.resize(500, 1);
  divider.fills = [{ 
    type: 'SOLID', 
    color: mode === 'dark' ? { r: 0.2, g: 0.2, b: 0.2 } : { r: 0.9, g: 0.9, b: 0.9 } 
  }];
  frame.appendChild(divider);

  // Add scales with larger swatches
  const scaleOrder2 = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
  for (const key of scaleOrder2) {
    const scale = scales[key];
    if (scale) {
      const row = await createScaleRow(scale, mode, true, 40);
      frame.appendChild(row);
    }
  }

  // Add Color Pairing Guide
  const pairingDivider = figma.createRectangle();
  pairingDivider.resize(500, 1);
  pairingDivider.fills = [{ 
    type: 'SOLID', 
    color: mode === 'dark' ? { r: 0.2, g: 0.2, b: 0.2 } : { r: 0.9, g: 0.9, b: 0.9 } 
  }];
  frame.appendChild(pairingDivider);

  const pairingGuide = await createColorPairingGuide(scales, mode);
  frame.appendChild(pairingGuide);

  return frame;
}

// Generate PRESENTATION layout
async function generatePresentationLayout(
  systemName: string,
  scales: ColorSystemData['scales']['light'],
  proportions: ColorSystemData['usageProportions'],
  mode: 'light' | 'dark'
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = `${systemName} - ${mode === 'dark' ? 'Dark' : 'Light'} Mode`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 32;
  frame.paddingLeft = 40;
  frame.paddingRight = 40;
  frame.paddingTop = 40;
  frame.paddingBottom = 40;
  frame.cornerRadius = 20;
  frame.fills = [{ 
    type: 'SOLID', 
    color: mode === 'dark' ? { r: 0.08, g: 0.08, b: 0.08 } : { r: 1, g: 1, b: 1 } 
  }];

  const textColor = mode === 'dark' ? { r: 0.95, g: 0.95, b: 0.95 } : { r: 0.1, g: 0.1, b: 0.1 };
  const mutedColor = mode === 'dark' ? { r: 0.6, g: 0.6, b: 0.6 } : { r: 0.5, g: 0.5, b: 0.5 };

  // Header
  const header = figma.createFrame();
  header.name = "Header";
  header.layoutMode = 'VERTICAL';
  header.primaryAxisSizingMode = 'AUTO';
  header.counterAxisSizingMode = 'AUTO';
  header.itemSpacing = 8;
  header.fills = [];

  const title = createText(systemName, 28, "Bold", textColor);
  header.appendChild(title);

  const subtitle = createText(`${mode === 'dark' ? 'Dark' : 'Light'} Mode Color System`, 14, "Regular", mutedColor);
  header.appendChild(subtitle);

  frame.appendChild(header);

  // Primary Palette Section
  const primarySection = figma.createFrame();
  primarySection.name = "Primary Palette";
  primarySection.layoutMode = 'VERTICAL';
  primarySection.primaryAxisSizingMode = 'AUTO';
  primarySection.counterAxisSizingMode = 'AUTO';
  primarySection.itemSpacing = 16;
  primarySection.fills = [];

  const primaryTitle = createText("PRIMARY PALETTE", 11, "Bold", mutedColor);
  primaryTitle.letterSpacing = { value: 1.5, unit: "PIXELS" };
  primarySection.appendChild(primaryTitle);

  // Primary colors row
  const primaryRow = figma.createFrame();
  primaryRow.name = "Primary Colors";
  primaryRow.layoutMode = 'HORIZONTAL';
  primaryRow.primaryAxisSizingMode = 'AUTO';
  primaryRow.counterAxisSizingMode = 'AUTO';
  primaryRow.itemSpacing = 16;
  primaryRow.fills = [];

  // Black & White
  const bw = createBWSwatches(80);
  primaryRow.appendChild(bw);

  // Main colors (step 9 of each scale)
  const mainColors = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
  for (const key of mainColors) {
    const scale = scales[key];
    if (scale && scale.steps[8]) {
      const colorFrame = figma.createFrame();
      colorFrame.name = scale.role;
      colorFrame.layoutMode = 'VERTICAL';
      colorFrame.primaryAxisSizingMode = 'AUTO';
      colorFrame.counterAxisSizingMode = 'AUTO';
      colorFrame.itemSpacing = 4;
      colorFrame.fills = [];

      const swatch = createColorSwatch(scale.steps[8].hex, 80, 80, 4);
      colorFrame.appendChild(swatch);

      const label = createText(scale.role, 10, "Medium", mutedColor);
      colorFrame.appendChild(label);

      const hexLabel = createText(scale.steps[8].hex.toUpperCase(), 9, "Regular", mutedColor);
      colorFrame.appendChild(hexLabel);

      primaryRow.appendChild(colorFrame);
    }
  }

  primarySection.appendChild(primaryRow);
  frame.appendChild(primarySection);

  // Usage Proportions
  const colors = {
    primary: scales.primary?.steps[8]?.hex,
    secondary: scales.secondary?.steps[8]?.hex,
    accent: scales.accent?.steps[8]?.hex,
    neutral: scales.neutral.steps[8].hex,
  };
  const proportionBar = createUsageProportionBar(proportions, colors, 600, mode);
  frame.appendChild(proportionBar);

  // Semantic Categories Section
  const semanticSection = figma.createFrame();
  semanticSection.name = "Semantic Categories";
  semanticSection.layoutMode = 'VERTICAL';
  semanticSection.primaryAxisSizingMode = 'AUTO';
  semanticSection.counterAxisSizingMode = 'AUTO';
  semanticSection.itemSpacing = 24;
  semanticSection.fills = [];

  const semanticTitle = createText("SEMANTIC USAGE GUIDE", 11, "Bold", mutedColor);
  semanticTitle.letterSpacing = { value: 1.5, unit: "PIXELS" };
  semanticSection.appendChild(semanticTitle);

  // Define semantic groups
  const semanticGroups = [
    { name: "BACKGROUNDS", steps: [1, 2, 3, 4, 5], description: "App backgrounds, UI elements, hover & active states" },
    { name: "BORDERS", steps: [6, 7, 8], description: "Subtle borders, default borders, focus rings" },
    { name: "INTERACTIVE", steps: [9, 10], description: "Buttons, badges, solid backgrounds" },
    { name: "TEXT", steps: [11, 12], description: "Secondary and primary text colors" },
  ];

  for (const group of semanticGroups) {
    const groupFrame = figma.createFrame();
    groupFrame.name = group.name;
    groupFrame.layoutMode = 'VERTICAL';
    groupFrame.primaryAxisSizingMode = 'AUTO';
    groupFrame.counterAxisSizingMode = 'AUTO';
    groupFrame.itemSpacing = 8;
    groupFrame.fills = [];

    // Group title
    const groupTitleRow = figma.createFrame();
    groupTitleRow.layoutMode = 'HORIZONTAL';
    groupTitleRow.primaryAxisSizingMode = 'AUTO';
    groupTitleRow.counterAxisSizingMode = 'AUTO';
    groupTitleRow.itemSpacing = 12;
    groupTitleRow.fills = [];

    const groupTitle = createText(group.name, 10, "Bold", textColor);
    groupTitle.letterSpacing = { value: 1, unit: "PIXELS" };
    groupTitleRow.appendChild(groupTitle);

    const groupDesc = createText(group.description, 9, "Regular", mutedColor);
    groupTitleRow.appendChild(groupDesc);
    groupFrame.appendChild(groupTitleRow);

    // Swatches for each role in this group
    const roleSwatches = figma.createFrame();
    roleSwatches.layoutMode = 'HORIZONTAL';
    roleSwatches.primaryAxisSizingMode = 'AUTO';
    roleSwatches.counterAxisSizingMode = 'AUTO';
    roleSwatches.itemSpacing = 16;
    roleSwatches.fills = [];

    const roles = ['primary', 'secondary', 'accent', 'neutral'] as const;
    for (const roleKey of roles) {
      const scale = scales[roleKey];
      if (!scale) continue;

      const roleColumn = figma.createFrame();
      roleColumn.layoutMode = 'VERTICAL';
      roleColumn.primaryAxisSizingMode = 'AUTO';
      roleColumn.counterAxisSizingMode = 'AUTO';
      roleColumn.itemSpacing = 4;
      roleColumn.fills = [];

      // Role label
      const roleLabel = createText(roleKey.toUpperCase(), 7, "Medium", mutedColor);
      roleColumn.appendChild(roleLabel);

      // Swatches row for this role
      const swatchRow = figma.createFrame();
      swatchRow.layoutMode = 'HORIZONTAL';
      swatchRow.primaryAxisSizingMode = 'AUTO';
      swatchRow.counterAxisSizingMode = 'AUTO';
      swatchRow.itemSpacing = 2;
      swatchRow.fills = [];

      for (const stepNum of group.steps) {
        const step = scale.steps[stepNum - 1];
        if (!step) continue;

        const swatchContainer = figma.createFrame();
        swatchContainer.layoutMode = 'VERTICAL';
        swatchContainer.primaryAxisSizingMode = 'AUTO';
        swatchContainer.counterAxisSizingMode = 'AUTO';
        swatchContainer.itemSpacing = 2;
        swatchContainer.fills = [];

        const swatch = createColorSwatch(step.hex, 32, 32, 4);
        swatchContainer.appendChild(swatch);

        // Step label
        const semantic = SEMANTIC_LABELS[stepNum];
        const stepLabel = createText(semantic.short, 5, "Regular", mutedColor);
        swatchContainer.appendChild(stepLabel);

        // Accessibility badge for text colors
        if (stepNum === 11 || stepNum === 12) {
          const bgColor = scale.steps[0].hex;
          const contrast = calculateContrastRatio(step.hex, bgColor);
          const { rating, color } = getAccessibilityRating(contrast);
          const badge = createText(rating, 5, "Medium", color);
          swatchContainer.appendChild(badge);
        }

        swatchRow.appendChild(swatchContainer);
      }

      roleColumn.appendChild(swatchRow);
      roleSwatches.appendChild(roleColumn);
    }

    groupFrame.appendChild(roleSwatches);
    semanticSection.appendChild(groupFrame);
  }

  frame.appendChild(semanticSection);

  // Extended Palette Section
  const extendedSection = figma.createFrame();
  extendedSection.name = "Extended Palette";
  extendedSection.layoutMode = 'VERTICAL';
  extendedSection.primaryAxisSizingMode = 'AUTO';
  extendedSection.counterAxisSizingMode = 'AUTO';
  extendedSection.itemSpacing = 16;
  extendedSection.fills = [];

  const extendedTitle = createText("FULL COLOR SCALES", 11, "Bold", mutedColor);
  extendedTitle.letterSpacing = { value: 1.5, unit: "PIXELS" };
  extendedSection.appendChild(extendedTitle);

  // Add all scales
  const extendedScaleOrder = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
  for (const key of extendedScaleOrder) {
    const scale = scales[key];
    if (scale) {
      const row = await createScaleRow(scale, mode, true, 48);
      extendedSection.appendChild(row);
    }
  }

  frame.appendChild(extendedSection);

  // Color Pairing Guide Section
  const pairingGuide = await createColorPairingGuide(scales, mode);
  frame.appendChild(pairingGuide);

  return frame;
}

// Main function to generate color system frames
async function generateColorSystemFrames(config: any, scalesData: ColorSystemData) {
  await loadFonts();

  const { detailLevel, includeDarkMode, systemName, scaleMethod } = scalesData;
  const { light: lightScales, dark: darkScales } = scalesData.scales;

  // Create parent container
  const container = figma.createFrame();
  const methodLabel = scaleMethod === 'custom' ? 'Custom Scales' : 'Radix Matched';
  container.name = `Color System - ${systemName} (${methodLabel})`;
  container.layoutMode = 'HORIZONTAL';
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';
  container.itemSpacing = 32;
  container.fills = [];

  // Generate light mode frame
  let lightFrame: FrameNode;
  switch (detailLevel) {
    case 'minimal':
      lightFrame = await generateMinimalLayout(lightScales, 'light');
      break;
    case 'detailed':
      lightFrame = await generateDetailedLayout(lightScales, scalesData.usageProportions, 'light');
      break;
    case 'presentation':
      lightFrame = await generatePresentationLayout(systemName, lightScales, scalesData.usageProportions, 'light');
      break;
    default:
      lightFrame = await generateDetailedLayout(lightScales, scalesData.usageProportions, 'light');
  }
  container.appendChild(lightFrame);

  // Generate dark mode frame if requested
  if (includeDarkMode && darkScales) {
    let darkFrame: FrameNode;
    switch (detailLevel) {
      case 'minimal':
        darkFrame = await generateMinimalLayout(darkScales, 'dark');
        break;
      case 'detailed':
        darkFrame = await generateDetailedLayout(darkScales, scalesData.usageProportions, 'dark');
        break;
      case 'presentation':
        darkFrame = await generatePresentationLayout(systemName, darkScales, scalesData.usageProportions, 'dark');
        break;
      default:
        darkFrame = await generateDetailedLayout(darkScales, scalesData.usageProportions, 'dark');
    }
    container.appendChild(darkFrame);
  }

  // Position next to selection or in viewport center
  const selection = figma.currentPage.selection;
  if (selection.length > 0) {
    const bounds = selection[0];
    container.x = bounds.x + bounds.width + 48;
    container.y = bounds.y;
  } else {
    container.x = figma.viewport.center.x - container.width / 2;
    container.y = figma.viewport.center.y - container.height / 2;
  }

  figma.currentPage.selection = [container];
  figma.viewport.scrollAndZoomIntoView([container]);

  figma.notify(`Created "${systemName}" color system with ${includeDarkMode ? 'light & dark modes' : 'light mode'}`);
}

// ============================================
// Create Color Styles from Color System
// ============================================

interface CreateStylesScaleData {
  name: string;
  role: string;
  steps: { step: number; hex: string }[];
}

interface CreateStylesData {
  systemName: string;
  includeDarkMode: boolean;
  scales: {
    light: {
      primary?: CreateStylesScaleData;
      secondary?: CreateStylesScaleData;
      tertiary?: CreateStylesScaleData;
      accent?: CreateStylesScaleData;
      neutral: CreateStylesScaleData;
    };
    dark?: {
      primary?: CreateStylesScaleData;
      secondary?: CreateStylesScaleData;
      tertiary?: CreateStylesScaleData;
      accent?: CreateStylesScaleData;
      neutral: CreateStylesScaleData;
    };
  };
}

// Convert step number to Radix-style name (1-12 → 50-1200)
function stepToStyleNumber(step: number): string {
  const mapping: Record<number, string> = {
    1: '50',
    2: '100',
    3: '200',
    4: '300',
    5: '400',
    6: '500',
    7: '600',
    8: '700',
    9: '800',
    10: '900',
    11: '1000',
    12: '1100',
  };
  return mapping[step] || step.toString();
}

/**
 * Create Figma color styles from a color system
 * Naming convention: [System Name]/[Mode]/[Role]/[Step]
 * e.g., "Brand Colors/Light/Primary/800"
 */
async function createColorStyles(scalesData: CreateStylesData, systemName: string) {
  const existingStyles = await figma.getLocalPaintStylesAsync();
  const existingStyleNames = new Set(existingStyles.map(s => s.name));
  
  let created = 0;
  let skipped = 0;

  // Helper to create a single style
  const createStyle = async (
    basePath: string,
    role: string,
    step: number,
    hex: string
  ) => {
    const styleName = `${basePath}/${role}/${stepToStyleNumber(step)}`;
    
    // Check if style already exists
    if (existingStyleNames.has(styleName)) {
      skipped++;
      return;
    }

    const style = figma.createPaintStyle();
    style.name = styleName;
    style.paints = [{
      type: 'SOLID',
      color: hexToFigmaRgb(hex)
    }];
    
    created++;
  };

  // Create styles for a set of scales
  const createScaleStyles = async (
    scales: CreateStylesData['scales']['light'],
    modePath: string
  ) => {
    const styleScaleOrder = ['primary', 'secondary', 'tertiary', 'accent', 'neutral'] as const;
    
    for (const key of styleScaleOrder) {
      const scale = scales[key];
      if (scale) {
        for (const step of scale.steps) {
          await createStyle(modePath, scale.role, step.step, step.hex);
        }
      }
    }
  };

  // Create light mode styles
  const lightPath = scalesData.includeDarkMode 
    ? `${systemName}/Light` 
    : systemName;
  await createScaleStyles(scalesData.scales.light, lightPath);

  // Create dark mode styles if available
  if (scalesData.includeDarkMode && scalesData.scales.dark) {
    const darkPath = `${systemName}/Dark`;
    await createScaleStyles(scalesData.scales.dark, darkPath);
  }

  // Also create semantic aliases for common use cases
  const lightScales = scalesData.scales.light;
  const basePath = scalesData.includeDarkMode ? `${systemName}/Light` : systemName;
  
  // Create semantic aliases
  const semanticAliases = [
    // Backgrounds
    { name: 'bg-app', scale: 'neutral', step: 1 },
    { name: 'bg-subtle', scale: 'neutral', step: 2 },
    { name: 'bg-muted', scale: 'neutral', step: 3 },
    // Foreground/Text
    { name: 'text-primary', scale: 'neutral', step: 12 },
    { name: 'text-secondary', scale: 'neutral', step: 11 },
    { name: 'text-muted', scale: 'neutral', step: 9 },
    // Borders
    { name: 'border-subtle', scale: 'neutral', step: 6 },
    { name: 'border-default', scale: 'neutral', step: 7 },
    { name: 'border-strong', scale: 'neutral', step: 8 },
  ];

  for (const alias of semanticAliases) {
    const scale = lightScales[alias.scale as keyof typeof lightScales];
    if (scale) {
      const step = scale.steps.find(s => s.step === alias.step);
      if (step) {
        const styleName = `${basePath}/Semantic/${alias.name}`;
        if (!existingStyleNames.has(styleName)) {
          const style = figma.createPaintStyle();
          style.name = styleName;
          style.paints = [{
            type: 'SOLID',
            color: hexToFigmaRgb(step.hex)
          }];
          created++;
        }
      }
    }
  }

  // Add primary color semantic aliases if available
  if (lightScales.primary) {
    const primaryAliases = [
      { name: 'primary-bg', step: 3 },
      { name: 'primary-bg-hover', step: 4 },
      { name: 'primary-solid', step: 9 },
      { name: 'primary-solid-hover', step: 10 },
      { name: 'primary-text', step: 11 },
    ];

    for (const alias of primaryAliases) {
      const step = lightScales.primary.steps.find(s => s.step === alias.step);
      if (step) {
        const styleName = `${basePath}/Semantic/${alias.name}`;
        if (!existingStyleNames.has(styleName)) {
          const style = figma.createPaintStyle();
          style.name = styleName;
          style.paints = [{
            type: 'SOLID',
            color: hexToFigmaRgb(step.hex)
          }];
          created++;
        }
      }
    }
  }

  figma.notify(`Created ${created} color styles${skipped > 0 ? ` (${skipped} already existed)` : ''}`);
}
