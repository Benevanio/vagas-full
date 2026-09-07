import { afterEach, describe, expect, it } from "vitest";
import type { User } from "../../../../src/db/schema/users";
import { encryptText } from "../../../../src/lib/security/encryption";
import {
  toPublicUser,
  toUserCreateValues,
  toUserUpdateValues,
} from "../../../../src/modules/users/users.mapper";

const originalEnv = {
  ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY,
  ENCRYPTION_KEY_ID: process.env.ENCRYPTION_KEY_ID,
  SEARCH_KEY: process.env.SEARCH_KEY,
};

function setValidSecurityEnv() {
  process.env.ENCRYPTION_MASTER_KEY =
    "0000000000000000000000000000000000000000000000000000000000000000";
  process.env.ENCRYPTION_KEY_ID = "mapper-test";
  process.env.SEARCH_KEY = "mapper-search-key";
}

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    firstName: null,
    firstNameEncrypted: null,
    lastName: null,
    lastNameEncrypted: null,
    displayName: null,
    displayNameEncrypted: null,
    username: "user.name",
    email: null,
    emailEncrypted: null,
    emailHash: null,
    emailVerified: false,
    avatarUrl: null,
    avatarUrlEncrypted: null,
    phone: null,
    phoneEncrypted: null,
    cpf: null,
    cpfEncrypted: null,
    cpfHash: null,
    technologies: null,
    technologiesEncrypted: null,
    technologyExperiencesEncrypted: null,
    level: null,
    levelEncrypted: null,
    role: "user",
    isBlocked: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastLoginAt: null,
    ...overrides,
  };
}

afterEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = originalEnv.ENCRYPTION_MASTER_KEY;
  process.env.ENCRYPTION_KEY_ID = originalEnv.ENCRYPTION_KEY_ID;
  process.env.SEARCH_KEY = originalEnv.SEARCH_KEY;
});

describe("users.mapper", () => {
  it("maps create values with encrypted PII and null plain fields", () => {
    setValidSecurityEnv();

    const values = toUserCreateValues({
      email: " USER@Example.COM ",
      firstName: "Ada",
      lastName: "Lovelace",
      displayName: "Ada Lovelace",
      avatarUrl: "https://example.com/ada.png",
      phone: "+5534999999999",
      cpf: "123.456.789-01",
      technologies: ["TypeScript", "Node.js"],
      technologyExperiences: [{ name: "TypeScript", years: 4 }],
      level: "pleno",
    });

    expect(values).toMatchObject({
      email: null,
      firstName: null,
      lastName: null,
      displayName: null,
      avatarUrl: null,
      phone: null,
      cpf: null,
      technologies: null,
      level: null,
    });
    expect(values.emailEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.emailHash).toHaveLength(64);
    expect(values.firstNameEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.lastNameEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.displayNameEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.avatarUrlEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.phoneEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.cpfEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.cpfHash).toHaveLength(64);
    expect(values.technologiesEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.technologyExperiencesEncrypted).toMatch(
      /^v1:mapper-test:/,
    );
    expect(values.levelEncrypted).toMatch(/^v1:mapper-test:/);
  });

  it("maps update values only for provided fields", () => {
    setValidSecurityEnv();

    const values = toUserUpdateValues({
      firstName: "Grace",
      lastName: "Hopper",
      displayName: "Grace Hopper",
      avatarUrl: "https://example.com/grace.png",
      phone: "+5511999999999",
      cpf: "987.654.321-00",
      technologies: ["Go"],
      technologyExperiences: [{ name: "Go", years: 2 }],
      level: "senior",
    });

    expect(values).toMatchObject({
      firstName: null,
      lastName: null,
      displayName: null,
      avatarUrl: null,
      phone: null,
      cpf: null,
      technologies: null,
      level: null,
    });
    expect(values.firstNameEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.lastNameEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.displayNameEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.avatarUrlEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.phoneEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.cpfEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.cpfHash).toHaveLength(64);
    expect(values.technologiesEncrypted).toMatch(/^v1:mapper-test:/);
    expect(values.technologyExperiencesEncrypted).toMatch(
      /^v1:mapper-test:/,
    );
    expect(values.levelEncrypted).toMatch(/^v1:mapper-test:/);

    expect(toUserUpdateValues({ username: "grace" })).toEqual({
      username: "grace",
    });
  });

  it("returns decrypted public user values when encrypted fields exist", () => {
    setValidSecurityEnv();

    const publicUser = toPublicUser(
      baseUser({
        emailEncrypted: encryptText("ada@example.com"),
        firstNameEncrypted: encryptText("Ada"),
        lastNameEncrypted: encryptText("Lovelace"),
        displayNameEncrypted: encryptText("Ada Lovelace"),
        avatarUrlEncrypted: encryptText("https://example.com/ada.png"),
        phoneEncrypted: encryptText("+5534999999999"),
        cpfEncrypted: encryptText("12345678901"),
        technologiesEncrypted: encryptText(JSON.stringify(["TypeScript"])),
        technologyExperiencesEncrypted: encryptText(
          JSON.stringify([{ name: "TypeScript", years: 4 }]),
        ),
        levelEncrypted: encryptText("pleno"),
      }),
    );

    expect(publicUser).toMatchObject({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      displayName: "Ada Lovelace",
      avatarUrl: "https://example.com/ada.png",
      phone: "+5534999999999",
      cpf: "12345678901",
      technologies: ["TypeScript"],
      technologyExperiences: [{ name: "TypeScript", years: 4 }],
      level: "pleno",
    });
  });

  it("falls back to legacy plain values when encrypted fields are missing", () => {
    const publicUser = toPublicUser(
      baseUser({
        email: "legacy@example.com",
        firstName: "Legacy",
        lastName: "User",
        displayName: "Legacy User",
        avatarUrl: "https://example.com/legacy.png",
        phone: "+5500000000000",
        cpf: "00000000000",
        technologies: ["React"],
        level: "junior",
      }),
    );

    expect(publicUser).toMatchObject({
      email: "legacy@example.com",
      firstName: "Legacy",
      lastName: "User",
      displayName: "Legacy User",
      avatarUrl: "https://example.com/legacy.png",
      phone: "+5500000000000",
      cpf: "00000000000",
      technologies: ["React"],
      level: "junior",
    });
  });

  it("strips raw encrypted/hash fields from the public user object", () => {
    setValidSecurityEnv();

    const publicUser = toPublicUser(
      baseUser({
        emailEncrypted: encryptText("ada@example.com"),
        emailHash: "hash",
        firstNameEncrypted: encryptText("Ada"),
        lastNameEncrypted: encryptText("Lovelace"),
        displayNameEncrypted: encryptText("Ada Lovelace"),
        avatarUrlEncrypted: encryptText("https://example.com/ada.png"),
        phoneEncrypted: encryptText("+5534999999999"),
        cpfEncrypted: encryptText("12345678901"),
        cpfHash: "hash",
        technologiesEncrypted: encryptText(JSON.stringify(["TypeScript"])),
        technologyExperiencesEncrypted: encryptText(
          JSON.stringify([{ name: "TypeScript", years: 4 }]),
        ),
        levelEncrypted: encryptText("pleno"),
      }),
    );

    expect(publicUser).not.toHaveProperty("emailEncrypted");
    expect(publicUser).not.toHaveProperty("emailHash");
    expect(publicUser).not.toHaveProperty("firstNameEncrypted");
    expect(publicUser).not.toHaveProperty("lastNameEncrypted");
    expect(publicUser).not.toHaveProperty("displayNameEncrypted");
    expect(publicUser).not.toHaveProperty("avatarUrlEncrypted");
    expect(publicUser).not.toHaveProperty("phoneEncrypted");
    expect(publicUser).not.toHaveProperty("cpfEncrypted");
    expect(publicUser).not.toHaveProperty("cpfHash");
    expect(publicUser).not.toHaveProperty("technologiesEncrypted");
    expect(publicUser).not.toHaveProperty("technologyExperiencesEncrypted");
    expect(publicUser).not.toHaveProperty("levelEncrypted");
  });

  it("falls back to plain technologies for invalid encrypted technologies", () => {
    const publicUser = toPublicUser(
      baseUser({
        technologies: ["Fallback"],
        technologiesEncrypted: "invalid-payload",
      }),
    );

    expect(publicUser.technologies).toEqual(["Fallback"]);
  });

  it("falls back to plain technologies when encrypted JSON is not an array", () => {
    setValidSecurityEnv();

    const publicUser = toPublicUser(
      baseUser({
        technologies: ["Fallback"],
        technologiesEncrypted: encryptText(JSON.stringify({ value: "React" })),
      }),
    );

    expect(publicUser.technologies).toEqual(["Fallback"]);
  });

  it("maps null values to null encrypted values when creating or updating", () => {
    setValidSecurityEnv();

    expect(toUserCreateValues({ email: null })).toMatchObject({
      email: null,
      emailEncrypted: null,
      emailHash: null,
      firstNameEncrypted: null,
      lastNameEncrypted: null,
      displayNameEncrypted: null,
      avatarUrlEncrypted: null,
      phoneEncrypted: null,
      cpfEncrypted: null,
      cpfHash: null,
      technologiesEncrypted: expect.stringMatching(/^v1:mapper-test:/),
      technologyExperiencesEncrypted: expect.stringMatching(
        /^v1:mapper-test:/,
      ),
      levelEncrypted: null,
    });

    expect(
      toUserUpdateValues({
        phone: null,
        cpf: null,
        technologies: null,
        technologyExperiences: null,
        level: null,
      }),
    ).toMatchObject({
      phone: null,
      phoneEncrypted: null,
      cpf: null,
      cpfEncrypted: null,
      cpfHash: null,
      technologies: null,
      technologiesEncrypted: null,
      technologyExperiencesEncrypted: null,
      level: null,
      levelEncrypted: null,
    });
  });
});
