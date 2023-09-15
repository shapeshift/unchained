import axios from 'axios'
import { execSync } from 'child_process'
import * as pulumi from '@pulumi/pulumi'
import { Dockerhub } from '.'

export interface BuildAndPushImageArgs {
  auth: Dockerhub
  buildArgs?: Record<string, string>
  env?: Record<string, string>
  cacheFroms?: Array<string>
  context: string
  dockerFile?: string
  image: string
  tags?: Array<string>
}

export const buildAndPushImage = async (args: BuildAndPushImageArgs): Promise<void> => {
  execSync(`docker login -p ${args.auth.password} -u ${args.auth.username} 2> /dev/null`)

  const dockerBuildArgs: Array<string> = []
  const dockerTags: Array<string> = []

  const envs = Object.entries(args.env ?? {})
    .map(([key, val]) => `${key}=${val}`)
    .join(' ')

  // use provided tags or default to latest
  if (args.tags) {
    args.tags.forEach((tag) => {
      dockerTags.push(`${args.image}:${tag}`)
    })

    // add latest tag by default if not provided
    if (!args.tags.includes('latest')) {
      dockerTags.push(`${args.image}:latest`)
    }
  } else {
    dockerTags.push(`${args.image}:latest`)
  }

  // add all tags to docker build args
  dockerBuildArgs.push(...dockerTags.map((tag) => `-t ${tag}`))

  if (args.buildArgs) {
    Object.entries(args.buildArgs).forEach(([key, val]) => {
      dockerBuildArgs.push(`--build-arg ${key}=${val}`)
    })
  }

  if (args.cacheFroms) {
    args.cacheFroms.forEach((image) => {
      dockerBuildArgs.push(`--cache-from ${image}`)
    })
  }

  if (args.dockerFile) {
    dockerBuildArgs.push(`-f ${args.dockerFile}`)
  }

  dockerBuildArgs.push(args.context)

  execSync(`${envs} docker build --pull --platform linux/amd64 ${dockerBuildArgs.join(' ')}`, {
    stdio: 'inherit',
  })

  if (!pulumi.runtime.isDryRun()) {
    dockerTags.forEach((tag) => execSync(`docker push ${tag}`))
  }
}

export const hasTag = async (repository: string, tag: string): Promise<boolean> => {
  try {
    await axios(`https://hub.docker.com/v2/repositories/${repository}/tags/${tag}`)
    return true
  } catch (e) {
    return false
  }
}
