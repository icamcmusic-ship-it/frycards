import React, { useEffect, useRef, useState } from 'react';

/** Do not request video bytes until the card is visible. Pause hidden cards
 * without discarding their buffered media when users scroll away and back. */
export function VisibleVideo(props: React.VideoHTMLAttributes<HTMLVideoElement>) {
  const ref = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let visible = false;
    const update = () => {
      if (visible && !document.hidden) {
        setLoaded(true);
        void video.play().catch(() => {});
      } else video.pause();
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            update();
          });
    if (observer) observer.observe(video);
    else {
      visible = true;
      update();
    }
    document.addEventListener('visibilitychange', update);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      video.pause();
    };
  }, [props.src]);
  return (
    <video
      {...props}
      ref={ref}
      src={loaded ? props.src : undefined}
      preload="none"
      autoPlay={loaded}
    />
  );
}
