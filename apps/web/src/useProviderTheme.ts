import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "combined-inspector-theme";
export type ProviderTheme = "light" | "dark";

function subscribe(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onStoreChange();
  };
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

function getResolvedTheme(): ProviderTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// @mcp-use/inspector/client currently exports ThemeProvider but not its internal hook.
// Use its documented storage/class contract; App remounts the provider so it applies the value.
export function setProviderTheme(theme: ProviderTheme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
}

export function useProviderTheme() {
  const theme = useSyncExternalStore(subscribe, getResolvedTheme, () => "light");
  return { theme, setTheme: setProviderTheme } as const;
}
