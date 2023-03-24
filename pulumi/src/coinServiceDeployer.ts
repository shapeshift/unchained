import { CoinService, StatefulService } from "."
import { PvcResolver } from "./pvcResolver"
import { readFileSync } from 'fs'
import { createCoinService } from "./coinServiceCreator"

export const deployCoinServices = async (statefulService: StatefulService, asset: string, pvcResolver: PvcResolver) => {
  return await Promise.all(statefulService.coinServices.map((coinService) => {
      if (coinService.name === 'daemon') {
        return createCoinService({
            asset,
            serviceName: coinService.name,
            config: coinService,
            command: [
              '/bin/blockbook',
              '-blockchaincfg=/config.json',
              '-datadir=/data',
              '-sync',
              '-public=:8001',
              '-enablesubnewtx',
              '-logtostderr',
              '-debug',
            ],
            ports: { public: { port: 8001 } },
            configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
            volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
            readinessProbe: { initialDelaySeconds: 20, periodSeconds: 5, failureThreshold: 12 },
            livenessProbe: { timeoutSeconds: 10, initialDelaySeconds: 60, periodSeconds: 15, failureThreshold: 4 },
            pvcResolver,
          })
      }
      if (coinService.name === 'daemon') {
        return createCoinService({
          serviceName: coinService.name,
            asset,
            config: coinService,
            command: [
              '/bin/blockbook',
              '-blockchaincfg=/config.json',
              '-datadir=/data',
              '-sync',
              '-public=:8001',
              '-enablesubnewtx',
              '-logtostderr',
              '-debug',
            ],
            ports: { public: { port: 8001 } },
            configMapData: { 'indexer-config.json': readFileSync('../indexer/config.json').toString() },
            volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
            readinessProbe: { initialDelaySeconds: 20, periodSeconds: 5, failureThreshold: 12 },
            livenessProbe: { timeoutSeconds: 10, initialDelaySeconds: 60, periodSeconds: 15, failureThreshold: 4 },
            pvcResolver,
          })
        }
      return null;
    }).filter((s): s is Promise<CoinService> => Boolean(s)));
  }
