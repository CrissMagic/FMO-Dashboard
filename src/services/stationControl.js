import { FmoApiClient } from './fmoApi'
import { useRelaySwitchStore } from '../stores/relaySwitchStore'
import { normalizeHost } from '../utils/urlUtils'

const DEFAULT_CONTROL_HOST = '192.168.31.146'
const DEFAULT_CONTROL_PROTOCOL = 'ws'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getControlTarget(host = '', protocol = 'ws') {
  const savedHost = localStorage.getItem('fmo_control_host') || ''
  const savedProtocol = localStorage.getItem('fmo_control_protocol') || ''

  return {
    host: normalizeHost(host || savedHost || DEFAULT_CONTROL_HOST),
    protocol: protocol || savedProtocol || DEFAULT_CONTROL_PROTOCOL
  }
}

function matchStationByName(stations, relayName) {
  const target = String(relayName || '').trim()
  if (!target) return null

  const exact = stations.find((station) => String(station.name || '').trim() === target)
  if (exact) return exact

  const normalized = target.toLowerCase()
  return (
    stations.find(
      (station) =>
        String(station.name || '')
          .trim()
          .toLowerCase() === normalized
    ) || null
  )
}

async function findStationByRelayName(client, relayName) {
  const stations = await client.getAllStations()
  const station = matchStationByName(stations, relayName)

  if (!station) {
    throw new Error(`未在中继列表中找到「${relayName}」`)
  }

  return station
}

export async function switchStationByRelayName(
  relayName,
  host = '',
  protocol = 'ws',
  options = {}
) {
  const target = getControlTarget(host, protocol)
  if (!target.host) {
    throw new Error('请先设置 FMO 控制地址')
  }

  const result = await useRelaySwitchStore().run(target, { type: 'name', name: relayName })
  if (!result) throw new Error('中继正在切换，请稍候')
  options.onSwitched?.(result.current)
  return result
}

export async function addStationToPinnedByRelayName(relayName, host = '', protocol = 'ws') {
  const target = getControlTarget(host, protocol)
  if (!target.host) {
    throw new Error('请先设置 FMO 控制地址')
  }

  const client = new FmoApiClient(`${target.protocol}://${target.host}`)

  try {
    const station = await findStationByRelayName(client, relayName)
    const pinnedList = await client.getAllPinnedStations()
    const pinnedUids = new Set(pinnedList.map((item) => String(item.uid)))

    if (pinnedUids.has(String(station.uid))) {
      return { station, alreadyPinned: true }
    }

    await client.addPinnedStation(station.uid)
    await wait(700)

    const updatedPinnedList = await client.getAllPinnedStations()
    const updatedPinnedUids = new Set(updatedPinnedList.map((item) => String(item.uid)))

    if (!updatedPinnedUids.has(String(station.uid))) {
      throw new Error('当前 FMO 固件没有开放远程添加收藏接口')
    }

    return { station, alreadyPinned: false }
  } finally {
    client.close()
  }
}
