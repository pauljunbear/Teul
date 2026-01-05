/**
 * Type-safe messaging utilities for Figma plugin communication
 */

import type { UIToPluginMessage, PluginToUIMessage } from '../types/messages';

/**
 * Send a message from UI to the Figma plugin backend
 */
export function postToPlugin(message: UIToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

/**
 * Create a message handler for plugin messages
 * Returns a cleanup function to remove the listener
 */
export function onPluginMessage(callback: (message: PluginToUIMessage) => void): () => void {
  const handler = (event: MessageEvent) => {
    const msg = event.data?.pluginMessage;
    if (msg && typeof msg === 'object' && 'type' in msg) {
      callback(msg as PluginToUIMessage);
    }
  };

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/**
 * Send a notification to the user
 */
export function notify(text: string): void {
  postToPlugin({ type: 'notify', text });
}

/**
 * Apply a color as fill to the current selection
 */
export function applyFill(hex: string, name: string, rgb?: number[]): void {
  postToPlugin({ type: 'apply-fill', hex, name, rgb });
}

/**
 * Apply a color as stroke to the current selection
 */
export function applyStroke(hex: string, name: string, rgb?: number[]): void {
  postToPlugin({ type: 'apply-stroke', hex, name, rgb });
}

/**
 * Create a color style from the given color
 */
export function createStyle(hex: string, name: string, rgb?: number[]): void {
  postToPlugin({ type: 'create-style', hex, name, rgb });
}

/**
 * Request the color of the current selection
 */
export function getSelectionColor(): void {
  postToPlugin({ type: 'get-selection-color' });
}

/**
 * Request selection info for grid application
 */
export function getSelectionForGrid(): void {
  postToPlugin({ type: 'get-selection-for-grid' });
}
