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
import { ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SelectOptionItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  description?: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size" | "onChange"> {
  error?: string;
  helperText?: string;
  wrapperClassName?: string;
  selectSize?: "sm" | "md" | "lg";
  options?: SelectOptionItem[];
  searchable?: boolean;
  searchPlaceholder?: string;
  placeholder?: string;
  onChange?: (
    e: React.ChangeEvent<HTMLSelectElement> | { target: { value: string; name?: string } }
  ) => void;
  onValueChange?: (value: string) => void;
}

function optionText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(optionText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return optionText(node.props.children);
  return "";
}

/**
 * Recursively extracts select options from React children (<option>, <optgroup>, arrays).
 */
function extractOptionsFromChildren(children: React.ReactNode): SelectOptionItem[] {
  const items: SelectOptionItem[] = [];

  const processNode = (node: React.ReactNode) => {
    if (node === null || node === undefined || typeof node === "boolean") {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(processNode);
      return;
    }
    if (React.isValidElement(node)) {
      const props = node.props as {
        children?: React.ReactNode;
        value?: string | number;
        disabled?: boolean;
      };

      if (node.type === "optgroup" && props.children) {
        processNode(props.children);
        return;
      }

      if (node.type === "option" || props.value !== undefined) {
        items.push({
          value: props.value !== undefined ? String(props.value) : "",
          label: props.children !== undefined ? props.children : String(props.value ?? ""),
          disabled: Boolean(props.disabled),
        });
      }
    }
  };

  React.Children.forEach(children, processNode);
  return items;
}

const DROPDOWN_OFFSET = 6;

/**
 * Animated Select Dropdown inspired by SmoothUI (@smoothui) and Kibo UI (@kibo-ui).
 * Features smooth spring open/close transitions, responsive portal positioning,
 * instant search filtering for large option lists, keyboard navigation, and full
 * backward compatibility with existing form handlers.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      wrapperClassName,
      children,
      options: explicitOptions,
      value,
      defaultValue,
      onChange,
      onValueChange,
      error,
      helperText,
      disabled,
      placeholder,
      searchable,
      searchPlaceholder = "Search options...",
      selectSize = "md",
      name,
      id: explicitId,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = explicitId || generatedId;
    const listId = `${selectId}-options`;
    const messageId = `${selectId}-message`;
    const shouldReduceMotion = useReducedMotion();

    const [mounted, setMounted] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [invalid, setInvalid] = useState(false);

    const buttonRef = useRef<HTMLButtonElement>(null);
    const nativeRef = useRef<HTMLSelectElement>(null);
    const portalRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const [position, setPosition] = useState<{
      left: number;
      top: number;
      width: number;
      openUpward: boolean;
      maxHeight: number;
    }>({
      left: 0,
      top: 0,
      width: 0,
      openUpward: false,
      maxHeight: 300,
    });

    useEffect(() => {
      setMounted(true);
    }, []);

    // Parse options from either explicit prop or children
    const parsedOptions = React.useMemo(() => {
      if (explicitOptions && explicitOptions.length > 0) {
        return explicitOptions;
      }
      return extractOptionsFromChildren(children);
    }, [explicitOptions, children]);

    // Track internal value
    const [internalValue, setInternalValue] = useState<string>(() => {
      if (value !== undefined) return String(value);
      if (defaultValue !== undefined) return String(defaultValue);
      return "";
    });

    const isControlled = value !== undefined;
    const currentValue = isControlled ? String(value) : internalValue;

    // Synchronize when controlled value changes
    useEffect(() => {
      if (value !== undefined) {
        setInternalValue(String(value));
      }
    }, [value]);

    // Selected option metadata
    const selectedOption = parsedOptions.find(
      (opt) => String(opt.value) === String(currentValue)
    );

    // Filterable items: exclude placeholder-only options with empty string & disabled=true
    const selectableOptions = React.useMemo(() => {
      return parsedOptions.filter((opt) => !(opt.value === "" && opt.disabled));
    }, [parsedOptions]);

    // Text search filter
    const filteredOptions = React.useMemo(() => {
      if (!searchQuery.trim()) return selectableOptions;
      const q = searchQuery.toLowerCase().trim();
      return selectableOptions.filter((opt) => {
        const text = optionText(opt.label) || opt.value;
        return text.toLowerCase().includes(q);
      });
    }, [selectableOptions, searchQuery]);

    // Auto-enable search bar if more than 6 options, unless explicitly set
    const showSearch =
      searchable !== undefined ? searchable : selectableOptions.length > 6;

    // Display label on closed button
    let displayLabel: React.ReactNode = "";
    let isPlaceholder = false;

    if (selectedOption && (!selectedOption.disabled || selectedOption.value !== "")) {
      displayLabel = selectedOption.label;
    } else if (placeholder) {
      displayLabel = placeholder;
      isPlaceholder = true;
    } else {
      const placeholderOption = parsedOptions.find(
        (opt) => opt.value === "" && opt.disabled
      );
      if (placeholderOption) {
        displayLabel = placeholderOption.label;
        isPlaceholder = true;
      } else if (selectedOption) {
        displayLabel = selectedOption.label;
      } else if (selectableOptions.length > 0) {
        displayLabel = selectableOptions[0].label;
      } else {
        displayLabel = "Select...";
        isPlaceholder = true;
      }
    }

    // Dynamic viewport position calculation
    const updatePosition = useCallback(() => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.visualViewport
        ? window.visualViewport.offsetTop + window.visualViewport.height
        : window.innerHeight;
      const viewportWidth = window.innerWidth;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownEstimatedHeight = 260;

      const openUpward = spaceBelow < dropdownEstimatedHeight && spaceAbove > spaceBelow;

      const popoverWidth = Math.min(Math.max(rect.width, 200), viewportWidth - 24);
      const left = Math.max(12, Math.min(rect.left, viewportWidth - popoverWidth - 12));

      setPosition({
        left,
        top: openUpward ? rect.top - DROPDOWN_OFFSET : rect.bottom + DROPDOWN_OFFSET,
        width: popoverWidth,
        openUpward,
        maxHeight: Math.max(80, Math.min(320, (openUpward ? spaceAbove : spaceBelow) - 18)),
      });
    }, []);

    // Toggle dropdown open/close
    const handleToggle = () => {
      if (disabled) return;
      buttonRef.current?.focus();
      if (!isOpen) {
        updatePosition();
        setIsOpen(true);
        setSearchQuery("");
        const idx = filteredOptions.findIndex(
          (o) => String(o.value) === String(currentValue)
        );
        setFocusedIndex(idx >= 0 && !filteredOptions[idx].disabled ? idx : filteredOptions.findIndex((option) => !option.disabled));
      } else {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    // Close on click outside
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
          setSearchQuery("");
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

    // Recalculate position on scroll or window resize
    useEffect(() => {
      if (!isOpen) return;

      const handleScrollOrResize = () => {
        updatePosition();
      };

      window.addEventListener("scroll", handleScrollOrResize, true);
      window.addEventListener("resize", handleScrollOrResize);
      window.visualViewport?.addEventListener("resize", handleScrollOrResize);
      window.visualViewport?.addEventListener("scroll", handleScrollOrResize);
      return () => {
        window.removeEventListener("scroll", handleScrollOrResize, true);
        window.removeEventListener("resize", handleScrollOrResize);
        window.visualViewport?.removeEventListener("resize", handleScrollOrResize);
        window.visualViewport?.removeEventListener("scroll", handleScrollOrResize);
      };
    }, [isOpen, updatePosition]);

    // Auto-focus search input when opened
    useEffect(() => {
      if (isOpen && showSearch) {
        const timer = setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
        return () => clearTimeout(timer);
      }
    }, [isOpen, showSearch]);

    // Scroll active item into view during keyboard navigation
    useEffect(() => {
      if (isOpen && focusedIndex >= 0 && listRef.current) {
        const itemEl = listRef.current.children[focusedIndex] as HTMLElement | undefined;
        itemEl?.scrollIntoView({ block: "nearest" });
      }
    }, [isOpen, focusedIndex]);

    // Selection handler
    const handleSelect = (item: SelectOptionItem) => {
      if (item.disabled) return;

      if (!isControlled) {
        setInternalValue(item.value);
      }
      setIsOpen(false);
      setSearchQuery("");
      setFocusedIndex(-1);
      setInvalid(false);
      buttonRef.current?.focus();
      if (nativeRef.current) {
        nativeRef.current.value = item.value;
        nativeRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;

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
        setSearchQuery("");
        buttonRef.current?.focus();
      } else if (e.key === "Tab") {
        setIsOpen(false);
        setSearchQuery("");
        buttonRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const direction = e.key === "ArrowDown" ? 1 : -1;
        setFocusedIndex((previous) => {
          for (let step = 1; step <= filteredOptions.length; step++) {
            const index = (previous + direction * step + filteredOptions.length) % filteredOptions.length;
            if (!filteredOptions[index]?.disabled) return index;
          }
          return -1;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
          handleSelect(filteredOptions[focusedIndex]);
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        setFocusedIndex(filteredOptions.findIndex((option) => !option.disabled));
      } else if (e.key === "End") {
        e.preventDefault();
        setFocusedIndex(filteredOptions.findLastIndex((option) => !option.disabled));
      }
    };

    const sizeClasses = {
      sm: "h-8 text-xs pl-2.5 pr-8 py-1",
      md: "min-h-11 text-base sm:min-h-0 sm:h-9 sm:text-xs pl-3 pr-8.5 py-1.5",
      lg: "h-10 text-sm pl-3.5 pr-9 py-2",
    }[selectSize];

    const dropdownPortal = mounted && typeof window !== "undefined" ? (
      <AnimatePresence>
        {isOpen && (
          <div ref={portalRef}>
            <motion.div
              initial={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scaleY: 0.94,
                      scaleX: 0.98,
                      y: position.openUpward ? 6 : -6,
                    }
              }
              animate={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 1,
                      scaleY: 1,
                      scaleX: 1,
                      y: 0,
                    }
              }
              exit={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      scaleY: 0.94,
                      scaleX: 0.98,
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
                minWidth: "200px",
                maxWidth: "calc(100vw - 24px)",
                maxHeight: position.maxHeight,
              }}
              className={cn(
                "fixed z-[99999] rounded-xl border border-neutral-200/90 dark:border-neutral-800",
                "bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl",
                "shadow-xl shadow-black/10 dark:shadow-2xl dark:shadow-black/70",
                "ring-1 ring-black/5 dark:ring-white/10",
                "p-1.5 focus:outline-none flex flex-col",
                position.openUpward ? "origin-bottom" : "origin-top"
              )}
            >
              {/* Optional Search Filter */}
              {showSearch && (
                <div className="relative mb-1.5 px-1 pt-0.5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    role="combobox"
                    aria-label={searchPlaceholder}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    aria-activedescendant={focusedIndex >= 0 ? `${listId}-${focusedIndex}` : undefined}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setFocusedIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={searchPlaceholder}
                    className="w-full min-h-11 text-base sm:min-h-0 sm:h-7 sm:text-xs pl-7 pr-6 rounded-md bg-neutral-100/80 dark:bg-neutral-800/60 border border-neutral-200/70 dark:border-neutral-700/60 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-100 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      aria-label="Clear option search"
                      onClick={() => {
                        setSearchQuery("");
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Options List */}
              <div
                ref={listRef}
                role="listbox"
                id={listId}
                aria-label="Select options"
                className="min-h-0 flex-1 max-h-60 overflow-y-auto overscroll-contain py-0.5 space-y-0.5 scrollbar-thin"
              >
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
                    No matching options found
                  </div>
                ) : (
                  filteredOptions.map((opt, index) => {
                    const isSelected = String(opt.value) === String(currentValue);
                    const isFocused = index === focusedIndex;

                    return (
                      <motion.button
                        key={`${opt.value}-${index}`}
                        type="button"
                        role="option"
                        data-value={opt.value}
                        id={`${listId}-${index}`}
                        tabIndex={-1}
                        aria-selected={isSelected}
                        disabled={opt.disabled}
                        whileHover={shouldReduceMotion || opt.disabled ? undefined : { x: 2 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        onClick={() => handleSelect(opt)}
                        onMouseEnter={() => setFocusedIndex(index)}
                        className={cn(
                          "flex min-h-11 sm:min-h-0 items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left text-sm sm:text-xs transition-colors select-none cursor-pointer",
                          opt.disabled && "opacity-40 cursor-not-allowed pointer-events-none",
                          isFocused && !opt.disabled
                            ? "bg-neutral-100 dark:bg-neutral-800/80 text-neutral-900 dark:text-neutral-100"
                            : "text-neutral-700 dark:text-neutral-300",
                          isSelected &&
                            "bg-neutral-100/70 dark:bg-neutral-800/50 text-neutral-900 dark:text-neutral-100 font-semibold"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {opt.icon && <span className="shrink-0 text-neutral-400">{opt.icon}</span>}
                          <div className="truncate">
                            <span className="block truncate">{opt.label}</span>
                            {opt.description && (
                              <span className="block text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
                                {opt.description}
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <motion.span
                            initial={shouldReduceMotion ? { opacity: 1 } : { scale: 0, opacity: 0 }}
                            animate={shouldReduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                            exit={shouldReduceMotion ? { opacity: 0 } : { scale: 0, opacity: 0 }}
                            transition={{ type: "spring", damping: 20, stiffness: 350 }}
                            className="ml-auto flex items-center text-emerald-600 dark:text-emerald-400 shrink-0 pl-2"
                          >
                            <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                          </motion.span>
                        )}
                      </motion.button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    ) : null;

    return (
      <div className={cn("relative w-full group", wrapperClassName)}>
        {/* Hidden native select for form accessibility and ref forwarding */}
        <select
          {...props}
          ref={(node) => {
            nativeRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          name={name}
          id={`${selectId}-native`}
          value={currentValue}
          onChange={(event) => {
            if (!isControlled) setInternalValue(event.target.value);
            setInvalid(false);
            onValueChange?.(event.target.value);
            onChange?.(event);
          }}
          onInvalid={(event) => {
            props.onInvalid?.(event);
            event.preventDefault();
            setInvalid(true);
            buttonRef.current?.focus();
          }}
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          className="sr-only pointer-events-none absolute h-0 w-0 opacity-0"
        >
          {parsedOptions.map((opt, i) => (
            <option key={`${opt.value}-${i}`} value={opt.value} disabled={opt.disabled}>
              {optionText(opt.label) || opt.value}
            </option>
          ))}
        </select>

        {/* Custom Styled Trigger Button */}
        <div className="relative">
          <button
            ref={buttonRef}
            id={selectId}
            type="button"
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label={props["aria-label"]}
            aria-labelledby={props["aria-labelledby"]}
            aria-required={props.required}
            aria-invalid={Boolean(error || invalid)}
            aria-describedby={[props["aria-describedby"], error || helperText || invalid ? messageId : null].filter(Boolean).join(" ") || undefined}
            aria-controls={listId}
            aria-activedescendant={isOpen && focusedIndex >= 0 ? `${listId}-${focusedIndex}` : undefined}
            disabled={disabled}
            onClick={handleToggle}
            onKeyDown={handleKeyDown}
            className={cn(
              "w-full flex items-center justify-between rounded-lg cursor-pointer transition-all duration-150 font-medium text-left",
              "border border-neutral-200/90 dark:border-neutral-800",
              "bg-white dark:bg-[#121215]",
              "text-neutral-900 dark:text-neutral-100",
              "hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/10 dark:focus-visible:ring-neutral-100/15 focus-visible:border-neutral-900 dark:focus-visible:border-neutral-100",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-neutral-100 dark:disabled:bg-neutral-800/50",
              "shadow-2xs",
              sizeClasses,
              isOpen &&
                "border-neutral-900 dark:border-neutral-100 ring-2 ring-neutral-900/10 dark:ring-neutral-100/15",
              error &&
                "border-rose-500 dark:border-rose-500 focus-visible:ring-rose-500/20 focus-visible:border-rose-500",
              className
            )}
          >
            <span
              className={cn(
                "block truncate flex-1",
                isPlaceholder && "text-neutral-400 dark:text-neutral-500 font-normal"
              )}
            >
              {displayLabel}
            </span>

            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={
                shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }
              }
              className="pointer-events-none shrink-0 text-neutral-400 group-hover:text-neutral-600 dark:text-neutral-500 dark:group-hover:text-neutral-300 ml-1.5 flex items-center"
            >
              <ChevronDown className="h-4 w-4" />
            </motion.div>
          </button>
        </div>

        {/* Error or Helper text */}
        {error || invalid ? (
          <p id={messageId} role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
            {error || "Choose an option."}
          </p>
        ) : helperText ? (
          <p id={messageId} className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            {helperText}
          </p>
        ) : null}

        {/* Portal-rendered dropdown menu */}
        {dropdownPortal && createPortal(dropdownPortal, document.body)}
      </div>
    );
  }
);

Select.displayName = "Select";
