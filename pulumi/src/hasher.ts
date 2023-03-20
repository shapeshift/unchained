import { createHash } from 'crypto'
import { hashElement } from 'folder-hash'

const rootDir = `${__dirname}/../../node`
const volumeReaperDir = `${__dirname}/../volumeReaper`

// creates a hash of the content included in the final build image (base)
export const getBaseHash = async (): Promise<string> => {
  const hash = createHash('sha1')

  // hash root level unchained files
  const { hash: unchainedHash } = await hashElement(rootDir, {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['package.json', 'lerna.json'] },
  })
  hash.update(unchainedHash)

  // hash contents of packages
  const { hash: packagesHash } = await hashElement(`${rootDir}/packages`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(packagesHash)

  // hash contents of common coinstack
  const { hash: commonHash } = await hashElement(`${rootDir}/coinstacks/common`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(commonHash)

  // hash coinstacks dependencies
  const { hash: dependenciesHash } = await hashElement(`${rootDir}/coinstacks`, {
    folders: { include: ['**'], exclude: ['.*', 'common', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['package.json'] },
  })
  hash.update(dependenciesHash)

  return hash.digest('hex')
}

export const getVolumeReaperHJash = async (): Promise<string> => {
  const hash = createHash('sha1')
  // hash volume reaper files
  const { hash: volumeReaperHash } = await hashElement(volumeReaperDir, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules'] },
    files: { include: ['package.json'] },
  })
  hash.update(volumeReaperHash)
  return hash.digest('hex') 
}
