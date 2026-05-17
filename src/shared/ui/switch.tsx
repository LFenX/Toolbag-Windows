import type { ButtonHTMLAttributes } from "react";

import { cn } from "../lib/utils";

type SwitchProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  checked: boolean;
};

export function Switch({ checked, className, ...props }: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border border-transparent transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        className,
      )}
      role="switch"
      type="button"
      {...props}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
