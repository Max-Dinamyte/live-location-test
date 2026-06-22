// firebase-config.js
// Max Dinamyte PWA — Firebase setup and purchase tracking
// Include this in the PWA before any other app logic

// ─── PASTE YOUR FIREBASE CONFIG HERE ───────────────────────────────────────
// Get this from Firebase Console → Project Settings → Your apps → Web app
// It looks like the object below — fill in the real values
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBetQsXKk7RJtHDHPOpLgunAAXovema3A8",
  authDomain: "max-dinamyte-travel.firebaseapp.com",
  projectId: "max-dinamyte-travel",
  storageBucket: "max-dinamyte-travel.firebasestorage.app",
  messagingSenderId: "966323686121",
  appId: "1:966323686121:web:1540d493c808c802803e78",
  measurementId: "G-KB8EF7ZZQJ"
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── MAP CATALOG ─────────────────────────────────────────────────────────────
// This mirrors your existing Stripe links and map keys from mapapp.html
const MAP_CATALOG = {
  rome: {
    name: 'Rome, Italy',
    flag: '🇮🇹',
    price: '$2.99',
    stripeUrl: 'https://buy.stripe.com/00w7sLbBM3KX97mexNenS03',
    idealLength: '7–10 days',
    bestSeason: 'Mar–May · Sep–Nov',
    total: 48,
    restaurants: 23, bars: 8, sites: 17,
    center: [41.897, 12.476], zoom: 13
  },
  hawaii: {
    name: 'Big Island, Hawaii',
    flag: '🇺🇸',
    price: '$2.99',
    stripeUrl: 'https://buy.stripe.com/7sY00jgW6a9l4R6dtJenS02',
    idealLength: '7–10 days',
    bestSeason: 'Apr–Jun · Sep–Nov',
    total: 55,
    restaurants: 20, bars: 8, sites: 27,
    center: [19.5, -155.5], zoom: 9
  },
  paris: {
    name: 'Paris, France',
    flag: '🇫🇷',
    price: '$2.99',
    stripeUrl: 'https://buy.stripe.com/dRmdR99tE95herGexNenS04',
    idealLength: '5–7 days',
    bestSeason: 'Apr–Jun · Sep–Oct',
    total: 69,
    restaurants: 28, bars: 14, sites: 27,
    center: [48.856, 2.352], zoom: 13
  },
  florence: {
    name: 'Florence, Italy',
    flag: '🇮🇹',
    price: '$2.99',
    stripeUrl: 'https://buy.stripe.com/bJe7sL21cftFcjy75lenS05',
    idealLength: '3–5 days',
    bestSeason: 'Apr–Jun · Sep–Oct',
    total: 44,
    restaurants: 18, bars: 8, sites: 18,
    center: [43.769, 11.256], zoom: 14
  },
  amsterdam: {
    name: 'Amsterdam, Netherlands',
    flag: '🇳🇱',
    price: '$2.99',
    stripeUrl: 'https://buy.stripe.com/aFa4gz9tE1CP5VablBenS0a',
    idealLength: '3–5 days',
    bestSeason: 'Apr–May · Sep–Oct',
    total: 50,
    restaurants: 19, bars: 11, sites: 20,
    center: [52.372, 4.895], zoom: 13
  },
  london: {
    name: 'London, UK',
    flag: '🇬🇧',
    price: '$2.99',
    stripeUrl: 'https://buy.stripe.com/4gMdR99tE4P14R6fBRenS08',
    idealLength: '5–7 days',
    bestSeason: 'May–Sep',
    total: 78,
    restaurants: 26, bars: 14, sites: 38,
    center: [51.505, -0.118], zoom: 12
  },
  buenosaires: {
    name: 'Buenos Aires & Montevideo',
    flag: '🇦🇷',
    price: '$2.99',
    stripeUrl: 'https://buy.stripe.com/7sY9ATbBMchtfvK9dtenS0b',
    idealLength: '4–6 days',
    bestSeason: 'Sep–Nov · Mar–May',
    total: 64,
    restaurants: 25, bars: 13, sites: 26,
    center: [-34.65, -57.9], zoom: 9
  }
};

// ─── PURCHASE TRACKING ───────────────────────────────────────────────────────

/**
 * Record a new map purchase in Firestore.
 * Call this from your Stripe success webhook or redirect handler.
 *
 * @param {string} userId  - Firebase Auth UID of the buyer
 * @param {string} mapKey  - e.g. 'rome', 'hawaii', 'paris'
 * @returns {Promise<string>} - the new purchase document ID
 */
async function recordPurchase(userId, mapKey) {
  const db = firebase.firestore();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 12 months from purchase

  const purchase = {
    userId,
    mapKey,
    mapName: MAP_CATALOG[mapKey]?.name || mapKey,
    purchasedAt: firebase.firestore.Timestamp.fromDate(now),
    expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
    active: true
  };

  const ref = await db.collection('mapPurchases').add(purchase);
  console.log(`Purchase recorded: ${mapKey} for user ${userId}, expires ${expiresAt.toDateString()}`);
  return ref.id;
}

/**
 * Get all active (non-expired) purchases for a user.
 * Returns an array of mapKey strings the user currently has access to.
 *
 * @param {string} userId - Firebase Auth UID
 * @returns {Promise<string[]>} - e.g. ['rome', 'paris']
 */
async function getActivePurchases(userId) {
  const db = firebase.firestore();
  const now = firebase.firestore.Timestamp.now();

  const snapshot = await db.collection('mapPurchases')
    .where('userId', '==', userId)
    .where('expiresAt', '>', now)
    .get();

  return snapshot.docs.map(doc => doc.data().mapKey);
}

/**
 * Check if a user has active access to a specific map.
 *
 * @param {string} userId
 * @param {string} mapKey
 * @returns {Promise<boolean>}
 */
async function hasAccess(userId, mapKey) {
  const active = await getActivePurchases(userId);
  return active.includes(mapKey);
}

/**
 * Get full purchase details for a user (including expiry dates).
 * Useful for showing "expires in X days" in the UI.
 *
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getPurchaseDetails(userId) {
  const db = firebase.firestore();
  const now = firebase.firestore.Timestamp.now();

  const snapshot = await db.collection('mapPurchases')
    .where('userId', '==', userId)
    .where('expiresAt', '>', now)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    const expiresAt = data.expiresAt.toDate();
    const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
    return {
      id: doc.id,
      mapKey: data.mapKey,
      mapName: data.mapName,
      purchasedAt: data.purchasedAt.toDate(),
      expiresAt,
      daysLeft
    };
  });
}

// Export for use in the PWA
if (typeof module !== 'undefined') {
  module.exports = { MAP_CATALOG, recordPurchase, getActivePurchases, hasAccess, getPurchaseDetails };
}
