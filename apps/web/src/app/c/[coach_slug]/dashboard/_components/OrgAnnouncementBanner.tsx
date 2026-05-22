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
                    className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950"
                >
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{a.title}</p>
                    <p className="mt-0.5 text-sm text-blue-800 dark:text-blue-200">{a.body}</p>
                </div>
            ))}
        </div>
    )
}
