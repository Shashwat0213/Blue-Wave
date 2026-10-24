import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAS-_oYs0RMAMc28tqqaGaviYzHSfIEh6s",
  authDomain: "blue-wave-d05f6.firebaseapp.com",
  projectId: "blue-wave-d05f6",
  storageBucket: "blue-wave-d05f6.firebasestorage.app",
  messagingSenderId: "247703938465",
  appId: "1:247703938465:web:f68a9b33d906b8244957e0",
  measurementId: "G-7M12000KW0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

window.currentUser = null;
window.favorites = [];
window.userPlaylists = [];

// OPEN / CLOSE MODAL
window.openLoginModal = () => { document.getElementById("loginModal").style.display = "flex"; }
window.closeLoginModal = () => { document.getElementById("loginModal").style.display = "none"; }

window.signInWithGoogle = () => signInWithPopup(auth, provider).catch(err => alert("Login failed: " + err.message));
window.logout = () => { if(confirm("Log out?")) signOut(auth).then(() => location.reload()); };

onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.currentUser = user;
    window.closeLoginModal(); // लॉगिन होते ही पॉपअप बंद करें
    
    // UI Update
    document.getElementById("loginBtnHeader").style.display = "none";
    document.getElementById("userProfile").style.display = "flex";
    if (user.photoURL) document.getElementById("userAvatar").src = user.photoURL;

    // Fetch Firestore Data
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      window.favorites = docSnap.data().favorites || [];
      window.userPlaylists = docSnap.data().playlists || [];
    } else {
      await setDoc(docRef, { favorites: [], playlists: [] });
    }
    
    // Re-render UI to show favorites/playlists
    if(window.renderLibrary) window.renderLibrary();
    if(window.performSearch) window.performSearch(); // रिफ्रेश करें ताकि हार्ट आइकॉन अपडेट हो
  } else {
    window.currentUser = null;
    document.getElementById("loginBtnHeader").style.display = "flex";
    document.getElementById("userProfile").style.display = "none";
    window.favorites = []; window.userPlaylists = [];
  }
});

window.toggleFavFirestore = async (id) => {
  if(!window.currentUser) {
    window.openLoginModal();
    return;
  }
  const docRef = doc(db, "users", window.currentUser.uid);
  const isFav = window.favorites.includes(id);
  if (isFav) {
    window.favorites = window.favorites.filter(x => x !== id);
    await updateDoc(docRef, { favorites: arrayRemove(id) });
  } else {
    window.favorites.push(id);
    await updateDoc(docRef, { favorites: arrayUnion(id) });
  }
  if(window.updateFavButton) window.updateFavButton();
  if(window.renderLibrary) window.renderLibrary();
};

window.savePlaylistsFirestore = async (newPlaylists) => {
  if(!window.currentUser) { window.openLoginModal(); return; }
  const docRef = doc(db, "users", window.currentUser.uid);
  await updateDoc(docRef, { playlists: newPlaylists });
  window.userPlaylists = newPlaylists;
  if(window.renderLibrary) window.renderLibrary();
};