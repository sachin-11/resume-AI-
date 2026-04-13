"use client";
import { useState, useCallback } from "react";

type ToastVariant = "default" | "destructive" | "success";

interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

let toastCount = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback(
    ({ title, description, variant = "default" }: Omit<ToastData, "id">) => {
      const id = String(++toastCount);
      setToasts((prev) => [...prev, { id, title, description, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, toast, dismiss };
}
