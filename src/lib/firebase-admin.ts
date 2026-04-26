import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  deleteDoc,
  setDoc, 
  updateDoc, 
  addDoc, 
  query, 
  orderBy, 
  limit,
  getDocs, 
  runTransaction, 
  arrayUnion,
  Firestore
} from "firebase/firestore";
import fs from 'fs';
import path from 'path';

// Read config for server-side initialization
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Firebase Client SDK (Authorized via API Key)
console.log(`📡 Initializing Firebase with Project: ${firebaseConfig.projectId}, Database: ${firebaseConfig.firestoreDatabaseId}`);
const app = initializeApp(firebaseConfig);

/**
 * DATABASE INITIALIZATION
 * Using Client SDK to bypass Service Account permission restrictions in container.
 */
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// auth is still handled by admin for now if needed, but for public db client is fine
import admin from "firebase-admin";
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
export const auth = admin.auth();

// Connection test
async function testConnection() {
  try {
    await getDoc(doc(db, '_test_connection_', 'ping'));
    console.log('✅ Firestore (Client SDK) connection verified successfully.');
  } catch (error: any) {
    console.error('❌ Firestore (Client SDK) connection test failed:', error.message);
  }
}
testConnection();

interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

async function handleFirestoreError(error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null = null, userId: string = 'unknown') {
  if (error.message?.includes('Missing or insufficient permissions') || error.code === 'permission-denied') {
    const errorInfo: FirestoreErrorInfo = {
      error: error.message,
      operationType,
      path,
      authInfo: {
        userId: userId,
        email: 'N/A (Client SDK)',
        emailVerified: true,
        isAnonymous: false,
        providerInfo: []
      }
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw error;
}

export interface UserProfile {
  userId: string;
  username: string;
  bio: string;
  mainGame: string;
  tradingStyle: string;
  vouchImages: string[];
  totalVouches: number;
  totalDeals: number;
  trustLevel: "LOW" | "MEDIUM" | "HIGH";
  createdAt: string;
}

export interface Vouch {
  fromUserId: string;
  toUserId: string;
  message: string;
  imageURL?: string;
  timestamp: string;
}

export interface AutoModSettings {
  enabled: boolean;
  whitelistedRoles: string[];
  whitelistedChannels: string[];
  capsLimit: number; // percentage
  emojiLimit: number;
  mentionLimit: number;
  duplicateDetect: boolean;
  badWords: string[];
  linkWhitelist: string[];
  punishment: 'warn' | 'mute' | 'kick' | 'ban';
  loggingEnabled: boolean;
}

const DEFAULT_AUTOMOD: AutoModSettings = {
  enabled: false,
  whitelistedRoles: [],
  whitelistedChannels: [],
  capsLimit: 70,
  emojiLimit: 10,
  mentionLimit: 5,
  duplicateDetect: true,
  badWords: [],
  linkWhitelist: ['youtube.com', 'google.com', 'discord.com'],
  punishment: 'warn',
  loggingEnabled: true,
};

export const userService = {
  // ... existing methods (getProfile, createProfile, etc.)
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      const docRef = doc(db, "users", userId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? (docSnap.data() as UserProfile) : null;
    } catch (error) {
      await handleFirestoreError(error, 'get', `users/${userId}`, userId);
      return null;
    }
  },

  async createProfile(userId: string, username: string, bio: string = 'No bio set.', mainGame: string = 'None', tradingStyle: string = 'Both') {
    const profile: UserProfile = {
      userId,
      username,
      bio,
      mainGame,
      tradingStyle,
      vouchImages: [],
      totalVouches: 0,
      totalDeals: 0,
      trustLevel: "LOW",
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, "users", userId), profile);
      return profile;
    } catch (error) {
      await handleFirestoreError(error, 'create', `users/${userId}`, userId);
      return profile;
    }
  },

  async updateProfile(userId: string, data: Partial<UserProfile>) {
    try {
      await updateDoc(doc(db, "users", userId), data);
    } catch (error) {
      await handleFirestoreError(error, 'update', `users/${userId}`, userId);
    }
  },

  async addVouch(toUserId: string, fromUserId: string, message: string, imageURL?: string) {
    const vouch: Vouch = {
      fromUserId,
      toUserId,
      message,
      imageURL,
      timestamp: new Date().toISOString(),
    };
    try {
      const vouchesCol = collection(db, "users", toUserId, "vouches");
      await addDoc(vouchesCol, vouch);
      
      // Update count
      const userRef = doc(db, "users", toUserId);
      await runTransaction(db, async (t) => {
        const docSnap = await t.get(userRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          const newCount = (data.totalVouches || 0) + 1;
          t.update(userRef, { totalVouches: newCount });
        }
      });
    } catch (error) {
      await handleFirestoreError(error, 'write', `users/${toUserId}/vouches`, fromUserId);
    }
  },

  async addVouchImage(userId: string, imageURL: string) {
    const userRef = doc(db, "users", userId);
    try {
      await runTransaction(db, async (t) => {
        const docSnap = await t.get(userRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          const images = data.vouchImages || [];
          if (images.length >= 50) return; // Hard limit
          t.update(userRef, { vouchImages: arrayUnion(imageURL) });
        }
      });
    } catch (error) {
      await handleFirestoreError(error, 'update', `users/${userId}`, userId);
    }
  },

  async getVouches(userId: string) {
    try {
      const vouchesCol = collection(db, "users", userId, "vouches");
      const q = query(vouchesCol, orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as Vouch);
    } catch (error) {
      await handleFirestoreError(error, 'list', `users/${userId}/vouches`, userId);
      return [];
    }
  },

  async recordDeal(userId: string) {
    const userRef = doc(db, "users", userId);
    try {
      await runTransaction(db, async (t) => {
        const docSnap = await t.get(userRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          const newDeals = (data.totalDeals || 0) + 1;
          let trust: "LOW" | "MEDIUM" | "HIGH" = "LOW";
          if (newDeals >= 10) trust = "HIGH";
          else if (newDeals >= 3) trust = "MEDIUM";
          
          t.update(userRef, { totalDeals: newDeals, trustLevel: trust });
        }
      });
    } catch (error) {
      await handleFirestoreError(error, 'update', `users/${userId}`, userId);
    }
  }
};

// Extra utility queries
export const leaderboardService = {
  async getTopVouches(limitN: number): Promise<UserProfile[]> {
    try {
      const usersCol = collection(db, 'users');
      const q = query(usersCol, orderBy('totalVouches', 'desc'), limit(Math.max(1, Math.min(50, limitN))));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => d.data() as UserProfile);
    } catch (e) {
      console.error('Top vouches query error:', e);
      return [];
    }
  },
};

export const autoModService = {
  async getSettings(guildId: string): Promise<AutoModSettings> {
    try {
      const docRef = doc(db, "guilds", guildId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return { ...DEFAULT_AUTOMOD, ...(data.automod || {}) };
      }
      return DEFAULT_AUTOMOD;
    } catch (error) {
      console.error('AutoMod Settings Load Error:', error);
      return DEFAULT_AUTOMOD;
    }
  },

  async updateSettings(guildId: string, settings: Partial<AutoModSettings>) {
    try {
      const docRef = doc(db, "guilds", guildId);
      const docSnap = await getDoc(docRef);
      const current = docSnap.exists() ? (docSnap.data().automod || DEFAULT_AUTOMOD) : DEFAULT_AUTOMOD;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { automod: updated }, { merge: true });
    } catch (error) {
      console.error('AutoMod Settings Update Error:', error);
    }
  },

  async resetSettings(guildId: string) {
    try {
      const docRef = doc(db, "guilds", guildId);
      await setDoc(docRef, { automod: DEFAULT_AUTOMOD }, { merge: true });
    } catch (error) {
      console.error('AutoMod Settings Reset Error:', error);
    }
  }
};

export interface GuildModSettings {
  jailRoleId: string | null;
  voiceBanRoleId: string | null;
  lockdownChannels: string[];
  lockdownEnabled: boolean;
}

const DEFAULT_MOD_SETTINGS: GuildModSettings = {
  jailRoleId: null,
  voiceBanRoleId: null,
  lockdownChannels: [],
  lockdownEnabled: false,
};

export const modService = {
  async getSettings(guildId: string): Promise<GuildModSettings> {
    try {
      const docRef = doc(db, "guilds", guildId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return { ...DEFAULT_MOD_SETTINGS, ...(data.mod || {}) };
      }
      return DEFAULT_MOD_SETTINGS;
    } catch (error) {
      console.error('Mod Settings Load Error:', error);
      return DEFAULT_MOD_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<GuildModSettings>) {
    try {
      const docRef = doc(db, "guilds", guildId);
      const docSnap = await getDoc(docRef);
      const current = docSnap.exists() ? (docSnap.data().mod || DEFAULT_MOD_SETTINGS) : DEFAULT_MOD_SETTINGS;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { mod: updated }, { merge: true });
    } catch (error) {
      console.error('Mod Settings Update Error:', error);
    }
  },

  async getWarningCount(guildId: string, userId: string): Promise<number> {
    try {
      const docRef = doc(db, "guilds", guildId, "warnings", userId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return 0;
      const data = snap.data() as any;
      return Number(data.count || 0);
    } catch (error) {
      console.error('Warning Load Error:', error);
      return 0;
    }
  },

  async setWarningCount(guildId: string, userId: string, count: number) {
    try {
      const docRef = doc(db, "guilds", guildId, "warnings", userId);
      await setDoc(
        docRef,
        { count: Math.max(0, Math.floor(count)), updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch (error) {
      console.error('Warning Set Error:', error);
    }
  },

  async addWarning(guildId: string, userId: string) {
    const current = await this.getWarningCount(guildId, userId);
    await this.setWarningCount(guildId, userId, current + 1);
  },

  async removeWarning(guildId: string, userId: string) {
    const current = await this.getWarningCount(guildId, userId);
    await this.setWarningCount(guildId, userId, Math.max(0, current - 1));
  },

  async resetWarnings(guildId: string, userId: string) {
    await this.setWarningCount(guildId, userId, 0);
  },
};

export interface MemeSettings {
  enabled: boolean;
  channelId: string | null;
  lastPostedAt: string | null;
}

const DEFAULT_MEME_SETTINGS: MemeSettings = {
  enabled: false,
  channelId: null,
  lastPostedAt: null,
};

export const memeService = {
  async getSettings(guildId: string): Promise<MemeSettings> {
    try {
      const docRef = doc(db, "guilds", guildId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return { ...DEFAULT_MEME_SETTINGS, ...(data.meme || {}) };
      }
      return DEFAULT_MEME_SETTINGS;
    } catch (error) {
      console.error('Meme Settings Load Error:', error);
      return DEFAULT_MEME_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<MemeSettings>) {
    try {
      const docRef = doc(db, "guilds", guildId);
      const docSnap = await getDoc(docRef);
      const current = docSnap.exists() ? (docSnap.data().meme || DEFAULT_MEME_SETTINGS) : DEFAULT_MEME_SETTINGS;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { meme: updated }, { merge: true });
    } catch (error) {
      console.error('Meme Settings Update Error:', error);
    }
  },
};

export interface LevelsSettings {
  enabled: boolean;
  xpPerMessage: number;
  messageCooldownMs: number;
  announceChannelId: string | null;
  rewardRoles: { level: number; roleId: string }[];
  loggingEnabled: boolean;
}

const DEFAULT_LEVELS_SETTINGS: LevelsSettings = {
  enabled: false,
  xpPerMessage: 5,
  messageCooldownMs: 60_000,
  announceChannelId: null,
  rewardRoles: [],
  loggingEnabled: true,
};

export interface LevelState {
  xp: number;
  level: number;
  lastMessageAt: string | null;
  updatedAt: string;
}

export const levelsService = {
  async getSettings(guildId: string): Promise<LevelsSettings> {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { ...DEFAULT_LEVELS_SETTINGS, ...(data.levels || {}) };
      }
      return DEFAULT_LEVELS_SETTINGS;
    } catch (e) {
      console.error('Levels settings load error:', e);
      return DEFAULT_LEVELS_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<LevelsSettings>) {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      const current = snap.exists() ? (snap.data().levels || DEFAULT_LEVELS_SETTINGS) : DEFAULT_LEVELS_SETTINGS;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { levels: updated }, { merge: true });
    } catch (e) {
      console.error('Levels settings update error:', e);
    }
  },

  async getUserState(guildId: string, userId: string): Promise<LevelState> {
    try {
      const docRef = doc(db, 'guilds', guildId, 'levels', userId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as any;
        return {
          xp: Number(data.xp || 0),
          level: Number(data.level || 0),
          lastMessageAt: typeof data.lastMessageAt === 'string' ? data.lastMessageAt : null,
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
        };
      }
    } catch (e) {
      console.error('Levels user load error:', e);
    }
    return { xp: 0, level: 0, lastMessageAt: null, updatedAt: new Date().toISOString() };
  },

  async setUserState(guildId: string, userId: string, state: Partial<LevelState>) {
    try {
      const docRef = doc(db, 'guilds', guildId, 'levels', userId);
      await setDoc(docRef, { ...state, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.error('Levels user update error:', e);
    }
  },

  async getTopUsers(guildId: string, topN: number): Promise<{ userId: string; xp: number; level: number }[]> {
    try {
      const col = collection(db, 'guilds', guildId, 'levels');
      const q = query(col, orderBy('xp', 'desc'), limit(Math.max(1, Math.min(50, topN))));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => {
        const data = d.data() as any;
        return { userId: d.id, xp: Number(data.xp || 0), level: Number(data.level || 0) };
      });
    } catch (e) {
      console.error('Levels leaderboard error:', e);
      return [];
    }
  },
};

export interface WelcomeSettings {
  enabled: boolean;
  channelId: string | null;
  welcomeTemplate: string;
  goodbyeTemplate: string;
}

const DEFAULT_WELCOME_SETTINGS: WelcomeSettings = {
  enabled: false,
  channelId: null,
  welcomeTemplate: 'Welcome {user} to **{server}**! You are member **#{memberCount}**.',
  goodbyeTemplate: 'Goodbye {user}. **{server}** now has **{memberCount}** members.',
};

export const welcomeService = {
  async getSettings(guildId: string): Promise<WelcomeSettings> {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { ...DEFAULT_WELCOME_SETTINGS, ...(data.welcome || {}) };
      }
      return DEFAULT_WELCOME_SETTINGS;
    } catch (e) {
      console.error('Welcome settings load error:', e);
      return DEFAULT_WELCOME_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<WelcomeSettings>) {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      const current = snap.exists() ? (snap.data().welcome || DEFAULT_WELCOME_SETTINGS) : DEFAULT_WELCOME_SETTINGS;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { welcome: updated }, { merge: true });
    } catch (e) {
      console.error('Welcome settings update error:', e);
    }
  },
};

export interface InvitesSettings {
  enabled: boolean;
  logChannelId: string | null;
}

const DEFAULT_INVITES_SETTINGS: InvitesSettings = { enabled: false, logChannelId: null };

export const invitesService = {
  async getSettings(guildId: string): Promise<InvitesSettings> {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { ...DEFAULT_INVITES_SETTINGS, ...(data.invites || {}) };
      }
      return DEFAULT_INVITES_SETTINGS;
    } catch (e) {
      console.error('Invites settings load error:', e);
      return DEFAULT_INVITES_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<InvitesSettings>) {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      const current = snap.exists() ? (snap.data().invites || DEFAULT_INVITES_SETTINGS) : DEFAULT_INVITES_SETTINGS;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { invites: updated }, { merge: true });
    } catch (e) {
      console.error('Invites settings update error:', e);
    }
  },

  async addInviteCredit(guildId: string, inviterId: string) {
    try {
      const docRef = doc(db, 'guilds', guildId, 'inviteStats', inviterId);
      const snap = await getDoc(docRef);
      const current = snap.exists() ? Number((snap.data() as any).count || 0) : 0;
      await setDoc(docRef, { count: current + 1, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.error('Invite credit error:', e);
    }
  },
};

export interface AutoRoleSettings {
  enabled: boolean;
  roleIds: string[];
}

const DEFAULT_AUTOROLE_SETTINGS: AutoRoleSettings = { enabled: false, roleIds: [] };

export const autoRoleService = {
  async getSettings(guildId: string): Promise<AutoRoleSettings> {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { ...DEFAULT_AUTOROLE_SETTINGS, ...(data.autorole || {}) };
      }
      return DEFAULT_AUTOROLE_SETTINGS;
    } catch (e) {
      console.error('Autorole settings load error:', e);
      return DEFAULT_AUTOROLE_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<AutoRoleSettings>) {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      const current = snap.exists() ? (snap.data().autorole || DEFAULT_AUTOROLE_SETTINGS) : DEFAULT_AUTOROLE_SETTINGS;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { autorole: updated }, { merge: true });
    } catch (e) {
      console.error('Autorole settings update error:', e);
    }
  },
};

export interface AutoResponderSettings {
  enabled: boolean;
  rules: { trigger: string; response: string }[];
}

const DEFAULT_AUTORESPONDER_SETTINGS: AutoResponderSettings = { enabled: false, rules: [] };

export const autoResponderService = {
  async getSettings(guildId: string): Promise<AutoResponderSettings> {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { ...DEFAULT_AUTORESPONDER_SETTINGS, ...(data.autoresponder || {}) };
      }
      return DEFAULT_AUTORESPONDER_SETTINGS;
    } catch (e) {
      console.error('Autoresponder settings load error:', e);
      return DEFAULT_AUTORESPONDER_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<AutoResponderSettings>) {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      const current = snap.exists()
        ? (snap.data().autoresponder || DEFAULT_AUTORESPONDER_SETTINGS)
        : DEFAULT_AUTORESPONDER_SETTINGS;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { autoresponder: updated }, { merge: true });
    } catch (e) {
      console.error('Autoresponder settings update error:', e);
    }
  },
};

export interface ReactionRolesSettings {
  enabled: boolean;
  channelId: string | null;
  messageId: string | null;
  mappings: { emoji: string; roleId: string }[];
}

const DEFAULT_REACTIONROLES_SETTINGS: ReactionRolesSettings = {
  enabled: false,
  channelId: null,
  messageId: null,
  mappings: [],
};

export const reactionRolesService = {
  async getSettings(guildId: string): Promise<ReactionRolesSettings> {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { ...DEFAULT_REACTIONROLES_SETTINGS, ...(data.reactionroles || {}) };
      }
      return DEFAULT_REACTIONROLES_SETTINGS;
    } catch (e) {
      console.error('ReactionRoles settings load error:', e);
      return DEFAULT_REACTIONROLES_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<ReactionRolesSettings>) {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      const current = snap.exists()
        ? (snap.data().reactionroles || DEFAULT_REACTIONROLES_SETTINGS)
        : DEFAULT_REACTIONROLES_SETTINGS;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { reactionroles: updated }, { merge: true });
    } catch (e) {
      console.error('ReactionRoles settings update error:', e);
    }
  },
};

export interface Giveaway {
  giveawayId: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  winnersCount: number;
  endsAt: string; // ISO
  ended: boolean;
  winners: string[];
  createdBy: string;
  createdAt: string; // ISO
}

export interface GiveawaySettings {
  enabled: boolean;
  logChannelId: string | null;
}

const DEFAULT_GIVEAWAY_SETTINGS: GiveawaySettings = {
  enabled: true,
  logChannelId: null,
};

export const giveawayService = {
  async getSettings(guildId: string): Promise<GiveawaySettings> {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { ...DEFAULT_GIVEAWAY_SETTINGS, ...(data.giveaway || {}) };
      }
      return DEFAULT_GIVEAWAY_SETTINGS;
    } catch (e) {
      console.error('Giveaway settings load error:', e);
      return DEFAULT_GIVEAWAY_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<GiveawaySettings>) {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      const current = snap.exists() ? (snap.data().giveaway || DEFAULT_GIVEAWAY_SETTINGS) : DEFAULT_GIVEAWAY_SETTINGS;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { giveaway: updated }, { merge: true });
    } catch (e) {
      console.error('Giveaway settings update error:', e);
    }
  },

  async createGiveaway(guildId: string, giveaway: Giveaway) {
    try {
      const docRef = doc(db, 'guilds', guildId, 'giveaways', giveaway.giveawayId);
      await setDoc(docRef, giveaway, { merge: false });
    } catch (e) {
      console.error('Create giveaway error:', e);
    }
  },

  async updateGiveaway(guildId: string, giveawayId: string, patch: Partial<Giveaway>) {
    try {
      const docRef = doc(db, 'guilds', guildId, 'giveaways', giveawayId);
      await setDoc(docRef, { ...patch, updatedAt: new Date().toISOString() } as any, { merge: true });
    } catch (e) {
      console.error('Update giveaway error:', e);
    }
  },

  async getGiveaway(guildId: string, giveawayId: string): Promise<Giveaway | null> {
    try {
      const docRef = doc(db, 'guilds', guildId, 'giveaways', giveawayId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return snap.data() as Giveaway;
    } catch (e) {
      console.error('Get giveaway error:', e);
      return null;
    }
  },

  async deleteGiveaway(guildId: string, giveawayId: string) {
    try {
      const docRef = doc(db, 'guilds', guildId, 'giveaways', giveawayId);
      await setDoc(docRef, { deleted: true, ended: true, updatedAt: new Date().toISOString() } as any, { merge: true });
    } catch (e) {
      console.error('Delete giveaway error:', e);
    }
  },

  async addEntry(guildId: string, giveawayId: string, userId: string) {
    try {
      const entryRef = doc(db, 'guilds', guildId, 'giveaways', giveawayId, 'entries', userId);
      await setDoc(entryRef, { userId, createdAt: new Date().toISOString() }, { merge: false });
    } catch (e) {
      console.error('Add giveaway entry error:', e);
    }
  },

  async listEntries(guildId: string, giveawayId: string): Promise<string[]> {
    try {
      const col = collection(db, 'guilds', guildId, 'giveaways', giveawayId, 'entries');
      const snapshot = await getDocs(col);
      return snapshot.docs.map((d) => d.id);
    } catch (e) {
      console.error('List giveaway entries error:', e);
      return [];
    }
  },

  async listDueGiveaways(guildId: string, maxN = 25): Promise<Giveaway[]> {
    try {
      const col = collection(db, 'guilds', guildId, 'giveaways');
      const now = new Date().toISOString();
      // Simple query: order by endsAt and fetch a small window, then filter client-side.
      const q = query(col, orderBy('endsAt', 'asc'), limit(Math.max(1, Math.min(50, maxN))));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((d) => d.data() as Giveaway);
      return items.filter((g) => g && !g.ended && typeof g.endsAt === 'string' && g.endsAt <= now);
    } catch (e) {
      console.error('List due giveaways error:', e);
      return [];
    }
  },
};

export interface EconomySettings {
  enabled: boolean;
  currencyName: string;
  earnPerMessage: number;
  earnCooldownMs: number;
  dailyAmount: number;
  dailyCooldownMs: number;
  messageEarningsEnabled: boolean;
}

const DEFAULT_ECONOMY_SETTINGS: EconomySettings = {
  enabled: true,
  currencyName: 'TradeCoins',
  earnPerMessage: 1,
  earnCooldownMs: 60_000,
  dailyAmount: 50,
  dailyCooldownMs: 24 * 60 * 60 * 1000,
  messageEarningsEnabled: true,
};

export interface Wallet {
  balance: number;
  bank: number;
  lastEarnAt: string | null;
  lastDailyAt: string | null;
  lastRobAt: string | null;
  updatedAt: string;
}

const DEFAULT_WALLET: Wallet = {
  balance: 0,
  bank: 0,
  lastEarnAt: null,
  lastDailyAt: null,
  lastRobAt: null,
  updatedAt: new Date().toISOString(),
};

export const economyService = {
  async getSettings(guildId: string): Promise<EconomySettings> {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { ...DEFAULT_ECONOMY_SETTINGS, ...(data.economy || {}) };
      }
      return DEFAULT_ECONOMY_SETTINGS;
    } catch (e) {
      console.error('Economy settings load error:', e);
      return DEFAULT_ECONOMY_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<EconomySettings>) {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      const current = snap.exists() ? (snap.data().economy || DEFAULT_ECONOMY_SETTINGS) : DEFAULT_ECONOMY_SETTINGS;
      const updated = { ...current, ...settings };
      await setDoc(docRef, { economy: updated }, { merge: true });
    } catch (e) {
      console.error('Economy settings update error:', e);
    }
  },

  async getWallet(guildId: string, userId: string): Promise<Wallet> {
    try {
      const docRef = doc(db, 'guilds', guildId, 'economy', userId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as any;
        return {
          balance: Number(data.balance || 0),
          bank: Number(data.bank || 0),
          lastEarnAt: typeof data.lastEarnAt === 'string' ? data.lastEarnAt : null,
          lastDailyAt: typeof data.lastDailyAt === 'string' ? data.lastDailyAt : null,
          lastRobAt: typeof data.lastRobAt === 'string' ? data.lastRobAt : null,
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
        };
      }
      return DEFAULT_WALLET;
    } catch (e) {
      console.error('Wallet load error:', e);
      return DEFAULT_WALLET;
    }
  },

  async adjustBalances(
    guildId: string,
    userId: string,
    deltaWallet: number,
    deltaBank: number,
    patchTimes?: Partial<Pick<Wallet, 'lastEarnAt' | 'lastDailyAt' | 'lastRobAt'>>,
  ): Promise<{ ok: boolean; reason?: string; wallet?: Wallet }> {
    const dw = Math.trunc(deltaWallet);
    const dbal = Math.trunc(deltaBank);
    try {
      const walletRef = doc(db, 'guilds', guildId, 'economy', userId);
      const nowIso = new Date().toISOString();
      let result: Wallet | null = null;
      await runTransaction(db, async (t) => {
        const snap = await t.get(walletRef);
        const current = snap.exists() ? (snap.data() as any) : {};
        const curBalance = Number(current.balance || 0);
        const curBank = Number(current.bank || 0);
        const nextBalance = curBalance + dw;
        const nextBank = curBank + dbal;
        if (nextBalance < 0) throw new Error('INSUFFICIENT_WALLET');
        if (nextBank < 0) throw new Error('INSUFFICIENT_BANK');
        const next: any = {
          balance: nextBalance,
          bank: nextBank,
          updatedAt: nowIso,
          ...(patchTimes || {}),
        };
        t.set(walletRef, next, { merge: true });
        result = {
          balance: nextBalance,
          bank: nextBank,
          lastEarnAt: typeof current.lastEarnAt === 'string' ? current.lastEarnAt : null,
          lastDailyAt: typeof current.lastDailyAt === 'string' ? current.lastDailyAt : null,
          lastRobAt: typeof current.lastRobAt === 'string' ? current.lastRobAt : null,
          updatedAt: nowIso,
          ...(patchTimes || {}),
        } as Wallet;
      });
      return { ok: true, wallet: result ?? (await this.getWallet(guildId, userId)) };
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('INSUFFICIENT_WALLET')) return { ok: false, reason: 'Insufficient wallet balance.' };
      if (msg.includes('INSUFFICIENT_BANK')) return { ok: false, reason: 'Insufficient bank balance.' };
      console.error('Wallet adjust balances error:', e);
      return { ok: false, reason: 'Balance update failed.' };
    }
  },

  async addBalance(guildId: string, userId: string, amount: number, patchTimes?: Partial<Pick<Wallet, 'lastEarnAt' | 'lastDailyAt'>>) {
    const delta = Math.max(0, Math.floor(amount));
    try {
      const walletRef = doc(db, 'guilds', guildId, 'economy', userId);
      await runTransaction(db, async (t) => {
        const snap = await t.get(walletRef);
        const current = snap.exists() ? (snap.data() as any) : {};
        const balance = Number(current.balance || 0);
        const next = {
          balance: balance + delta,
          bank: Number(current.bank || 0),
          updatedAt: new Date().toISOString(),
          ...(patchTimes || {}),
        };
        t.set(walletRef, next, { merge: true });
      });
    } catch (e) {
      console.error('Wallet add balance error:', e);
    }
  },

  async deposit(guildId: string, userId: string, amount: number): Promise<{ ok: boolean; reason?: string; wallet?: Wallet }> {
    const delta = Math.max(1, Math.floor(amount));
    return this.adjustBalances(guildId, userId, -delta, +delta);
  },

  async withdraw(guildId: string, userId: string, amount: number): Promise<{ ok: boolean; reason?: string; wallet?: Wallet }> {
    const delta = Math.max(1, Math.floor(amount));
    return this.adjustBalances(guildId, userId, +delta, -delta);
  },

  async adminSetWallet(
    guildId: string,
    userId: string,
    walletBalance: number,
    bankBalance: number,
  ): Promise<{ ok: boolean; reason?: string; wallet?: Wallet }> {
    const w = Math.max(0, Math.floor(walletBalance));
    const b = Math.max(0, Math.floor(bankBalance));
    try {
      const walletRef = doc(db, 'guilds', guildId, 'economy', userId);
      const nowIso = new Date().toISOString();
      await setDoc(walletRef, { balance: w, bank: b, updatedAt: nowIso }, { merge: true });
      return { ok: true, wallet: await this.getWallet(guildId, userId) };
    } catch (e) {
      console.error('Admin set wallet error:', e);
      return { ok: false, reason: 'Failed to set wallet.' };
    }
  },

  async destroyGuildEconomy(guildId: string): Promise<{ ok: boolean; deleted: number }> {
    let deleted = 0;
    try {
      // Delete economy wallets
      const econCol = collection(db, 'guilds', guildId, 'economy');
      const econSnap = await getDocs(econCol);
      for (const d of econSnap.docs) {
        await deleteDoc(d.ref);
        deleted++;
      }

      // Delete shop items
      const shopCol = collection(db, 'guilds', guildId, 'economy_shop');
      const shopSnap = await getDocs(shopCol);
      for (const d of shopSnap.docs) {
        await deleteDoc(d.ref);
        deleted++;
      }

      // Reset settings
      await this.updateSettings(guildId, { ...DEFAULT_ECONOMY_SETTINGS });
      return { ok: true, deleted };
    } catch (e) {
      console.error('Destroy guild economy error:', e);
      return { ok: false, deleted };
    }
  },

  async transfer(guildId: string, fromUserId: string, toUserId: string, amount: number): Promise<{ ok: boolean; reason?: string }> {
    const delta = Math.max(1, Math.floor(amount));
    if (fromUserId === toUserId) return { ok: false, reason: 'Cannot pay yourself.' };
    try {
      const fromRef = doc(db, 'guilds', guildId, 'economy', fromUserId);
      const toRef = doc(db, 'guilds', guildId, 'economy', toUserId);
      await runTransaction(db, async (t) => {
        const fromSnap = await t.get(fromRef);
        const toSnap = await t.get(toRef);
        const fromBal = Number((fromSnap.exists() ? (fromSnap.data() as any).balance : 0) || 0);
        if (fromBal < delta) throw new Error('INSUFFICIENT');
        const toBal = Number((toSnap.exists() ? (toSnap.data() as any).balance : 0) || 0);
        t.set(fromRef, { balance: fromBal - delta, updatedAt: new Date().toISOString() }, { merge: true });
        t.set(toRef, { balance: toBal + delta, updatedAt: new Date().toISOString() }, { merge: true });
      });
      return { ok: true };
    } catch (e: any) {
      if (String(e?.message || '').includes('INSUFFICIENT')) return { ok: false, reason: 'Insufficient balance.' };
      console.error('Wallet transfer error:', e);
      return { ok: false, reason: 'Transfer failed.' };
    }
  },

  async getTopWallets(guildId: string, topN: number): Promise<{ userId: string; balance: number }[]> {
    try {
      const col = collection(db, 'guilds', guildId, 'economy');
      const q = query(col, orderBy('balance', 'desc'), limit(Math.max(1, Math.min(25, topN))));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ userId: d.id, balance: Number((d.data() as any).balance || 0) }));
    } catch (e) {
      console.error('Economy leaderboard error:', e);
      return [];
    }
  },
};

export interface EconomyShopItem {
  itemId: string;
  name: string;
  price: number;
  roleId: string | null;
  stock: number | null; // null = unlimited
  soldCount: number;
  createdAt: string;
  updatedAt: string;
}

export const economyShopService = {
  async listItems(guildId: string): Promise<EconomyShopItem[]> {
    try {
      const colRef = collection(db, 'guilds', guildId, 'economy_shop');
      const q = query(colRef, orderBy('price', 'asc'), limit(50));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ ...(d.data() as any), itemId: d.id } as EconomyShopItem));
    } catch (e) {
      console.error('Shop list items error:', e);
      return [];
    }
  },

  async getItem(guildId: string, itemId: string): Promise<EconomyShopItem | null> {
    try {
      const ref = doc(db, 'guilds', guildId, 'economy_shop', itemId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return { ...(snap.data() as any), itemId } as EconomyShopItem;
    } catch (e) {
      console.error('Shop get item error:', e);
      return null;
    }
  },

  async addItem(
    guildId: string,
    item: Omit<EconomyShopItem, 'itemId' | 'soldCount' | 'createdAt' | 'updatedAt'> & { itemId?: string },
  ): Promise<{ ok: boolean; itemId?: string; reason?: string }> {
    try {
      const nowIso = new Date().toISOString();
      const data: any = {
        name: item.name,
        price: Math.max(0, Math.floor(item.price)),
        roleId: item.roleId ?? null,
        stock: item.stock === null || item.stock === undefined ? null : Math.max(0, Math.floor(item.stock)),
        soldCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      if (item.itemId) {
        const ref = doc(db, 'guilds', guildId, 'economy_shop', item.itemId);
        await setDoc(ref, data, { merge: false });
        return { ok: true, itemId: item.itemId };
      }

      const colRef = collection(db, 'guilds', guildId, 'economy_shop');
      const ref = await addDoc(colRef, data);
      return { ok: true, itemId: ref.id };
    } catch (e) {
      console.error('Shop add item error:', e);
      return { ok: false, reason: 'Failed to add item.' };
    }
  },

  async updateItem(guildId: string, itemId: string, patch: Partial<Pick<EconomyShopItem, 'name' | 'price' | 'roleId' | 'stock'>>) {
    try {
      const ref = doc(db, 'guilds', guildId, 'economy_shop', itemId);
      await setDoc(ref, { ...patch, updatedAt: new Date().toISOString() } as any, { merge: true });
    } catch (e) {
      console.error('Shop update item error:', e);
    }
  },

  async removeItem(guildId: string, itemId: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      const ref = doc(db, 'guilds', guildId, 'economy_shop', itemId);
      await deleteDoc(ref);
      return { ok: true };
    } catch (e) {
      console.error('Shop remove item error:', e);
      return { ok: false, reason: 'Failed to remove item.' };
    }
  },

  async purchase(guildId: string, buyerId: string, itemId: string): Promise<{ ok: boolean; reason?: string; item?: EconomyShopItem; wallet?: Wallet }> {
    try {
      const itemRef = doc(db, 'guilds', guildId, 'economy_shop', itemId);
      const walletRef = doc(db, 'guilds', guildId, 'economy', buyerId);
      const nowIso = new Date().toISOString();
      let purchasedItem: EconomyShopItem | null = null;
      let nextWallet: Wallet | null = null;

      await runTransaction(db, async (t) => {
        const itemSnap = await t.get(itemRef);
        if (!itemSnap.exists()) throw new Error('NO_ITEM');
        const itemData = itemSnap.data() as any;
        const price = Math.max(0, Math.floor(Number(itemData.price || 0)));
        const stock = itemData.stock === null || itemData.stock === undefined ? null : Math.max(0, Math.floor(Number(itemData.stock || 0)));
        const soldCount = Math.max(0, Math.floor(Number(itemData.soldCount || 0)));
        if (stock !== null && soldCount >= stock) throw new Error('OUT_OF_STOCK');

        const walletSnap = await t.get(walletRef);
        const cur = walletSnap.exists() ? (walletSnap.data() as any) : {};
        const curBal = Number(cur.balance || 0);
        const curBank = Number(cur.bank || 0);
        if (curBal < price) throw new Error('INSUFFICIENT');

        const nextBal = curBal - price;
        const nextSold = soldCount + 1;
        t.set(walletRef, { balance: nextBal, bank: curBank, updatedAt: nowIso }, { merge: true });
        t.set(itemRef, { soldCount: nextSold, updatedAt: nowIso }, { merge: true });

        purchasedItem = {
          itemId,
          name: String(itemData.name || 'Item'),
          price,
          roleId: typeof itemData.roleId === 'string' ? itemData.roleId : null,
          stock,
          soldCount: nextSold,
          createdAt: typeof itemData.createdAt === 'string' ? itemData.createdAt : nowIso,
          updatedAt: nowIso,
        };
        nextWallet = {
          balance: nextBal,
          bank: curBank,
          lastEarnAt: typeof cur.lastEarnAt === 'string' ? cur.lastEarnAt : null,
          lastDailyAt: typeof cur.lastDailyAt === 'string' ? cur.lastDailyAt : null,
          lastRobAt: typeof cur.lastRobAt === 'string' ? cur.lastRobAt : null,
          updatedAt: nowIso,
        };
      });

      return { ok: true, item: purchasedItem ?? undefined, wallet: nextWallet ?? undefined };
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('NO_ITEM')) return { ok: false, reason: 'Item not found.' };
      if (msg.includes('OUT_OF_STOCK')) return { ok: false, reason: 'That item is out of stock.' };
      if (msg.includes('INSUFFICIENT')) return { ok: false, reason: 'Insufficient wallet balance.' };
      console.error('Shop purchase error:', e);
      return { ok: false, reason: 'Purchase failed.' };
    }
  },
};

export interface Poll {
  pollId: string;
  channelId: string;
  messageId: string | null;
  question: string;
  options: string[];
  createdBy: string;
  createdAt: string;
  ended: boolean;
  endedAt: string | null;
}

export const pollService = {
  async createPoll(guildId: string, poll: Poll) {
    try {
      const ref = doc(db, 'guilds', guildId, 'polls', poll.pollId);
      await setDoc(ref, poll, { merge: false });
    } catch (e) {
      console.error('Create poll error:', e);
    }
  },

  async updatePoll(guildId: string, pollId: string, patch: Partial<Poll>) {
    try {
      const ref = doc(db, 'guilds', guildId, 'polls', pollId);
      await setDoc(ref, { ...patch, updatedAt: new Date().toISOString() } as any, { merge: true });
    } catch (e) {
      console.error('Update poll error:', e);
    }
  },

  async getPoll(guildId: string, pollId: string): Promise<Poll | null> {
    try {
      const ref = doc(db, 'guilds', guildId, 'polls', pollId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return snap.data() as Poll;
    } catch (e) {
      console.error('Get poll error:', e);
      return null;
    }
  },

  async vote(guildId: string, pollId: string, userId: string, optionIndex: number) {
    try {
      const ref = doc(db, 'guilds', guildId, 'polls', pollId, 'votes', userId);
      await setDoc(ref, { optionIndex, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.error('Poll vote error:', e);
    }
  },

  async listVotes(guildId: string, pollId: string): Promise<number[]> {
    try {
      const colRef = collection(db, 'guilds', guildId, 'polls', pollId, 'votes');
      const snapshot = await getDocs(colRef);
      return snapshot.docs.map((d) => Number((d.data() as any).optionIndex));
    } catch (e) {
      console.error('List poll votes error:', e);
      return [];
    }
  },
};

export interface AiChatSettings {
  enabled: boolean;
  channelId: string | null;
  mode: 'reply' | 'react';
  memoryText: string;
  personalityText: string;
  updatedAt: string;
}

const DEFAULT_AI_SETTINGS: AiChatSettings = {
  enabled: false,
  channelId: null,
  mode: 'reply',
  memoryText: '',
  personalityText: '',
  updatedAt: new Date().toISOString(),
};

export const aiService = {
  async getSettings(guildId: string): Promise<AiChatSettings> {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { ...DEFAULT_AI_SETTINGS, ...(data.ai || {}) };
      }
      return DEFAULT_AI_SETTINGS;
    } catch (e) {
      console.error('AI settings load error:', e);
      return DEFAULT_AI_SETTINGS;
    }
  },

  async updateSettings(guildId: string, settings: Partial<AiChatSettings>) {
    try {
      const docRef = doc(db, 'guilds', guildId);
      const snap = await getDoc(docRef);
      const current = snap.exists() ? (snap.data().ai || DEFAULT_AI_SETTINGS) : DEFAULT_AI_SETTINGS;
      const updated = { ...current, ...settings, updatedAt: new Date().toISOString() };
      await setDoc(docRef, { ai: updated }, { merge: true });
    } catch (e) {
      console.error('AI settings update error:', e);
    }
  },
};

export interface StickyChannelSettings {
  enabled: boolean;
  message: string;
  everyNMessages: number;
  lastStickyMessageId: string | null;
  counter: number;
}

const DEFAULT_STICKY_CHANNEL: StickyChannelSettings = {
  enabled: false,
  message: '',
  everyNMessages: 10,
  lastStickyMessageId: null,
  counter: 0,
};

export const stickyService = {
  async getChannelSettings(guildId: string, channelId: string): Promise<StickyChannelSettings> {
    try {
      const docRef = doc(db, 'guilds', guildId, 'sticky', channelId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as any;
        return { ...DEFAULT_STICKY_CHANNEL, ...data };
      }
      return DEFAULT_STICKY_CHANNEL;
    } catch (e) {
      console.error('Sticky settings load error:', e);
      return DEFAULT_STICKY_CHANNEL;
    }
  },

  async updateChannelSettings(guildId: string, channelId: string, settings: Partial<StickyChannelSettings>) {
    try {
      const docRef = doc(db, 'guilds', guildId, 'sticky', channelId);
      const snap = await getDoc(docRef);
      const current = snap.exists() ? ({ ...DEFAULT_STICKY_CHANNEL, ...(snap.data() as any) } as StickyChannelSettings) : DEFAULT_STICKY_CHANNEL;
      const updated = { ...current, ...settings };
      await setDoc(docRef, updated, { merge: true });
    } catch (e) {
      console.error('Sticky settings update error:', e);
    }
  },
};
