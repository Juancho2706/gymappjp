import type { OrgAnnouncement } from '../_data/dashboard.queries'

interface Props {
    announcements: OrgAnnouncement[]
}

export function OrgAnnouncementBanner({ announcements }: Props) {
    if (announcements.length === 0) return null

    return (
        <div className="flex flex-col gap-2 px-4 pt-2">
            {announcements.map((a) => (
                <div
                    key={a.id}
                    className="rounded-card border border-[color-mix(in_srgb,var(--info-500)_30%,transparent)] bg-[var(--info-100)] px-4 py-3"
                >
                    <p className="text-sm font-bold text-[var(--info-600)]">{a.title}</p>
                    <p className="mt-0.5 text-sm text-[var(--info-600)]">{a.body}</p>
                </div>
            ))}
        </div>
    )
}
