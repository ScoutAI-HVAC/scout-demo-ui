export const THEME_STORAGE_KEY = "scout-theme";
export const THEME_COLORS = { light: "#f7f5f0", dark: "#211f1c" } as const;
export const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}document.documentElement.classList.toggle("dark",t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))})()`;
