import { useState } from 'react'

/**
 * State of an «add / edit» dialog. `key` changes on every opening, so a form closed with «Скасувати»
 * never shows its unsaved values again — pass it as the dialog's React key.
 */
export function useEditDialog<T>(): {
  editing: T | null
  open: boolean
  key: number
  openWith: (item: T | null) => void
  setOpen: (open: boolean) => void
} {
  const [editing, setEditing] = useState<T | null>(null)
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(0)
  return {
    editing,
    open,
    key,
    openWith: (item) => {
      setEditing(item)
      setKey((n) => n + 1)
      setOpen(true)
    },
    setOpen
  }
}
