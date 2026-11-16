import { FmoApiClient } from '../../services/fmoApi'
import { isValidHostAddress, normalizeHost } from '../../utils/urlUtils'
import {
  checkDeviceModeAcknowledgement,
  isDeviceScreenMode,
  readDeviceScreenMode
} from '../../core/deviceMode'
import type { DeviceScreenMode } from '../../core/deviceMode'
import type { FmoDeviceTarget, IDeviceControlService } from '../interfaces/IDeviceControlService'

interface ModeClient {
  sendRequest(type: string, subType: string, data: object, options: object): Promise<unknown>
  close(): void
}

export class WebDeviceControlService implements IDeviceControlService {
  constructor(private createClient: (url: string) => ModeClient = (url) => new FmoApiClient(url)) {}

  private client(target: FmoDeviceTarget): ModeClient {
    const host = normalizeHost(target.host)
    if (!isValidHostAddress(host) || !['ws', 'wss'].includes(target.protocol))
      throw new Error('请先选择有效的 FMO 设备地址')
    return this.createClient(`${target.protocol}://${host}`)
  }

  private async read(client: ModeClient): Promise<DeviceScreenMode> {
    const data = await client.sendRequest('ui', 'getScreenMode', {}, { timeoutMs: 3000 })
    return readDeviceScreenMode(data)
  }

  async getScreenMode(target: FmoDeviceTarget): Promise<DeviceScreenMode> {
    const client = this.client(target)
    try {
      return await this.read(client)
    } finally {
      client.close()
    }
  }

  async setScreenMode(target: FmoDeviceTarget, mode: DeviceScreenMode): Promise<DeviceScreenMode> {
    if (!isDeviceScreenMode(mode)) throw new Error('无效的设备模式')
    const client = this.client(target)
    try {
      // Never retry a write automatically: a timed-out command may already have taken effect.
      const data = await client.sendRequest('ui', 'setScreenMode', { mode }, { timeoutMs: 5000 })
      checkDeviceModeAcknowledgement(data)
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        if ((await this.read(client)) === mode) return mode
      }
      throw new Error('设备尚未确认目标模式，请刷新状态后再操作')
    } finally {
      client.close()
    }
  }
}
