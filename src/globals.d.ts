/**
 * Versión de la parte web: el número de ejecución del workflow que la compiló (DANZI_VERSION en vite.config.ts).
 * Es la misma de la APK compilada en esa ejecución (1.<versión>). Vale 0 en las compilaciones locales.
 */
declare const __DANZI_VERSION__: number;

/** En las versiones de prueba («Danzi Pruebas»), el número del pull request del que salen. 0 en las demás. */
declare const __DANZI_PR__: number;

/** Huella de la parte de Android de esta compilación (vacía en las compilaciones locales). */
declare const __DANZI_HUELLA__: string;

/** Proyecto de Supabase para la sincronización (supabase/config.json). Vacío si todavía no se configuró. */
declare const __DANZI_NUBE__: { url: string; key: string };
