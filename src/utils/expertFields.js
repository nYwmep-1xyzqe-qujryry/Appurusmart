const toDisplayText = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    return firstNonEmpty(
      value.name,
      value.title,
      value.reference,
      value.label,
      // A contact or lookup sent as an object states its content under one of
      // these instead, and reading only the four above turned such a field
      // into an empty row that looked like missing data.
      value.value,
      value.text,
      value.number,
      value.th,
      value.en,
    );
  }
  return String(value).trim();
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    const text = toDisplayText(value);
    if (text) return text;
  }
  return "";
};

export const getExpertTitle = (entry) =>
  firstNonEmpty(
    entry?.name,
    entry?.title,
    entry?.reference,
    entry?.citation,
    entry?.proceeding,
    entry?.proceeding_name,
    entry?.proceeding_title,
    entry?.article_title,
    entry?.paper_title,
    entry?.topic,
    entry?.description,
  );

export const getExpertLink = (entry) =>
  firstNonEmpty(
    entry?.link,
    entry?.url,
    entry?.file_url,
    entry?.fileUrl,
    entry?.evidence_url,
    entry?.evidenceUrl,
    entry?.document_url,
    entry?.documentUrl,
  );

export const getExpertYear = (entry) =>
  firstNonEmpty(entry?.year);

// Identity fields as /info/expert/profile serves them.
//
// That endpoint replaced /profile/{id}, which returned the position as a
// name. This one returns `position` as a numeric id and carries the label in
// `position_name`, so reading `position` directly printed "1" where a title
// belonged.
//
// `department_name_th` is the trap: here it holds the FACULTY, not the
// department, which is why the PDF showed the faculty's name on the
// department row. The department is `major_name_th`. The older spellings stay
// as fallbacks so a response from another endpoint — /me and the search
// results each use their own — still resolves.
export const getExpertPositionName = (profile = {}) => firstNonEmpty(
  profile.position_name,
  profile.position_label,
  profile.academic_position,
  // Last: on this endpoint it is an id, and an id is worse than nothing only
  // when something better exists.
  profile.position,
);

export const getExpertFacultyName = (profile = {}) => firstNonEmpty(
  profile.faculty_name_th,
  profile.faculty_name_en,
  profile.faculty_name,
  profile.faculty,
);

export const getExpertDepartmentName = (profile = {}) => firstNonEmpty(
  profile.major_name_th,
  profile.major_name_en,
  profile.department_name_en,
  profile.program,
  profile.major,
  profile.unit_name_th,
  profile.department,
);

export const getExpertPhone = (profile = {}) => firstNonEmpty(
  profile.phone_work,
  profile.tel,
  profile.mobile,
  profile.phone,
  profile.phone_number,
);
