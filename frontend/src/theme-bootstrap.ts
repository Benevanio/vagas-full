const root = document.documentElement;
const storedPreference =
  localStorage.getItem("jobs-theme-preference") ??
  localStorage.getItem("theme") ??
  localStorage.getItem("vite-ui-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const themePreference =
  storedPreference === "light" ||
  storedPreference === "dark" ||
  storedPreference === "system"
    ? storedPreference
    : "system";
const resolvedTheme =
  themePreference === "system"
    ? prefersDark
      ? "dark"
      : "light"
    : themePreference;

root.classList.toggle("dark", resolvedTheme === "dark");
root.setAttribute("data-theme", resolvedTheme);
