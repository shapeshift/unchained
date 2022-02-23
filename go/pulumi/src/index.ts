import { ApiConfig } from './api'

export * from './api'
export * from './docker'
export * from './hasher'

export interface Dockerhub {
  username: string
  password: string
  server: string
}

export type Cluster = 'docker-desktop' | 'minikube' | 'eks'

export interface BaseConfig {
  /**
   * This is used to create dockerhub repositories and push/pull images
   */
  dockerhub?: Dockerhub
  cluster: Cluster
  isLocal: boolean
  additionalEnvironments?: string[]
  /**
   * Creates ingress for public dns
   *
   * _this assumes ExternalDNS and Traefik have been configured on the cluster_
   */
  rootDomainName?: string
}

export interface Config extends BaseConfig {
  stack: string
  network: string
  environment?: string
  api?: ApiConfig
}
