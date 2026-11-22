/**
 * Copy text to clipboard and notify user
 * @param text - The text to copy
 * @param label - Description shown in notification (e.g., "hex code", "CSS variables")
 */
export function copyToClipboard(text: string, label: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const copied = document.execCommand('copy');
    parent.postMessage(
      { pluginMessage: { type: 'notify', text: copied ? `Copied ${label}` : 'Copy failed' } },
      '*'
    );
  } catch {
    parent.postMessage({ pluginMessage: { type: 'notify', text: 'Copy failed' } }, '*');
  } finally {
    document.body.removeChild(textarea);
  }
}
