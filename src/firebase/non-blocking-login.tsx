'use client';
import {
  Auth, // Import Auth type for type hinting
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  // Assume getAuth and app are initialized elsewhere
} from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  // CRITICAL: Call signInAnonymously directly. Do NOT use 'await signInAnonymously(...)'.
  signInAnonymously(authInstance);
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}

/** Initiate email/password sign-up (non-blocking). */
export function initiateEmailSignUp(authInstance: Auth, email: string, password: string, username: string, onError?: (error: any) => void): void {
  // CRITICAL: Call createUserWithEmailAndPassword directly. Do NOT use 'await createUserWithEmailAndPassword(...)'.
  createUserWithEmailAndPassword(authInstance, email, password)
    .then(userCredential => {
      const user = userCredential.user;
      const firestore = getFirestore(authInstance.app);
      const userRef = doc(firestore, 'users', user.uid);
      const userData = {
        id: user.uid,
        username: username,
        role: 'Agent' // Default role
      };

      setDoc(userRef, userData)
        .catch(error => {
          const contextualError = new FirestorePermissionError({
            operation: 'create',
            path: userRef.path,
            requestResourceData: userData,
          });
          errorEmitter.emit('permission-error', contextualError);
          // Also call the original onError if it exists
          if (onError) onError(error);
        });
    })
    .catch(error => {
      if (onError) onError(error);
    });
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string, onError?: (error: any) => void): void {
  // CRITICAL: Call signInWithEmailAndPassword directly. Do NOT use 'await signInWithEmailAndPassword(...)'.
  signInWithEmailAndPassword(authInstance, email, password)
    .catch(error => {
        if (onError) onError(error);
    });
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}
