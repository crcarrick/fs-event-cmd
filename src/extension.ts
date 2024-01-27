import { minimatch } from 'minimatch'
import * as vscode from 'vscode'
import winston from 'winston'

import { createLogger } from './logger'

export type ActionType = 'create' | 'rename' | 'delete'
export type LogLevel = 'info' | 'warn' | 'error' | 'debug'
export type VSCodeApi = typeof vscode
export interface Command {
  cmd: string
  glob: string
  type: ActionType | ActionType[]
}

export class Extension {
  protected logger: winston.Logger

  constructor(private vscode: VSCodeApi) {
    this.logger = createLogger(
      this.vscode.window.createOutputChannel('FS Event Commands', 'log'),
    )
  }

  async executeCommands(files: readonly vscode.Uri[], type: ActionType) {
    const commands = await this.getExecutableCommands(files, type)

    this.log(`Executing commands for "${type}" action`)
    this.log(`Files: ${files.map(({ fsPath }) => fsPath).join(', ')}`)
    this.log(`Commands: ${commands.join(', ')}`)

    for (const command of commands) {
      this.vscode.commands.executeCommand(command).then(
        () => this.log(`Executed command: ${command}`),
        (reason) =>
          this.log(
            `Failed to execute command: ${command} - ${reason}`,
            'error',
          ),
      )
    }
  }

  log(message: string, level: LogLevel = 'info') {
    this.logger.log(level, message)
  }

  protected getCommands(): Command[] {
    return (
      this.vscode.workspace
        .getConfiguration('crcarrick.fsEventCmd')
        .get('commands') ?? []
    )
  }

  protected async getExecutableCommands(
    files: readonly vscode.Uri[],
    actionType: ActionType,
  ) {
    const commands: string[] = []
    const configCommands = this.getCommands()
    const vscodeCommands = await this.vscode.commands.getCommands(true)

    for (const { cmd, glob, type } of configCommands) {
      const matchesCmds = vscodeCommands.includes(cmd)
      const matchesGlob = files.some(({ fsPath }) => minimatch(fsPath, glob))
      const matchesType = Array.isArray(type)
        ? type.includes(actionType)
        : type === actionType

      if (matchesGlob && matchesType && matchesCmds) {
        commands.push(cmd)
      }
    }

    if (commands.length !== configCommands.length) {
      const missingCommands = configCommands.filter(
        ({ cmd }) => !commands.includes(cmd),
      )

      this.log(
        `The following commands are not valid: ${missingCommands
          .map(({ cmd }) => cmd)
          .join(', ')}`,
        'error',
      )
    }

    return commands
  }
}

function noop() {}

export function activate(context: vscode.ExtensionContext) {
  const extension = new Extension(vscode)

  extension.log('FS Event Commands activated')

  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles((e) =>
      extension.executeCommands(e.files, 'create').catch(noop),
    ),
  )
  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles((e) => {
      const files = e.files.map(({ newUri }) => newUri)
      extension.executeCommands(files, 'rename').catch(noop)
    }),
  )
  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles((e) =>
      extension.executeCommands(e.files, 'delete').catch(noop),
    ),
  )
}

export function deactivate(context: vscode.ExtensionContext) {
  context.subscriptions.forEach((disposable) => disposable.dispose())
}
