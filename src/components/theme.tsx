"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Segmented } from "@/components/ui/toggles";
import { usePersistedState, useMounted } from "@/lib/use-persisted-state";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "kraken-theme";

/**
 * Inlined in <head> so the first paint already has the right class. Without
 * this the app flashes light before hydration, which on a dark-mode machine is
 * the single most obvious "unfinished" tell.
 */
export const themeBootstrapScript = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var dark = stored === 'dark' || ((!stored || stored === 'system') &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`.trim();

function apply(preference: ThemePreference) {
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function useTheme() {
  const [preference, setPreference] = usePersistedState<ThemePreference>(STORAGE_KEY, "system");

  // Pushes the current preference onto the document. Synchronising an external
  // system is exactly what an effect is for; no state is set here.
  React.useEffect(() => {
    apply(preference);
  }, [preference]);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) ?? "system") === "system") apply("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return { preference, setTheme: setPreference };
}

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/** Three-way segmented control; the current choice is always visible. */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <Segmented
      label="Colour theme"
      size="icon"
      className={className}
      // Nothing is checked until hydration: the server cannot see the stored choice.
      value={mounted ? preference : ""}
      onChange={(value) => value && setTheme(value)}
      options={OPTIONS.map(({ value, label, Icon }) => ({
        value,
        title: label,
        icon: <Icon />,
        label: <span className="sr-only">{label}</span>,
      }))}
    />
  );
}
