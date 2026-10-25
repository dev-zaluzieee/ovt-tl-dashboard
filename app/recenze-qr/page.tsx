import { AppLayout } from '../components/layout/AppLayout';
import { ReviewQrClient } from '../components/review-qr/ReviewQrClient';

/**
 * Recenze QR — marketing's admin for the review QR the tablet shows after a
 * closed-on-site export: global switch (default off), QR per region (kraj
 * from the marketing calendar) and slot (primární / sekundární — the OVT
 * switches to the secondary when the customer lacks the first platform),
 * the global fallback QR, the QR targets (label + platform + URL, QR rendered
 * from the URL), and what the OVTs answered when closing the prompt.
 */
export default function RecenzeQrPage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Recenze QR</h1>
          <p className="mt-2 text-gray-600">
            Po úspěšném exportu ADMF s výsledkem „chci objednat“ tablet ukáže zákazníkovi QR na recenzi pobočky.
            Který QR se ukáže, určuje kraj OVT z marketingového kalendáře: nejdřív primární (tam chceme recenze), a když
            zákazník tu platformu nemá, OVT přepne na sekundární. Který QR má který kraj, určujete tady.
          </p>
        </div>
        <ReviewQrClient />
      </main>
    </AppLayout>
  );
}
