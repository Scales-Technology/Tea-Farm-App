import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:            "AIzaSyAEq1DlrSa639eYYu64jAqeGrPtMwJToR8",
  authDomain:        "teafarmapp-92c80.firebaseapp.com",
  projectId:         "teafarmapp-92c80",
  storageBucket:     "teafarmapp-92c80.firebasestorage.app",
  messagingSenderId: "964555602209",
  appId:             "1:964555602209:web:7a136411db6d09fddaa660",
};

const app = initializeApp(firebaseConfig);

export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);