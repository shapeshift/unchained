import * as k8s from '@pulumi/kubernetes'
import { getConfig } from './config'
import * as grafana from './grafana'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Outputs = Record<string, any>

//https://www.pulumi.com/docs/intro/languages/javascript/#entrypoint
export = async (): Promise<Outputs> => {
  const { kubeconfig, domain } = await getConfig()

  const name = 'unchained'
  const namespace = `${name}-monitoring`
  const outputs: Outputs = {}
  const provider = new k8s.Provider('kube-provider', { kubeconfig })

  new grafana.Ingress(
    name,
    {
      namespace: namespace,
      domain: domain,
    },
    { provider }
  )

  return outputs
}
