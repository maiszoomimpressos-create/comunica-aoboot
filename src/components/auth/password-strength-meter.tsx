"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPasswordStrength, passwordRequirements } from "@/lib/auth/password-policy";

const BAR_COLOR_BY_SCORE: Record<number, string> = {
  0: "bg-destructive",
  1: "bg-destructive",
  2: "bg-warning",
  3: "bg-warning",
  4: "bg-success",
};

const LABEL_COLOR_BY_SCORE: Record<number, string> = {
  0: "text-destructive",
  1: "text-destructive",
  2: "text-warning",
  3: "text-warning",
  4: "text-success",
};

/** Live password strength bar + requirement checklist, shared by every
 * password-entry form (sign-up, reset, change, invitation acceptance). */
export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = getPasswordStrength(password);
  const segments = [0, 1, 2, 3];

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {segments.map((segment) => (
            <div
              key={segment}
              className={cn(
                "h-1.5 flex-1 rounded-full bg-muted transition-colors",
                password && segment < score && BAR_COLOR_BY_SCORE[score]
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            "text-xs font-medium text-muted-foreground",
            password && LABEL_COLOR_BY_SCORE[score]
          )}
        >
          {password ? label : "Nível de segurança"}
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {passwordRequirements.map((requirement) => {
          const met = requirement.test(password);
          return (
            <li
              key={requirement.key}
              className={cn(
                "flex items-center gap-1.5 text-xs",
                met ? "text-success" : "text-muted-foreground"
              )}
            >
              {met ? (
                <Check className="size-3.5 shrink-0" />
              ) : (
                <X className="size-3.5 shrink-0" />
              )}
              {requirement.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
