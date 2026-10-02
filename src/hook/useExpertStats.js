import useExpertCounts from "./useExpertCounts";

const ENDPOINTS = [
  { key: "researches", path: "/researches" },
  { key: "journals",   path: "/journals"   },
  { key: "patents",    path: "/patents"     },
  { key: "awards",     path: "/awards"      },
];

const useExpertStats = () => {
  const { counts: stats, loading, refetch } = useExpertCounts(ENDPOINTS);
  return { stats, loading, refetch };
};

export default useExpertStats;
