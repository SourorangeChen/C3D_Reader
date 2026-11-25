import { useEffect, useState } from "react";
import { errorMessage } from "./errors";
import { api } from "./types";
import type {
  Acquisition,
  ParameterGroup,
  Selection,
  SeriesData,
} from "./types";
import type { FrameRange } from "./workbench";

// Display series for the selected channel over the observation range. A source
// that changed on disk clears the plot until the acquisition is reopened.
export function useSeries(
  meta: Acquisition | null,
  selection: Selection,
  roi: FrameRange,
  sourceChanged: boolean,
) {
  const url = meta
    ? `/api/files/${meta.id}/series?kind=${selection.kind}&ids=${selection.id}&start=${roi[0]}&stop=${roi[1] + 1}&limit=900`
    : "";
  // Results are kept with the request they answer, so a newly opened file,
  // channel or range never shows the previous plot, even for one render.
  const [result, setResult] = useState<{
    meta: Acquisition | null;
    url: string;
    series: SeriesData | null;
    error: string;
  } | null>(null);
  const current =
    result && result.meta === meta && result.url === url && !sourceChanged
      ? result
      : null;
  useEffect(() => {
    if (!meta || sourceChanged) return;
    const controller = new AbortController();
    void api<SeriesData>(url, { signal: controller.signal })
      .then((series) => {
        if (!controller.signal.aborted)
          setResult({ meta, url, series, error: "" });
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setResult({ meta, url, series: null, error: errorMessage(e) });
      });
    return () => controller.abort();
  }, [meta, url, sourceChanged]);
  return { series: current?.series ?? null, error: current?.error ?? "" };
}

// C3D parameter groups, read once per opened acquisition when first shown.
export function useParameters(
  meta: Acquisition | null,
  shown: boolean,
  sourceChanged: boolean,
  onError: (message: string) => void,
) {
  const [loaded, setLoaded] = useState<{
    meta: Acquisition;
    groups: ParameterGroup[];
  } | null>(null);
  const params =
    loaded && loaded.meta === meta && !sourceChanged ? loaded.groups : null;
  useEffect(() => {
    if (!shown || !meta || params || sourceChanged) return;
    const controller = new AbortController();
    void api<ParameterGroup[]>(`/api/files/${meta.id}/parameters`, {
      signal: controller.signal,
    })
      .then((groups) => {
        if (!controller.signal.aborted) setLoaded({ meta, groups });
      })
      .catch((e) => {
        if (e.name !== "AbortError") onError(errorMessage(e));
      });
    return () => controller.abort();
  }, [shown, meta, params, sourceChanged, onError]);
  return params;
}
