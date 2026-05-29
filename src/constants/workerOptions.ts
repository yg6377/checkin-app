export const DEFAULT_DEPARTMENT_OPTIONS = ["관리부", "생산부", "영업부", "구매부"];

export const DEFAULT_RANK_OPTIONS = [
  "사원",
  "주임",
  "대리",
  "과장",
  "차장",
  "부장",
  "팀장",
  "실장",
  "이사",
  "상무",
  "전무",
  "부사장",
  "사장",
  "대표",
];

export const DEFAULT_JOB_OPTIONS = ["관리", "사상", "용접", "취부", "절단", "도비"];

export const withCurrentOption = (options: string[], currentValue: string) => {
  if (!currentValue || options.includes(currentValue)) return options;
  return [currentValue, ...options];
};
