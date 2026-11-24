import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Placeholder while a lazy page chunk loads. Shows nothing for the first 150ms: local chunks usually
 * arrive faster, and a skeleton that flashes for one frame looks worse than none.
 */
export function PageSkeleton({ delay = 150 }: { delay?: number }) {
  const [visible, setVisible] = useState(delay === 0)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  if (!visible) return null
  return (
    <div className="flex animate-page flex-col gap-6 px-8 pt-7" aria-busy="true" aria-label="Загрузка страницы">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-64 rounded-2xl" />
        <Skeleton className="h-4 w-96 max-w-full rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-32 rounded-3xl" />
      </div>
      <Skeleton className="h-64 rounded-3xl" />
    </div>
  )
}
