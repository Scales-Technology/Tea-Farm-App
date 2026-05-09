// ─── Global Loading Context ───────────────────────────────────────────────────
// Use this anywhere in the app to show the tea leaf loading overlay
// Usage: const { showLoader, hideLoader } = useLoader();
//        showLoader("Saving farmer...");
//        hideLoader();

import React, { createContext, useContext, useState, useRef } from "react";
import TeaLoader from "../components/TeaLoader";

interface LoaderContextType {
  showLoader: (message?: string, subMessage?: string) => void;
  hideLoader: () => void;
  isLoading:  boolean;
}

const LoaderContext = createContext<LoaderContextType>({
  showLoader: () => {},
  hideLoader: () => {},
  isLoading:  false,
});

export function LoaderProvider({ children }: { children: React.ReactNode }) {
  const [visible,    setVisible]    = useState(false);
  const [message,    setMessage]    = useState("Loading...");
  const [subMessage, setSubMessage] = useState("");
  const timerRef = useRef<any>(null);

  const showLoader = (msg = "Loading...", sub = "") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    setSubMessage(sub);
    setVisible(true);
  };

  const hideLoader = () => {
    // Small delay so loader does not flash too quickly
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, 300);
  };

  return (
    <LoaderContext.Provider value={{ showLoader, hideLoader, isLoading: visible }}>
      {children}
      {visible && (
        <TeaLoader message={message} subMessage={subMessage || undefined} />
      )}
    </LoaderContext.Provider>
  );
}

export const useLoader = () => useContext(LoaderContext);