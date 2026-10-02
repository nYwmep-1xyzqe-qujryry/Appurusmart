import useExpertCounts from "./useExpertCounts";

const MENU_ENDPOINTS = [
  { key: "education",     path: "/educations"  },
  { key: "work_history",  path: "/workexes"    },
  { key: "admin_history", path: "/boardexes"   },
  { key: "expertise",     path: "/expertises"  },
  { key: "interest",      path: "/interests"   },
  { key: "research",      path: "/researches"  },
  { key: "journal",       path: "/journals"    },
  { key: "proceeding",    path: "/proceedings" },
  { key: "book",          path: "/books"       },
  { key: "patent",        path: "/patents"     },
  { key: "award",         path: "/awards"      },
  { key: "speaker",       path: "/lecturers"   },
  { key: "training",      path: "/trainings"   },
  { key: "service",       path: "/academics"   },
  { key: "human_subjects",path: "/hsps"        },
];

const useMenuCounts = () => useExpertCounts(MENU_ENDPOINTS);

export default useMenuCounts;
