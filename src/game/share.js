// ---------------------------------------------------------------------------
// Share plumbing (refactor Phase 5): the share sheet with a clipboard
// fallback. Callers pass their own text; per-mode share text stays in each
// mode, word for word.
// ---------------------------------------------------------------------------
import { gameEls } from './round.js';

export async function shareResult(text, button = gameEls.share, status = gameEls.status) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    status.textContent = 'Result copied to clipboard';
  } catch {
    status.textContent = 'Could not copy this result';
  }
}
