"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick?: () => void;
}

export interface DropdownMenuProps {
  trigger?: React.ReactNode;
  label?: string;
  items: DropdownMenuItem[];
  className?: string;
  menuClassName?: string;
  align?: "left" | "right";
  buttonVariant?: "default" | "secondary" | "outline" | "ghost";
}

const MENU_OFFSET = 6;

/**
 * Animated Action Dropdown Menu inspired by SmoothUI (@smoothui) and Dice UI (@diceui).
 * Renders into a portal with spring entrance/exit animations, keyboard navigation,
 * and high-density dark mode styling.
 */
export function DropdownMenu({
  trigger,
  label = "Options",
  items,
  className,
  menuClassName,
  align = "right",
  buttonVariant = "outline",
}: DropdownMenuProps) {
  const generatedId = useId();
  const shouldReduceMotion = useReducedMotion();

  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    openUpward: boolean;
  }>({
    left: 0,
    top: 0,
    width: 0,
    openUpward: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedHeight = items.length * 40 + 20;

    const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    const menuWidth = 190;
    let left =
      align === "right"
        ? rect.right - menuWidth
        : rect.left;

    if (left + menuWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - menuWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    setPosition({
      left,
      top: openUpward ? rect.top - MENU_OFFSET : rect.bottom + MENU_OFFSET,
      width: menuWidth,
      openUpward,
    });
  }, [items.length, align]);

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
      setFocusedIndex(items.findIndex((item) => !item.disabled));
    } else {
      setIsOpen(false);
      setFocusedIndex(-1);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        portalRef.current &&
        !portalRef.current.contains(target)
      ) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen || focusedIndex < 0) return;
    const option = listRef.current?.children[focusedIndex] as HTMLElement | undefined;
    option?.focus();
    option?.scrollIntoView({ block: "nearest" });
  }, [isOpen, focusedIndex]);

  const handleItemClick = (item: DropdownMenuItem) => {
    if (item.disabled) return;
    setIsOpen(false);
    setFocusedIndex(-1);
    buttonRef.current?.focus();
    item.onClick?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        handleToggle();
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        for (let step = 1; step <= items.length; step++) {
          const next = (prev + step) % items.length;
          if (!items[next].disabled) return next;
        }
        return -1;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        for (let step = 1; step <= items.length; step++) {
          const next = (prev - step + items.length) % items.length;
          if (!items[next].disabled) return next;
        }
        return -1;
      });
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setFocusedIndex(e.key === "Home"
        ? items.findIndex((item) => !item.disabled)
        : items.findLastIndex((item) => !item.disabled));
    } else if (e.key === "Tab") {
      setIsOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < items.length) {
        handleItemClick(items[focusedIndex]);
      }
    }
  };

  const buttonStyleVariants = {
    default:
      "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100",
    secondary:
      "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700",
    outline:
      "border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#121215] text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30",
    ghost:
      "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60",
  }[buttonVariant];

  const menuPortal = mounted && typeof window !== "undefined" ? (
    <AnimatePresence>
      {isOpen && (
        <div ref={portalRef}>
          <motion.div
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 0.95,
                    y: position.openUpward ? 6 : -6,
                  }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : {
                    opacity: 1,
                    scale: 1,
                    y: 0,
                  }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 0.95,
                    y: position.openUpward ? 6 : -6,
                  }
            }
            transition={
              shouldReduceMotion
                ? { duration: 0.1 }
                : {
                    type: "spring",
                    damping: 26,
                    stiffness: 350,
                    mass: 0.8,
                  }
            }
            style={{
              left: `${position.left}px`,
              top: position.openUpward ? undefined : `${position.top}px`,
              bottom: position.openUpward
                ? `${window.innerHeight - position.top}px`
                : undefined,
              width: `${position.width}px`,
              maxHeight: `${Math.max(80, (position.openUpward ? position.top : window.innerHeight - position.top) - 12)}px`,
              overflowY: "auto",
            }}
            className={cn(
              "fixed z-[99999] rounded-xl border border-neutral-200/90 dark:border-neutral-800",
              "bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl",
              "shadow-xl shadow-black/10 dark:shadow-2xl dark:shadow-black/70",
              "ring-1 ring-black/5 dark:ring-white/10",
              "p-1 focus:outline-none flex flex-col",
              position.openUpward ? "origin-bottom" : "origin-top",
              menuClassName
            )}
          >
            <div
              ref={listRef}
              id={`${generatedId}-menu`}
              aria-labelledby={generatedId}
              onKeyDown={handleKeyDown}
              tabIndex={-1}
              role="menu"
              aria-orientation="vertical"
              className="py-0.5 space-y-0.5"
            >
              {items.map((item, index) => {
                const isFocused = index === focusedIndex;

                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    disabled={item.disabled}
                    whileHover={shouldReduceMotion || item.disabled ? undefined : { x: 2 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    onClick={() => handleItemClick(item)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={cn(
                      "flex items-center justify-between w-full min-h-11 sm:min-h-0 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors select-none cursor-pointer",
                      item.disabled && "opacity-40 cursor-not-allowed pointer-events-none",
                      item.destructive
                        ? "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        : isFocused
                        ? "bg-neutral-100 dark:bg-neutral-800/80 text-neutral-900 dark:text-neutral-100"
                        : "text-neutral-700 dark:text-neutral-300"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.icon && (
                        <span
                          className={cn(
                            "shrink-0",
                            item.destructive
                              ? "text-rose-500"
                              : "text-neutral-400 dark:text-neutral-500"
                          )}
                        >
                          {item.icon}
                        </span>
                      )}
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.shortcut && (
                      <span className="ml-auto text-[10px] font-mono text-neutral-400 dark:text-neutral-500 pl-2">
                        {item.shortcut}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  ) : null;

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        ref={buttonRef}
        type="button"
        id={generatedId}
        aria-controls={isOpen ? `${generatedId}-menu` : undefined}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={cn(
          "inline-flex items-center justify-between gap-1.5 h-8 px-3 rounded-lg text-xs font-medium cursor-pointer transition-all",
          buttonStyleVariants,
          isOpen && "ring-2 ring-neutral-900/10 dark:ring-neutral-100/15"
        )}
      >
        {trigger ? (
          trigger
        ) : (
          <>
            <span>{label}</span>
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={
                shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }
              }
              className="text-neutral-400"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.div>
          </>
        )}
      </button>

      {menuPortal && createPortal(menuPortal, document.body)}
    </div>
  );
}
