import { redirect } from 'next/navigation'

// /admin daba 404 para el CEO ya logueado — habia que recordar /admin/dashboard (F4 08-05).
export default function AdminRootPage() {
    redirect('/admin/dashboard')
}
