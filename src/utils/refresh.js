export const settleRefreshTasks = (tasks) => Promise.allSettled(
  tasks.map((task) => Promise.resolve().then(() => (
    typeof task === "function" ? task() : task
  ))),
);
