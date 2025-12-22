import * as React from 'react'

// ============================================
// Skeleton Loading Components
// ============================================

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  isDark?: boolean
  className?: string
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 6,
  isDark = true,
}) => {
  const bgColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
  const shimmerColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  
  return (
    <>
      <div
        style={{
          width,
          height,
          borderRadius,
          backgroundColor: bgColor,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(90deg, transparent, ${shimmerColor}, transparent)`,
            animation: 'skeletonShimmer 1.5s infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes skeletonShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </>
  )
}

// ============================================
// Grid Preset Card Skeleton
// ============================================

export const GridPresetCardSkeleton: React.FC<{ isDark?: boolean }> = ({ isDark = true }) => {
  return (
    <div style={{
      padding: '12px',
      borderRadius: '10px',
      border: `1px solid ${isDark ? '#404040' : '#e5e5e5'}`,
      backgroundColor: isDark ? '#262626' : '#ffffff',
    }}>
      {/* Preview area */}
      <Skeleton width="100%" height={80} borderRadius={8} isDark={isDark} />
      
      {/* Title */}
      <div style={{ marginTop: '10px' }}>
        <Skeleton width="70%" height={14} isDark={isDark} />
      </div>
      
      {/* Description */}
      <div style={{ marginTop: '6px' }}>
        <Skeleton width="90%" height={10} isDark={isDark} />
      </div>
      
      {/* Tags */}
      <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
        <Skeleton width={40} height={16} borderRadius={4} isDark={isDark} />
        <Skeleton width={50} height={16} borderRadius={4} isDark={isDark} />
      </div>
    </div>
  )
}

// ============================================
// Grid Library Skeleton (Multiple Cards)
// ============================================

export const GridLibrarySkeleton: React.FC<{ count?: number; isDark?: boolean }> = ({ 
  count = 6, 
  isDark = true 
}) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
      padding: '16px',
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <GridPresetCardSkeleton key={i} isDark={isDark} />
      ))}
    </div>
  )
}

// ============================================
// My Grids Skeleton
// ============================================

export const MyGridsSkeleton: React.FC<{ count?: number; isDark?: boolean }> = ({ 
  count = 4, 
  isDark = true 
}) => {
  return (
    <div style={{ padding: '16px' }}>
      {/* Search bar */}
      <Skeleton width="100%" height={44} borderRadius={8} isDark={isDark} />
      
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <Skeleton width="50%" height={36} borderRadius={6} isDark={isDark} />
        <Skeleton width="50%" height={36} borderRadius={6} isDark={isDark} />
      </div>
      
      {/* Grid list */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        marginTop: '16px',
      }}>
        {Array.from({ length: count }).map((_, i) => (
          <GridPresetCardSkeleton key={i} isDark={isDark} />
        ))}
      </div>
    </div>
  )
}

// ============================================
// Loading Spinner
// ============================================

interface SpinnerProps {
  size?: number
  color?: string
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 20, color = '#3b82f6' }) => {
  return (
    <>
      <div
        style={{
          width: size,
          height: size,
          border: `2px solid ${color}30`,
          borderTopColor: color,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

// ============================================
// Loading Overlay
// ============================================

interface LoadingOverlayProps {
  message?: string
  isDark?: boolean
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ 
  message = 'Loading...', 
  isDark = true 
}) => {
  const theme = {
    bg: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
    text: isDark ? '#ffffff' : '#1a1a1a',
    textMuted: isDark ? '#a3a3a3' : '#666666',
  }
  
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: theme.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      zIndex: 100,
      backdropFilter: 'blur(4px)',
    }}>
      <Spinner size={32} />
      <p style={{
        margin: 0,
        fontSize: '13px',
        fontWeight: 500,
        color: theme.text,
      }}>
        {message}
      </p>
    </div>
  )
}

export default Skeleton


