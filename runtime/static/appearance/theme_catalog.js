import { cloneThemeCatalog, normalizeThemeCatalog } from "./theme_model.js";

const fallbackThemes = [
  {
    id: "default",
    name: "Default",
    accent: "#2ca7f8",
    background: "#000000",
    foreground: "#00cd00",
    xterm: {
      background: "#000000",
      foreground: "#00cd00",
      cursor: "#2ca7f8",
      selectionBackground: "rgba(44, 167, 248, 0.28)",
      selectionForeground: "#ffffff",
      black: "#000000",
      red: "#cd0000",
      green: "#00cd00",
      yellow: "#cdcd00",
      blue: "#1e90ff",
      magenta: "#cd00cd",
      cyan: "#00cdcd",
      white: "#e5e5e5",
      brightBlack: "#7f7f7f",
      brightRed: "#ff0000",
      brightGreen: "#00ff00",
      brightYellow: "#ffff00",
      brightBlue: "#5c9cff",
      brightMagenta: "#ff00ff",
      brightCyan: "#00ffff",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "one-dark",
    name: "One Dark",
    accent: "#21937d",
    background: "#1e2127",
    foreground: "#abb2bf",
    xterm: {
      background: "#1e2127",
      foreground: "#abb2bf",
      cursor: "#21937d",
      selectionBackground: "rgba(33, 147, 125, 0.28)",
      selectionForeground: "#ffffff",
      black: "#1e2127",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#d19a66",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#abb2bf",
      brightBlack: "#5c6370",
      brightRed: "#e06c75",
      brightGreen: "#98c379",
      brightYellow: "#e5c07b",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    accent: "#00c18d",
    background: "#002b36",
    foreground: "#93a1a1",
    xterm: {
      background: "#002b36",
      foreground: "#93a1a1",
      cursor: "#00c18d",
      selectionBackground: "rgba(0, 193, 141, 0.24)",
      selectionForeground: "#fdf6e3",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    accent: "#403513",
    background: "#fdf6e3",
    foreground: "#403513",
    xterm: {
      background: "#fdf6e3",
      foreground: "#403513",
      cursor: "#403513",
      selectionBackground: "rgba(64, 53, 19, 0.18)",
      selectionForeground: "#002b36",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    accent: "#bd93f9",
    background: "#282a36",
    foreground: "#f8f8f2",
    xterm: {
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#bd93f9",
      selectionBackground: "rgba(189, 147, 249, 0.26)",
      selectionForeground: "#ffffff",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff",
    },
  },
];

export const defaultThemeCatalogURL = new URL("./themes.json", import.meta.url).toString();

export const fallbackThemeCatalog = () => cloneThemeCatalog(fallbackThemes);

export function createThemeCatalogLoader({
  fetchImpl = globalThis.fetch,
  catalogURL = defaultThemeCatalogURL,
  logger = globalThis.console,
} = {}) {
  return {
    async load({ signal } = {}) {
      if (typeof fetchImpl !== "function") {
        return [];
      }
      try {
        const response = await fetchImpl(catalogURL, { signal });
        if (!response?.ok) {
          return [];
        }
        return normalizeThemeCatalog(await response.json());
      } catch (error) {
        if (error?.name === "AbortError" || signal?.aborted) {
          throw error;
        }
        logger?.warn?.("Failed to load theme catalog", error);
        return [];
      }
    },
  };
}
