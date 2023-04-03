import { createHash } from 'crypto'
import { hashElement } from 'folder-hash'

const rootDir = `${__dirname}/../..`
const nodeDir = `${__dirname}/../../node`

// creates a hash of the content included in the final build image (base)
export const getBaseHash = async (): Promise<string> => {
  const hash = createHash('sha1')

  // hash root level unchained files
  const { hash: unchainedHash } = await hashElement(rootDir, {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['package.json', 'lerna.json', 'yarn.lock', 'Dockerfile.node'] },
  })
  hash.update(unchainedHash)

  // hash contents of packages
  const { hash: packagesHash } = await hashElement(`${nodeDir}/packages`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(packagesHash)

  // hash contents of common coinstack
  const { hash: commonHash } = await hashElement(`${nodeDir}/coinstacks/common`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(commonHash)

  // hash coinstacks dependencies
  const { hash: dependenciesHash } = await hashElement(`${nodeDir}/coinstacks`, {
    folders: { include: ['**'], exclude: ['.*', 'common', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['package.json'] },
  })
  hash.update(dependenciesHash)

  return hash.digest('hex')
}

export const getPulumiHash = async (): Promise<string> => {
  const hash = createHash('sha1')

  // hash root level unchained files
  const { hash: unchainedHash } = await hashElement(rootDir, {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['package.json', 'lerna.json', 'yarn.lock', 'Dockerfile.node'] },
  })
  hash.update(unchainedHash)

  // hash contents of pulumi
  const { hash: pulumiHash } = await hashElement(`${__dirname}/..`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile*'] },
  })
  hash.update(pulumiHash)

  return hash.digest('hex')
}
