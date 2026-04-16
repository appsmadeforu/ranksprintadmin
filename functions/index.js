import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createQuestionImportHandlers } from "./importPipeline.js";

initializeApp();

const auth = getAuth();
const db = getFirestore();
const importHandlers = createQuestionImportHandlers({ db });

export const createAdminUser = onCall(async (request) => {

  const { name, email, password, role, permissions } = request.data;

  // 🔐 Only superadmin can create
  if (!request.auth) {
    throw new Error("Not authenticated");
  }

  const requesterDoc = await db
    .collection("admins")
    .doc(request.auth.uid)
    .get();

  if (!requesterDoc.exists || requesterDoc.data().role !== "superadmin") {
    throw new Error("Only superadmin can create admins");
  }

  try {
    // Create Auth user
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name
    });

    // Create Firestore admin doc
    await db
      .collection("admins")
      .doc(userRecord.uid)
      .set({
        name,
        email,
        role,
        permissions,
        createdAt: FieldValue.serverTimestamp()
      });

    return { success: true };

  } catch (err) {
    console.error(err);
    throw new HttpsError(
      "invalid-argument",
      err.errorInfo?.message || "Invalid input"
    );
  }

});

export const updateAdminPassword = onCall(async (request) => {

  const { uid, password } = request.data;

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Not authenticated");
  }

  const requesterDoc = await db
    .collection("admins")
    .doc(request.auth.uid)
    .get();

  if (!requesterDoc.exists || requesterDoc.data().role !== "superadmin") {
    throw new HttpsError("permission-denied", "Only superadmin can update password");
  }

  try {

    await auth.updateUser(uid, {
      password: password
    });

    return { success: true };

  } catch (err) {

    throw new HttpsError(
      "invalid-argument",
      err.errorInfo?.message || "Error updating password"
    );

  }

});

export const deleteAdminUser = onCall(async (request) => {

  const { uid } = request.data;

  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Not authenticated");
  }

  const requesterDoc = await db
    .collection("admins")
    .doc(request.auth.uid)
    .get();

  if (!requesterDoc.exists || requesterDoc.data().role !== "superadmin") {
    throw new HttpsError("permission-denied", "Only superadmin can delete admins");
  }

  // Prevent deleting self
  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "You cannot delete yourself");
  }

  try {

    await auth.deleteUser(uid);

    await db
      .collection("admins")
      .doc(uid)
      .delete();

    return { success: true };

  } catch (err) {

    throw new HttpsError(
      "invalid-argument",
      err.message || "Error deleting admin"
    );

  }

});

export const createQuestionImportReview =
  importHandlers.createQuestionImportReview;

export const finalizeQuestionImport =
  importHandlers.finalizeQuestionImport;
