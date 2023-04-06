import * as k8s from '@pulumi/kubernetes'
import { ApiConfig } from './api'
import * as pulumi from '@pulumi/pulumi'

export * from './config'
export * from './api'
export * from './docker'
export * from './statefulService'
export * from './snapper'
export * from './hasher'

export interface Dockerhub {
  username: string
  password: string
  server: string
}

export interface BaseConfig {
  /**
   * This is used to create dockerhub repositories and push/pull images
   */
  dockerhub?: Dockerhub
  additionalEnvironments?: string[]
  /**
   * Creates ingress for public dns
   *
   * _this assumes ExternalDNS and Traefik have been configured on the cluster_
   */
  rootDomainName?: string
}

export interface BackupConfig {
  count: number
  schedule: string
}

export interface StatefulService {
  replicas: number
  services: Array<ServiceConfig>
  backup?: BackupConfig
}

export interface Config extends BaseConfig {
  stack: string
  assetName: string
  network: string
  environment?: string
  api?: ApiConfig
  statefulService?: StatefulService
}

export interface Port {
  port: number
  ingressRoute?: boolean
  pathPrefix?: string
  stripPathPrefix?: boolean
}

export interface ServiceConfig {
  cpuLimit?: string
  cpuRequest?: string
  image: string
  memoryLimit?: string
  memoryRequest?: string
  name: string
  storageSize: string
}

export interface ServiceInput {
  coinServiceName: string
  ports: Record<string, Port>
  command?: Array<string>
  args?: Array<string>
  env?: Record<string, string>
  dataDir?: string
  configMapData?: Record<string, string>
  volumeMounts?: Array<k8s.types.input.core.v1.VolumeMount>
  readinessProbe?: k8s.types.input.core.v1.Probe
  livenessProbe?: k8s.types.input.core.v1.Probe
}

export interface JointCoinServiceInput extends ServiceInput, ServiceConfig {}

export interface Service {
  ports: Array<
    k8s.types.input.core.v1.ServicePort & { ingressRoute?: boolean; pathPrefix?: string; stripPathPrefix?: boolean }
  >
  configMapData: Record<string, string>
  containers: Array<k8s.types.input.core.v1.Container>
  volumeClaimTemplates: Array<k8s.types.input.core.v1.PersistentVolumeClaim>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Outputs = Record<string, any>

export type SecretData = pulumi.Input<{
  [key: string]: pulumi.Input<string>
}>
