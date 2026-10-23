import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { desktop } from "./desktop";
import { chineseErrors, english } from "./translations";

export type Preferences = {
  theme: "dark" | "light" | "system";
  language: "zh-CN" | "en";
  layout: { library: number; inspector: number; scene: number };
};
export const defaultLayout = { library: 230, inspector: 220, scene: 0.67 };
const defaults: Preferences = {
  theme: "dark",
  language: "zh-CN",
  layout: defaultLayout,
};
const key = "c3d-reader-preferences-v1";
const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
export function validPreferences(value: unknown): Preferences {
  const p = value as Partial<Preferences> | null;
  return {
    theme: p?.theme === "light" || p?.theme === "system" ? p.theme : "dark",
    language: p?.language === "en" ? "en" : "zh-CN",
    layout: {
      library: clamp(p?.layout?.library, 190, 420, defaultLayout.library),
      inspector: clamp(p?.layout?.inspector, 200, 400, defaultLayout.inspector),
      scene: clamp(p?.layout?.scene, 0.3, 0.82, defaultLayout.scene),
    },
  };
}
function readLocal() {
  try {
    return validPreferences(JSON.parse(localStorage.getItem(key) || "null"));
  } catch {
    return defaults;
  }
}
function translate(
  text: string,
  language: Preferences["language"],
  values: (string | number)[] = [],
) {
  const copy =
    language === "en" ? english[text] || text : chineseErrors[text] || text;
  return copy.replace(/\{(\d+)\}/g, (match, n) =>
    values[Number(n)] == null ? match : String(values[Number(n)]),
  );
}
const Context = createContext<{
  preferences: Preferences;
  resolvedTheme: "dark" | "light";
  update: (patch: Partial<Preferences>) => void;
  t: (text: string, values?: (string | number)[]) => string;
}>(null!);
export function PreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState(readLocal);
  const [loaded, setLoaded] = useState(!desktop);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    let disposed = false;
    if (desktop)
      void desktop
        .getPreferences()
        .then((p) => {
          if (!disposed) {
            setPreferences(validPreferences(p));
            setLoaded(true);
          }
        })
        .catch(() => {
          if (!disposed) setLoaded(true);
        });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemDark(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  const resolvedTheme =
    preferences.theme === "system"
      ? systemDark
        ? "dark"
        : "light"
      : preferences.theme;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.lang = preferences.language;
  }, [resolvedTheme, preferences.language]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
    } catch {
      /* Private browsing may disable storage. */
    }
    // Native preferences survive the random loopback port used on every launch.
    if (desktop) void desktop.setPreferences(preferences).catch(() => {});
  }, [preferences, loaded]);
  const update = useCallback(
    (patch: Partial<Preferences>) =>
      setPreferences((p) => validPreferences({ ...p, ...patch })),
    [],
  );
  const t = useCallback(
    (text: string, values?: (string | number)[]) =>
      translate(text, preferences.language, values),
    [preferences.language],
  );
  return (
    <Context.Provider value={{ preferences, resolvedTheme, update, t }}>
      {loaded ? children : <div className="startup-message">C3D Reader…</div>}
    </Context.Provider>
  );
}
export const usePreferences = () => useContext(Context);
