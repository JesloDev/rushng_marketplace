import "server-only";

export const isFirebaseAdminConfigured: boolean = Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT || process.env.NEXT_PUBLIC_FIREBASE_API_KEY
);

/**
 * Verify a Firebase ID token using Google Identity Toolkit API.
 * Completely immune to ERR_REQUIRE_ESM, CJS/ESM bundling issues, and jwks-rsa crashes.
 */
export async function verifyIdToken(idToken: string): Promise<{
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  emailVerified: boolean;
}> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is not configured.");
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  const data = await res.json();

  if (!res.ok || !data.users || data.users.length === 0) {
    throw new Error(data.error?.message || "Invalid or expired Firebase ID token");
  }

  const user = data.users[0];

  return {
    uid: user.localId,
    email: user.email,
    name: user.displayName,
    picture: user.photoUrl,
    emailVerified: user.emailVerified ?? false,
  };
}
