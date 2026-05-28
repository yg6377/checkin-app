import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // 새 배포 감지 시 확인 없이 즉시 적용한다.
    // (현장 근로자 단말에서 confirm 을 놓쳐 옛 버전 캐시에
    //  머무는 문제 방지 — 출퇴근 기능이 안 되는 주요 원인이었음)
    void updateSW(true);
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
