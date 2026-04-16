import { useEffect, useState } from "react";

const KEY = "tv-client-mascot-visible";

function read(): boolean {
  const v = localStorage.getItem(KEY);
  return v === null ? true : v === "1";
}

export function useMascotVisible(): [boolean, (v: boolean) => void] {
  const [visible, setVisible] = useState(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setVisible(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = (v: boolean) => {
    localStorage.setItem(KEY, v ? "1" : "0");
    setVisible(v);
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  };

  return [visible, update];
}
