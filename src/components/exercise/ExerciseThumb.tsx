'use client'

import Image from 'next/image'
import { Dumbbell, Play } from 'lucide-react'
import { extractYoutubeVideoId } from '@/lib/youtube'

interface Props {
    exercise: {
        video_url: string | null
        gif_url: string | null
        image_url: string | null
        name: string
    }
    /** Logo del coach DUEÑO del exercise; `null` si es system o no hay branding. */
    coachLogoUrl?: string | null
    size?: 'xs' | 'sm' | 'md' | 'lg'
    /** Mostrar overlay de play encima del thumb cuando hay video. Default true. */
    showPlay?: boolean
    className?: string
}

const SIZE_MAP: Record<NonNullable<Props['size']>, string> = {
    xs: 'w-10 h-10',
    sm: 'w-14 h-14',
    md: 'w-20 h-20',
    lg: 'w-full aspect-[4/3]',
}

const LOGO_SIZE_MAP: Record<NonNullable<Props['size']>, string> = {
    xs: 'w-4 h-4 top-0.5 right-0.5',
    sm: 'w-5 h-5 top-1 right-1',
    md: 'w-6 h-6 top-1 right-1',
    lg: 'w-8 h-8 top-2 right-2',
}

const PLAY_SIZE_MAP: Record<NonNullable<Props['size']>, string> = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-8 h-8',
}

/**
 * Thumbnail unificado para ejercicios: GIF/Imagen como medio real, YouTube como thumb i.ytimg con play overlay,
 * fallback dumbbell. Si coachLogoUrl está presente, se overlay un badge circular branded en esquina superior derecha.
 */
export function ExerciseThumb({
    exercise,
    coachLogoUrl,
    size = 'sm',
    showPlay = true,
    className = '',
}: Props) {
    const media = exercise.gif_url ?? exercise.image_url ?? null
    const ytId =
        !media && exercise.video_url ? extractYoutubeVideoId(exercise.video_url) : null
    const ytThumb = ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : null
    const isGif = !!exercise.gif_url

    return (
        <div
            className={`relative ${SIZE_MAP[size]} rounded-xl overflow-hidden bg-gradient-to-br from-muted to-muted/40 ${className}`}
        >
            {media ? (
                <Image
                    src={media}
                    alt={exercise.name}
                    fill
                    sizes={size === 'lg' ? '320px' : '80px'}
                    className="object-cover"
                    unoptimized={isGif}
                />
            ) : ytThumb ? (
                <>
                    <Image
                        src={ytThumb}
                        alt={exercise.name}
                        fill
                        sizes={size === 'lg' ? '320px' : '80px'}
                        className="object-cover"
                    />
                    {showPlay && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
                            <Play
                                className={`${PLAY_SIZE_MAP[size]} text-white fill-white drop-shadow-lg`}
                            />
                        </div>
                    )}
                </>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/70">
                    <Dumbbell className={PLAY_SIZE_MAP[size]} />
                </div>
            )}
            {coachLogoUrl && (
                <div
                    className={`absolute ${LOGO_SIZE_MAP[size]} rounded-full overflow-hidden ring-2 ring-white shadow-md bg-white`}
                    aria-hidden
                >
                    <Image
                        src={coachLogoUrl}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-cover"
                        unoptimized
                    />
                </div>
            )}
        </div>
    )
}
