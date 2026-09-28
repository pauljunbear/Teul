export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(name: string, text: string, extension: string) {
  const filename = `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'teul'
  }.${extension}`;
  downloadBlob(
    filename,
    new Blob([text], {
      type: extension.endsWith('json')
        ? 'application/json'
        : extension === 'svg'
          ? 'image/svg+xml'
          : 'text/plain;charset=utf-8',
    })
  );
}
