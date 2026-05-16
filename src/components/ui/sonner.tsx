"use client"

import { useTheme } from "@/components/providers/theme-provider"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { useEffect, useCallback, useRef } from "react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  const processedToasts = useRef(new Set<Element>())

  const applyStackStyles = useCallback(() => {
    const toaster = document.querySelector('[data-sonner-toaster]')
    if (!toaster) return

    // <ol>: flex column-reverse + pointer-events none
    // pointer-events none impede que o hover no <ol> pause TODOS os toasts
    const ol = toaster.querySelector('ol') as HTMLElement | null
    if (ol) {
      ol.style.setProperty('display', 'flex', 'important')
      ol.style.setProperty('flex-direction', 'column-reverse', 'important')
      ol.style.setProperty('gap', '0', 'important')
      ol.style.setProperty('padding', '0', 'important')
      ol.style.setProperty('pointer-events', 'none', 'important')
    }

    const toasts = toaster.querySelectorAll<HTMLElement>('[data-sonner-toast]')
    toasts.forEach((el, i) => {
      const isRemoved = el.getAttribute('data-removed') === 'true'
      const isVisible = el.getAttribute('data-visible') !== 'false'

      if (isRemoved) {
        el.style.setProperty('transition', 'opacity 0.3s ease, height 0.4s ease, margin 0.4s ease, padding 0.4s ease', 'important')
        el.style.setProperty('opacity', '0', 'important')
        el.style.setProperty('height', '0', 'important')
        el.style.setProperty('padding-top', '0', 'important')
        el.style.setProperty('padding-bottom', '0', 'important')
        el.style.setProperty('margin', '0', 'important')
        el.style.setProperty('overflow', 'hidden', 'important')
        processedToasts.current.delete(el)
        return
      }

      if (!isVisible) {
        el.style.setProperty('display', 'none', 'important')
        return
      }

      // Estilos base
      el.style.setProperty('position', 'relative', 'important')
      el.style.setProperty('bottom', 'auto', 'important')
      el.style.setProperty('left', 'auto', 'important')
      el.style.setProperty('right', 'auto', 'important')
      el.style.setProperty('height', 'auto', 'important')
      el.style.setProperty('overflow', 'hidden', 'important')
      el.style.setProperty('margin-bottom', i < toasts.length - 1 ? '10px' : '0', 'important')
      el.style.setProperty('margin-top', '0', 'important')
      // Cada toast recebe eventos de mouse individualmente
      el.style.setProperty('pointer-events', 'auto', 'important')

      // Animacao de entrada para novos toasts
      const isNew = !processedToasts.current.has(el)
      if (isNew) {
        processedToasts.current.add(el)
        el.style.setProperty('transform', 'translateY(80px)', 'important')
        el.style.setProperty('opacity', '0', 'important')
        el.style.setProperty('transition', 'none', 'important')

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.setProperty('transition', 'transform 0.35s cubic-bezier(0.21, 1.02, 0.73, 1), opacity 0.25s ease, height 0.4s ease, margin 0.4s ease, padding 0.4s ease', 'important')
            el.style.setProperty('transform', 'none', 'important')
            el.style.setProperty('opacity', '1', 'important')
          })
        })
      } else {
        el.style.setProperty('transform', 'none', 'important')
        el.style.setProperty('opacity', '1', 'important')
        el.style.setProperty('transition', 'transform 0.35s cubic-bezier(0.21, 1.02, 0.73, 1), opacity 0.25s ease, height 0.4s ease, margin 0.4s ease, padding 0.4s ease', 'important')
      }

      // Conteudo visivel
      Array.from(el.children).forEach((child) => {
        ;(child as HTMLElement).style.setProperty('opacity', '1', 'important')
      })
    })
  }, [])

  useEffect(() => {
    applyStackStyles()

    const observer = new MutationObserver(applyStackStyles)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-sonner-toast', 'data-mounted', 'data-front', 'data-expanded', 'data-removed', 'data-visible'],
    })

    return () => observer.disconnect()
  }, [applyStackStyles])

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      visibleToasts={4}
      gap={12}
      position="bottom-right"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          title: "!text-sm !font-medium",
          description: "!text-xs !text-muted-foreground",
        },
        duration: 4000,
      }}
      {...props}
    />
  )
}

export { Toaster }
