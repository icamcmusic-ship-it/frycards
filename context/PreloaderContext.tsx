import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';

interface PreloaderContextType {
  preloadImages: (urls: string[]) => void;
  preloadVideos: (urls: string[]) => void;
}

const PreloaderContext = createContext<PreloaderContextType | undefined>(undefined);

export const PreloaderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const imgCache = useRef<Set<string>>(new Set());
  const vidCache = useRef<Set<string>>(new Set());

  const preloadImages = useCallback((urls: string[]) => {
    urls.forEach(url => {
      if (!url || imgCache.current.has(url)) return;
      imgCache.current.add(url);
      const img = new Image();
      img.src = url;
    });
  }, []);

  const preloadVideos = useCallback((urls: string[]) => {
    urls.forEach(url => {
      if (!url || vidCache.current.has(url)) return;
      vidCache.current.add(url);
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'video';
      link.href = url;
      document.head.appendChild(link);
    });
  }, []);

  return (
    <PreloaderContext.Provider value={{ preloadImages, preloadVideos }}>
      {children}
    </PreloaderContext.Provider>
  );
};

export const usePreloader = () => {
  const ctx = useContext(PreloaderContext);
  if (!ctx) throw new Error('usePreloader must be used within PreloaderProvider');
  return ctx;
};

// Standalone hook for pack opener — call after fetching pack data
export function usePackPreloader(packImageUrl?: string, cardImageUrls?: string[]) {
  const { preloadImages } = usePreloader();
  React.useEffect(() => {
    const urls: string[] = [];
    if (packImageUrl) urls.push(packImageUrl);
    if (cardImageUrls) urls.push(...cardImageUrls);
    if (urls.length) preloadImages(urls);
  }, [packImageUrl, cardImageUrls, preloadImages]);
}

export const useImageLoadStatus = (urls: string[]) => {
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!urls || urls.length === 0) {
      setLoaded(true);
      setProgress(100);
      return;
    }

    setLoaded(false);
    setProgress(0);

    let count = 0;
    const total = urls.length;
    let isMounted = true;

    const check = () => {
      if (!isMounted) return;
      count++;
      setProgress(Math.round((count / total) * 100));
      if (count === total) setLoaded(true);
    };

    urls.forEach(url => {
      if (!url) { check(); return; }
      const img = new Image();
      img.src = url;
      if (img.complete) {
        check();
      } else {
        img.onload = check;
        img.onerror = check;
      }
    });

    return () => { isMounted = false; };
  }, [JSON.stringify(urls)]);

  return { loaded, progress };
};
