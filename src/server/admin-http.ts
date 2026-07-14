import "server-only";

import { AuthConfigurationError } from "@/auth/config";
import { authErrorResponse } from "@/auth/http";
import { UnauthorizedError } from "@/auth/session";
import { errorResponse } from "@/server/http";

export function adminApiErrorResponse(error: unknown) {
  return error instanceof UnauthorizedError || error instanceof AuthConfigurationError
    ? authErrorResponse(error)
    : errorResponse(error);
}
