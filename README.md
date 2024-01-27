# FS Event Commands

Simple VSCode extension to run command palette commands when certain file system events happen.

## Extension Settings

This extension contributes the following settings:

* `crcarrick.fsEventCmd.commands`: List of commands to run

```json
{
  "crcarrick.fsEventCmd": {
    "commands": [
      {
        "cmd": "typescript.restartTsServer",
        "glob": "**/*.ts{,x}",
        "type": ["create", "rename", "delete"]
      }
    ]
  }
}
```

## Release Notes

### 0.0.1

Initial release of `FSEventCmd`
