import './styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query'
import { router } from '@/app/router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { useApplyTheme } from '@/hooks/use-theme'
import { installErrorReporting } from '@/lib/error-reporting'
import { z } from 'zod'
import { uk } from 'zod/locales'

installErrorReporting()
// Validation messages in Ukrainian (import previews, client-side checks).
z.config(uk())

function Root() {
  useApplyTheme()
  return (
    <TooltipProvider delayDuration={350}>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>
)
