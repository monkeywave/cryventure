/**
 * How long the object URL outlives the click. Revoking it right away can cancel the download in Safari
 * and Firefox, which start fetching the blob asynchronously; FileSaver.js waits 40 s for the same reason.
 */
export const REVOKE_DELAY_MS = 60_000;

/** Offers `text` as a file download (Blob + temporary object URL); browser-only. */
export function downloadText(fileName: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
