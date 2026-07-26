import { useState, useEffect } from "react";

export function usePlatform() {
  const [platform, setPlatform] = useState("desktop");

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroid = /android/.test(userAgent);
    setPlatform(isAndroid ? "mobile" : "desktop");
  }, []);

  return platform;
}
