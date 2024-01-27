import * as assert from 'node:assert'
import { match, spy, type SinonSpiedMember } from 'sinon'

import {
  Extension,
  type ActionType,
  type Command,
  type LogLevel,
  type VSCodeApi,
} from '../extension'

interface VSCodeMock {
  commands: {
    executeCommand: SinonSpiedMember<(command: string) => Promise<unknown>>
    getCommands: SinonSpiedMember<(filter: boolean) => Promise<string[]>>
  }
  window: {
    createOutputChannel: SinonSpiedMember<
      (
        name: string,
        log: string,
      ) => {
        appendLine: SinonSpiedMember<(line: string) => void>
      }
    >
  }
  workspace: {
    getConfiguration: SinonSpiedMember<
      (section: string) => {
        get: SinonSpiedMember<(section: string) => Command[]>
      }
    >
  }
}

interface VSCodeMockValues {
  commands: Command[]
  vscodeCommands: string[]
}

// importing anything (even types) from 'vscode' seems to trigger
// `vscode-test` to run this file as an e2e test
interface VSCodeUri {
  authority: string
  fragment: string
  fsPath: string
  path: string
  query: string
  scheme: string
  toJSON: () => unknown
  with: () => VSCodeUri
}

const DEFAULT_MOCK_VALUES: VSCodeMockValues = {
  commands: [],
  vscodeCommands: [],
}

function mockUri(uri: Partial<VSCodeUri>) {
  return uri as unknown as VSCodeUri
}

function mockVSCode(values: VSCodeMockValues = DEFAULT_MOCK_VALUES) {
  const mock: VSCodeMock = {
    commands: {
      executeCommand: spy((_command: string) => Promise.resolve()),
      getCommands: spy((_filter: boolean) =>
        Promise.resolve(values.vscodeCommands),
      ),
    },
    window: {
      createOutputChannel: spy((_name: string, _log: string) => ({
        appendLine: spy((_line: string) => {}),
      })),
    },
    workspace: {
      getConfiguration: spy((_section: string) => ({
        get: spy((_section: string) => values.commands),
      })),
    },
  }

  return mock
}

class TestExtension extends Extension {
  getCommands() {
    return super.getCommands()
  }

  getExecutableCommands(files: readonly VSCodeUri[], actionType: ActionType) {
    return super.getExecutableCommands(files, actionType)
  }
}

suite('CommandOnFile', () => {
  suite('getConfigCommands', () => {
    test('should return an array of objects with cmd, glob, and type properties', () => {
      const vscode = mockVSCode({
        commands: [
          {
            cmd: 'typescript.restartTsServer',
            glob: '**/*.ts{,x}',
            type: 'create',
          },
        ],
        vscodeCommands: [],
      })

      const extension = new TestExtension(vscode as unknown as VSCodeApi)
      const commands = extension.getCommands()

      assert.strictEqual(
        vscode.workspace.getConfiguration.calledOnceWithExactly(
          'crcarrick.commandsOnFile',
        ),
        true,
      )
      assert.strictEqual(
        commands.every((command) => typeof command.cmd === 'string'),
        true,
      )
      assert.strictEqual(
        commands.every((command) => typeof command.glob === 'string'),
        true,
      )
      assert.strictEqual(
        commands.every(
          (command) =>
            typeof command.type === 'string' || Array.isArray(command.type),
        ),
        true,
      )
    })
  })

  suite('getExecutableCommands', () => {
    test('should get the vscode commands', async () => {
      const vscode = mockVSCode()
      const extension = new TestExtension(vscode as unknown as VSCodeApi)

      await extension.getExecutableCommands([], 'create')

      assert.strictEqual(
        vscode.commands.getCommands.calledOnceWithExactly(true),
        true,
      )
    })

    test('should return an array of strings that are valid vscode commands and match the glob', async () => {
      const vscodeCommands = ['typescript.restartTsServer']
      const extension = new TestExtension(
        mockVSCode({
          commands: [
            {
              cmd: 'typescript.restartTsServer',
              glob: '**/*.ts{,x}',
              type: 'create',
            },
          ],
          vscodeCommands,
        }) as unknown as VSCodeApi,
      )
      const commands = await extension.getExecutableCommands(
        [mockUri({ fsPath: 'foo/bar/baz.ts' })],
        'create',
      )

      assert.strictEqual(
        commands.every((command) => vscodeCommands.includes(command)),
        true,
      )
    })

    test('should return an empty array if the glob does not match', async () => {
      const extension = new TestExtension(
        mockVSCode({
          commands: [
            {
              cmd: 'typescript.restartTsServer',
              glob: '**/*.ts{,x}',
              type: 'create',
            },
          ],
          vscodeCommands: ['typescript.restartTsServer'],
        }) as unknown as VSCodeApi,
      )
      const commands = await extension.getExecutableCommands(
        [mockUri({ fsPath: 'foo/bar/baz.js' })],
        'create',
      )

      console.log(commands)

      assert.strictEqual(commands.length, 0)
    })

    test('should return an empty array if the command is not a valid vscode command', async () => {
      const extension = new TestExtension(
        mockVSCode({
          commands: [
            {
              cmd: 'i.dont.exist',
              glob: '**/*.ts{,x}',
              type: 'create',
            },
          ],
          vscodeCommands: ['typescript.restartTsServer'],
        }) as unknown as VSCodeApi,
      )
      const commands = await extension.getExecutableCommands(
        [mockUri({ fsPath: 'foo/bar/baz.ts' })],
        'create',
      )

      assert.strictEqual(commands.length, 0)
    })

    test('should return an empty array if the command type does not match', async () => {
      const extension = new TestExtension(
        mockVSCode({
          commands: [
            {
              cmd: 'typescript.restartTsServer',
              glob: '**/*.ts{,x}',
              type: 'create',
            },
          ],
          vscodeCommands: ['typescript.restartTsServer'],
        }) as unknown as VSCodeApi,
      )
      const commands = await extension.getExecutableCommands(
        [mockUri({ fsPath: 'foo/bar/baz.ts' })],
        'delete',
      )

      assert.strictEqual(commands.length, 0)
    })
  })

  suite('executeCommands', () => {
    test('should execute all commands that match the glob and type', async () => {
      const vscode = mockVSCode({
        commands: [
          {
            cmd: 'typescript.restartTsServer',
            glob: '**/*.ts{,x}',
            type: 'create',
          },
          {
            cmd: 'typescript.reloadProject',
            glob: '**/*.js{,x}',
            type: 'create',
          },
        ],
        vscodeCommands: [
          'typescript.restartTsServer',
          'typescript.reloadProject',
        ],
      })
      const extension = new TestExtension(vscode as unknown as VSCodeApi)
      const files = [
        mockUri({ fsPath: 'foo/bar/baz.ts' }),
        mockUri({ fsPath: 'foo/bar/baz.js' }),
      ]
      const type = 'create'

      await extension.executeCommands(files, type)

      assert.strictEqual(
        vscode.commands.executeCommand.calledWithExactly(
          'typescript.restartTsServer',
        ),
        true,
      )
      assert.strictEqual(
        vscode.commands.executeCommand.calledWithExactly(
          'typescript.reloadProject',
        ),
        true,
      )
    })

    test('should log the files and commands', async () => {
      const vscode = mockVSCode({
        commands: [
          {
            cmd: 'typescript.restartTsServer',
            glob: '**/*.ts{,x}',
            type: 'create',
          },
          {
            cmd: 'typescript.reloadProject',
            glob: '**/*.js{,x}',
            type: 'create',
          },
        ],
        vscodeCommands: [
          'typescript.restartTsServer',
          'typescript.reloadProject',
        ],
      })
      const extension = new TestExtension(vscode as unknown as VSCodeApi)
      const files = [
        mockUri({ fsPath: 'foo/bar/baz.ts' }),
        mockUri({ fsPath: 'foo/bar/baz.js' }),
      ]
      const type = 'create'

      await extension.executeCommands(files, type)

      assert.strictEqual(
        vscode.window.createOutputChannel.calledOnceWithExactly(
          'Commands on File',
          'log',
        ),
        true,
      )

      const outputChannel = vscode.window.createOutputChannel.returnValues[0]

      assert.strictEqual(
        outputChannel.appendLine.calledWithExactly(
          match('[INFO] Executing commands for "create" action'),
        ),
        true,
      )
      assert.strictEqual(
        outputChannel.appendLine.calledWithExactly(
          match('[INFO] Files: foo/bar/baz.ts, foo/bar/baz.js'),
        ),
        true,
      )
      assert.strictEqual(
        outputChannel.appendLine.calledWithExactly(
          match(
            '[INFO] Commands: typescript.restartTsServer, typescript.reloadProject',
          ),
        ),
        true,
      )
    })
  })
})
