import React from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type LoadingIconProps = React.ComponentProps<typeof LoaderCircle>;

/** Small, consistent loading indicator for inline actions and messages. */
export function LoadingIcon({ className, ...props }: LoadingIconProps) {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={cn("motion-safe:animate-spin motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
