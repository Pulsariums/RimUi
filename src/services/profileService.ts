import { ModProfile } from "../types";
import { safeInvoke } from "./tauriBridge";
import { modStore } from "../store/modStore";

export class ProfileService {
  /**
   * Loads a mod profile from a JSON file.
   */
  static async loadProfile(path: string): Promise<ModProfile> {
    const profile = await safeInvoke<ModProfile>("load_profile", { path });
    // Sync groups to modStore
    modStore.setGroups(profile.groups || []);
    return profile;
  }

  /**
   * Saves a mod profile to a JSON file.
   */
  static async saveProfile(path: string, profile: ModProfile): Promise<void> {
    // Inject current groups from modStore into profile before saving
    const profileToSave = {
      ...profile,
      groups: modStore.getGroups()
    };
    return safeInvoke<void>("save_profile", { path, profile: profileToSave });
  }

  /**
   * Duplicates an existing profile to a new path.
   */
  static async duplicateProfile(sourcePath: string, targetPath: string): Promise<void> {
    const sourceProfile = await this.loadProfile(sourcePath);
    
    // Deep copy the profile to ensure groups and other arrays are independent
    const duplicatedProfile: ModProfile = {
      ...sourceProfile,
      active_mods: [...sourceProfile.active_mods],
      groups: sourceProfile.groups
        ? sourceProfile.groups.map(group => ({
            ...group,
            modIds: [...group.modIds]
          }))
        : []
    };

    // We save the deep-copied profile to the new path.
    return safeInvoke<void>("save_profile", { path: targetPath, profile: duplicatedProfile });
  }
}
