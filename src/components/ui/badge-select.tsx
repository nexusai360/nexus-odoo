"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface BadgeOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  /** Tailwind classes para o pill. */
  bg: string;
  icon: LucideIcon;
}

export interface BadgeStyle {
  bg: string;
  icon: LucideIcon;
}

export interface BadgeSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: BadgeOption<T>[];
  getBadgeStyle: (value: T) => BadgeStyle;
  disabled?: boolean;
  /** Quando true, renderiza popover via portal com posicionamento fixed. */
  useFixed?: boolean;
  minWidth?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

interface FixedPosition {
  top: number;
  left: number;
  width: number;
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function BadgeSelect<T extends string = string>({
  value,
  onChange,
  options,
  getBadgeStyle,
  disabled = false,
  useFixed = false,
  minWidth = 240,
  placeholder,
  className,
  ariaLabel,
}: BadgeSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [fixedPos, setFixedPos] = useState<FixedPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const listboxId = useId();

  const current = getBadgeStyle(value);
  const CurrentIcon = current.icon;
  const currentOption = options.find((o) => o.value === value);
  const triggerLabel = currentOption?.label ?? placeholder ?? value;

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value],
  );
  const [activeIndex, setActiveIndex] = useState<number>(
    selectedIndex >= 0 ? selectedIndex : 0,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateFixedPosition = useCallback(() => {
    if (!useFixed || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setFixedPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, minWidth),
    });
  }, [useFixed, minWidth]);

  useIsomorphicLayoutEffect(() => {
    if (open && useFixed) {
      updateFixedPosition();
    }
  }, [open, useFixed, updateFixedPosition]);

  useEffect(() => {
    if (!open || !useFixed) return;
    const handler = () => updateFixedPosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, useFixed, updateFixedPosition]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((idx) => (idx + 1) % options.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((idx) => (idx - 1 + options.length) % options.length);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(options.length - 1);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const opt = options[activeIndex];
        if (opt) {
          onChange(opt.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, options, activeIndex, onChange]);

  useEffect(() => {
    if (!open) return;
    const node = optionRefs.current[activeIndex];
    node?.focus();
  }, [open, activeIndex]);

  function handleToggle() {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen((o) => !o);
  }

  function handleSelect(opt: BadgeOption<T>) {
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  const popoverContent = open ? (
    <div
      ref={popoverRef}
      id={listboxId}
      role="listbox"
      aria-label={ariaLabel ?? "Opções"}
      style={
        useFixed && fixedPos
          ? {
              position: "fixed",
              top: fixedPos.top,
              left: fixedPos.left,
              width: fixedPos.width,
              zIndex: 1000,
            }
          : { minWidth }
      }
      className={cn(
        "min-w-[260px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10",
        "origin-top animate-in fade-in-0 zoom-in-95",
        "duration-150 ease-out",
        !useFixed && "absolute left-0 top-full z-[1000] mt-1",
      )}
      data-state={open ? "open" : "closed"}
    >
      {options.map((option, idx) => {
        const OptionIcon = option.icon;
        const isSelected = value === option.value;
        const isActive = idx === activeIndex;
        return (
          <button
            key={option.value}
            ref={(el) => {
              optionRefs.current[idx] = el;
            }}
            type="button"
            role="option"
            aria-selected={isSelected}
            tabIndex={-1}
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => handleSelect(option)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors",
              "hover:bg-accent focus:bg-accent focus:outline-none",
              isSelected && "bg-accent/50",
              isActive && "bg-accent",
            )}
          >
            <span
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                option.bg,
              )}
              aria-hidden="true"
            >
              <OptionIcon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                {option.label}
              </span>
              {option.description ? (
                <span className="block text-xs text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </div>
            {isSelected ? (
              <Check
                className="h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex", className)}
      data-disabled={disabled || undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-disabled={disabled || undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleToggle}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          current.bg,
          disabled
            ? "cursor-default opacity-100"
            : "cursor-pointer hover:opacity-80",
        )}
      >
        <CurrentIcon className="h-3 w-3" aria-hidden="true" />
        <span className="truncate">{triggerLabel}</span>
        {!disabled ? (
          <ChevronDown
            className={cn(
              "ml-0.5 h-3 w-3 transition-transform duration-150",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        ) : null}
      </button>

      {useFixed && mounted && popoverContent
        ? createPortal(popoverContent, document.body)
        : popoverContent}
    </div>
  );
}

export default BadgeSelect;
