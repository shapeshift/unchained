import { createHash } from 'crypto'
import { parse } from 'dotenv'
import { hashElement } from 'folder-hash'
import objectHash from 'object-hash'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'

export const secretEnvs = (_: string, asset: string) =>
  Object.keys(parse(readFileSync('../sample.env'))).map<k8s.types.input.core.v1.EnvVar>((key) => ({
    name: key,
    valueFrom: { secretKeyRef: { name: asset, key: key } },
  }))

// creates a hash of the content included in the final build image
export const getHash = async (coinstack: string, buildArgs: Record<string, string>): Promise<string> => {
  const hash = createHash('sha1')

  // hash root level unchained files
  const { hash: unchainedHash } = await hashElement('../../../../', {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['package.json', 'lerna.json', 'yarn.lock', 'Dockerfile.node'] },
  })
  hash.update(unchainedHash)

  // hash contents of packages
  const { hash: packagesHash } = await hashElement('../../../packages', {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(packagesHash)

  // hash contents of common-api
  const { hash: commonApiHash } = await hashElement('../../common/api', {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(commonApiHash)

  // hash contents of coinstack-api
  const { hash: apiHash } = await hashElement(`../../${coinstack}/api`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(apiHash)

  hash.update(objectHash(buildArgs))

  return hash.digest('hex')
}
