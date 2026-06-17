import { APP_NAME } from "@oco/shared";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
      <main className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          MVP · каркас проекта
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{APP_NAME}</h1>
        <p className="mt-4 text-slate-600 leading-relaxed">
          Веб-кабинет для сравнения доставки и создания отправлений через APIShip.
          Сейчас поднят пустой каркас — экраны и логика появятся на следующих шагах.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-slate-500">
          <li>Next.js + TypeScript + Tailwind</li>
          <li>PostgreSQL 16 через Docker Compose</li>
          <li>Prisma — схема базы готова</li>
        </ul>
      </main>
    </div>
  );
}
