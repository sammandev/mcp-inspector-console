export type BrowserRequestHeaders = {
  origin?: string | null;
  fetchSite?: string | null;
  referer?: string | null;
};

export function isSameOriginBrowserRequest(origin: string, headers: BrowserRequestHeaders): boolean {
  const { origin: requestOrigin, fetchSite, referer } = headers;
  if (fetchSite != null && fetchSite !== "same-origin") return false;
  if (requestOrigin != null) return requestOrigin === origin;
  if (fetchSite === "same-origin") return true;
  // Plain-HTTP pages send neither Fetch Metadata nor Origin on same-origin
  // GETs, but browsers still set a Referer that pages cannot forge.
  if (referer == null) return false;
  try {
    return new URL(referer).origin === origin;
  } catch {
    return false;
  }
}
