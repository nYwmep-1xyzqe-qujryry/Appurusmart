import api from "./api";

export const SERVICES_ENDPOINT = "/services";

export async function fetchServices({ authSession } = {}) {
  return api.get(SERVICES_ENDPOINT, {
    authSession,
    suppressErrorLog: true,
  });
}
