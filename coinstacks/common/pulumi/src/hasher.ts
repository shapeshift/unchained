import { createHash } from 'crypto'
import { hashElement } from 'folder-hash'

// creates a hash of the content included in the final build image (base)
export const getBaseHash = async (): Promise<string> => {
  const hash = createHash('sha1')

  // hash root level unchained files
  const { hash: unchainedHash } = await hashElement(`${__dirname}/../../../`, {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['package.json', 'lerna.json'] },
  })
  hash.update(unchainedHash)

  // hash contents of packages
  const { hash: packagesHash } = await hashElement(`${__dirname}/../../../../packages`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(packagesHash)

  // hash contents of common-ingester
  const { hash: commonHash } = await hashElement(`${__dirname}/../../../../coinstacks/common`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(commonHash)

  // hash coinstacks dependencies
  const { hash: dependenciesHash } = await hashElement(`${__dirname}/../../../../coinstacks`, {
    folders: { include: ['**'], exclude: ['.*', 'common', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['package.json'] },
  })
  hash.update(dependenciesHash)

  return hash.digest('hex')
}
