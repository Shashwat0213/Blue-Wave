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

window.signInWithGoogle = () => signInWithPopup(auth, provider).catch(err => alert("Login failed: " + err.message));
window.logout = () => { if(confirm("Log out?")) signOut(auth).then(() => location.reload()); };

onAuthStateChanged(auth, async (user) => {
  if (user) {
    window.currentUser = user;
    document.getElementById("loginScreen").style.opacity = "0";
    setTimeout(() => {
      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("appContainer").style.display = "block";
      if(window.renderHome) window.renderHome();
    }, 500);
    if (user.photoURL) document.getElementById("userAvatar").src = user.photoURL;

    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      window.favorites = docSnap.data().favorites || [];
      window.userPlaylists = docSnap.data().playlists || [];
    } else {
      await setDoc(docRef, { favorites: [], playlists: [] });
    }
    if(window.renderLibrary) window.renderLibrary();
  } else {
    window.currentUser = null;
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("loginScreen").style.opacity = "1";
    document.getElementById("appContainer").style.display = "none";
  }
});

window.toggleFavFirestore = async (id) => {
  if(!window.currentUser) return;
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
  if(!window.currentUser) return;
  const docRef = doc(db, "users", window.currentUser.uid);
  await updateDoc(docRef, { playlists: newPlaylists });
  window.userPlaylists = newPlaylists;
  if(window.renderLibrary) window.renderLibrary();
};