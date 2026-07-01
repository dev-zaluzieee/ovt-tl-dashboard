import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignInForm } from '../components/auth/SignInForm';

export default async function AuthPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (token) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#1E8449] mb-2">
            žaluzieee — portál vedoucích týmů
          </h1>
          <p className="text-gray-600">
            Přihlaste se (Administrátor)
          </p>
        </div>
        <SignInForm />
      </div>
    </div>
  );
}
