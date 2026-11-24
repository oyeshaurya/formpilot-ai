import { describe, expect, it } from "vitest";
import { factScore, ruleFill } from "../src/background/rules";
import type { RequestField } from "../src/background/prompt";
import { emptyProfile } from "../src/shared/schema";

function profile() {
  const p = emptyProfile();
  p.personal.firstName = "Shaurya";
  p.personal.lastName = "Verma";
  p.personal.email = "shaurya@example.com";
  p.personal.phone = "+91 98765 43210";
  p.address.city = "Delhi";
  p.address.country = "India";
  p.links.linkedin = "https://linkedin.com/in/shaurya";
  p.work.currentTitle = "Software Engineer";
  p.work.yearsExperience = "3";
  p.work.skills = "TypeScript, React, Python";
  p.work.needsSponsorship = "no";
  p.customFacts = [{ id: "a", label: "Why do you want to join", value: "I like building tools people use every day." }];
  return p;
}

const f = (id: string, label: string, extra: Partial<RequestField> = {}): RequestField => ({ id, kind: "text", label, required: false, ...extra });

describe("Basic mode (no AI)", () => {
  const fields: RequestField[] = [
    f("1", "Given name", { autocomplete: "given-name" }),
    f("2", "Surname"),
    f("3", "Email address", { kind: "email" }),
    f("4", "Mobile number", { kind: "tel" }),
    f("5", "Country of residence", { kind: "select", options: [{ value: "", label: "Select…" }, { value: "in", label: "India" }, { value: "us", label: "United States" }] }),
    f("6", "Country of birth", { kind: "select", options: [{ value: "in", label: "India" }] }),
    f("7", "Emergency contact name"),
    f("8", "Years of professional experience", { kind: "number" }),
    f("9", "Skills", { kind: "checkbox-group", options: [{ value: "ts", label: "TypeScript" }, { value: "rs", label: "Rust" }, { value: "py", label: "Python" }] }),
    f("10", "Why do you want to join Acme?", { kind: "textarea" }),
    f("11", "Tell us about a project", { kind: "textarea" }),
    f("12", "Will you now or in the future require sponsorship?", { kind: "radio-group", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] }),
    f("13", "Current job title"),
    f("14", "LinkedIn profile", { kind: "url" }),
    f("15", "Favourite colour"),
  ];
  const { mappings, unmapped } = ruleFill(profile(), fields);
  const v = Object.fromEntries(mappings.map((m) => [m.fieldId, m.values.length ? m.values.join(",") : m.value]));
  const why = Object.fromEntries(unmapped.map((u) => [u.fieldId, u.reason]));

  it("uses the page's autofill hint and label rules", () => {
    expect(v["1"]).toBe("Shaurya");
    expect(v["2"]).toBe("Verma");
    expect(v["3"]).toBe("shaurya@example.com");
    expect(v["4"]).toBe("+91 98765 43210");
    expect(v["13"]).toBe("Software Engineer");
    expect(v["14"]).toBe("https://linkedin.com/in/shaurya");
  });
  it("picks the dropdown option, not the raw text", () => {
    expect(v["5"]).toBe("in");
  });
  it("does not treat country of birth as country of residence", () => {
    expect(v["6"]).toBeUndefined();
  });
  it("leaves fields about other people alone", () => {
    expect(v["7"]).toBeUndefined();
    expect(why["7"]).toMatch(/someone else/);
  });
  it("cleans numbers and ticks only the skills you have", () => {
    expect(v["8"]).toBe("3");
    expect(v["9"]).toBe("ts,py");
  });
  it("answers an open question only from a saved answer, never by writing one", () => {
    expect(v["10"]).toBe("I like building tools people use every day.");
    expect(v["11"]).toBeUndefined();
    expect(why["11"]).toMatch(/does not write answers/);
  });
  it("answers yes/no questions from profile flags", () => {
    expect(v["12"]).toBe("no");
  });
  it("marks everything as from your profile and explains what it skipped", () => {
    expect(mappings.every((m) => m.source === "profile")).toBe(true);
    expect(why["15"]).toBe("No match in your profile");
  });
});

describe("Aadhaar (local-only)", () => {
  const aad: RequestField = { id: "a1", kind: "text", label: "Aadhaar card number", required: true, localOnly: true };
  it("fills only from a saved fact, and says it stayed on this device", () => {
    const p = profile();
    p.customFacts.push({ id: "x", label: "Aadhaar card number", value: "1234 5678 9012" });
    const { mappings } = ruleFill(p, [aad]);
    expect(mappings[0]!.value).toBe("1234 5678 9012");
    expect(mappings[0]!.reasoning).toMatch(/never sent/);
  });
  it("leaves it empty, with a reason, when nothing is saved", () => {
    const { mappings, unmapped } = ruleFill(profile(), [aad]);
    expect(mappings).toHaveLength(0);
    expect(unmapped[0]!.reason).toMatch(/Other facts/);
  });
});

describe("saved-answer matching", () => {
  it("matches a saved question inside a longer label", () => {
    expect(factScore("CGPA", "What is your CGPA?")).toBe(1);
  });
  it("does not match unrelated questions", () => {
    expect(factScore("Why do you want to join", "Describe your biggest failure")).toBeLessThan(0.6);
  });
});

describe("one fact per field", () => {
  const p = () => {
    const x = profile();
    x.personal.dateOfBirth = "2004-05-17";
    x.personal.fatherName = "Rakesh Verma";
    x.education.degree = "B.Tech";
    x.education.grade = "8.9";
    return x;
  };
  const value = (field: RequestField) => {
    const r = ruleFill(p(), [field]);
    return r.mappings[0]?.value ?? `unmapped: ${r.unmapped[0]?.reason}`;
  };
  it("never puts a full name in Middle name", () => expect(value(f("m", "Middle name"))).toMatch(/^unmapped: Not in your profile: middle name/));
  it("never copies the main phone into Alternate phone", () => expect(value(f("a", "Alternate phone number"))).toMatch(/^unmapped/));
  it("fills date of birth and father's name", () => {
    expect(value(f("d", "Date of birth", { kind: "date" }))).toBe("2004-05-17");
    expect(value(f("fa", "Father's name"))).toBe("Rakesh Verma");
    expect(value(f("fo", "Father's occupation"))).toMatch(/^unmapped/);
  });
  it("uses CGPA for the degree but not for Class 10 marks", () => {
    expect(value(f("g", "CGPA / Percentage"))).toBe("8.9");
    expect(value(f("c", "Class 10: Percentage / CGPA"))).toMatch(/^unmapped: School marks/);
  });
  it("infers highest qualification from the degree when not set", () => expect(value(f("h", "Highest qualification"))).toBe("B.Tech"));
  it("keeps the bare-name rule off other names", () => {
    expect(value(f("n", "Full name"))).toBe("Shaurya Verma");
    expect(value(f("b", "Class 10: Board name"))).toMatch(/^unmapped/);
    expect(value(f("e", "Name of current employer"))).not.toBe("Shaurya Verma");
  });
  it("ticks a combined option when either skill is yours", () => {
    const r = ruleFill(p(), [
      f("s", "Which languages and tools are you comfortable with?", {
        kind: "checkbox-group",
        options: ["JavaScript / TypeScript", "Java", "Node.js"].map((v) => ({ value: v, label: v })),
      }),
    ]);
    expect(r.mappings[0]!.values).toEqual(["JavaScript / TypeScript"]);
  });
});

describe("Aadhaar fact names", () => {
  const field: RequestField = { id: "a", kind: "text", label: "Aadhaar number", required: true, localOnly: true };
  for (const label of ["Aadhaar Card", "Aadhar", "UID", "My ID"]) {
    it(`fills from a fact named “${label}”`, () => {
      const p = profile();
      p.customFacts.push({ id: "x", label, value: "538942581375" });
      expect(ruleFill(p, [field]).mappings[0]?.value).toBe("538942581375");
    });
  }
  it("never uses a non-Aadhaar fact for it", () => {
    const p = profile();
    p.customFacts.push({ id: "x", label: "Aadhaar Card", value: "not a number" });
    p.customFacts = p.customFacts.filter((x) => x.id !== "x").concat({ id: "y", label: "PAN", value: "ABCDE1234F" });
    expect(ruleFill(p, [field]).mappings).toHaveLength(0);
  });
  it("matches Aadhaar card to Aadhaar number for ordinary facts too", () => expect(factScore("Aadhaar Card", "Aadhaar number")).toBe(1));
});

describe("Indian address forms", () => {
  const p = () => {
    const x = profile();
    x.address.street = "G101, G block, Abode Valley";
    x.address.district = "Chengalpattu";
    x.address.postalCode = "603203";
    return x;
  };
  const value = (field: RequestField) => ruleFill(p(), [field]).mappings[0]?.value;
  it("fills district and PIN code", () => {
    expect(value(f("d", "District"))).toBe("Chengalpattu");
    expect(value(f("p", "PIN code"))).toBe("603203");
    expect(value(f("p2", "Pincode"))).toBe("603203");
  });
  it("fills a multi-line street box, but not 'if different'", () => {
    expect(value(f("s", "House no. / Street / Locality", { kind: "textarea" }))).toBe("G101, G block, Abode Valley");
    expect(value(f("c", "Correspondence address (if different)", { kind: "textarea" }))).toBeUndefined();
  });
});
