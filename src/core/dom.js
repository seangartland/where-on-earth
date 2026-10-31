// ---------------------------------------------------------------------------
// Shared element builders and helpers (refactor Phase 5): the home (x)
// button, element fades, thumbnails, and the one confirm dialog. Moved out
// of main.js unchanged.
// ---------------------------------------------------------------------------
export function fadeElement(el, show, duration, delay = 0) {
  el.getAnimations().forEach((a) => a.cancel());
  const fade = el.animate(
    [{ opacity: show ? 0 : 1 }, { opacity: show ? 1 : 0 }],
    { duration, delay, easing: 'ease-out', fill: 'backwards' },
  );
  if (!show) fade.onfinish = () => { el.hidden = true; };
}

// Drop the old src when there's no image, so a previous round's photo can't linger.
export function setThumb(img, url) {
  if (url) img.src = url;
  else img.removeAttribute('src');
  img.hidden = !url;
}

export function createHomeButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-close home-nav';
  button.setAttribute('aria-label', 'Go home');
  button.textContent = '×';
  // Click handled by document-level delegation above
  return button;
}

let confirmModal;
let confirmModalResolve;
let confirmModalReturnFocus;

export function showConfirmModal({ title, message, confirmLabel, cancelLabel }) {
  if (!confirmModal) {
    confirmModal = document.createElement('section');
    confirmModal.className = 'confirm-modal';
    confirmModal.hidden = true;
    confirmModal.innerHTML = `
      <div class="confirm-modal__card glass" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message">
        <h2 class="confirm-modal__title" id="confirm-modal-title"></h2>
        <p class="confirm-modal__message" id="confirm-modal-message"></p>
        <div class="confirm-modal__actions">
          <button class="confirm-modal__cancel" type="button"></button>
          <button class="confirm-modal__confirm" type="button"></button>
        </div>
      </div>`;
    document.getElementById('game').appendChild(confirmModal);

    confirmModal.addEventListener('click', (event) => {
      if (event.target === confirmModal) closeConfirmModal(false);
    });
    confirmModal.querySelector('.confirm-modal__cancel').addEventListener('click', () => closeConfirmModal(false));
    confirmModal.querySelector('.confirm-modal__confirm').addEventListener('click', () => closeConfirmModal(true));
  }

  // A single shared dialog prevents competing confirmation layers.
  if (!confirmModal.hidden) return Promise.resolve(false);

  confirmModal.querySelector('.confirm-modal__title').textContent = title;
  confirmModal.querySelector('.confirm-modal__message').textContent = message;
  confirmModal.querySelector('.confirm-modal__confirm').textContent = confirmLabel;
  confirmModal.querySelector('.confirm-modal__cancel').textContent = cancelLabel;
  confirmModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  confirmModal.hidden = false;
  confirmModal.querySelector('.confirm-modal__cancel').focus();

  return new Promise((resolve) => {
    confirmModalResolve = resolve;
  });
}

export function closeConfirmModal(confirmed) {
  if (!confirmModal || confirmModal.hidden) return;
  confirmModal.hidden = true;
  const resolve = confirmModalResolve;
  confirmModalResolve = null;
  resolve?.(confirmed);
  confirmModalReturnFocus?.focus();
  confirmModalReturnFocus = null;
}

// Escape closes the confirm dialog; registered at the spot it was in main.js.
export function initConfirmModal() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && confirmModal && !confirmModal.hidden) {
      event.preventDefault();
      closeConfirmModal(false);
    }
  });
}
