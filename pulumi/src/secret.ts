import * as k8s from '@pulumi/kubernetes'
import * as pulumi from '@pulumi/pulumi'
import { CustomResourceOptions } from '@pulumi/pulumi'
import { parse } from 'dotenv'

export interface SecretArgs {
  name: string
  env: Buffer
  namespace: string
}

export const createSecret = (args: SecretArgs, opts: CustomResourceOptions) => {
  const { name, env, namespace } = args
  const secretData = getSecretData(env)

  return new k8s.core.v1.Secret(name, { metadata: { name, namespace }, stringData: secretData }, opts)
}

const getSecretData = (sampleEnv: Buffer) => {
  const missingKeys: Array<string> = []
  const stringData = Object.keys(parse(sampleEnv)).reduce((prev, key) => {
    const value = process.env[key]

    if (value === undefined) {
      missingKeys.push(key)
      return prev
    }

    return { ...prev, [key]: pulumi.secret(value) }
  }, {})

  if (missingKeys.length) {
    throw new Error(`Missing the following required environment variables: ${missingKeys.join(', ')}`)
  }

  return stringData
}
