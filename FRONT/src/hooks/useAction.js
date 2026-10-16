import { useCallback, useEffect, useRef, useState } from "react";

// Один запрос на экземпляр hook; отмена при уходе со страницы.
export function useAction(action) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const controller = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const run = useCallback(async (...args) => {
    if (controller.current) throw new Error("Дождитесь завершения предыдущего запроса");
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    setError(null);
    try {
      return await action(...args, { signal: current.signal });
    } catch (failure) {
      if (mounted.current && failure.name !== "AbortError") setError(failure.message);
      throw failure;
    } finally {
      if (controller.current === current) controller.current = null;
      if (mounted.current) setPending(false);
    }
  }, [action]);
  return { run, pending, error };
}
