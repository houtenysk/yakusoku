import { notify } from "./dialog";
import { useCallback, useEffect, useState } from "react";

// 読み込み → 表示 → 操作後に再読み込み、の流れを扱う
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    load().then(
      (d) => alive && (setData(d), setError(null)),
      (e: Error) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}

// ボタン操作。実行中は二重押しを防ぎ、失敗したらメッセージを出す
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      await notify((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
