import { useState, useEffect, useCallback } from "react";

interface Toast {
  id: number;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string) => void;
}

let toastId = 0;

export function useToast(): ToastContextValue & { toasts: Toast[] } {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2000);
  }, []);

  return { toasts, showToast };
}

interface ToastContainerProps {
  toasts: Toast[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} message={toast.message} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  message: string;
}

function ToastItem({ message }: ToastItemProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation after mount
    requestAnimationFrame(() => {
      setIsVisible(true);
    });

    // Fade out before removal
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 1700);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`toast-item ${isVisible ? "toast-visible" : ""}`}>
      {message}
    </div>
  );
}
