import { useEffect } from "react";

const TITLE_PREFIX = "Inspector";

export function inspectorDocumentTitle(page: string | undefined) {
  return page ? `${TITLE_PREFIX} | ${page}` : TITLE_PREFIX;
}

export function useInspectorDocumentTitle(page: string | undefined) {
  useEffect(() => {
    document.title = inspectorDocumentTitle(page);
  }, [page]);
}
