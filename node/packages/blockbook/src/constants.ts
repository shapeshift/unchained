export const defaultCoinServiceArgs = {
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
  volumeMounts: [{ name: 'config-map', mountPath: '/config.json', subPath: 'indexer-config.json' }],
  startupProbe: {
    httpGet: { path: '/api/v2', port: 8001 },
    periodSeconds: 30,
    failureThreshold: 60,
    timeoutSeconds: 10,
  },
  livenessProbe: { httpGet: { path: '/api/v2', port: 8001 }, periodSeconds: 30, timeoutSeconds: 10 },
  readinessProbe: { periodSeconds: 15, failureThreshold: 8 },
}
