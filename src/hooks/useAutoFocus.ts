import { useEffect } from "react";
import { focusFirst } from "../dom";

export function useAutoFocus(deps: unknown[] = []) {
  useEffect(() => {
    requestAnimationFrame(() => focusFirst(document));
  }, deps);
}
