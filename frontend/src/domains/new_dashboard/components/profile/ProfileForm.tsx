import { useState } from "react";
import type { UserProfile } from "../../types";

interface ProfileFormProps {
  userProfile: UserProfile;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  isSaving?: boolean;
  onSave: (userProfile: UserProfile) => Promise<void>;
}

export function ProfileForm({
  userProfile,
  setUserProfile,
  isSaving = false,
  onSave,
}: ProfileFormProps) {
  const [technology, setTechnology] = useState("");
  const [technologyYears, setTechnologyYears] = useState(1);
  const initials = userProfile.displayName
    .trim()
    .split(/\s|[._-]/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const updateField = (field: keyof UserProfile, value: string) => {
    setUserProfile((current) => ({ ...current, [field]: value }));
  };

  const removeTechnology = (technologyToRemove: string) => {
    setUserProfile((current) => ({
      ...current,
      technologies: current.technologies.filter(
        (item) => item !== technologyToRemove,
      ),
      technologyExperiences: current.technologyExperiences.filter(
        (item) => item.name !== technologyToRemove,
      ),
    }));
  };

  const updateTechnologyYears = (technologyName: string, years: number) => {
    setUserProfile((current) => ({
      ...current,
      technologyExperiences: current.technologyExperiences.map((item) =>
        item.name === technologyName ? { ...item, years } : item,
      ),
    }));
  };

  const addTechnology = () => {
    const nextTechnology = technology.trim();
    if (!nextTechnology) return;

    setUserProfile((current) => ({
      ...current,
      technologies: current.technologies.includes(nextTechnology)
        ? current.technologies
        : [...current.technologies, nextTechnology],
      technologyExperiences: current.technologyExperiences.some(
        (item) => item.name === nextTechnology,
      )
        ? current.technologyExperiences.map((item) =>
            item.name === nextTechnology
              ? { ...item, years: technologyYears }
              : item,
          )
        : [
            ...current.technologyExperiences,
            { name: nextTechnology, years: technologyYears },
          ],
    }));
    setTechnology("");
    setTechnologyYears(1);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 flex flex-col items-center gap-5 rounded-xl border border-border bg-background px-4 py-4 sm:flex-row">
        {userProfile.avatarUrl ? (
          <img
            src={userProfile.avatarUrl}
            alt={`Avatar de ${userProfile.displayName}`}
            className="profile-avatar-bounce h-20 w-20 shrink-0 rounded-full border border-border object-cover shadow-md"
          />
        ) : (
          <div className="profile-avatar-bounce flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-foreground shadow-md">
            {initials || "BS"}
          </div>
        )}
        <div className="space-y-2 text-center sm:text-left">
          <h2 className="text-xl font-bold leading-tight">
            {userProfile.displayName}
          </h2>
          <p className="text-xs font-semibold text-muted-foreground">
            Usuário: @{userProfile.username} | Nível: {userProfile.level}
          </p>
        </div>
      </div>

      <h2 className="text-[18px] font-bold">Informações Gerais</h2>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="URL do avatar">
          <input
            value={userProfile.avatarUrl}
            onChange={(event) => updateField("avatarUrl", event.target.value)}
            placeholder="https://..."
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          />
        </Field>
        <Field label="Nome">
          <input
            value={userProfile.firstName}
            onChange={(event) => updateField("firstName", event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          />
        </Field>
        <Field label="Sobrenome">
          <input
            value={userProfile.lastName}
            onChange={(event) => updateField("lastName", event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          />
        </Field>
        <Field label="E-mail ">
          <input
            value={userProfile.email}
            readOnly
            className="h-10 w-full rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground outline-none"
          />
        </Field>
        <Field label="Contato">
          <input
            value={userProfile.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          />
        </Field>
        <Field label="Nível">
          <select
            value={userProfile.level}
            onChange={(event) => updateField("level", event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          >
            <option>Júnior</option>
            <option>Pleno</option>
            <option>Sênior</option>
          </select>
        </Field>
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <span className="text-xs font-bold uppercase text-muted-foreground">
          Tecnologias de domínio
        </span>
        <div className="mt-3 flex flex-wrap gap-2">
          {userProfile.technologies.map((item) => {
            const experience = userProfile.technologyExperiences.find(
              (skill) => skill.name === item,
            );

            return (
            <span
              key={item}
              className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-bold text-primary dark:text-emerald-400"
            >
              {item}
              <input
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={experience?.years ?? 1}
                onChange={(event) =>
                  updateTechnologyYears(
                    item,
                    Number(event.target.value) || 0,
                  )
                }
                aria-label={`Anos de experiência em ${item}`}
                className="h-6 w-14 rounded-md border border-primary/20 bg-background px-2 text-[11px] text-foreground outline-none"
              />
              <span className="font-semibold opacity-80">anos</span>
              <button
                type="button"
                onClick={() => removeTechnology(item)}
                className="text-[10px] font-black leading-none opacity-70 transition-opacity hover:opacity-100"
                aria-label={`Remover ${item}`}
              >
                ×
              </button>
            </span>
            );
          })}
        </div>
        <div className="mt-3 grid max-w-2xl gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
          <input
            value={technology}
            onChange={(event) => setTechnology(event.target.value)}
            placeholder="Adicionar tecnologia..."
            className="h-10 flex-1 rounded-lg border border-input bg-background px-4 text-sm outline-none focus:border-ring"
          />
          <input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={technologyYears}
            onChange={(event) =>
              setTechnologyYears(Number(event.target.value) || 0)
            }
            aria-label="Anos de experiência da nova tecnologia"
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={addTechnology}
            className="h-10 rounded-lg bg-muted px-5 text-sm font-bold transition-colors hover:bg-muted/70"
          >
            Adicionar
          </button>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={() => onSave(userProfile)}
          disabled={isSaving}
          className="h-10 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-bold uppercase text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
