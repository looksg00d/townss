export interface ProfileData {
    profileId?: string;
    name?: string;
    userDataDir?: string;
    authFile?: string;
    metamaskSeed?: string;
    metamaskPassword?: string;
    email?: string;
    emailPassword?: string;
    proxy?: string;
    userAgent?: string;
    character?: string;
    characterObj?: any;
}

export interface Profile {
    profileId: string;
    name: string;
    userDataDir: string;
    authFile: string;
    metamaskSeed: string;
    metamaskPassword: string;
    email: string;
    emailPassword: string;
    proxy: string;
    userAgent: string;
    character?: string;
    characterObj?: any;
}

export interface ProfileManager {
    loadProfiles(): Promise<Record<string, Profile>>;
    saveProfiles(profiles: Record<string, Profile>): Promise<void>;
    createProfile(profileData: ProfileData): Promise<Profile>;
    deleteProfile(profileId: string): Promise<void>;
    runProfile(profileId: string): Promise<any>;
    importProfiles(data: ProfileData[]): Promise<Profile[]>;
} 