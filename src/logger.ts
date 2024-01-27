import { MESSAGE } from 'triple-beam'
import type { OutputChannel } from 'vscode'
import winston from 'winston'
import Transport, { type TransportStreamOptions } from 'winston-transport'

class VSCodeTransport extends Transport {
  constructor(
    private outputChannel: OutputChannel,
    opts: TransportStreamOptions,
  ) {
    super(opts)
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      this.emit('logged', info)
    })

    this.outputChannel.appendLine(info[MESSAGE])
    callback()
  }
}

export function createLogger(outputChannel: OutputChannel) {
  return winston.createLogger({
    transports: [
      new VSCodeTransport(outputChannel, {
        format: winston.format.combine(
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss',
          }),
          winston.format.printf(
            (info) =>
              `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`,
          ),
        ),
      }),
    ],
  })
}
