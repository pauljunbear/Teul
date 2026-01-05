// Grid Operations for Figma Backend
// Handles grid frame creation, application, and clearing

// ============================================
// Type Definitions
// ============================================

interface GridColumnConfig {
  pattern: 'COLUMNS' | 'ROWS' | 'GRID';
  alignment: 'MIN' | 'MAX' | 'CENTER' | 'STRETCH';
  gutterSize: number;
  count: number;
  offset: number;
  visible: boolean;
  color: RGBA;
}

interface GridRowConfig {
  pattern: 'COLUMNS' | 'ROWS' | 'GRID';
  alignment: 'MIN' | 'MAX' | 'CENTER' | 'STRETCH';
  gutterSize: number;
  count: number;
  offset: number;
  visible: boolean;
  color: RGBA;
}

interface GridBaselineConfig {
  height?: number;
  sectionSize?: number;
  visible: boolean;
  color: RGBA;
}

interface GridConfig {
  columns?: GridColumnConfig;
  rows?: GridRowConfig;
  baseline?: GridBaselineConfig;
}

// ============================================
// Create Grid Frame
// ============================================

export async function handleCreateGridFrame(msg: {
  config: GridConfig;
  frameName?: string;
  width: number;
  height: number;
  includeImage?: boolean;
  imageData?: string;
  positionNearSelection?: boolean;
}): Promise<void> {
  try {
    const {
      config,
      frameName,
      width,
      height,
      includeImage,
      imageData,
      positionNearSelection = true,
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
        sectionSize: config.baseline.height || 8,
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
        imageRect.name = 'Reference Image';
        imageRect.resize(width, height);
        imageRect.x = 0;
        imageRect.y = 0;
        imageRect.fills = [
          {
            type: 'IMAGE',
            scaleMode: 'FILL',
            imageHash: imageHash,
          },
        ];
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

// ============================================
// Apply Grid to Selection
// ============================================

export function handleApplyGrid(msg: {
  config: GridConfig;
  replaceExisting?: boolean;
  scaledToFit?: boolean;
}): void {
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
        sectionSize: config.baseline.height || 8,
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

    const action = replaceExisting ? (previousCount > 0 ? 'Replaced' : 'Applied') : 'Added';

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

// ============================================
// Clear Grids
// ============================================

export function handleClearGrids(): void {
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

    figma.notify(
      `Cleared ${previousCount} grid${previousCount !== 1 ? 's' : ''} from "${frame.name}"`
    );
  } catch (error) {
    console.error('Error clearing grids:', error);
    figma.notify('Failed to clear grids');
  }
}
