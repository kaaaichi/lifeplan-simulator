export class DocValidationError extends Error {
  path: string
  constructor(message: string, path: string) {
    super(message)
    this.name = 'DocValidationError'
    this.path = path
  }
}

export class UnsupportedSchemaVersionError extends Error {
  foundVersion: number
  constructor(foundVersion: number) {
    super(`Unsupported schemaVersion: ${foundVersion} (max supported is current)`)
    this.name = 'UnsupportedSchemaVersionError'
    this.foundVersion = foundVersion
  }
}
