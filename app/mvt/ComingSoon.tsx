import { AppLayout } from '../components/layout/AppLayout';

/** Placeholder for MVT pages that are designed but not built yet — never a 404 from the menu. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <AppLayout>
      <main className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold text-[#1E8449]">{title}</h1>
        <p className="mt-2 text-gray-600">{description}</p>
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
          Tato stránka se připravuje. Data už vznikají (výsledky z aplikace montérů se ukládají), zobrazení přijde v další verzi.
        </div>
      </main>
    </AppLayout>
  );
}
