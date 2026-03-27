import { computed, reactive, ref } from "vue";

export type ThemeMode = "light" | "dark" | "system";

type BrandingSettings = {
  title: string;
  subtitle: string;
  footer: string;
  faviconHref: string;
};

const THEME_STORAGE_KEY = "knowledge-cube-theme";
const BRANDING_STORAGE_KEY = "knowledge-cube-branding";

const defaultBranding: BrandingSettings = {
  title: "Knowledge Cube",
  subtitle: "Local Vault Preview",
  footer: "Knowledge Cube Local Vault Preview",
  faviconHref: "/favicon.ico"
};

const themeMode = ref<ThemeMode>("system");
const systemPrefersDark = ref(false);
const branding = reactive<BrandingSettings>({ ...defaultBranding });

function applyDocumentBranding() {
  if (typeof document === "undefined") {
    return;
  }

  document.title = [branding.title, branding.subtitle].filter(Boolean).join(" ");

  let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = branding.faviconHref || defaultBranding.faviconHref;
}

const effectiveTheme = computed<"light" | "dark">(() => {
  if (themeMode.value === "system") {
    return systemPrefersDark.value ? "dark" : "light";
  }
  return themeMode.value;
});

let initialized = false;

function initAppSettings() {
  if (initialized || typeof window === "undefined") {
    return;
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
    themeMode.value = savedTheme;
  }

  const savedBranding = window.localStorage.getItem(BRANDING_STORAGE_KEY);
  if (savedBranding) {
    try {
      const parsed = JSON.parse(savedBranding) as Partial<BrandingSettings>;
      branding.title = parsed.title?.trim() || defaultBranding.title;
      branding.subtitle = parsed.subtitle?.trim() || defaultBranding.subtitle;
      branding.footer = parsed.footer?.trim() || defaultBranding.footer;
      branding.faviconHref = parsed.faviconHref?.trim() || defaultBranding.faviconHref;
    } catch {
      branding.title = defaultBranding.title;
      branding.subtitle = defaultBranding.subtitle;
      branding.footer = defaultBranding.footer;
      branding.faviconHref = defaultBranding.faviconHref;
    }
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  systemPrefersDark.value = mediaQuery.matches;
  mediaQuery.addEventListener("change", (event) => {
    systemPrefersDark.value = event.matches;
  });

  applyDocumentBranding();
  initialized = true;
}

function setTheme(mode: ThemeMode) {
  themeMode.value = mode;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  }
}

function setBranding(payload: Partial<BrandingSettings>) {
  branding.title = payload.title?.trim() || defaultBranding.title;
  branding.subtitle = payload.subtitle?.trim() || defaultBranding.subtitle;
  branding.footer = payload.footer?.trim() || defaultBranding.footer;
  branding.faviconHref = payload.faviconHref?.trim() || defaultBranding.faviconHref;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(branding));
  }
  applyDocumentBranding();
}

function resetBranding() {
  setBranding(defaultBranding);
}

export function useAppSettings() {
  initAppSettings();

  return {
    branding,
    defaultBranding,
    themeMode,
    effectiveTheme,
    setTheme,
    setBranding,
    resetBranding
  };
}
