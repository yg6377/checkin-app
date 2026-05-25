# Checkin App Template

Supabase 기반 출퇴근/근태 관리 템플릿입니다.

## Stack

- React
- Vite
- Supabase

## Local Development

1. 의존성 설치
   `npm install`
2. 환경변수 설정
   `.env.example`을 참고해 `.env.local` 생성
3. 개발 서버 실행
   `npm run dev`

## Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Build

```bash
npm run build
```

## Notes

- `.env.local`은 커밋하지 않습니다.
- Vercel 배포 시 동일한 환경변수를 프로젝트 설정에 등록해야 합니다.
