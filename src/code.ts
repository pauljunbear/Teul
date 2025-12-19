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

// Helper to convert hex to Figma RGB
function hexToFigmaRgb(hex: string): RGB {
  const cleanHex = hex.replace('#', '');
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
      const existingStyle = existingStyles.find(s => s.name === `Sanzo/${msg.name}`);
      
      if (existingStyle) {
        figma.notify(`Style "Sanzo/${msg.name}" already exists`);
        return;
      }
      
      const style = figma.createPaintStyle();
      style.name = `Sanzo/${msg.name}`;
      style.paints = [{
        type: 'SOLID',
        color: color
      }];
      
      figma.notify(`Created style: Sanzo/${msg.name}`);
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
    const paletteName = msg.name || 'Sanzo Palette';
    
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
      rect.cornerRadius = 8;
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
  scales: {
    light: {
      primary?: ColorScaleData;
      secondary?: ColorScaleData;
      accent?: ColorScaleData;
      neutral: ColorScaleData;
    };
    dark?: {
      primary?: ColorScaleData;
      secondary?: ColorScaleData;
      accent?: ColorScaleData;
      neutral: ColorScaleData;
    };
  };
  usageProportions: {
    primary: number;
    secondary: number;
    accent: number;
    neutral: number;
  };
}

// Font loading helper
async function loadFonts() {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
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
    swatchFrame.counterAxisSizingMode = 'AUTO';
    swatchFrame.itemSpacing = 2;
    swatchFrame.fills = [];

    const swatch = createColorSwatch(
      step.hex,
      swatchSize,
      swatchSize,
      step.step === 1 ? 4 : step.step === 12 ? 4 : 0
    );
    swatchFrame.appendChild(swatch);

    if (showLabels) {
      const hexLabel = createText(
        step.hex.toUpperCase().slice(1),
        7,
        "Regular",
        mode === 'dark' ? { r: 0.6, g: 0.6, b: 0.6 } : { r: 0.5, g: 0.5, b: 0.5 }
      );
      swatchFrame.appendChild(hexLabel);
    }

    swatchesContainer.appendChild(swatchFrame);
  }

  row.appendChild(swatchesContainer);

  // Step numbers
  if (showLabels) {
    const numbersContainer = figma.createFrame();
    numbersContainer.name = "Step Numbers";
    numbersContainer.layoutMode = 'HORIZONTAL';
    numbersContainer.primaryAxisSizingMode = 'AUTO';
    numbersContainer.counterAxisSizingMode = 'AUTO';
    numbersContainer.itemSpacing = 2;
    numbersContainer.fills = [];

    for (let i = 1; i <= 12; i++) {
      const numFrame = figma.createFrame();
      numFrame.resize(swatchSize, 12);
      numFrame.fills = [];
      numFrame.layoutMode = 'HORIZONTAL';
      numFrame.primaryAxisAlignItems = 'CENTER';
      numFrame.counterAxisAlignItems = 'CENTER';

      const num = createText(
        i.toString(),
        8,
        "Regular",
        mode === 'dark' ? { r: 0.5, g: 0.5, b: 0.5 } : { r: 0.6, g: 0.6, b: 0.6 }
      );
      numFrame.appendChild(num);
      numbersContainer.appendChild(numFrame);
    }

    row.appendChild(numbersContainer);
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

  const blackSwatch = createColorSwatch('#000000', size, size, 8);
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

  const whiteSwatch = createColorSwatch('#FFFFFF', size, size, 8);
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
  proportions: { primary: number; secondary: number; accent: number; neutral: number },
  colors: { primary?: string; secondary?: string; accent?: string; neutral: string },
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

  const total = proportions.primary + proportions.secondary + proportions.accent + proportions.neutral;

  const segments = [
    { key: 'primary', color: colors.primary, proportion: proportions.primary },
    { key: 'secondary', color: colors.secondary, proportion: proportions.secondary },
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
  const scaleOrder = ['primary', 'secondary', 'accent', 'neutral'] as const;
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
  const scaleOrder = ['primary', 'secondary', 'accent', 'neutral'] as const;
  for (const key of scaleOrder) {
    const scale = scales[key];
    if (scale) {
      const row = await createScaleRow(scale, mode, true, 40);
      frame.appendChild(row);
    }
  }

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
  const mainColors = ['primary', 'secondary', 'accent', 'neutral'] as const;
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

      const swatch = createColorSwatch(scale.steps[8].hex, 80, 80, 8);
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

  // Extended Palette Section
  const extendedSection = figma.createFrame();
  extendedSection.name = "Extended Palette";
  extendedSection.layoutMode = 'VERTICAL';
  extendedSection.primaryAxisSizingMode = 'AUTO';
  extendedSection.counterAxisSizingMode = 'AUTO';
  extendedSection.itemSpacing = 16;
  extendedSection.fills = [];

  const extendedTitle = createText("EXTENDED PALETTE", 11, "Bold", mutedColor);
  extendedTitle.letterSpacing = { value: 1.5, unit: "PIXELS" };
  extendedSection.appendChild(extendedTitle);

  // Add all scales
  const scaleOrder = ['neutral', 'primary', 'secondary', 'accent'] as const;
  for (const key of scaleOrder) {
    const scale = scales[key];
    if (scale) {
      const row = await createScaleRow(scale, mode, true, 48);
      extendedSection.appendChild(row);
    }
  }

  frame.appendChild(extendedSection);

  return frame;
}

// Main function to generate color system frames
async function generateColorSystemFrames(config: any, scalesData: ColorSystemData) {
  await loadFonts();

  const { detailLevel, includeDarkMode, systemName } = scalesData;
  const { light: lightScales, dark: darkScales } = scalesData.scales;

  // Create parent container
  const container = figma.createFrame();
  container.name = `Color System - ${systemName}`;
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
      accent?: CreateStylesScaleData;
      neutral: CreateStylesScaleData;
    };
    dark?: {
      primary?: CreateStylesScaleData;
      secondary?: CreateStylesScaleData;
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
    const scaleOrder = ['primary', 'secondary', 'accent', 'neutral'] as const;
    
    for (const key of scaleOrder) {
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
