import { AppLayout } from '../components/layout/AppLayout';
import { ReviewQrClient } from '../components/review-qr/ReviewQrClient';

/**
 * Recenze QR — marketing's admin for the review QR the tablet shows after a
 * closed-on-site export: global switch (default off), QR per region (kraj
 * from the marketing calendar) and audience (B2C soukromá osoba / B2B firma),
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
            QR se vybírá podle kraje OVT z marketingového kalendáře a podle toho, jestli je zákazník soukromá osoba (B2C),
            nebo firma (B2B). Který QR má který kraj, určujete tady. OVT nic nevybírá.
          </p>
        </div>
        <ReviewQrClient />
      </main>
    </AppLayout>
  );
}
