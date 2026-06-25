import { useEffect, useState } from 'react';

const OVERLAY_SELECTOR = [
  '[data-state="open"][role="dialog"]',
  '[data-state="open"][data-vaul-drawer]',
  '[data-state="open"][data-radix-popper-content-wrapper]',
].join(', ');

export function useHasOpenOverlay() {
  const [hasOverlay, setHasOverlay] = useState(false);

  useEffect(() => {
    const check = () => {
      setHasOverlay(!!document.querySelector(OVERLAY_SELECTOR));
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-state', 'data-vaul-drawer'],
    });

    check();
    return () => observer.disconnect();
  }, []);

  return hasOverlay;
}
