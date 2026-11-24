// A React-controlled application form: the hard case for autofillers. Every field's value lives in
// React state; a write that skips React's value tracker would be undone on the next render.
// <pre id="state"> shows the live state so tests can read what React itself believes.
import { useState } from "react";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    __submitted?: boolean;
  }
}

function Form() {
  const [s, set] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    linkedin: "",
    country: "",
    years: "",
    title: "",
    authorized: "",
    skills: [] as string[],
    why: "",
    gender: "",
    agree: false,
    referral: "FRIEND-42",
    aadhaar: "",
  });
  const up = (k: keyof typeof s) => (e: { target: { value: string } }) => set((p) => ({ ...p, [k]: e.target.value }));
  (document.getElementById("state") as HTMLElement).textContent = JSON.stringify(s, null, 1);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        window.__submitted = true;
      }}
    >
      <input type="hidden" name="csrf_token" value="abc123" />
      <label htmlFor="fn">First name</label>
      <input id="fn" name="first_name" autoComplete="given-name" value={s.firstName} onChange={up("firstName")} required />
      <label htmlFor="ln">Last name</label>
      <input id="ln" name="last_name" value={s.lastName} onChange={up("lastName")} required />
      <label htmlFor="em">Email address</label>
      <input id="em" type="email" value={s.email} onChange={up("email")} />
      <label htmlFor="ph">Mobile number</label>
      <input id="ph" type="tel" value={s.phone} onChange={up("phone")} />
      <label htmlFor="li">LinkedIn profile</label>
      <input id="li" type="url" value={s.linkedin} onChange={up("linkedin")} />
      <label htmlFor="co">Country of residence</label>
      <select id="co" value={s.country} onChange={up("country")}>
        <option value="">Select…</option>
        <option value="us">United States</option>
        <option value="in">India</option>
        <option value="de">Germany</option>
      </select>
      <label htmlFor="yr">Years of professional experience</label>
      <input id="yr" type="number" value={s.years} onChange={up("years")} />
      <label htmlFor="ti">Current job title</label>
      <input id="ti" value={s.title} onChange={up("title")} />

      <fieldset>
        <legend>Are you authorized to work in this country?</legend>
        <input type="radio" id="au-y" name="authorized" value="yes" checked={s.authorized === "yes"} onChange={up("authorized")} />
        <label htmlFor="au-y">Yes</label>
        <input type="radio" id="au-n" name="authorized" value="no" checked={s.authorized === "no"} onChange={up("authorized")} />
        <label htmlFor="au-n">No</label>
      </fieldset>

      <fieldset>
        <legend>Skills</legend>
        {["AWS", "React", "Rust"].map((k) => (
          <span key={k}>
            <input
              type="checkbox"
              id={`sk-${k}`}
              name="skills"
              value={k.toLowerCase()}
              checked={s.skills.includes(k.toLowerCase())}
              onChange={(e) =>
                set((p) => ({ ...p, skills: e.target.checked ? [...p.skills, k.toLowerCase()] : p.skills.filter((x) => x !== k.toLowerCase()) }))
              }
            />
            <label htmlFor={`sk-${k}`}>{k}</label>
          </span>
        ))}
      </fieldset>

      <label htmlFor="why">Why do you want to join Acme Tools?</label>
      <textarea id="why" rows={4} maxLength={600} value={s.why} onChange={up("why")} />

      <label htmlFor="cover">Anything else? (rich text)</label>
      <div id="cover" contentEditable suppressContentEditableWarning aria-label="Anything else?" role="textbox" />

      <label htmlFor="gd">Gender (optional)</label>
      <select id="gd" value={s.gender} onChange={up("gender")}>
        <option value="">Prefer not to say</option>
        <option value="f">Female</option>
        <option value="m">Male</option>
        <option value="x">Non-binary</option>
      </select>

      <label htmlFor="rf">Referral code</label>
      <input id="rf" value={s.referral} onChange={up("referral")} />

      <fieldset>
        <legend>Identity verification</legend>
        <label htmlFor="ad" style={{ display: "block", fontWeight: 600 }}>
          Aadhaar card number
        </label>
        <input id="ad" name="aadhaar_number" inputMode="numeric" placeholder="1234 5678 9012" value={s.aadhaar} onChange={up("aadhaar")} />
      </fieldset>

      <label htmlFor="pw">Create a password</label>
      <input id="pw" type="password" autoComplete="new-password" />
      <label htmlFor="cc">Card number (application fee)</label>
      <input id="cc" name="card_number" autoComplete="cc-number" />

      <p>
        <input type="checkbox" id="agree" checked={s.agree} onChange={(e) => set((p) => ({ ...p, agree: e.target.checked }))} />
        <label htmlFor="agree" style={{ display: "inline" }}>
          I agree to the terms and privacy policy
        </label>
      </p>
      <button type="submit">Submit application</button>
    </form>
  );
}

createRoot(document.getElementById("app")!).render(<Form />);
