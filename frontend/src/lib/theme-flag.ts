/** Where the theme choice is stored (read before paint, so no React here). */
export const THEME_KEY = "of:theme";

/**
 * Runs in <head> before first paint: applies a saved "light" so the page
 * never flashes dark first. Kept in a plain module so the server layout gets
 * the string itself (a "use client" module would hand it a client reference).
 */
export const THEME_FLAG = `try{if(localStorage.getItem('${THEME_KEY}')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;
