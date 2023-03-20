import { hashElement } from "folder-hash"
import { Dockerhub } from ".."
import { hasTag, buildAndPushImage } from "../docker"
import { getBaseHash, getVolumeReaperHJash as getVolumeReaperHash } from "../hasher"

export const buildAndPushDockerImages = async (dockerhub: Dockerhub) => {
  const baseImage = `${dockerhub.username}/${name}-base`
  const baseTag = await getBaseHash()

  if (!(await hasTag(baseImage, baseTag))) {
    await buildAndPushImage({
      image: baseImage,
      context: '../../../node',
      auth: {
        password: dockerhub.password,
        username: dockerhub.username,
        server: dockerhub.server,
      },
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
      auth: {
        password: dockerhub.password,
        username: dockerhub.username,
        server: dockerhub.server,
      },
      buildArgs: { BUILDKIT_INLINE_CACHE: '1' },
      env: { DOCKER_BUILDKIT: '1' },
      tags: [blockbookTag],
      cacheFroms: [`${blockbookImage}:${blockbookTag}`, `${blockbookImage}:latest`],
    })
  }

  const volumeReaperImage = `${dockerhub.username}/${name}-volume-reaper`
  const volumeReaperHash = await getVolumeReaperHash()

  if (!(await hasTag(volumeReaperImage, volumeReaperHash))) {
    await buildAndPushImage({
      image: volumeReaperImage,
      context: '../../volumeReaper',
      auth: {
        password: dockerhub.password,
        username: dockerhub.username,
        server: dockerhub.server,
      },
      buildArgs: { BUILDKIT_INLINE_CACHE: '1', BASE_IMAGE: baseImage },
      env: { DOCKER_BUILDKIT: '1' },
      tags: [volumeReaperHash],
      cacheFroms: [`${volumeReaperImage}:latest`, `${volumeReaperImage}:${volumeReaperHash}`, `${baseImage}:latest`],
    })
  }
}