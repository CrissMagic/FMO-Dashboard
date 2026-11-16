export function dashboardView(query: Record<string, unknown> = {}): 'live' | 'footprints' {
  return query.view === 'footprints' ? 'footprints' : 'live'
}

export function isNavigationActive(
  route: { name?: unknown; path: string; query?: Record<string, unknown> },
  item: { type: string; path: string }
): boolean {
  if (item.type === 'dashboard' || item.type === 'map') {
    if (route.name !== 'dashboard') return false
    return (dashboardView(route.query) === 'footprints') === (item.type === 'map')
  }
  return route.path === item.path
}
