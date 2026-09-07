import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import {
  getReportsKpis,
  periodToRange,
  type PeriodPreset,
  type ReportsKpis,
} from "../infrastructure/reportsApi";

export function useReportsKpis() {
  const [period, setPeriod] = useState<PeriodPreset>("90d");
  const [data, setData] = useState<ReportsKpis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let isMounted = true;
    // Cancela de verdade a requisição anterior (em vez de só ignorar a
    // resposta) quando o período muda antes dela terminar — evita que uma
    // resposta atrasada de um período antigo sobrescreva o período atual.
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getReportsKpis(periodToRange(period), {
          signal: controller.signal,
        });
        if (!isMounted) return;
        setData(result);
      } catch (err) {
        if (!isMounted || axios.isCancel(err)) return;
        const message =
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os relatórios.";
        setError(message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [period, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return { data, isLoading, error, period, setPeriod, reload };
}
