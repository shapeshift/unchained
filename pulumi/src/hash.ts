import { createHash } from 'crypto'
import { parse } from 'dotenv'
import { hashElement } from 'folder-hash'
import objectHash from 'object-hash'
import * as k8s from '@pulumi/kubernetes'

export enum CoinstackType {
  GO,
  NODE,
}

export const secretEnvs = (assetName: string, sampleEnv: Buffer) =>
  Object.keys(parse(sampleEnv)).map<k8s.types.input.core.v1.EnvVar>((key) => ({
    name: key,
    valueFrom: { secretKeyRef: { name: assetName, key: key } },
  }))

export const getCoinstackHash = async (
  coinstack: string,
  buildArgs: Record<string, string>,
  coinstackType: CoinstackType
): Promise<string> => {
  switch (coinstackType) {
    case CoinstackType.NODE:
      return await getNodeCoinstackHash(coinstack, buildArgs)
    case CoinstackType.GO:
      return await getGoCoinstackHash(coinstack, buildArgs)
  }
}

// creates a hash of the content included in the final build image
const getNodeCoinstackHash = async (coinstack: string, buildArgs: Record<string, string>): Promise<string> => {
  const hash = createHash('sha1')
  const nodeBasePath = `${__dirname}/../../node`

  // hash root level unchained files
  const { hash: unchainedHash } = await hashElement(nodeBasePath, {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['package.json', 'lerna.json'] },
  })
  hash.update(unchainedHash)

  // hash contents of packages
  const { hash: packagesHash } = await hashElement(`${nodeBasePath}/packages`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(packagesHash)

  // hash contents of common-api
  const { hash: commonApiHash } = await hashElement(`${nodeBasePath}/coinstacks/common/api`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(commonApiHash)

  // hash contents of coinstack-api
  const { hash: apiHash } = await hashElement(`${nodeBasePath}/coinstacks/${coinstack}/api`, {
    folders: { include: ['**'], exclude: ['.*', 'dist', 'node_modules', 'pulumi'] },
    files: { include: ['*.ts', '*.json', 'Dockerfile'] },
  })
  hash.update(apiHash)

  hash.update(objectHash(buildArgs))

  return hash.digest('hex')
}

// creates a hash of the content included in the final build image
const getGoCoinstackHash = async (coinstack: string, buildArgs: Record<string, string>): Promise<string> => {
  const hash = createHash('sha1')
  const goBasePath = '${__dirname}/../../go'

  // hash go module files
  const { hash: unchainedHash } = await hashElement(goBasePath, {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['go.mod', 'go.sum'] },
  })
  hash.update(unchainedHash)

  // hash build files
  const { hash: buildHash } = await hashElement(`${goBasePath}/build`, {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['Dockerfile'] },
  })
  hash.update(buildHash)

  // hash contents of static
  const { hash: staticHash } = await hashElement(`${goBasePath}/static`, {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*'] },
  })
  hash.update(staticHash)

  // hash contents of internal
  const { hash: internalHash } = await hashElement(`${goBasePath}/internal`, {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go'] },
  })
  hash.update(internalHash)

  // hash contents of cmd
  const { hash: cmdHash } = await hashElement(`${goBasePath}/cmd/${coinstack}`, {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go', 'sample.env'] },
  })
  hash.update(cmdHash)

  // hash contents of pkg
  const { hash: pkgHash } = await hashElement(`${goBasePath}/pkg`, {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go'] },
  })
  hash.update(pkgHash)

  // hash contents of coinstack
  const { hash: coinstackHash } = await hashElement(`${goBasePath}/${coinstack}`, {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['*.go'] },
  })
  hash.update(coinstackHash)

  // hash contents of coinstack api
  const { hash: coinstackApiHash } = await hashElement(`${goBasePath}/${coinstack}/api`, {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go', '*.json'] },
  })
  hash.update(coinstackApiHash)

  hash.update(objectHash(buildArgs))

  return hash.digest('hex')
}
