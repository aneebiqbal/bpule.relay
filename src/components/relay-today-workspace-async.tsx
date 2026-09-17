'use client'

import { use } from 'react'
import { RelayTodayWorkspace, type RelayTodayWorkspaceProps } from './relay-today-workspace'

export function RelayTodayWorkspaceAsync({ dataPromise }: { dataPromise: Promise<RelayTodayWorkspaceProps> }) {
  const props = use(dataPromise)
  return <RelayTodayWorkspace {...props} />
}
