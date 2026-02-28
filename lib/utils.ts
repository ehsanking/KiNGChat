import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getTextDirection(text: string): 'rtl' | 'ltr' {
  if (!text) return 'ltr';
  // Regex for Persian/Arabic/Hebrew characters
  const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlRegex.test(text) ? 'rtl' : 'ltr';
}
