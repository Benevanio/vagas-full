import type { SearchPreferences, UserProfile } from "../../types";
import { ConnectionsForm } from "./ConnectionsForm";
import { EmailChangeForm } from "./EmailChangeForm";
import { PreferencesForm } from "./PreferencesForm";
import { ProfileForm } from "./ProfileForm";

interface ProfileTabProps {
  userProfile: UserProfile;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  searchPreferences: SearchPreferences;
  setSearchPreferences: React.Dispatch<React.SetStateAction<SearchPreferences>>;
  isSavingProfile: boolean;
  isSavingPreferences: boolean;
  onSaveProfile: (userProfile: UserProfile) => Promise<void>;
  onSavePreferences: (searchPreferences: SearchPreferences) => Promise<void>;
}

export function ProfileTab({
  userProfile,
  setUserProfile,
  searchPreferences,
  setSearchPreferences,
  isSavingProfile,
  isSavingPreferences,
  onSaveProfile,
  onSavePreferences,
}: ProfileTabProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 px-6 py-8 lg:px-8">
      <ProfileForm
        userProfile={userProfile}
        setUserProfile={setUserProfile}
        isSaving={isSavingProfile}
        onSave={onSaveProfile}
      />
      <EmailChangeForm currentEmail={userProfile.email} />
      <PreferencesForm
        searchPreferences={searchPreferences}
        setSearchPreferences={setSearchPreferences}
        isSaving={isSavingPreferences}
        onSave={onSavePreferences}
      />
      <ConnectionsForm />
    </div>
  );
}
