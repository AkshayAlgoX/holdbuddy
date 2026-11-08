import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { IconCheck } from "./icons.js";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  badge?: string;
  description?: string;
  disabled?: boolean;
}

export interface HbSelectProps<T extends string = string> {
  id: string;
  labelId?: string;
  value: T;
  options: Array<SelectOption<T>>;
  disabled?: boolean;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}

export function HbSelect<T extends string = string>({
  id,
  labelId,
  value,
  options,
  disabled = false,
  onChange,
  className = "",
  ariaLabel,
}: HbSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx >= 0 ? idx : 0;
  });

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = `${id}-listbox`;

  const selectedOption = options.find((o) => o.value === value) || options[0];

  // Keep highlightedIndex in sync when value changes or menu opens
  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) setHighlightedIndex(idx);
  }, [value, options]);

  // Handle outside click to close
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listboxRef.current) return;
    const items = listboxRef.current.querySelectorAll<HTMLLIElement>('[role="option"]');
    const target = items[highlightedIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, highlightedIndex]);

  const selectOption = useCallback(
    (opt: SelectOption<T>) => {
      if (opt.disabled || disabled) return;
      onChange(opt.value);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [disabled, onChange],
  );

  const moveHighlight = useCallback(
    (delta: number) => {
      setHighlightedIndex((prev) => {
        let next = prev + delta;
        const total = options.length;
        if (total === 0) return 0;
        // Loop around or find next enabled
        let attempts = 0;
        while (attempts < total) {
          if (next < 0) next = total - 1;
          if (next >= total) next = 0;
          if (!options[next]?.disabled) {
            return next;
          }
          next += delta > 0 ? 1 : -1;
          attempts++;
        }
        return prev;
      });
    },
    [options],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveHighlight(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveHighlight(-1);
        break;
      case "Home":
        e.preventDefault();
        setHighlightedIndex(options.findIndex((o) => !o.disabled) || 0);
        break;
      case "End": {
        e.preventDefault();
        const lastIdx = [...options].reverse().findIndex((o) => !o.disabled);
        if (lastIdx >= 0) setHighlightedIndex(options.length - 1 - lastIdx);
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        const opt = options[highlightedIndex];
        if (opt && !opt.disabled) {
          selectOption(opt);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const highlightedOption = options[highlightedIndex];
  const activeDescendant = isOpen && highlightedOption ? `${id}-opt-${highlightedOption.value}` : undefined;

  return (
    <div ref={wrapRef} className={`hb-select-wrap ${isOpen ? "is-open" : ""} ${disabled ? "is-disabled" : ""} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={`${id}-trigger`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-labelledby={labelId}
        aria-label={ariaLabel}
        aria-activedescendant={activeDescendant}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className="hb-select-trigger"
      >
        <span className="hb-select-value">
          {selectedOption ? selectedOption.label : "Select…"}
        </span>
        <svg
          className="hb-select-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          tabIndex={-1}
          className="hb-select-menu"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIndex;
            return (
              <li
                key={opt.value}
                id={`${id}-opt-${opt.value}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                onClick={() => selectOption(opt)}
                onMouseEnter={() => !opt.disabled && setHighlightedIndex(idx)}
                className={`hb-select-option ${isSelected ? "is-selected" : ""} ${isHighlighted ? "is-highlighted" : ""} ${opt.disabled ? "is-disabled" : ""}`}
              >
                <div className="hb-select-option-content">
                  <span className="hb-select-option-label">{opt.label}</span>
                  {opt.description && (
                    <span className="hb-select-option-desc">{opt.description}</span>
                  )}
                </div>
                {isSelected && (
                  <span className="hb-select-option-check" aria-hidden="true">
                    <IconCheck size={14} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
