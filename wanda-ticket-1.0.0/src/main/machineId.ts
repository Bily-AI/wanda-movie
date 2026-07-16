import { createHash } from 'node:crypto'
import os from 'node:os'

function firstRealMac(): string {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (!info.internal && info.mac && info.mac !== '00:00:00:00:00:00') return info.mac
    }
  }
  return ''
}

export function getMachineFingerprint(): string {
  const cpu = os.cpus()[0]?.model ?? ''
  const raw = [os.hostname(), os.platform(), os.arch(), firstRealMac(), cpu].join('|')
  return createHash('sha256').update(raw).digest('hex')
}
