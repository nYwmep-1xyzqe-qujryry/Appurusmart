// Field accessors for /info/lrd/researches.
//
// The screens used to read /info/lrd/projects, whose table had no column for
// the abstract, objective, contributors or local experts — anything typed
// into those fields was accepted and silently dropped. The real records live
// in `researchs`, which the researches endpoint serves, so the screens read
// that instead.
//
// Three names differ between the two shapes:
//
//   projects          researches
//   ----------------  -------------
//   projectname       title_th
//   projectname_eng   title_eng
//   year_id           createyear     (4-digit B.E. year, sent as a string)
//
// Every accessor still falls back to the old name. A list fetched before the
// switch can sit in the resource cache, and a record reached through a
// navigation param may have been captured under the old shape; reading both
// keeps those rows rendering instead of blanking out. The fallbacks can go
// once no cache from the projects era can still be in play.
export const getResearchTitleTh = (item) => item?.title_th ?? item?.projectname ?? "";

export const getResearchTitleEn = (item) => item?.title_eng
  ?? item?.projectname_eng
  ?? item?.title_en
  ?? "";

export const getResearchYear = (item) => item?.createyear ?? item?.year_id ?? item?.year ?? "";

// The backend decides who may edit: a record bound to an LRD proposal, or one
// where this researcher is a member rather than the owner, comes back with
// editable:false. Absent the flag (an older response, or a cached row) the
// screens fall back to the ownership check they already made, so nothing
// becomes editable that was not before.
export const isResearchEditable = (item, isOwner) => (
  typeof item?.editable === "boolean" ? item.editable : Boolean(isOwner)
);

export const getResearchLockedReason = (item) => {
  const reason = item?.locked_reason ?? item?.lockedReason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : "";
};

export const isResearchMemberRole = (item) => item?.role === "member";
