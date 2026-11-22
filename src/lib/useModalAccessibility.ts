import * as React from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface UseModalAccessibilityOptions {
  isOpen?: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
}

const getFocusableElements = (dialog: HTMLElement): HTMLElement[] =>
  Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    element => !element.hidden && element.getAttribute('aria-hidden') !== 'true'
  );

const openDialogs: HTMLDivElement[] = [];
const isolatedBackgroundElements = new Map<
  HTMLElement,
  { ariaHidden: string | null; inert: boolean }
>();

const restoreBackgroundIsolation = () => {
  for (const [element, previousState] of isolatedBackgroundElements) {
    if (previousState.ariaHidden === null) {
      element.removeAttribute('aria-hidden');
    } else {
      element.setAttribute('aria-hidden', previousState.ariaHidden);
    }
    if (previousState.inert) {
      element.setAttribute('inert', '');
    } else {
      element.removeAttribute('inert');
    }
  }
  isolatedBackgroundElements.clear();
};

const isolateApplicationBackground = (dialog: HTMLElement) => {
  let current: HTMLElement | null = dialog;

  while (current?.parentElement) {
    const parentElement: HTMLElement = current.parentElement;
    for (const sibling of Array.from(parentElement.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === current) continue;
      isolatedBackgroundElements.set(sibling, {
        ariaHidden: sibling.getAttribute('aria-hidden'),
        inert: sibling.hasAttribute('inert'),
      });
      sibling.setAttribute('aria-hidden', 'true');
      sibling.setAttribute('inert', '');
    }
    if (parentElement === document.body) break;
    current = parentElement;
  }
};

const syncDialogIsolation = () => {
  restoreBackgroundIsolation();
  const topDialog = openDialogs[openDialogs.length - 1];
  if (topDialog) isolateApplicationBackground(topDialog);

  for (const dialog of openDialogs) {
    const isTopDialog = dialog === topDialog;
    dialog.setAttribute('aria-modal', isTopDialog ? 'true' : 'false');
    if (isTopDialog) {
      dialog.removeAttribute('aria-hidden');
      dialog.removeAttribute('inert');
    } else {
      dialog.setAttribute('aria-hidden', 'true');
      dialog.setAttribute('inert', '');
    }
  }
};

export const isAnyModalOpen = (): boolean => openDialogs.length > 0;

export const useModalAccessibility = ({
  isOpen = true,
  onClose,
  closeOnEscape = true,
  initialFocusRef,
}: UseModalAccessibilityOptions): React.RefObject<HTMLDivElement> => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  const closeOnEscapeRef = React.useRef(closeOnEscape);

  React.useEffect(() => {
    onCloseRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
  }, [closeOnEscape, onClose]);

  React.useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog) {
      openDialogs.push(dialog);
      syncDialogIsolation();
    }
    const initialFocus =
      initialFocusRef?.current ?? (dialog ? getFocusableElements(dialog)[0] : undefined) ?? dialog;

    initialFocus?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      const currentDialog = dialogRef.current;
      if (!currentDialog || openDialogs[openDialogs.length - 1] !== currentDialog) return;

      if (event.key === 'Escape' && closeOnEscapeRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusableElements = getFocusableElements(currentDialog);

      if (focusableElements.length === 0) {
        event.preventDefault();
        currentDialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (
        event.shiftKey &&
        (activeElement === firstElement || !currentDialog.contains(activeElement))
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === lastElement || !currentDialog.contains(activeElement))
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (dialog) {
        const index = openDialogs.lastIndexOf(dialog);
        if (index >= 0) openDialogs.splice(index, 1);
        dialog.removeAttribute('aria-hidden');
        dialog.removeAttribute('inert');
        syncDialogIsolation();
      }
      previouslyFocused?.focus();
    };
  }, [initialFocusRef, isOpen]);

  return dialogRef;
};
