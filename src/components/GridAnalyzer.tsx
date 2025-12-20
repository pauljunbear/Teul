import * as React from 'react'
import { GridPreview } from './GridPreview'
import { GridControls } from './GridControls'
import { SaveGridModal } from './SaveGridModal'
import { 
  analyzeGridWithClaude, 
  detectedGridToConfig,
  saveApiKey, 
  loadApiKey, 
  hasApiKey,
  clearApiKey 
} from '../lib/gridAnalysis'
import {
  buildCreateGridFrameMessage,
  buildApplyGridMessage,
  detectedGridToFrameName,
} from '../lib/figmaGrids'
import type { GridConfig, DetectedGrid } from '../types/grid'

interface GridAnalyzerProps {
  isDark: boolean
}

const styles = {
  light: {
    bg: '#ffffff',
    text: '#1a1a1a',
    textMuted: '#666666',
    border: '#e5e5e5',
    inputBg: '#f5f5f5',
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
  const [rawImageData, setRawImageData] = React.useState<string | null>(null) // Base64 without prefix
  const [imageWidth, setImageWidth] = React.useState(0)
  const [imageHeight, setImageHeight] = React.useState(0)
  const [imageName, setImageName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  
  // API Key state
  const [apiKey, setApiKey] = React.useState<string>('')
  const [showApiKeyInput, setShowApiKeyInput] = React.useState(false)
  const [apiKeyError, setApiKeyError] = React.useState<string | null>(null)
  
  // Grid configuration
  const [gridConfig, setGridConfig] = React.useState<GridConfig>({
    columns: {
      count: 4,
      gutterSize: 3,
      gutterUnit: 'percent',
      margin: 5,
      marginUnit: 'percent',
      alignment: 'STRETCH',
      visible: true,
      color: { r: 1, g: 0.2, b: 0.2, a: 0.15 },
    },
  })
  const [originalConfig, setOriginalConfig] = React.useState<GridConfig | null>(null)
  const [detectedGrid, setDetectedGrid] = React.useState<DetectedGrid | null>(null)
  const [showSaveModal, setShowSaveModal] = React.useState(false)
  
  // Load API key on mount
  React.useEffect(() => {
    const storedKey = loadApiKey()
    if (storedKey) {
      setApiKey(storedKey)
    }
  }, [])
  
  // Check for selection on mount
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
        if (msg.name) setImageName(msg.name)
      }
      
      if (msg?.type === 'image-exported') {
        if (msg.success && msg.imageData) {
          setRawImageData(msg.imageData)
          setImageData(`data:image/png;base64,${msg.imageData}`)
          setImageWidth(msg.width)
          setImageHeight(msg.height)
          setError(null)
          
          // Now trigger AI analysis if we have an API key
          if (apiKey) {
            runAnalysis(msg.imageData, msg.width, msg.height)
          } else {
            setIsAnalyzing(false)
            setShowApiKeyInput(true)
            setApiKeyError('Please enter your Anthropic API key to analyze grids')
          }
        } else {
          setIsAnalyzing(false)
          setError(msg.error || 'Failed to export image')
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
  
  // Run Claude Vision analysis
  const runAnalysis = async (base64Data: string, width: number, height: number) => {
    setIsAnalyzing(true)
    setError(null)
    setApiKeyError(null)
    
    try {
      const result = await analyzeGridWithClaude({
        imageData: base64Data,
        width,
        height,
        apiKey,
      })
      
      if (result.success && result.grid) {
        setDetectedGrid(result.grid)
        
        // Convert detected grid to config
        const newConfig = detectedGridToConfig(result.grid)
        setGridConfig(newConfig)
        setOriginalConfig(newConfig)
        
        setError(null)
      } else {
        setError(result.error || 'Analysis failed')
        
        // If API key error, show the input
        if (result.error?.includes('API key')) {
          setShowApiKeyInput(true)
          setApiKeyError(result.error)
        }
        
        // Set a default config for manual mode
        setDetectedGrid({
          gridType: 'none',
          columns: null,
          gutterPercent: null,
          marginLeftPercent: 5,
          marginRightPercent: 5,
          marginTopPercent: 5,
          marginBottomPercent: 5,
          rows: null,
          rowGutterPercent: null,
          aspectRatio: `${width}:${height}`,
          symmetry: 'symmetric',
          confidence: 0,
          notes: result.error || 'Analysis failed - use manual controls',
          sourceWidth: width,
          sourceHeight: height,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }
  
  // Save API key and retry analysis
  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      saveApiKey(apiKey.trim())
      setShowApiKeyInput(false)
      setApiKeyError(null)
      
      // If we have image data, retry analysis
      if (rawImageData && imageWidth && imageHeight) {
        runAnalysis(rawImageData, imageWidth, imageHeight)
      }
    }
  }
  
  // Load image for analysis
  const handleLoadImage = () => {
    setIsAnalyzing(true)
    setError(null)
    setDetectedGrid(null)
    parent.postMessage({ pluginMessage: { type: 'export-image-for-analysis' } }, '*')
  }
  
  // Retry analysis with current image
  const handleRetryAnalysis = () => {
    if (rawImageData && imageWidth && imageHeight) {
      runAnalysis(rawImageData, imageWidth, imageHeight)
    }
  }
  
  // Apply grid to selection
  const handleApplyGrid = () => {
    const width = imageWidth || 800
    const height = imageHeight || 600
    
    const message = buildApplyGridMessage({
      config: gridConfig,
      width,
      height,
      replaceExisting: true,
    })
    
    parent.postMessage({ pluginMessage: message }, '*')
  }
  
  // Create new frame with grid
  const handleCreateFrame = (includeImage: boolean = false) => {
    const width = imageWidth || 800
    const height = imageHeight || 600
    
    // Generate frame name based on detected grid
    const frameName = detectedGrid 
      ? detectedGridToFrameName(detectedGrid, imageName)
      : `Grid - ${imageName || 'Custom'}`
    
    const message = buildCreateGridFrameMessage({
      config: gridConfig,
      frameName,
      width,
      height,
      includeImage: includeImage && !!rawImageData,
      imageData: includeImage ? rawImageData || undefined : undefined,
      positionNearSelection: true,
    })
    
    parent.postMessage({ pluginMessage: message }, '*')
  }
  
  // Reset to original
  const handleReset = () => {
    if (originalConfig) {
      setGridConfig(originalConfig)
    }
  }
  
  // Check if config has changed
  const hasChanges = originalConfig && JSON.stringify(gridConfig) !== JSON.stringify(originalConfig)
  
  // Calculate preview dimensions (fit within available space)
  const maxPreviewWidth = 280
  const maxPreviewHeight = 200
  const aspectRatio = imageWidth && imageHeight ? imageWidth / imageHeight : 4/3
  let previewWidth = maxPreviewWidth
  let previewHeight = previewWidth / aspectRatio
  
  if (previewHeight > maxPreviewHeight) {
    previewHeight = maxPreviewHeight
    previewWidth = previewHeight * aspectRatio
  }
  
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.bg,
    }}>
      {/* Header Status */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: hasImage ? theme.successBg : theme.warningBg,
        borderBottom: `1px solid ${theme.border}`,
      }}>
        <p style={{
          margin: 0,
          fontSize: '12px',
          fontWeight: 500,
          color: hasImage ? theme.successText : theme.warningText,
        }}>
          {hasImage 
            ? `✓ ${imageName || 'Element selected'} (${imageWidth}×${imageHeight})`
            : '⚠ Select an image or frame to analyze'
          }
        </p>
      </div>
      
      {/* Main Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
      }}>
        {/* API Key Configuration */}
        {showApiKeyInput && (
          <div style={{
            padding: '16px',
            backgroundColor: theme.warningBg,
            borderBottom: `1px solid ${theme.border}`,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
            }}>
              <span style={{ fontSize: '16px' }}>🔑</span>
              <h4 style={{
                margin: 0,
                fontSize: '13px',
                fontWeight: 600,
                color: theme.text,
              }}>
                Anthropic API Key Required
              </h4>
            </div>
            
            {apiKeyError && (
              <p style={{
                margin: '0 0 12px 0',
                fontSize: '11px',
                color: theme.warningText,
              }}>
                {apiKeyError}
              </p>
            )}
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKey.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: apiKey.trim() ? '#3b82f6' : theme.border,
                  color: apiKey.trim() ? '#ffffff' : theme.textMuted,
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: apiKey.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Save & Analyze
              </button>
            </div>
            
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '10px',
              color: theme.textMuted,
            }}>
              Your key is stored locally in your browser. Get one at{' '}
              <a 
                href="https://console.anthropic.com/settings/keys" 
                target="_blank"
                style={{ color: '#3b82f6' }}
              >
                console.anthropic.com
              </a>
            </p>
          </div>
        )}
        
        {!imageData ? (
          // Initial state - no image loaded
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '16px',
              backgroundColor: theme.inputBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              fontSize: '32px',
            }}>
              🔍
            </div>
            
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '16px',
              fontWeight: 600,
              color: theme.text,
            }}>
              Analyze Grid Structure
            </h3>
            
            <p style={{
              margin: '0 0 20px 0',
              fontSize: '13px',
              color: theme.textMuted,
              lineHeight: 1.5,
            }}>
              Select an image or poster on your canvas, then click analyze to detect its underlying grid system using AI.
            </p>
            
            {/* API Key Status */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '16px',
              padding: '6px 12px',
              borderRadius: '16px',
              backgroundColor: apiKey ? theme.successBg : theme.warningBg,
              fontSize: '11px',
              color: apiKey ? theme.successText : theme.warningText,
            }}>
              {apiKey ? '✓ API key configured' : '⚠ API key needed'}
              {apiKey && (
                <button
                  onClick={() => {
                    clearApiKey()
                    setApiKey('')
                  }}
                  style={{
                    padding: '2px 6px',
                    marginLeft: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: theme.textMuted,
                    fontSize: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            
            <button
              onClick={() => {
                if (!apiKey) {
                  setShowApiKeyInput(true)
                } else {
                  handleLoadImage()
                }
              }}
              disabled={!hasImage || isAnalyzing}
              style={{
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: hasImage ? '#3b82f6' : theme.border,
                color: hasImage ? '#ffffff' : theme.textMuted,
                fontSize: '13px',
                fontWeight: 600,
                cursor: hasImage ? 'pointer' : 'not-allowed',
                opacity: isAnalyzing ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {isAnalyzing ? (
                <>
                  <span style={{ 
                    display: 'inline-block',
                    animation: 'spin 1s linear infinite',
                  }}>⟳</span>
                  Analyzing with Claude...
                </>
              ) : (
                <>🔍 Load & Analyze</>
              )}
            </button>
            
            {error && (
              <p style={{
                marginTop: '16px',
                padding: '10px 16px',
                backgroundColor: theme.errorBg,
                borderRadius: '8px',
                fontSize: '12px',
                color: theme.errorText,
              }}>
                {error}
              </p>
            )}
            
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        ) : (
          // Image loaded - show preview and controls
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            {/* Preview */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '16px',
              backgroundColor: theme.inputBg,
              borderRadius: '12px',
            }}>
              <GridPreview
                config={gridConfig}
                width={previewWidth}
                height={previewHeight}
                backgroundImage={imageData}
                isDark={isDark}
                showLabels={true}
              />
            </div>
            
            {/* Detection Results */}
            {detectedGrid && (
              <div style={{
                padding: '12px 16px',
                backgroundColor: detectedGrid.confidence >= 70 
                  ? theme.successBg 
                  : detectedGrid.confidence >= 40 
                    ? theme.warningBg 
                    : theme.errorBg,
                borderRadius: '8px',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: detectedGrid.confidence >= 70 
                      ? theme.successText 
                      : detectedGrid.confidence >= 40 
                        ? theme.warningText 
                        : theme.errorText,
                  }}>
                    {detectedGrid.gridType === 'none' 
                      ? '⚠ No Clear Grid Detected' 
                      : detectedGrid.confidence >= 70 
                        ? '✓ Grid Detected' 
                        : detectedGrid.confidence >= 40 
                          ? '⚡ Possible Grid Found'
                          : '? Low Confidence'}
                  </span>
                  
                  {/* Confidence Badge */}
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '10px',
                    fontWeight: 600,
                    backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)',
                    color: detectedGrid.confidence >= 70 
                      ? theme.successText 
                      : detectedGrid.confidence >= 40 
                        ? theme.warningText 
                        : theme.errorText,
                  }}>
                    {detectedGrid.confidence}% confidence
                  </span>
                </div>
                
                {/* Grid Info */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginBottom: '8px',
                }}>
                  {detectedGrid.gridType !== 'none' && (
                    <>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        color: theme.text,
                      }}>
                        {detectedGrid.gridType === 'modular' ? '🔲' : detectedGrid.gridType === 'column' ? '▤' : '📄'}{' '}
                        {detectedGrid.gridType}
                      </span>
                      
                      {detectedGrid.columns && (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                          color: theme.text,
                        }}>
                          {detectedGrid.columns} columns
                        </span>
                      )}
                      
                      {detectedGrid.rows && (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                          color: theme.text,
                        }}>
                          {detectedGrid.rows} rows
                        </span>
                      )}
                      
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                        color: theme.text,
                      }}>
                        {detectedGrid.symmetry}
                      </span>
                    </>
                  )}
                </div>
                
                {/* AI Notes */}
                {detectedGrid.notes && (
                  <p style={{
                    margin: 0,
                    fontSize: '11px',
                    color: theme.textMuted,
                    fontStyle: 'italic',
                  }}>
                    "{detectedGrid.notes}"
                  </p>
                )}
                
                {/* Retry Button */}
                {detectedGrid.confidence < 70 && (
                  <button
                    onClick={handleRetryAnalysis}
                    disabled={isAnalyzing}
                    style={{
                      marginTop: '8px',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: 'transparent',
                      color: theme.textMuted,
                      fontSize: '10px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    ↻ Re-analyze
                  </button>
                )}
              </div>
            )}
            
            {/* Loading State */}
            {isAnalyzing && (
              <div style={{
                padding: '16px',
                backgroundColor: theme.inputBg,
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{
                  fontSize: '24px',
                  marginBottom: '8px',
                  animation: 'spin 1s linear infinite',
                  display: 'inline-block',
                }}>
                  ⟳
                </div>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: theme.textMuted,
                }}>
                  Claude is analyzing the grid structure...
                </p>
              </div>
            )}
            
            {/* Error Display */}
            {error && !isAnalyzing && (
              <div style={{
                padding: '12px 16px',
                backgroundColor: theme.errorBg,
                borderRadius: '8px',
                fontSize: '12px',
                color: theme.errorText,
              }}>
                <strong>Error:</strong> {error}
              </div>
            )}
            
            {/* Grid Controls */}
            <GridControls
              config={gridConfig}
              onChange={setGridConfig}
              onReset={handleReset}
              hasChanges={hasChanges || false}
              frameWidth={imageWidth || 800}
              frameHeight={imageHeight || 600}
              isDark={isDark}
            />
          </div>
        )}
      </div>
      
      {/* Footer Actions */}
      {imageData && (
        <div style={{
          flexShrink: 0,
          padding: '16px',
          borderTop: `1px solid ${theme.border}`,
        }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '8px',
          }}>
            <button
              onClick={handleApplyGrid}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ✓ Apply to Selection
            </button>
            <button
              onClick={() => handleCreateFrame(false)}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: 'transparent',
                color: theme.text,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + New Frame
            </button>
            <button
              onClick={() => setShowSaveModal(true)}
              title="Save to My Grids"
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: 'transparent',
                color: theme.text,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              💾
            </button>
            <button
              onClick={() => {
                setImageData(null)
                setRawImageData(null)
                setDetectedGrid(null)
              }}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: 'transparent',
                color: theme.textMuted,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Clear and start over"
            >
              ✕
            </button>
          </div>
          
          {/* Include Image Option */}
          <button
            onClick={() => handleCreateFrame(true)}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
              color: theme.textMuted,
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            title="Create a new frame with the original image as a semi-transparent reference layer"
          >
            <span>🖼</span>
            <span>New Frame with Reference Image</span>
          </button>
        </div>
      )}
      
      {/* Save Grid Modal */}
      {showSaveModal && (
        <SaveGridModal
          config={gridConfig}
          suggestedName={imageName ? `${imageName} Grid` : 'Analyzed Grid'}
          source="Analyzed"
          detectedData={detectedGrid || undefined}
          aspectRatio={imageWidth && imageHeight ? `${imageWidth}:${imageHeight}` : undefined}
          isDark={isDark}
          onClose={() => setShowSaveModal(false)}
          onSave={() => {
            setShowSaveModal(false)
            parent.postMessage({
              pluginMessage: {
                type: 'notify',
                text: 'Grid saved to My Grids'
              }
            }, '*')
          }}
        />
      )}
    </div>
  )
}

export default GridAnalyzer

