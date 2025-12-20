import * as React from 'react'

// ============================================
// Toast Notification System
// ============================================

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextValue {
  toasts: ToastMessage[]
  addToast: (type: ToastType, message: string, duration?: number) => void
  removeToast: (id: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

// ============================================
// Toast Provider
// ============================================

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([])
  
  const addToast = React.useCallback((type: ToastType, message: string, duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    setToasts(prev => [...prev, { id, type, message, duration }])
    
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
  }, [])
  
  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])
  
  const success = React.useCallback((message: string) => addToast('success', message), [addToast])
  const error = React.useCallback((message: string) => addToast('error', message, 5000), [addToast])
  const info = React.useCallback((message: string) => addToast('info', message), [addToast])
  const warning = React.useCallback((message: string) => addToast('warning', message, 4000), [addToast])
  
  const value = React.useMemo(() => ({
    toasts,
    addToast,
    removeToast,
    success,
    error,
    info,
    warning,
  }), [toasts, addToast, removeToast, success, error, info, warning])
  
  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  )
}

// ============================================
// useToast Hook
// ============================================

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext)
  if (!context) {
    // Return a no-op version if not in provider
    return {
      toasts: [],
      addToast: () => {},
      removeToast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
    }
  }
  return context
}

// ============================================
// Toast Display Component
// ============================================

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
}

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; text: string }> = {
  success: { bg: '#052e16', border: '#16a34a', text: '#86efac' },
  error: { bg: '#450a0a', border: '#dc2626', text: '#fca5a5' },
  info: { bg: '#0c1a2b', border: '#3b82f6', text: '#93c5fd' },
  warning: { bg: '#422006', border: '#f59e0b', text: '#fcd34d' },
}

const TOAST_COLORS_LIGHT: Record<ToastType, { bg: string; border: string; text: string }> = {
  success: { bg: '#f0fdf4', border: '#16a34a', text: '#166534' },
  error: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b' },
  info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
}

interface ToastItemProps {
  toast: ToastMessage
  onDismiss: () => void
  isDark: boolean
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss, isDark }) => {
  const colors = isDark ? TOAST_COLORS[toast.type] : TOAST_COLORS_LIGHT[toast.type]
  const [isExiting, setIsExiting] = React.useState(false)
  
  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(onDismiss, 150)
  }
  
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 16px',
        borderRadius: '10px',
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        transform: isExiting ? 'translateX(100%)' : 'translateX(0)',
        opacity: isExiting ? 0 : 1,
        transition: 'all 0.15s ease',
        maxWidth: '300px',
      }}
    >
      <span style={{
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        backgroundColor: colors.border,
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {TOAST_ICONS[toast.type]}
      </span>
      
      <span style={{
        flex: 1,
        fontSize: '12px',
        fontWeight: 500,
        color: colors.text,
        lineHeight: 1.4,
      }}>
        {toast.message}
      </span>
      
      <button
        onClick={handleDismiss}
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '4px',
          border: 'none',
          backgroundColor: 'transparent',
          color: colors.text,
          fontSize: '14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.6,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}

// ============================================
// Toast Container
// ============================================

interface ToastContainerProps {
  isDark: boolean
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ isDark }) => {
  const { toasts, removeToast } = useToast()
  
  if (toasts.length === 0) return null
  
  return (
    <div style={{
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      zIndex: 9999,
    }}>
      {toasts.map(toast => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => removeToast(toast.id)}
          isDark={isDark}
        />
      ))}
    </div>
  )
}

export default ToastProvider


