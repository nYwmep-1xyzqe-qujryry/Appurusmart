import infoApi from "./infoApi";
import { createLrdRequestId, getSafeLrdErrorDetails } from "../utils/lrdDiagnostics";

const withLrdConfig = (config = {}) => ({
  ...config,
  timeout: config.timeout ?? 30000,
  suppressAuthRedirect: config.suppressAuthRedirect ?? true,
  lrdRequestId: config.lrdRequestId ?? createLrdRequestId(),
});

export const LRD_ENDPOINTS = {
  session: "/info/session",
  register: "/info/lrd/researcher/register",
  faculties: "/info/lrd/facultys",
  branches: "/info/lrd/branchs",
  paperIndexes: "/info/lrd/paperindexs",
  projects: "/info/lrd/projects",
  papers: "/info/lrd/papers",
  researcherMe: "/info/lrd/researcher/me",
  educations: "/info/lrd/researcher/me/educations",
  expertises: "/info/lrd/researcher/me/expertises",
};

// The search screens show every record visible to the authenticated user,
// while the management screens continue to use `scope=mine`.
export const LRD_VISIBLE_SCOPE = "all";

export const getLrd = (path, config) => infoApi.get(path, withLrdConfig(config));
export const postLrd = (path, data, config = {}) =>
  infoApi.post(path, data, withLrdConfig(config));

export const patchLrd = (path, data, config) =>
  data instanceof FormData
    ? (() => {
        data.append("_method", "PATCH");
        return postLrd(path, data, config);
      })()
    : postLrd(path, { ...data, _method: "PATCH" }, config);
export const deleteLrd = (path, config) => postLrd(path, { _method: "DELETE" }, config);
export const registerLrdResearcher = (config) => postLrd(LRD_ENDPOINTS.register, { x: 1 }, config);

export const getLrdErrorMessage = (error, fallback = "เชื่อมต่อ LRD ไม่สำเร็จ") => {
  return getSafeLrdErrorDetails(error).message || fallback;
};
