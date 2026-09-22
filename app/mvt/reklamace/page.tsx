import { AppLayout } from '../../components/layout/AppLayout';
import { MvtReklamaceClient } from '../../components/mvt/MvtReklamaceClient';

export default function Page() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#1E8449]">Reklamace z montáží</h1>
        <p className="mb-6 mt-2 text-gray-600">
          Co montéři poslali na reklamace, v jakém stavu je reklamace v ERP a zda reklamační oddělení už naplánovalo navazující návštěvu. Přehled, ne úkoly — položky mizí samy, jakmile je reklamace vyřešená.
        </p>
        <MvtReklamaceClient />
      </main>
    </AppLayout>
  );
}
