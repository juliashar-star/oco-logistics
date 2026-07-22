"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MutableRefObject,
  type Ref,
} from "react";
import { Input } from "@/components/ui/input";

export type AddressSuggestion = {
  city: string;
  addressString: string;
  fullAddress: string;
  street: string | null;
  house: string | null;
  flat: string | null;
};

type Props = {
  value: string;
  onChange: (raw: string) => void;
  onSelect: (result: AddressSuggestion) => void;
  /**
   * Если передан — отображается в поле вместо value.
   * Используется для показа fullAddress после выбора подсказки,
   * пока value хранит только часть адреса (улица без города).
   * Очищается родителем при следующем onChange.
   */
  displayValue?: string;
  placeholder?: string;
  disabled?: boolean;
};

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 350;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref && typeof ref === "object") {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

export const AddressAutocomplete = forwardRef<HTMLInputElement, Props>(
  function AddressAutocomplete(
    { value, onChange, onSelect, displayValue, placeholder, disabled },
    ref,
  ) {
    const listboxId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isUserTypingRef = useRef(false);

    const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState<number>(-1);

    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        assignRef(ref, node);
      },
      [ref],
    );

    const closeDropdown = useCallback(() => {
      setOpen(false);
      setActiveIndex(-1);
    }, []);

    // Закрыть при клике вне компонента
    useEffect(() => {
      function handlePointerDown(event: PointerEvent) {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          closeDropdown();
        }
      }
      document.addEventListener("pointerdown", handlePointerDown);
      return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [closeDropdown]);

    // Запрос к прокси с debounce — только при вводе пользователя, не при внешнем изменении value
    useEffect(() => {
      if (!isUserTypingRef.current) return;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (value.trim().length < MIN_QUERY_LENGTH) {
        setSuggestions([]);
        setOpen(false);
        setLoading(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const response = await fetch(
            `/api/address/suggest?query=${encodeURIComponent(value.trim())}`,
          );
          if (!response.ok) {
            setSuggestions([]);
            setOpen(false);
            return;
          }
          const data = (await response.json()) as AddressSuggestion[];
          setSuggestions(data);
          setOpen(data.length > 0);
          setActiveIndex(-1);
        } catch {
          setSuggestions([]);
          setOpen(false);
        } finally {
          setLoading(false);
        }
      }, DEBOUNCE_MS);

      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [value]);

    function handleSelect(suggestion: AddressSuggestion) {
      isUserTypingRef.current = false;
      onSelect(suggestion);
      closeDropdown();
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      if (!open || suggestions.length === 0) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
          break;
        case "Enter":
          event.preventDefault();
          if (activeIndex >= 0 && activeIndex < suggestions.length) {
            handleSelect(suggestions[activeIndex]);
          }
          break;
        case "Escape":
          event.preventDefault();
          closeDropdown();
          break;
      }
    }

    const activeId =
      activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

    return (
      <div ref={containerRef} className="relative">
        <Input
          ref={setInputRef}
          value={displayValue !== undefined ? displayValue : value}
          onChange={(e) => {
            isUserTypingRef.current = true;
            onChange(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={activeId}
          aria-expanded={open}
          className={loading ? "opacity-70" : ""}
        />

        {loading && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
          >
            <svg
              className="h-4 w-4 animate-spin text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          </span>
        )}

        {open && suggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={`${suggestion.fullAddress}-${index}`}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onPointerDown={(e) => {
                  // pointerdown вместо click — чтобы сработало раньше blur
                  e.preventDefault();
                  handleSelect(suggestion);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`cursor-pointer select-none px-3 py-2 text-sm ${
                  index === activeIndex
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="block truncate font-medium">
                  {suggestion.fullAddress}
                </span>
                {suggestion.city && (
                  <span className="block truncate text-xs text-slate-400">
                    {suggestion.city}
                    {suggestion.addressString
                      ? ` · ${suggestion.addressString}`
                      : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);
