import { WebUpdateService } from '../web/UpdateService.web'
import { WebRelayStatusService } from '../web/RelayStatusService.web'
import type { Platform } from '../index'
import { WebAprsService } from '../web/AprsService.web'
import { WebAudioService } from '../web/AudioService.web'
import { WebBackgroundService } from '../web/BackgroundService.web'
import { WebEventsService } from '../web/EventsService.web'
import { WebGridService } from '../web/GridService.web'
import { WebStationLocationService } from '../web/StationLocationService.web'
import { WebStorageService } from '../web/StorageService.web'
import { iosCapabilities } from './Capabilities.ios'
import { WebLocationService } from '../web/LocationService.web'
import { WebMapService } from '../web/MapService.web'
import { WebDeviceControlService } from '../web/DeviceControlService.web'

export function createIosPlatform(): Platform {
  return {
    updates: new WebUpdateService(),
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
    capabilities: iosCapabilities
  }
}
