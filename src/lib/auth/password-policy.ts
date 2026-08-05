import { z } from "zod";

/**
 * Single source of truth for the password policy — used by both the client
 * form schemas (via `passwordSchema`) and every server action that creates or
 * changes a password, so the rule can never drift between client and server.
 *
 * `requirements` doubles as the checklist rendered by `PasswordStrengthMeter`:
 * each entry's `test` is also what backs the matching zod `.regex`/`.min`
 * check below, so the UI checklist and the hard validation are always the
 * exact same rule.
 */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRequirement = {
  key: string;
  label: string;
  test: (password: string) => boolean;
};

export const passwordRequirements: PasswordRequirement[] = [
  {
    key: "length",
    label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    key: "uppercase",
    label: "Uma letra maiúscula",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    key: "lowercase",
    label: "Uma letra minúscula",
    test: (password) => /[a-z]/.test(password),
  },
  {
    key: "number",
    label: "Um número",
    test: (password) => /[0-9]/.test(password),
  },
];

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .regex(/[A-Z]/, "A senha precisa ter uma letra maiúscula.")
  .regex(/[a-z]/, "A senha precisa ter uma letra minúscula.")
  .regex(/[0-9]/, "A senha precisa ter um número.");

export type PasswordStrengthLevel = 0 | 1 | 2 | 3 | 4;

export const passwordStrengthLabels: Record<PasswordStrengthLevel, string> = {
  0: "Muito fraca",
  1: "Fraca",
  2: "Média",
  3: "Forte",
  4: "Muito forte",
};

/**
 * Strength is a separate, softer signal from the hard requirements above:
 * it rewards extra length and a special character even though those aren't
 * mandatory, so two passwords that both pass validation can still be shown
 * as "Média" vs "Muito forte".
 */
export function getPasswordStrength(password: string): {
  score: PasswordStrengthLevel;
  label: string;
} {
  if (!password) return { score: 0, label: passwordStrengthLabels[0] };

  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const level = Math.min(score, 4) as PasswordStrengthLevel;
  return { score: level, label: passwordStrengthLabels[level] };
}
