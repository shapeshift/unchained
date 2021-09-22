import { IndexerConfig } from '@shapeshiftoss/blockbook-pulumi'
import { ApiConfig } from './api'
import { IngesterConfig } from './ingester'
import { MongoConfig } from './mongo'

export * from './api'
export * from './docker'
export * from './ingester'
export * from './mongo'
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
  environment?: string
  api?: ApiConfig
  indexer?: IndexerConfig
  ingester?: IngesterConfig
  mongo?: MongoConfig
}
