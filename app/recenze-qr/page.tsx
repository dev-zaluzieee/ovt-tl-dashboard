import { AppLayout } from '../components/layout/AppLayout';
import { ReviewQrClient } from '../components/review-qr/ReviewQrClient';

/**
 * Recenze QR — marketing's admin for the review QR the tablet shows after a
 * closed-on-site export: global switch (default off), QR targets (label +
 * URL, QR rendered from the URL), which OVT gets which QR, and what the OVTs
 * answered when closing the prompt.
 */
export default function RecenzeQrPage() {
  return (
    <AppLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1E8449]">Recenze QR</h1>
          <p className="mt-2 text-gray-600">
            Po úspěšném exportu ADMF s výsledkem „chci objednat“ tablet ukáže zákazníkovi QR na recenzi pobočky.
            Který QR se komu zobrazí, určujete tady. OVT nic nevybírá.
          </p>
        </div>
        <ReviewQrClient />
      </main>
    </AppLayout>
  );
}
