import { useEffect } from 'react';

// Re-read WebKit's inset on resume/viewport changes instead of capturing launch
// geometry. A warm standalone reload can briefly report zero: retain only a
// previously measured portrait inset for that same installed-app session.
export function useSafeArea() {
  useEffect(() => {
    const probe = document.createElement('div');
    probe.className = 'safe-area-probe'; probe.setAttribute('aria-hidden', 'true');
    document.body.append(probe);
    let frame = 0, settleFrame = 0;
    const measure = () => {
      const portrait = screen.orientation?.type ? screen.orientation.type.startsWith('portrait') : screen.height >= screen.width;
      const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      let top = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      if (standalone && portrait) {
        try {
          if (top > 0) sessionStorage.setItem('plugtime.portrait-safe-area', String(top));
          else top = Number(sessionStorage.getItem('plugtime.portrait-safe-area')) || 0;
        } catch { /* Storage restrictions do not prevent live inset measurement. */ }
      }
      document.documentElement.style.setProperty('--app-safe-area-top', `${top}px`);
    };
    const refresh = () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(settleFrame);
      frame = requestAnimationFrame(() => { measure(); settleFrame = requestAnimationFrame(measure); });
    };
    measure();
    window.addEventListener('pageshow', refresh); window.addEventListener('resize', refresh); window.addEventListener('orientationchange', refresh);
    document.addEventListener('visibilitychange', refresh); window.visualViewport?.addEventListener('resize', refresh);
    return () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(settleFrame); probe.remove();
      window.removeEventListener('pageshow', refresh); window.removeEventListener('resize', refresh); window.removeEventListener('orientationchange', refresh);
      document.removeEventListener('visibilitychange', refresh); window.visualViewport?.removeEventListener('resize', refresh);
    };
  }, []);
}
