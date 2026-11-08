import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { isNative } from './lib/native';
import { loadProgress } from './lib/useProgress';
import './styles.css';

// En la APK la app ya viene completa adentro y funciona sin internet: no usa service worker.
if (!isNative) registerSW({ immediate: true });
loadProgress();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
