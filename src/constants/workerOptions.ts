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

// 송금 은행 추천 목록 — datalist 제안일 뿐이며 직접 입력도 허용한다.
export const BANK_OPTIONS = [
  "국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "기업은행",
  "NH농협은행",
  "지역농협",
  "SC제일은행",
  "한국씨티은행",
  "산업은행",
  "수협은행",
  "새마을금고",
  "신협",
  "우체국",
  "저축은행",
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  "부산은행",
  "경남은행",
  "대구은행(iM뱅크)",
  "광주은행",
  "전북은행",
  "제주은행",
  "산림조합",
];

export const withCurrentOption = (options: string[], currentValue: string) => {
  if (!currentValue || options.includes(currentValue)) return options;
  return [currentValue, ...options];
};
