/**
 * Utility for safely creating and manipulating DOM elements.
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  id?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (id) element.id = id;
  return element;
}

export function clearContainer(container: HTMLElement | null) {
  if (container) container.innerHTML = "";
}
