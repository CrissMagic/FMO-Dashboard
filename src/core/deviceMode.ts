export type DeviceScreenMode = 0 | 1

export function isDeviceScreenMode(value: unknown): value is DeviceScreenMode {
  return value === 0 || value === 1
}

export function readDeviceScreenMode(data: unknown): DeviceScreenMode {
  const mode = (data as { mode?: unknown } | null)?.mode
  if (!isDeviceScreenMode(mode)) throw new Error('设备未返回有效模式，当前固件可能不支持此接口')
  return mode
}

export function checkDeviceModeAcknowledgement(data: unknown): void {
  const result = (data as { result?: unknown } | null)?.result
  if (result !== undefined && result !== 0) throw new Error('设备拒绝切换模式，请刷新后重试')
}
