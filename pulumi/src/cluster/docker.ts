import { hasTag, buildAndPushImage } from '../docker'
import { getBaseHash } from '../hasher'
import { Dockerhub } from '..'

export const buildAndPushDockerImages = async (dockerhub: Dockerhub, name: string) => {
  const baseImage = `${dockerhub.username}/${name}-base`
  const baseTag = await getBaseHash()

  if (!(await hasTag(baseImage, baseTag))) {
    await buildAndPushImage({
      image: baseImage,
      context: '../../..',
      dockerFile: '../../../Dockerfile.node',
      auth: dockerhub,
      buildArgs: { BUILDKIT_INLINE_CACHE: '1' },
      env: { DOCKER_BUILDKIT: '1' },
      tags: [baseTag],
      cacheFroms: [`${baseImage}:${baseTag}`, `${baseImage}:latest`],
    })
  }
}
