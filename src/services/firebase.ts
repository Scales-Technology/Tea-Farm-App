import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  const firebaseConfig = {
  apiKey: "AIzaSyBam61zYjleDv-crKhgxisqZA-Zg6jYMYY",
  authDomain: "tea-farm-app-8e460.firebaseapp.com",
  projectId: "tea-farm-app-8e460",
  storageBucket: "tea-farm-app-8e460.firebasestorage.app",
  messagingSenderId: "812381313123",
  appId: "1:812381313123:web:843a68e575d57e09838056"
};

const app = initializeApp(firebaseConfig);

export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);
