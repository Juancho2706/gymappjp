'use client'
import React, { createContext, useContext, useEffect, useState } from 'react'
import { type OrgAdminContext, getOrgAdminContext } from '../lib/org-admin'

interface OrgContextValue {
  org: OrgAdminContext | null
  loading: boolean
  refresh: () => Promise<void>
}

const OrgContext = createContext<OrgContextValue>({
  org: null,
  loading: true,
  refresh: async () => {},
})

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [org, setOrg] = useState<OrgAdminContext | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const ctx = await getOrgAdminContext()
    setOrg(ctx)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <OrgContext.Provider value={{ org, loading, refresh: load }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  return useContext(OrgContext)
}
