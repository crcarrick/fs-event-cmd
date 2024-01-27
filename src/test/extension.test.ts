import assert from 'node:assert'

import { spy, type SinonSpiedMember } from 'sinon'
import { Uri } from 'vscode'

import {
  Extension,
  type ActionType,
  type Command,
  type VSCodeApi,
} from '../extension'

interface VSCodeMockValues {
  commands: Command[]
  vscodeCommands: string[]
}

const DEFAULT_MOCK_VALUES: VSCodeMockValues = {
  commands: [],
  vscodeCommands: [],
}

class MockVSCode {
  constructor(private values: VSCodeMockValues = DEFAULT_MOCK_VALUES) {}

  commands = {
    executeCommand: spy((_command: string) => Promise.resolve()),
    getCommands: spy((_filter: boolean) =>
      Promise.resolve(this.values.vscodeCommands),
    ),
  }

  window = {
    createOutputChannel: spy((_name: string, _log: string) => ({
      appendLine: spy((_line: string) => {}),
    })),
  }

  workspace = {
    getConfiguration: spy((_section: string) => ({
      get: spy((_section: string) => this.values.commands),
    })),
  }
}

class TestExtension extends Extension {
  getCommands() {
    return super.getCommands()
  }

  getExecutableCommands(files: readonly Uri[], actionType: ActionType) {
    return super.getExecutableCommands(files, actionType)
  }
}

suite('Extension', () => {
  suite('getConfigCommands', () => {
    test('should return an array of objects with cmd, glob, and type properties', () => {
      const vscode = new MockVSCode({
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

      assert.ok(
        vscode.workspace.getConfiguration.calledOnceWithExactly(
          'crcarrick.fsEventCmd',
        ),
      )

      assert.deepStrictEqual(commands, [
        {
          cmd: 'typescript.restartTsServer',
          glob: '**/*.ts{,x}',
          type: 'create',
        },
      ])
    })
  })

  suite('getExecutableCommands', () => {
    test('should get the vscode commands', async () => {
      const vscode = new MockVSCode()
      const extension = new TestExtension(vscode as unknown as VSCodeApi)

      await extension.getExecutableCommands([], 'create')

      assert.ok(vscode.commands.getCommands.calledOnceWithExactly(true))
    })

    test('should return an array of strings that are valid vscode commands and match the glob', async () => {
      const vscodeCommands = ['typescript.restartTsServer']
      const extension = new TestExtension(
        new MockVSCode({
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
        [Uri.file('/foo/bar/baz.ts')],
        'create',
      )

      assert.ok(commands.every((command) => vscodeCommands.includes(command)))
    })

    test('should return an empty array if the glob does not match', async () => {
      const extension = new TestExtension(
        new MockVSCode({
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
        [Uri.file('/foo/bar/baz.js')],
        'create',
      )

      assert.deepStrictEqual(commands, [])
    })

    test('should return an empty array if the command is not a valid vscode command', async () => {
      const extension = new TestExtension(
        new MockVSCode({
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
        [Uri.file('/foo/bar/baz.ts')],
        'create',
      )

      assert.deepStrictEqual(commands, [])
    })

    test('should return an empty array if the command type does not match', async () => {
      const extension = new TestExtension(
        new MockVSCode({
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
        [Uri.file('/foo/bar/baz.ts')],
        'delete',
      )

      assert.deepStrictEqual(commands, [])
    })

    test('should log an error if the command is not a valid vscode command', async () => {
      const vscode = new MockVSCode({
        commands: [
          {
            cmd: 'i.dont.exist',
            glob: '**/*.ts{,x}',
            type: 'create',
          },
        ],
        vscodeCommands: ['typescript.restartTsServer'],
      })
      const extension = new TestExtension(vscode as unknown as VSCodeApi)

      await extension.getExecutableCommands(
        [Uri.file('/foo/bar/baz.ts')],
        'create',
      )

      const outputChannel = vscode.window.createOutputChannel.returnValues[0]

      assert.ok(
        outputChannel.appendLine.calledWithMatch(
          '[ERROR] The following commands are not valid: i.dont.exist',
        ),
      )
    })
  })

  suite('executeCommands', () => {
    test('should execute all commands that match the glob and type', async () => {
      const vscode = new MockVSCode({
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
      const files = [Uri.file('/foo/bar/baz.ts'), Uri.file('/foo/bar/baz.js')]
      const type = 'create'

      await extension.executeCommands(files, type)

      assert.ok(
        vscode.commands.executeCommand.firstCall.calledWithExactly(
          'typescript.restartTsServer',
        ),
      )
      assert.ok(
        vscode.commands.executeCommand.secondCall.calledWithExactly(
          'typescript.reloadProject',
        ),
      )
    })

    test('should log the files and commands', async () => {
      const vscode = new MockVSCode({
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
      const files = [Uri.file('/foo/bar/baz.ts'), Uri.file('/foo/bar/baz.js')]
      const type = 'create'

      await extension.executeCommands(files, type)

      assert.ok(
        vscode.window.createOutputChannel.calledOnceWithExactly(
          'FS Event Commands',
          'log',
        ),
      )

      const outputChannel = vscode.window.createOutputChannel.returnValues[0]

      assert.ok(
        outputChannel.appendLine.calledWithMatch(
          '[INFO] Executing commands for "create" action',
        ),
      )
      assert.ok(
        outputChannel.appendLine.calledWithMatch(
          '[INFO] Files: /foo/bar/baz.ts, /foo/bar/baz.js',
        ),
      )
      assert.ok(
        outputChannel.appendLine.calledWithMatch(
          '[INFO] Commands: typescript.restartTsServer, typescript.reloadProject',
        ),
      )
    })
  })
})
