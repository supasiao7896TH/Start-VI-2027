import { APP_CONFIG } from './app-config.js';

export const DEBUG_MODULE = {
  log(...args) {
    if (APP_CONFIG.DEBUG) console.log('[DEBUG]', ...args);
  },
  warn(...args) {
    if (APP_CONFIG.DEBUG) console.warn('[DEBUG]', ...args);
  },
  error(...args) {
    console.error('[Start VI 2027]', ...args);
  }
};
