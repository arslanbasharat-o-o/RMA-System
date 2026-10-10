"use client";

import React, { useId } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useScrollLock, useEscapeKey } from "@/lib/utils/scroll-lock";
import { cn } from "@/lib/utils/cn";
import { modalOverlayVariants, modalContentVariants } from "@/lib/motion/variants";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "max-w-md",
  className,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();

  useScrollLock(isOpen);
  useEscapeKey(onClose, isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descId : undefined}
        >
          {/* Backdrop */}
          <motion.div
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Dialog Window */}
          <motion.div
            variants={modalContentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "relative w-full rounded-xl bg-white dark:bg-[#121215] shadow-2xl border border-neutral-200/90 dark:border-neutral-800 z-10 my-auto text-neutral-900 dark:text-neutral-100",
              maxWidth,
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            {(title || description) && (
              <div className="flex items-start justify-between p-5 pb-3 border-b border-neutral-100 dark:border-neutral-800">
                <div className="pr-6">
                  {title && (
                    <h3 id={titleId} className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                      {title}
                    </h3>
                  )}
                  {description && (
                    <p id={descId} className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors -mr-1 cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Close Button if no title/description */}
            {!title && !description && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors z-20 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Content */}
            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
