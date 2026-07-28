import { z } from "zod";

import { createRegistry, type WorkerHandler } from "../runtime/dispatcher.js";

const smokePayload = z.object({ sourceTheme: z.string().min(1) }).passthrough();

export function createSmokeRegistry() {
  const handler: WorkerHandler<z.infer<typeof smokePayload>> = {
    type: "places.metadata",
    parsePayload: (input) => smokePayload.parse(input),
    async run(context) {
      context.logger.info("worker_smoke_noop", { jobId: context.jobId });
      return { result: { smoke: true } };
    },
  };
  return createRegistry([handler]);
}
