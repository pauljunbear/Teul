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
};
