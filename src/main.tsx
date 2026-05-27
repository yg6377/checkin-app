import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const shouldUpdate = window.confirm(
      '새로운 버전이 있습니다. 지금 업데이트하시겠습니까?',
    );

    if (shouldUpdate) {
      void updateSW(true);
    }
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const checkForUpdate = () => {
      if (!navigator.onLine) return;
      void registration.update();
    };

    window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
