import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { storage, db, auth } from '../firebase';

/**
 * Upload avatar to Firebase Storage
 * @param {File} file - Image file to upload
 * @returns {Promise<string>} - Download URL of uploaded avatar
 */
export async function uploadAvatar(file) {
  if (!auth.currentUser) {
    throw new Error('User not authenticated');
  }

  // Validate file type
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. Only PNG, JPG, and GIF are allowed.');
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    throw new Error('File size exceeds 5MB limit.');
  }

  try {
    const userId = auth.currentUser.uid;
    const fileExtension = file.name.split('.').pop();
    const fileName = `${userId}_${Date.now()}.${fileExtension}`;
    const storageRef = ref(storage, `avatars/${fileName}`);

    // Upload file
    await uploadBytes(storageRef, file);

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);

    // Update user profile in Firestore
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      avatar: downloadURL,
      avatarPath: `avatars/${fileName}`,
      updatedAt: new Date()
    });

    return downloadURL;
  } catch (error) {
    console.error('Avatar upload error:', error);
    throw new Error(`Failed to upload avatar: ${error.message}`);
  }
}

/**
 * Get avatar URL for a user
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} - Avatar URL or null if not found
 */
export async function getAvatarUrl(userId) {
  try {
    if (!userId) return null;

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      return userDoc.data().avatar || null;
    }

    return null;
  } catch (error) {
    console.error('Get avatar error:', error);
    return null;
  }
}

/**
 * Delete user's avatar from Firebase Storage
 * @param {string} avatarPath - Path to avatar in storage (e.g., 'avatars/filename.jpg')
 * @returns {Promise<void>}
 */
export async function deleteAvatar(avatarPath) {
  if (!auth.currentUser) {
    throw new Error('User not authenticated');
  }

  try {
    if (!avatarPath) return;

    const storageRef = ref(storage, avatarPath);
    await deleteObject(storageRef);

    // Update user profile in Firestore
    const userId = auth.currentUser.uid;
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      avatar: null,
      avatarPath: null,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Delete avatar error:', error);
    throw new Error(`Failed to delete avatar: ${error.message}`);
  }
}

/**
 * Validate image file before upload
 * @param {File} file - File to validate
 * @returns {Object} - { valid: boolean, error: string|null }
 */
export function validateAvatarFile(file) {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!validTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Only PNG, JPG, and GIF are allowed.' };
  }

  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 5MB limit.' };
  }

  return { valid: true, error: null };
}
