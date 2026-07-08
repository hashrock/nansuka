import { useEffect, useRef } from "react";

interface UseDropdownOutsideClickOptions {
  isOpen: boolean;
  onClose: () => void;
}

interface UseDropdownOutsideClickReturn {
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

export function useDropdownOutsideClick({
  isOpen,
  onClose,
}: UseDropdownOutsideClickOptions): UseDropdownOutsideClickReturn {
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  return { dropdownRef };
}
