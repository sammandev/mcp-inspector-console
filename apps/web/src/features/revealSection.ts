const highlightClasses = ["ring-2", "ring-primary/30", "transition-shadow"];

// Scrolls to a section once its tab has rendered it visibly, then briefly highlights it.
export function revealSection(sectionId: string, timeoutMs = 2000) {
  const started = performance.now();
  const attempt = () => {
    const anchor = document.getElementById(sectionId);
    if (anchor && anchor.getClientRects().length > 0) {
      const target = anchor.closest<HTMLElement>("section, [data-slot='card']") ?? anchor;
      target.scrollIntoView({ block: "start", behavior: "smooth" });
      target.classList.add(...highlightClasses);
      window.setTimeout(() => target.classList.remove(...highlightClasses), 1600);
      return;
    }
    if (performance.now() - started < timeoutMs) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}
