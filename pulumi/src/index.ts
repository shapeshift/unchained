import * as k8s from '@pulumi/kubernetes'
import { ApiConfig } from './api'

export * from './config'
export * from './api'
export * from './docker'
export * from './secret'
export * from './statefulService'

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

export interface StatefulService {
  replicas: number
  services: Array<ServiceConfig>
}

export interface Config extends BaseConfig {
  stack: string
  assetName: string
  network: string
  environment?: string
  api?: ApiConfig
  statefulService?: StatefulService
}

export interface Port extends k8s.types.input.core.v1.ServicePort {
  ingressRoute?: boolean
  pathPrefix?: string
  stripPathPrefix?: boolean
}

export type StorageClass = 'gp2' | 'gp3'

export interface ServiceConfig {
  cpuLimit: string
  cpuRequest?: string
  image: string
  memoryLimit: string
  memoryRequest?: string
  name: string
  storageSize: string
  /**
   * **Only applicable for gp3 volumes**
   *
   * - Baseline: 3000 IOPS
   * - Max: 16000 IOPS
   * - Additional provision ratio: 500 IOPS per GiB max (ex. 500 IOPS per GiB × 32 GiB = 16000 IOPS)
   *
   * _if no value is specified, the gp2 equivalent will be used_
   **/
  storageIops?: string
  /**
   * **Only applicable for gp3 volumes**
   *
   * - Baseline: 125 MiB/s
   * - Max: 1000 MiB/s
   * - Additional provision ratio: 0.25 MiB/s per IOPS max (ex. 4000 IOPS × 0.25 MiB/s per IOPS = 1,000 MiB/s)
   *
   * _if no value is specified, the gp2 max burstable equivalent will be used_
   **/
  storageThroughput?: string
  storageClassName?: StorageClass
}

export interface CoinServiceArgs extends ServiceConfig {
  ports?: Record<string, Port>
  command?: Array<string>
  args?: Array<string>
  env?: Record<string, string>
  dataDir?: string
  configMapData?: Record<string, string>
  volumeMounts?: Array<k8s.types.input.core.v1.VolumeMount>
  startupProbe?: k8s.types.input.core.v1.Probe
  livenessProbe?: k8s.types.input.core.v1.Probe
  readinessProbe?: k8s.types.input.core.v1.Probe
  useMonitorContainer?: boolean
}

export interface Service {
  name: string
  ports: Array<Port>
  configMapData: Record<string, string>
  containers: Array<k8s.types.input.core.v1.Container>
  volumeClaimTemplates: Array<k8s.types.input.core.v1.PersistentVolumeClaim>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Outputs = Record<string, any>
