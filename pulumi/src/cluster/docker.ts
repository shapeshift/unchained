import { hashElement } from 'folder-hash'
import { hasTag, buildAndPushImage } from '../docker'
import { getBaseHash, getVolumeReaperHash } from '../hasher'
import { Dockerhub } from '..'

export const buildAndPushDockerImages = async (dockerhub: Dockerhub, name: string) => {
  const baseImage = `${dockerhub.username}/${name}-base`
  const baseTag = await getBaseHash()

  if (!(await hasTag(baseImage, baseTag))) {
    await buildAndPushImage({
      image: baseImage,
      context: '../../../node',
      auth: dockerhub,
      buildArgs: { BUILDKIT_INLINE_CACHE: '1' },
      env: { DOCKER_BUILDKIT: '1' },
      tags: [baseTag],
      cacheFroms: [`${baseImage}:${baseTag}`, `${baseImage}:latest`],
    })
  }

  const blockbookImage = `${dockerhub.username}/${name}-blockbook`
  const { hash: blockbookTag } = await hashElement(`../../..//node/packages/blockbook/Dockerfile`, { encoding: 'hex' })

  if (!(await hasTag(blockbookImage, blockbookTag))) {
    await buildAndPushImage({
      image: blockbookImage,
      context: '../../../node/packages/blockbook',
      auth: dockerhub,
      buildArgs: { BUILDKIT_INLINE_CACHE: '1' },
      env: { DOCKER_BUILDKIT: '1' },
      tags: [blockbookTag],
      cacheFroms: [`${blockbookImage}:${blockbookTag}`, `${blockbookImage}:latest`],
    })
  }

  const volumeReaperImage = `${dockerhub.username}/${name}-volume-reaper`
  const volumeReaperTag = await getVolumeReaperHash()

  if (!(await hasTag(volumeReaperImage, volumeReaperTag))) {
    await buildAndPushImage({
      image: volumeReaperImage,
      context: '../../volumeReaper',
      auth: dockerhub,
      buildArgs: { BUILDKIT_INLINE_CACHE: '1', BASE_IMAGE: baseImage },
      env: { DOCKER_BUILDKIT: '1' },
      tags: [volumeReaperTag],
      cacheFroms: [`${volumeReaperImage}:${volumeReaperTag}`, `${volumeReaperImage}:latest`, `${baseImage}:latest`],
    })
  }
}
