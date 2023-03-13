import k8s from "@kubernetes/client-node";

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

  var res = await k8sAppsClient.readNamespacedStatefulSet(name, namespace);
  let ss = res.body;
  ss.spec!!.replicas = Number(count);
  await k8sAppsClient.replaceNamespacedStatefulSet(name, namespace, ss);

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
  var done = false;
  var iterations = 0;
  var max_iterations = 100;

  while (!done) {
    iterations++;
    // termination grace period is 120s so need to account for that 
    console.log(`Waiting for ${name} to shut down...`)
    await delay(3000);
    var status = await k8sAppsClient.readNamespacedStatefulSetStatus(
      name,
      namespace
    );
    if (status.body.status?.availableReplicas === Number(count)) {
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