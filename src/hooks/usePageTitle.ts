import { useEffect } from "react";

const DEFAULT_TITLE = "Enso 禪香線香";

export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? title : DEFAULT_TITLE;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
