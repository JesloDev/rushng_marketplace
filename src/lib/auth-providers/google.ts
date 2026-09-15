"use client";

/**
 * Google Sign-In via Firebase Authentication — POPUP flow.
 *
 * Flow:
 *   1. User clicks "Continue with Google".
 *   2. Firebase opens Google's authentication page in a popup.
 *   3. User selects/signs into their Google account.
 *   4. The popup closes and Firebase returns the authenticated user.
 *   5. We obtain the fresh Firebase ID token.
 *   6. We POST the ID token to /api/auth/firebase.
 *   7. The server creates the RUSH session cookie.
 */

import {
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";

import {
  firebaseAuth,
  firebaseGoogleProvider,
  isFirebaseConfigured,
} from "./firebase-client";

import {
  AuthError,
  type AuthResult,
} from "./types";

/**
 * Start Google sign-in using a popup.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isFirebaseConfigured || !firebaseAuth || !firebaseGoogleProvider) {
    throw new AuthError(
      "Google Sign-In isn't configured. Set the NEXT_PUBLIC_FIREBASE_* env vars.",
      "FIREBASE_NOT_CONFIGURED",
    );
  }

  let cred: UserCredential;

  try {
    cred = await signInWithPopup(
      firebaseAuth,
      firebaseGoogleProvider,
    );
  } catch (error: any) {
    // 1. Popup closed by user
    if (error?.code === "auth/popup-closed-by-user") {
      throw new AuthError(
        "Google sign-in was cancelled.",
        "GOOGLE_POPUP_CLOSED",
      );
    }

    // 2. Browser blocked the popup window
    if (error?.code === "auth/popup-blocked") {
      throw new AuthError(
        "Sign-in popup was blocked by your browser. Please allow popups for this site.",
        "GOOGLE_POPUP_BLOCKED",
      );
    }

    // 3. Another popup attempt was initiated
    if (error?.code === "auth/cancelled-popup-request") {
      throw new AuthError(
        "Sign-in request was superseded by another attempt.",
        "GOOGLE_POPUP_CANCELLED",
      );
    }

    // 4. Unauthorized domain in Firebase Console
    if (error?.code === "auth/unauthorized-domain") {
      throw new AuthError(
        "This domain is not authorized in the Firebase Console.",
        "UNAUTHORIZED_DOMAIN",
      );
    }

    throw new AuthError(
      error?.message || "Failed to complete Google authentication.",
      error?.code || "GOOGLE_AUTH_FAILED",
    );
  }

  if (!cred?.user) {
    throw new AuthError(
      "Google sign-in did not return a user.",
      "GOOGLE_SIGN_IN_FAILED",
    );
  }

  // Retrieve token (force refresh to guarantee valid timestamps on backend)
  const idToken = await cred.user.getIdToken(true);

  // Exchange ID token for your application session cookie
  const res = await fetch("/api/auth/firebase", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ error: "Failed to exchange session" }));

    throw new AuthError(
      err.error || `Login failed with status ${res.status}`,
      String(res.status),
    );
  }

  const data = await res.json();

  return {
    id: data.user.id,
    email: data.user.email,
    name: data.user.name,
  };
}

export async function signOutFirebase() {
  if (!firebaseAuth) return;

  const { signOut } = await import("firebase/auth");
  await signOut(firebaseAuth);
}
