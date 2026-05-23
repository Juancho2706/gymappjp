'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const Player = dynamic(
  () => import('@lottiefiles/react-lottie-player').then(m => m.Player),
  { ssr: false },
)

type LottiePlayerProps = {
  src: string
  className?: string
  loop?: boolean
  autoplay?: boolean
  speed?: number
  ariaLabel?: string
}

export function LottiePlayer({
  src,
  className,
  loop = true,
  autoplay = true,
  speed = 1,
  ariaLabel,
}: LottiePlayerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn('relative w-full h-full', className)}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {visible && (
        <Player
          src={src}
          autoplay={autoplay && !reduced}
          loop={loop && !reduced}
          speed={speed}
          keepLastFrame
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </div>
  )
}
