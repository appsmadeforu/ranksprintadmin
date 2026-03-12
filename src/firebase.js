import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyBf-ifIEgNMr_l39PvhNyGvIXQm39xDJUg",
  authDomain: "ranksprintai-1eff8.firebaseapp.com",
  projectId: "ranksprintai-1eff8",
  storageBucket: "ranksprintai-1eff8.firebasestorage.app",
  messagingSenderId: "469236570222",
  appId: "1:469236570222:web:abf1507242e7460330ee7f",
  measurementId: "G-KDTNQFY9B3"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");
