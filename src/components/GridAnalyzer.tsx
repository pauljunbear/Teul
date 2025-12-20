import * as React from 'react'
import { SaveGridModal } from './SaveGridModal'
import { buildApplyGridMessage, buildCreateGridFrameMessage } from '../lib/figmaGrids'
import type { GridConfig } from '../types/grid'

interface GridAnalyzerProps {
  isDark: boolean
}

interface AnalysisResult {
  gridType: 'column' | 'modular'
  columns: { count: number; gutter: number; margin: number }
  rows: { count: number; gutter: number }
  confidence: number
  description: string
}

const styles = {
  light: {
    bg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    inputBg: '#f5f5f5',
    cardBg: '#f8f8f8',
    successBg: '#e6f4ea',
    successText: '#137333',
    warningBg: '#fef3e6',
    warningText: '#b45309',
    errorBg: '#fce8e8',
    errorText: '#c62828',
  },
  dark: {
    bg: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    border: '#404040',
    inputBg: '#2a2a2a',
    cardBg: '#262626',
    successBg: '#1e3a2f',
    successText: '#7dd3a0',
    warningBg: '#3a2e1e',
    warningText: '#fbbf24',
    errorBg: '#3a1e1e',
    errorText: '#f87171',
  }
}

export const GridAnalyzer: React.FC<GridAnalyzerProps> = ({ isDark }) => {
  const theme = isDark ? styles.dark : styles.light
  
  // State
  const [isAnalyzing, setIsAnalyzing] = React.useState(false)
  const [hasImage, setHasImage] = React.useState(false)
  const [imageData, setImageData] = React.useState<string | null>(null)
  const [rawImageData, setRawImageData] = React.useState<string | null>(null)
  const [imageWidth, setImageWidth] = React.useState(0)
  const [imageHeight, setImageHeight] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  
  // API Key
  const [apiKey, setApiKey] = React.useState<string>('')
  const [showApiKeyInput, setShowApiKeyInput] = React.useState(false)
  
  // Analysis result
  const [result, setResult] = React.useState<AnalysisResult | null>(null)
  const [showSaveModal, setShowSaveModal] = React.useState(false)
  
  // Load API key on mount via figma.clientStorage
  React.useEffect(() => {
    // Check for env variable first (set at build time)
    const envKey = (typeof process !== 'undefined' && process.env?.ANTHROPIC_API_KEY) || ''
    if (envKey) {
      setApiKey(envKey)
      return
    }
    
    // Request stored key from figma.clientStorage via code.ts
    parent.postMessage({ pluginMessage: { type: 'load-api-key' } }, '*')
  }, [])
  
  // Listen for messages from Figma
  React.useEffect(() => {
    const checkSelection = () => {
      parent.postMessage({ pluginMessage: { type: 'get-selection-for-grid' } }, '*')
    }
    
    checkSelection()
    
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage
      
      if (msg?.type === 'selection-info') {
        setHasImage(msg.isImage || msg.isFrame)
        if (msg.width) setImageWidth(msg.width)
        if (msg.height) setImageHeight(msg.height)
      }
      
      if (msg?.type === 'image-exported') {
        if (msg.success && msg.imageData) {
          setRawImageData(msg.imageData)
          setImageData(`data:image/png;base64,${msg.imageData}`)
          setImageWidth(msg.width)
          setImageHeight(msg.height)
          setError(null)
          
          // Trigger analysis via code.ts (avoids CORS)
          if (apiKey) {
            parent.postMessage({
              pluginMessage: {
                type: 'analyze-grid-with-claude',
                imageData: msg.imageData,
                width: msg.width,
                height: msg.height,
                apiKey,
              }
            }, '*')
          } else {
            setIsAnalyzing(false)
            setError('Please enter your Anthropic API key')
          }
        } else {
          setIsAnalyzing(false)
          setError(msg.error || 'Failed to export image')
        }
      }
      
      // Handle Claude analysis result
      if (msg?.type === 'claude-analysis-result') {
        setIsAnalyzing(false)
        if (msg.success && msg.result) {
          setResult(msg.result)
          setError(null)
        } else {
          setError(msg.error || 'Analysis failed')
        }
      }
      
      // Handle API key loaded from storage
      if (msg?.type === 'api-key-loaded') {
        if (msg.apiKey) {
          setApiKey(msg.apiKey)
          setShowApiKeyInput(false)
        } else {
          setShowApiKeyInput(true)
        }
      }
      
      // Handle API key saved confirmation
      if (msg?.type === 'api-key-saved') {
        if (msg.success) {
          setShowApiKeyInput(false)
        }
      }
    }
    
    window.addEventListener('message', handleMessage)
    const interval = setInterval(checkSelection, 2000)
    
    return () => {
      window.removeEventListener('message', handleMessage)
      clearInterval(interval)
    }
  }, [apiKey])
  
  // Start analysis
  const handleAnalyze = () => {
    if (!apiKey) {
      setError('Please enter your API key first')
      return
    }
    
    setIsAnalyzing(true)
    setError(null)
    setResult(null)
    parent.postMessage({ pluginMessage: { type: 'export-image-for-analysis' } }, '*')
  }
  
  // Save API key via figma.clientStorage
  const handleSaveKey = () => {
    if (apiKey.trim()) {
      parent.postMessage({ 
        pluginMessage: { type: 'save-api-key', apiKey: apiKey.trim() } 
      }, '*')
    }
  }
  
  // Convert result to GridConfig (internal format)
  const resultToGridConfig = (): GridConfig => {
    if (!result) {
      return {
        columns: {
          count: 4,
          gutterSize: 3,
          gutterUnit: 'percent',
          margin: 5,
          marginUnit: 'percent',
          alignment: 'STRETCH',
          visible: true,
          color: { r: 1, g: 0.2, b: 0.2, a: 0.1 },
        }
      }
    }
    
    const config: GridConfig = {
      columns: {
        count: result.columns.count,
        gutterSize: result.columns.gutter,
        gutterUnit: 'percent',
        margin: result.columns.margin,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: { r: 1, g: 0.2, b: 0.2, a: 0.1 },
      }
    }
    
    if (result.gridType === 'modular' && result.rows.count > 0) {
      config.rows = {
        count: result.rows.count,
        gutterSize: result.rows.gutter,
        gutterUnit: 'percent',
        margin: result.columns.margin,
        marginUnit: 'percent',
        alignment: 'STRETCH',
        visible: true,
        color: { r: 0.2, g: 0.5, b: 1, a: 0.1 },
      }
    }
    
    return config
  }
  
  // Apply to selection
  const handleApply = () => {
    const config = resultToGridConfig()
    const width = imageWidth || 800
    const height = imageHeight || 1000
    
    const message = buildApplyGridMessage({
      config,
      width,
      height,
      replaceExisting: true,
    })
    
    parent.postMessage({ pluginMessage: message }, '*')
  }
  
  // Create new frame
  const handleCreateFrame = () => {
    const config = resultToGridConfig()
    const width = imageWidth || 800
    const height = imageHeight || 1000
    
    const message = buildCreateGridFrameMessage({
      config,
      frameName: `Analyzed ${result?.columns.count || 4}-Column Grid`,
      width,
      height,
      positionNearSelection: true,
    })
    
    parent.postMessage({ pluginMessage: message }, '*')
  }
  
  // Render grid preview SVG
  const renderGridPreview = () => {
    if (!result || !imageData) return null
    
    const previewWidth = 280
    const previewHeight = (imageHeight / imageWidth) * previewWidth
    const marginPx = (result.columns.margin / 100) * previewWidth
    const availableWidth = previewWidth - (marginPx * 2)
    const gutterPx = (result.columns.gutter / 100) * previewWidth
    const totalGutters = gutterPx * (result.columns.count - 1)
    const colWidth = (availableWidth - totalGutters) / result.columns.count
    
    const columns = []
    let x = marginPx
    for (let i = 0; i < result.columns.count; i++) {
      columns.push(
        <rect
          key={i}
          x={x}
          y={0}
          width={colWidth}
          height={previewHeight}
          fill="rgba(239, 68, 68, 0.2)"
          stroke="rgba(239, 68, 68, 0.4)"
          strokeWidth={0.5}
        />
      )
      x += colWidth + gutterPx
    }
    
    return (
      <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
        <img 
          src={imageData} 
          alt="Analyzed" 
          style={{ 
            width: previewWidth, 
            height: previewHeight,
            display: 'block',
          }} 
        />
        <svg
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          width={previewWidth}
          height={previewHeight}
        >
          {columns}
        </svg>
      </div>
    )
  }
  
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.bg,
    }}>
      {/* Status Bar */}
      {!hasImage && (
        <div style={{
          padding: '10px 16px',
          backgroundColor: theme.warningBg,
          color: theme.warningText,
          fontSize: '12px',
          fontWeight: 500,
        }}>
          ⚠ Select an image or frame to analyze
        </div>
      )}
      
      {/* Main Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
      }}>
        {/* API Key Section */}
        {showApiKeyInput ? (
          <div style={{
            padding: '16px',
            backgroundColor: theme.cardBg,
            borderRadius: '8px',
            marginBottom: '16px',
            border: `1px solid ${theme.border}`,
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              marginBottom: '12px',
            }}>
              <span style={{ fontSize: '16px' }}>🔑</span>
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: theme.text }}>
                Anthropic API Key
              </h4>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSaveKey}
                disabled={!apiKey.trim()}
                style={{
                  padding: '10px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: apiKey.trim() ? '#3b82f6' : theme.border,
                  color: apiKey.trim() ? '#fff' : theme.textMuted,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: apiKey.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Save
              </button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '10px', color: theme.textMuted }}>
              Get your key at console.anthropic.com
            </p>
          </div>
        ) : apiKey && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            backgroundColor: theme.successBg,
            borderRadius: '6px',
            marginBottom: '16px',
          }}>
            <span style={{ fontSize: '12px', color: theme.successText }}>
              ✓ API key saved
            </span>
            <button
              onClick={() => setShowApiKeyInput(true)}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: 'transparent',
                color: theme.successText,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          </div>
        )}
        
        {/* No Result State */}
        {!result && !isAnalyzing && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              backgroundColor: theme.cardBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '28px',
            }}>
              🔍
            </div>
            <h3 style={{ 
              margin: '0 0 8px', 
              fontSize: '16px', 
              fontWeight: 600, 
              color: theme.text 
            }}>
              Analyze Grid Structure
            </h3>
            <p style={{ 
              margin: '0 0 20px', 
              fontSize: '13px', 
              color: theme.textMuted,
              lineHeight: 1.5,
            }}>
              Select an image or poster, then click analyze to detect its underlying grid system.
            </p>
            <button
              onClick={handleAnalyze}
              disabled={!hasImage || !apiKey || isAnalyzing}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: (hasImage && apiKey) ? '#3b82f6' : theme.border,
                color: (hasImage && apiKey) ? '#fff' : theme.textMuted,
                fontSize: '14px',
                fontWeight: 600,
                cursor: (hasImage && apiKey) ? 'pointer' : 'not-allowed',
              }}
            >
              🔍 Analyze Image
            </button>
          </div>
        )}
        
        {/* Loading State */}
        {isAnalyzing && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: `3px solid ${theme.border}`,
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              margin: '0 auto 16px',
              animation: 'spin 1s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ margin: 0, fontSize: '14px', color: theme.textMuted }}>
              Analyzing grid structure...
            </p>
          </div>
        )}
        
        {/* Error State */}
        {error && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: theme.errorBg,
            borderRadius: '8px',
            marginBottom: '16px',
          }}>
            <p style={{ margin: 0, fontSize: '12px', color: theme.errorText }}>
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}
        
        {/* Result */}
        {result && !isAnalyzing && (
          <div>
            {/* Preview with Grid Overlay */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '20px',
            }}>
              {renderGridPreview()}
            </div>
            
            {/* Grid Info Card */}
            <div style={{
              padding: '16px',
              backgroundColor: theme.cardBg,
              borderRadius: '8px',
              marginBottom: '16px',
              border: `1px solid ${theme.border}`,
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '12px',
              }}>
                <h4 style={{ 
                  margin: 0, 
                  fontSize: '14px', 
                  fontWeight: 600, 
                  color: theme.text 
                }}>
                  Suggested Grid
                </h4>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: result.confidence >= 70 
                    ? theme.successBg 
                    : result.confidence >= 40 
                    ? theme.warningBg 
                    : theme.errorBg,
                  color: result.confidence >= 70 
                    ? theme.successText 
                    : result.confidence >= 40 
                    ? theme.warningText 
                    : theme.errorText,
                }}>
                  {result.confidence}% confidence
                </span>
              </div>
              
              {/* Grid Stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                marginBottom: '12px',
              }}>
                <div>
                  <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>
                    COLUMNS
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: theme.text }}>
                    {result.columns.count}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>
                    GUTTER
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: theme.text }}>
                    {result.columns.gutter}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>
                    MARGIN
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: theme.text }}>
                    {result.columns.margin}%
                  </div>
                </div>
              </div>
              
              {/* Description */}
              <p style={{
                margin: 0,
                fontSize: '12px',
                color: theme.textMuted,
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}>
                "{result.description}"
              </p>
            </div>
            
            {/* Re-analyze button */}
            <button
              onClick={handleAnalyze}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                backgroundColor: 'transparent',
                color: theme.textMuted,
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                marginBottom: '16px',
              }}
            >
              ↻ Re-analyze
            </button>
          </div>
        )}
      </div>
      
      {/* Action Buttons - Fixed at Bottom */}
      {result && (
        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${theme.border}`,
          backgroundColor: theme.bg,
          display: 'flex',
          gap: '8px',
        }}>
          <button
            onClick={handleApply}
            style={{
              flex: 2,
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#3b82f6',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ✓ Apply to Selection
          </button>
          <button
            onClick={handleCreateFrame}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.cardBg,
              color: theme.text,
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + New Frame
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.cardBg,
              color: theme.text,
              fontSize: '16px',
              cursor: 'pointer',
            }}
            title="Save to My Grids"
          >
            💾
          </button>
        </div>
      )}
      
      {/* Save Modal */}
      {showSaveModal && (
        <SaveGridModal
          config={resultToGridConfig()}
          suggestedName={`Analyzed ${result?.columns.count || 4}-Column Grid`}
          source="Analyzed"
          isDark={isDark}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  )
}

export default GridAnalyzer
