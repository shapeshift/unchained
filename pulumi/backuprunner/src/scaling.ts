import k8s from '@kubernetes/client-node';

export const delay = (time: number) => {
  return new Promise((resolve) => setTimeout(resolve, time));
};

export const scaleStatefulSet = async (
  k8sAppsClient: k8s.AppsV1Api,
  name: string,
  namespace: string,
  count: number,
  waitToFinish: boolean
) => {
  console.log(`Scaling StatefulSet ${namespace}.${name} to ${count} replicas`);

  const { body } = await k8sAppsClient.readNamespacedStatefulSet(name, namespace);

  if(typeof(body.spec?.replicas) === "string"){
    body.spec.replicas = count
  }else{
    console.warn(`Invalid replica count: ${body.spec?.replicas}`)
  }

  await k8sAppsClient.replaceNamespacedStatefulSet(name, namespace, body);

  if (waitToFinish) {
    await waitForScalingToFinish(k8sAppsClient, name, namespace, count);
  }
};


const waitForScalingToFinish = async (
  k8sAppsClient: k8s.AppsV1Api,
  name: string,
  namespace: string,
  count: number
) => {
  const max_iterations = 100;

  var done = false;
  var iterations = 0;
  
  while (!done) {
    iterations++;
    // termination grace period is 120s so need to account for that 
    console.log(`Waiting for ${name} to shut down...`)
    await delay(3000);
    const status = await k8sAppsClient.readNamespacedStatefulSetStatus(
      name,
      namespace
    );
    if (status.body.status?.availableReplicas === count) {
      done = true;
      console.log(`Scaling finished - ${namespace}.${name} availableReplicas is now ${count}`);
    }
    if (iterations >= max_iterations) {
      console.log(
        `Scaling StatefulSet ${namespace}.${name} has timed out`
      );
      process.exit(1);
    }
  }
};