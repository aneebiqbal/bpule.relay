"use client"

import { ToastProvider } from "@/components/ui/toast"
import { CommandPaletteProvider } from "@/components/command-palette-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CommandPaletteProvider>
        {children}
      </CommandPaletteProvider>
    </ToastProvider>
  )
}
