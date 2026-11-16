import type { DeviceScreenMode } from '../../core/deviceMode'

export interface FmoDeviceTarget {
  host: string
  protocol: 'ws' | 'wss'
}

export interface IDeviceControlService {
  getScreenMode(target: FmoDeviceTarget): Promise<DeviceScreenMode>
  /** Only resolves after the device reports the requested mode. */
  setScreenMode(target: FmoDeviceTarget, mode: DeviceScreenMode): Promise<DeviceScreenMode>
}
