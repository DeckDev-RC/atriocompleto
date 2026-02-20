import { z } from "zod";

export const strongPasswordSchema = z
  .string()
  .min(8, "Senha deve ter no mínimo 8 caracteres")
  .refine((value) => /[A-Z]/.test(value), {
    message: "Senha deve conter pelo menos 1 letra maiúscula",
  })
  .refine((value) => /\d/.test(value), {
    message: "Senha deve conter pelo menos 1 número",
  });

export function getPasswordPolicyErrors(password: string): string[] {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("mínimo de 8 caracteres");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("pelo menos 1 letra maiúscula");
  }
  if (!/\d/.test(password)) {
    errors.push("pelo menos 1 número");
  }

  return errors;
}

export function isStrongPassword(password: string): boolean {
  return getPasswordPolicyErrors(password).length === 0;
}
