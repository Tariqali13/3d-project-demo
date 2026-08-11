export function measureProfileLineInWorker({
  startPoint,
  endPoint,
  setBuildingGraph,
  breakLineEdges,
  bvhRoot,
  profileWorkerRef,
}) {
  return new Promise((resolve, reject) => {
    let worker = new Worker(
      new URL('../workers/profileBuilder.worker.js', import.meta.url),
      {
        type: 'module', // if needed
      }
    );

    if (profileWorkerRef) {
      profileWorkerRef.current = worker;
    }

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        const { progress, details } = e.data;
        const calProgress = progress * 100;
        console.log("calProgress", calProgress)
        setBuildingGraph(calProgress.toFixed(2)); // Convert to percentage
      } else if (e.data.success) {
        worker.terminate();
        worker = null; // explicitly clear reference
        resolve(e.data.data);
      } else if (e.data.error) {
        worker.terminate();
        worker = null; // explicitly clear reference
        reject(new Error(e.data.error));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      worker = null; // explicitly clear reference
      reject(err.message);
    };
    worker.postMessage({
      startPoint,
      endPoint,
      breakLineEdges,
      bvhRoot,
    });
  });
}
