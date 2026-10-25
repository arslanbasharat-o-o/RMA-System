"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionValue, useSpring } from "motion/react";
import { useMotionPreference } from "./MotionProvider";

interface AnimatedNumberProps {
  value: number;
  className?: string;
  formatter?: (val: number) => string;
  duration?: number;
}

export function AnimatedNumber({
  value,
  className = "",
  formatter = (v) => Math.round(v).toLocaleString(),
}: AnimatedNumberProps) {
  const { reducedMotion } = useMotionPreference();
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const prevValueRef = useRef(safeValue);
  const motionVal = useMotionValue(safeValue);
  const spring = useSpring(motionVal, {
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  });

  const [displayValue, setDisplayValue] = useState(() => formatter(safeValue));

  useEffect(() => {
    if (reducedMotion) {
      setDisplayValue(formatter(safeValue));
      motionVal.set(safeValue);
      prevValueRef.current = safeValue;
      return;
    }

    if (prevValueRef.current !== safeValue) {
      motionVal.set(prevValueRef.current);
      spring.set(safeValue);
      prevValueRef.current = safeValue;
    } else {
      motionVal.set(safeValue);
    }
  }, [safeValue, spring, motionVal, formatter, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;

    const unsubscribe = spring.on("change", (latest) => {
      setDisplayValue(formatter(Number.isFinite(latest) ? latest : safeValue));
    });
    return () => unsubscribe();
  }, [spring, formatter, reducedMotion, safeValue]);

  return (
    <span className={`font-mono tabular-nums inline-block tracking-tight ${className}`}>
      {displayValue}
    </span>
  );
}
