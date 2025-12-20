// ============================================
// Grid Analysis Service - Claude Vision API
// ============================================

import type { DetectedGrid, GridPattern, GridSymmetry } from '../types/grid'

// ============================================
// Types
// ============================================

export interface GridAnalysisRequest {
  /** Base64-encoded image data (without data:image prefix) */
  imageData: string
  /** Image width in pixels */
  width: number
  /** Image height in pixels */
  height: number
  /** Anthropic API key */
  apiKey: string
}

export interface GridAnalysisResult {
  success: boolean
  grid?: DetectedGrid
  error?: string
  rawResponse?: string
}

// ============================================
// Claude Vision API Configuration
// ============================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

// ============================================
// Structured Prompt for Grid Detection
// ============================================

const GRID_ANALYSIS_PROMPT = `You are an expert in graphic design and grid systems, particularly the Swiss/International Typographic Style. Analyze this design image and identify its underlying grid structure.

Look for:
1. **Column structure**: Count vertical divisions, estimate column widths and gutters
2. **Row structure**: If there's a modular grid, count horizontal divisions
3. **Margins**: Estimate the outer margins on all sides
4. **Grid type**: Determine if it's a column grid, modular grid, manuscript (single column), or has no clear grid
5. **Symmetry**: Is the layout symmetric or asymmetric?

Important guidelines:
- Express gutters and margins as PERCENTAGES of the total width/height
- For column grids, focus on the main content columns, not decorative elements
- Consider that many Swiss designs use 3, 4, 5, 6, 8, or 12 columns
- If no clear grid is visible, set gridType to "none" and confidence to a low value
- Confidence should reflect how clearly defined the grid is (0-100)

Respond with ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "gridType": "column" | "modular" | "manuscript" | "none",
  "columns": <number or null>,
  "gutterPercent": <number or null>,
  "marginLeftPercent": <number>,
  "marginRightPercent": <number>,
  "marginTopPercent": <number>,
  "marginBottomPercent": <number>,
  "rows": <number or null>,
  "rowGutterPercent": <number or null>,
  "aspectRatio": "<width>:<height>",
  "symmetry": "symmetric" | "asymmetric",
  "confidence": <number 0-100>,
  "notes": "<brief description of the detected grid>"
}`

// ============================================
// Grid Analysis Function
// ============================================

/**
 * Analyze an image using Claude Vision API to detect grid structure
 */
export async function analyzeGridWithClaude(
  request: GridAnalysisRequest
): Promise<GridAnalysisResult> {
  const { imageData, width, height, apiKey } = request
  
  // Validate API key
  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      error: 'API key is required. Please add your Anthropic API key in settings.',
    }
  }
  
  // Validate image data
  if (!imageData || imageData.trim() === '') {
    return {
      success: false,
      error: 'No image data provided',
    }
  }
  
  try {
    // Prepare the API request
    const requestBody = {
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: imageData,
              },
            },
            {
              type: 'text',
              text: GRID_ANALYSIS_PROMPT,
            },
          ],
        },
      ],
    }
    
    // Make the API call
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
    })
    
    // Check for HTTP errors
    if (!response.ok) {
      const errorBody = await response.text()
      
      if (response.status === 401) {
        return {
          success: false,
          error: 'Invalid API key. Please check your Anthropic API key.',
        }
      }
      
      if (response.status === 429) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please wait a moment and try again.',
        }
      }
      
      if (response.status === 400) {
        // Check for specific error messages
        try {
          const errorJson = JSON.parse(errorBody)
          if (errorJson.error?.message?.includes('image')) {
            return {
              success: false,
              error: 'Image processing error. Try a smaller or different image.',
            }
          }
        } catch {
          // Ignore JSON parse error
        }
      }
      
      return {
        success: false,
        error: `API error (${response.status}): ${errorBody.slice(0, 200)}`,
        rawResponse: errorBody,
      }
    }
    
    // Parse the response
    const data = await response.json()
    
    // Extract the text content from Claude's response
    const textContent = data.content?.find((c: any) => c.type === 'text')
    if (!textContent || !textContent.text) {
      return {
        success: false,
        error: 'No text response from Claude',
        rawResponse: JSON.stringify(data),
      }
    }
    
    // Parse the JSON from Claude's response
    const responseText = textContent.text.trim()
    const gridData = parseGridResponse(responseText)
    
    if (!gridData) {
      return {
        success: false,
        error: 'Failed to parse grid analysis response',
        rawResponse: responseText,
      }
    }
    
    // Build the DetectedGrid object
    const detectedGrid: DetectedGrid = {
      gridType: gridData.gridType as GridPattern,
      columns: gridData.columns,
      gutterPercent: gridData.gutterPercent,
      marginLeftPercent: gridData.marginLeftPercent || 5,
      marginRightPercent: gridData.marginRightPercent || 5,
      marginTopPercent: gridData.marginTopPercent || 5,
      marginBottomPercent: gridData.marginBottomPercent || 5,
      rows: gridData.rows,
      rowGutterPercent: gridData.rowGutterPercent,
      aspectRatio: gridData.aspectRatio || `${width}:${height}`,
      symmetry: gridData.symmetry as GridSymmetry || 'symmetric',
      confidence: gridData.confidence || 50,
      notes: gridData.notes || '',
      sourceWidth: width,
      sourceHeight: height,
    }
    
    return {
      success: true,
      grid: detectedGrid,
      rawResponse: responseText,
    }
    
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        error: 'Network error. Please check your internet connection.',
      }
    }
    
    return {
      success: false,
      error: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

// ============================================
// Response Parsing
// ============================================

interface RawGridResponse {
  gridType: string
  columns: number | null
  gutterPercent: number | null
  marginLeftPercent: number
  marginRightPercent: number
  marginTopPercent: number
  marginBottomPercent: number
  rows: number | null
  rowGutterPercent: number | null
  aspectRatio: string
  symmetry: string
  confidence: number
  notes: string
}

/**
 * Parse Claude's response text into grid data
 */
function parseGridResponse(responseText: string): RawGridResponse | null {
  try {
    // Try to extract JSON from the response
    // Claude might sometimes wrap it in markdown code blocks
    let jsonStr = responseText
    
    // Remove markdown code blocks if present
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    
    // Try to find JSON object boundaries
    const startIdx = jsonStr.indexOf('{')
    const endIdx = jsonStr.lastIndexOf('}')
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.slice(startIdx, endIdx + 1)
    }
    
    // Parse the JSON
    const data = JSON.parse(jsonStr)
    
    // Validate required fields
    if (!data.gridType) {
      return null
    }
    
    // Normalize and validate values
    return {
      gridType: normalizeGridType(data.gridType),
      columns: normalizeNumber(data.columns, 1, 24),
      gutterPercent: normalizeNumber(data.gutterPercent, 0, 20),
      marginLeftPercent: normalizeNumber(data.marginLeftPercent, 0, 30) || 5,
      marginRightPercent: normalizeNumber(data.marginRightPercent, 0, 30) || 5,
      marginTopPercent: normalizeNumber(data.marginTopPercent, 0, 30) || 5,
      marginBottomPercent: normalizeNumber(data.marginBottomPercent, 0, 30) || 5,
      rows: normalizeNumber(data.rows, 1, 24),
      rowGutterPercent: normalizeNumber(data.rowGutterPercent, 0, 20),
      aspectRatio: data.aspectRatio || '4:3',
      symmetry: normalizeSymmetry(data.symmetry),
      confidence: normalizeNumber(data.confidence, 0, 100) || 50,
      notes: typeof data.notes === 'string' ? data.notes : '',
    }
    
  } catch (error) {
    console.error('Failed to parse grid response:', error)
    return null
  }
}

/**
 * Normalize grid type to valid enum value
 */
function normalizeGridType(value: unknown): string {
  const validTypes = ['column', 'modular', 'manuscript', 'baseline', 'none']
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    if (validTypes.includes(lower)) {
      return lower
    }
  }
  return 'none'
}

/**
 * Normalize symmetry value
 */
function normalizeSymmetry(value: unknown): string {
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    if (lower === 'asymmetric') return 'asymmetric'
  }
  return 'symmetric'
}

/**
 * Normalize number within bounds
 */
function normalizeNumber(
  value: unknown,
  min: number,
  max: number
): number | null {
  if (value === null || value === undefined) {
    return null
  }
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (isNaN(num)) {
    return null
  }
  return Math.max(min, Math.min(max, num))
}

// ============================================
// Convert DetectedGrid to GridConfig
// ============================================

import type { GridConfig } from '../types/grid'

/**
 * Convert a detected grid into a usable GridConfig
 */
export function detectedGridToConfig(detected: DetectedGrid): GridConfig {
  const config: GridConfig = {}
  
  // Add column configuration if columns detected
  if (detected.columns && detected.columns > 0 && detected.gridType !== 'none') {
    config.columns = {
      count: detected.columns,
      gutterSize: detected.gutterPercent ?? 2.5,
      gutterUnit: 'percent',
      margin: Math.max(detected.marginLeftPercent, detected.marginRightPercent),
      marginUnit: 'percent',
      alignment: detected.symmetry === 'symmetric' ? 'STRETCH' : 'MIN',
      visible: true,
      color: { r: 1, g: 0.2, b: 0.2, a: 0.15 },
    }
  }
  
  // Add row configuration if rows detected (modular grid)
  if (detected.rows && detected.rows > 0 && detected.gridType === 'modular') {
    config.rows = {
      count: detected.rows,
      gutterSize: detected.rowGutterPercent ?? 2.5,
      gutterUnit: 'percent',
      margin: Math.max(detected.marginTopPercent, detected.marginBottomPercent),
      marginUnit: 'percent',
      alignment: 'STRETCH',
      visible: true,
      color: { r: 0.2, g: 0.4, b: 1, a: 0.15 },
    }
  }
  
  return config
}

// ============================================
// API Key Storage
// ============================================

const API_KEY_STORAGE_KEY = 'anthropic_api_key'

/**
 * Save API key to local storage (browser-side for UI)
 */
export function saveApiKey(apiKey: string): void {
  try {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey)
  } catch (error) {
    console.error('Failed to save API key:', error)
  }
}

/**
 * Load API key from local storage
 */
export function loadApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to load API key:', error)
    return null
  }
}

/**
 * Clear stored API key
 */
export function clearApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear API key:', error)
  }
}

/**
 * Check if API key is stored
 */
export function hasApiKey(): boolean {
  return !!loadApiKey()
}

