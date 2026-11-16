/** Only format frequency fields actually supplied by the connected FMO device. */
export function frequencyText(record: any, direction: 'tx' | 'rx') {
  const keys =
    direction === 'tx'
      ? ['txFreqHz', 'txFrequencyHz', 'txFreq', 'txFrequency', 'transmitFrequency']
      : ['rxFreqHz', 'rxFrequencyHz', 'rxFreq', 'rxFrequency', 'receiveFrequency']
  for (const key of [...keys, 'freqHz', 'frequencyHz', 'freq']) {
    const value = record?.[key]
    if (value == null || value === '') continue
    const text = String(value).trim()
    const number = Number(text.replace(/\s*(MHz|kHz|Hz)$/i, ''))
    if (!Number.isFinite(number) || number <= 0) continue
    // FMO's historical *FreqHz fields are MHz × 10000, despite the field name.
    const mhz = /MHz$/i.test(text)
      ? number
      : /kHz$/i.test(text)
        ? number / 1000
        : /Hz$/i.test(text)
          ? number / 1e6
          : number < 10000
            ? number
            : number > 100000000
              ? number / 1e6
              : number / 10000
    return `${mhz.toFixed(4).replace(/0$/, '')} MHz`
  }
  return ''
}
