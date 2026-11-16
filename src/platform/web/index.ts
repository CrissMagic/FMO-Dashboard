import { WebRelayStatusService } from './RelayStatusService.web'
import type { Platform } from '../index'
import { webCapabilities } from './Capabilities.web'
import { WebGridService } from './GridService.web'
import { WebAprsService } from './AprsService.web'
import { WebAudioService } from './AudioService.web'
import { WebBackgroundService } from './BackgroundService.web'
import { WebEventsService } from './EventsService.web'
import { WebLocationService } from './LocationService.web'
import { WebStorageService } from './StorageService.web'
import { WebStationLocationService } from './StationLocationService.web'
import { WebMapService } from './MapService.web'
import { WebDeviceControlService } from './DeviceControlService.web'

export function createWebPlatform(): Platform {
  return {
    relayStatus: new WebRelayStatusService(),
    deviceControl: new WebDeviceControlService(),
    map: new WebMapService(),
    events: new WebEventsService(),
    audio: new WebAudioService(),
    aprs: new WebAprsService(),
    grid: new WebGridService(),
    background: new WebBackgroundService(),
    location: new WebLocationService(),
    stationLocation: new WebStationLocationService(),
    storage: new WebStorageService(),
    capabilities: webCapabilities
  }
}
