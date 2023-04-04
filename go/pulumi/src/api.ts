import { createHash } from 'crypto'
import { parse } from 'dotenv'
import { hashElement } from 'folder-hash'
import objectHash from 'object-hash'
import { readFileSync } from 'fs'
import * as k8s from '@pulumi/kubernetes'

export const secretEnvs = (coinstack: string, asset: string) =>
  Object.keys(parse(readFileSync(`../../../cmd/${coinstack}/sample.env`))).map<k8s.types.input.core.v1.EnvVar>(
    (key) => ({
      name: key,
      valueFrom: { secretKeyRef: { name: asset, key: key } },
    })
  )

// creates a hash of the content included in the final build image
export const getHash = async (coinstack: string, buildArgs: Record<string, string>): Promise<string> => {
  const hash = createHash('sha1')

  // hash go module files
  const { hash: unchainedHash } = await hashElement('../../../', {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['go.mod', 'go.sum'] },
  })
  hash.update(unchainedHash)

  // hash build files
  const { hash: buildHash } = await hashElement('../../../build', {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['Dockerfile'] },
  })
  hash.update(buildHash)

  // hash contents of static
  const { hash: staticHash } = await hashElement('../../../static', {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*'] },
  })
  hash.update(staticHash)

  // hash contents of internal
  const { hash: internalHash } = await hashElement('../../../internal', {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go'] },
  })
  hash.update(internalHash)

  // hash contents of cmd
  const { hash: cmdHash } = await hashElement(`../../../cmd/${coinstack}`, {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go', 'sample.env'] },
  })
  hash.update(cmdHash)

  // hash contents of pkg
  const { hash: pkgHash } = await hashElement('../../../pkg', {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go'] },
  })
  hash.update(pkgHash)

  // hash contents of coinstack
  const { hash: coinstackHash } = await hashElement(`../../${coinstack}`, {
    folders: { exclude: ['.*', '*'] },
    files: { include: ['*.go'] },
  })
  hash.update(coinstackHash)

  // hash contents of coinstack api
  const { hash: coinstackApiHash } = await hashElement(`../../${coinstack}/api`, {
    folders: { include: ['**'], exclude: ['.*'] },
    files: { include: ['*.go', '*.json'] },
  })
  hash.update(coinstackApiHash)

  hash.update(objectHash(buildArgs))

  return hash.digest('hex')
}
