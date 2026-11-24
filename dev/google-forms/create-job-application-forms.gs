/**
 * FormPilot AI test fixtures: three realistic job application Google Forms.
 *
 * How to run (takes about 1 minute):
 *   1. Open https://script.google.com and click "New project".
 *   2. Delete the sample code, paste this whole file, and save.
 *   3. Pick `createAllForms` in the function dropdown and click Run.
 *   4. Approve the Google Forms permission prompt (your own account only).
 *   5. Open the Execution log. Each form prints a "fill" link (what
 *      applicants see) and an "edit" link.
 *
 * The forms land in your own Google Drive. Delete them from Drive any time.
 *
 * Coverage: short text, paragraph, multiple choice, checkboxes, dropdowns,
 * dates, a time, a linear scale, a grid, email/number/length validation,
 * multi-page sections, and a few sensitive ID fields (Aadhaar, PAN, bank)
 * that FormPilot should leave blank.
 */

function createAllForms() {
  const forms = [
    createSoftwareEngineerForm(),
    createGovernmentRecruitmentForm(),
    createInternshipForm(),
  ];
  forms.forEach(function (form) {
    Logger.log('%s\n  fill: %s\n  edit: %s', form.getTitle(), form.getPublishedUrl(), form.getEditUrl());
  });
}

/* ---------------------------------------------------------------- helpers */

function newForm(title, description) {
  const form = FormApp.create(title);
  form.setDescription(description);
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setConfirmationMessage('Thank you. Your application has been received.');
  return form;
}

function text(form, title, required, help) {
  const item = form.addTextItem().setTitle(title).setRequired(!!required);
  if (help) item.setHelpText(help);
  return item;
}

function para(form, title, required, help) {
  const item = form.addParagraphTextItem().setTitle(title).setRequired(!!required);
  if (help) item.setHelpText(help);
  return item;
}

function choice(form, title, options, required, withOther) {
  const item = form.addMultipleChoiceItem().setTitle(title).setChoiceValues(options).setRequired(!!required);
  if (withOther) item.showOtherOption(true);
  return item;
}

function checks(form, title, options, required, withOther) {
  const item = form.addCheckboxItem().setTitle(title).setChoiceValues(options).setRequired(!!required);
  if (withOther) item.showOtherOption(true);
  return item;
}

function dropdown(form, title, options, required) {
  return form.addListItem().setTitle(title).setChoiceValues(options).setRequired(!!required);
}

function date(form, title, required) {
  return form.addDateItem().setTitle(title).setRequired(!!required);
}

function section(form, title, help) {
  const item = form.addPageBreakItem().setTitle(title);
  if (help) item.setHelpText(help);
  return item;
}

function emailField(form, title, required) {
  return text(form, title, required).setValidation(
    FormApp.createTextValidation().requireTextIsEmail().setHelpText('Enter a valid email address.').build()
  );
}

function phoneField(form, title, required) {
  return text(form, title, required, 'Include country code, e.g. +91 98765 43210').setValidation(
    FormApp.createTextValidation()
      .requireTextMatchesPattern('^\\+?[0-9 ()-]{7,20}$')
      .setHelpText('Enter a valid phone number.')
      .build()
  );
}

function urlField(form, title, required) {
  return text(form, title, required).setValidation(
    FormApp.createTextValidation().requireTextIsUrl().setHelpText('Enter a full URL starting with https://').build()
  );
}

const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Other',
];

/* ------------------------------------------- 1. Corporate tech job form */

function createSoftwareEngineerForm() {
  const form = newForm(
    'Job Application: Software Engineer (Full-time)',
    'Northwind Labs is hiring Software Engineers for our Bengaluru and remote teams. ' +
      'Please fill in every required field. Applications take about 10 minutes.'
  );

  section(form, 'Personal Information');
  text(form, 'First name', true);
  text(form, 'Middle name', false);
  text(form, 'Last name', true);
  text(form, 'Preferred name', false, 'What should we call you?');
  date(form, 'Date of birth', true);
  choice(form, 'Gender', ['Male', 'Female', 'Non-binary', 'Prefer not to say'], true, true);
  text(form, 'Pronouns', false);
  dropdown(form, 'Nationality', ['Indian', 'American', 'British', 'Canadian', 'Other'], true);
  emailField(form, 'Email address', true);
  phoneField(form, 'Mobile number', true);
  phoneField(form, 'Alternate phone number', false);

  section(form, 'Address');
  text(form, 'Street address', true);
  text(form, 'City', true);
  text(form, 'State / Province', true);
  text(form, 'PIN / ZIP code', true).setValidation(
    FormApp.createTextValidation().requireTextMatchesPattern('^[A-Za-z0-9 -]{3,10}$').build()
  );
  dropdown(form, 'Country', ['India', 'United States', 'United Kingdom', 'Canada', 'Germany', 'Singapore', 'Other'], true);

  section(form, 'Online Profiles');
  urlField(form, 'LinkedIn profile URL', true);
  urlField(form, 'GitHub profile URL', false);
  urlField(form, 'Portfolio / personal website', false);

  section(form, 'Experience');
  text(form, 'Current job title', false);
  text(form, 'Current employer', false);
  dropdown(form, 'Total years of professional experience', ['0-1', '1-3', '3-5', '5-8', '8+'], true);
  text(form, 'Current CTC (annual)', false, 'In INR or your local currency');
  text(form, 'Expected CTC (annual)', true);
  dropdown(form, 'Notice period', ['Immediate', '15 days', '30 days', '60 days', '90 days'], true);
  checks(form, 'Which languages and tools are you comfortable with?',
    ['JavaScript / TypeScript', 'Python', 'Java', 'Go', 'C++', 'React', 'Node.js', 'SQL', 'AWS / GCP / Azure', 'Docker / Kubernetes'],
    true, true);
  form.addScaleItem().setTitle('Rate your proficiency in system design').setBounds(1, 5)
    .setLabels('Beginner', 'Expert').setRequired(true);

  section(form, 'Education');
  dropdown(form, 'Highest qualification', ['High school', 'Diploma', "Bachelor's degree", "Master's degree", 'PhD'], true);
  text(form, 'Degree (e.g. B.Tech, B.Sc)', true);
  text(form, 'Field of study / specialisation', true);
  text(form, 'College / University', true);
  text(form, 'Year of graduation', true).setValidation(
    FormApp.createTextValidation().requireNumberBetween(1970, 2032).setHelpText('Enter a 4-digit year.').build()
  );
  text(form, 'CGPA / Percentage', false);

  section(form, 'Work Eligibility');
  choice(form, 'Are you legally authorised to work in India?', ['Yes', 'No'], true);
  choice(form, 'Will you now or in the future require visa sponsorship?', ['Yes', 'No'], true);
  choice(form, 'Are you willing to relocate?', ['Yes', 'No', 'Open to discussion'], true);
  choice(form, 'Preferred work mode', ['On-site', 'Hybrid', 'Remote'], true);
  date(form, 'Earliest date you can join', true);

  section(form, 'A Few Questions');
  para(form, 'Why do you want to work at Northwind Labs?', true);
  para(form, 'Tell us about a project you are proud of.', true, 'Max 300 words');
  urlField(form, 'Link to your resume (Google Drive, Dropbox, etc.)', true);
  choice(form, 'How did you hear about this role?',
    ['LinkedIn', 'Company website', 'Referral', 'Naukri', 'Indeed', 'College placement cell'], true, true);
  text(form, 'Referrer name (if referred)', false);
  checks(form, 'Declaration', ['I confirm that the information provided is true and complete.'], true);

  return form;
}

/* ------------------------------ 2. Government / PSU style recruitment */

function createGovernmentRecruitmentForm() {
  const form = newForm(
    'Recruitment Application Form: Junior Assistant (Advt. No. 07/2026)',
    'Application for the post of Junior Assistant. Fill in details exactly as they appear in your ' +
      'Class 10 certificate. Fields marked * are mandatory.'
  );

  section(form, 'Post Details');
  dropdown(form, 'Post applied for', ['Junior Assistant', 'Data Entry Operator', 'Stenographer Grade II', 'Accounts Clerk'], true);
  dropdown(form, 'Preferred exam centre', ['Delhi', 'Mumbai', 'Kolkata', 'Chennai', 'Lucknow', 'Bengaluru', 'Patna', 'Jaipur'], true);

  section(form, 'Personal Details');
  text(form, "Candidate's full name (as per Class 10 certificate)", true);
  text(form, "Father's name", true);
  text(form, "Mother's name", true);
  text(form, "Spouse's name (if married)", false);
  text(form, "Guardian's name (if different from parents)", false);
  date(form, 'Date of birth', true);
  text(form, 'Place of birth', true);
  choice(form, 'Gender', ['Male', 'Female', 'Transgender'], true);
  choice(form, 'Marital status', ['Unmarried', 'Married', 'Divorced', 'Widowed'], true);
  dropdown(form, 'Category', ['General (UR)', 'OBC (Non-creamy layer)', 'SC', 'ST', 'EWS'], true);
  choice(form, 'Are you a Person with Benchmark Disability (PwBD)?', ['Yes', 'No'], true);
  choice(form, 'Are you an Ex-Serviceman?', ['Yes', 'No'], true);
  dropdown(form, 'Religion', ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other', 'Prefer not to say'], false);
  text(form, 'Nationality', true);
  text(form, 'Mother tongue', true);
  text(form, 'Identification mark', true, 'A visible mole, scar, etc.');
  dropdown(form, 'Blood group', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], false);

  section(form, 'Identity Documents', 'Enter numbers exactly as printed on the document.');
  text(form, 'Aadhaar number', true).setValidation(
    FormApp.createTextValidation().requireTextMatchesPattern('^[0-9]{4} ?[0-9]{4} ?[0-9]{4}$')
      .setHelpText('12-digit Aadhaar number').build()
  );
  text(form, 'PAN number', false);
  text(form, 'Voter ID number', false);

  section(form, 'Contact Details');
  emailField(form, 'Email ID', true);
  phoneField(form, 'Mobile number', true);

  section(form, 'Permanent Address');
  para(form, 'House no. / Street / Locality', true);
  text(form, 'Village / Town / City', true);
  text(form, 'District', true);
  dropdown(form, 'State', STATES, true);
  text(form, 'PIN code', true).setValidation(
    FormApp.createTextValidation().requireTextMatchesPattern('^[1-9][0-9]{5}$').setHelpText('6-digit PIN code').build()
  );
  choice(form, 'Is your correspondence address the same as your permanent address?', ['Yes', 'No'], true);
  para(form, 'Correspondence address (if different)', false);

  section(form, 'Educational Qualifications');
  text(form, 'Class 10: Board name', true);
  text(form, 'Class 10: Year of passing', true);
  text(form, 'Class 10: Percentage / CGPA', true);
  text(form, 'Class 12: Board name', true);
  text(form, 'Class 12: Year of passing', true);
  text(form, 'Class 12: Percentage / CGPA', true);
  text(form, 'Graduation: Degree and subject', false);
  text(form, 'Graduation: University', false);
  text(form, 'Graduation: Year of passing', false);
  text(form, 'Graduation: Percentage / CGPA', false);
  form.addGridItem().setTitle('Proficiency in languages')
    .setRows(['Hindi', 'English', 'Regional language'])
    .setColumns(['Read', 'Write', 'Speak', 'All three'])
    .setRequired(false);
  choice(form, 'Typing speed (English)', ['Below 25 wpm', '25-35 wpm', '35-45 wpm', 'Above 45 wpm'], true);

  section(form, 'Employment Details');
  choice(form, 'Are you currently employed?', ['Yes, Government', 'Yes, Private', 'No'], true);
  text(form, 'Name of current employer', false);
  text(form, 'Total work experience (years)', false);

  section(form, 'Fee Details');
  text(form, 'Bank account holder name', false);
  text(form, 'Bank account number', false);
  text(form, 'IFSC code', false);
  text(form, 'Fee transaction / UTR number', true);
  date(form, 'Date of fee payment', true);

  section(form, 'Declaration');
  checks(form, 'I hereby declare that all the statements made in this application are true and correct to the best of my knowledge.',
    ['I agree'], true);
  text(form, 'Place', true);
  date(form, 'Date', true);

  return form;
}

/* ------------------------------------------ 3. Internship / campus form */

function createInternshipForm() {
  const form = newForm(
    'Summer Internship 2027: Application',
    'Open to undergraduate and postgraduate students. Selected interns get a stipend and a ' +
      'certificate. Shortlisted candidates will be contacted by email.'
  );

  section(form, 'About You');
  text(form, 'Full name', true);
  emailField(form, 'College email', true);
  emailField(form, 'Personal email', false);
  phoneField(form, 'WhatsApp number', true);
  date(form, 'Date of birth', true);
  choice(form, 'Gender', ['Male', 'Female', 'Other', 'Prefer not to say'], false);
  text(form, 'Current city', true);
  text(form, 'Hometown', false);

  section(form, 'Parent / Guardian Details');
  text(form, "Father's / Guardian's name", true);
  text(form, "Father's occupation", false);
  text(form, "Mother's name", true);
  text(form, "Mother's occupation", false);
  phoneField(form, 'Parent / guardian contact number', true);
  text(form, 'Emergency contact name and relationship', true);
  phoneField(form, 'Emergency contact number', true);

  section(form, 'Academics');
  text(form, 'College / Institute name', true);
  text(form, 'University roll number / Enrolment number', true);
  dropdown(form, 'Course', ['B.Tech / B.E.', 'B.Sc', 'BCA', 'BBA', 'B.Com', 'M.Tech', 'MCA', 'MBA', 'M.Sc'], true);
  text(form, 'Branch / Major', true);
  dropdown(form, 'Current year of study', ['1st year', '2nd year', '3rd year', '4th year', '5th year'], true);
  text(form, 'Expected graduation year', true);
  text(form, 'Current CGPA (out of 10)', true).setValidation(
    FormApp.createTextValidation().requireNumberBetween(0, 10).setHelpText('A number from 0 to 10').build()
  );
  choice(form, 'Any active backlogs?', ['No', '1', '2 or more'], true);

  section(form, 'Internship Preferences');
  checks(form, 'Which domains interest you?',
    ['Software Development', 'Data Science / ML', 'UI/UX Design', 'Product Management', 'Marketing', 'Finance', 'Operations'],
    true, true);
  dropdown(form, 'Preferred location', ['Bengaluru', 'Hyderabad', 'Pune', 'Gurugram', 'Mumbai', 'Remote'], true);
  date(form, 'Available from', true);
  date(form, 'Available until', true);
  form.addTimeItem().setTitle('Best time to call you for an interview').setRequired(false);
  checks(form, 'Languages known', ['English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Kannada'], true, true);
  choice(form, 'Do you have your own laptop?', ['Yes', 'No'], true);

  section(form, 'Show Us Your Work');
  urlField(form, 'LinkedIn', false);
  urlField(form, 'GitHub / Behance / Dribbble', false);
  urlField(form, 'Resume link (Google Drive, viewable by anyone)', true);
  para(form, 'Describe your previous internship or project experience', false);
  para(form, 'Why should we pick you? (100-200 words)', true).setValidation(
    FormApp.createParagraphTextValidation().requireTextLengthLessThanOrEqualTo(1500).build()
  );
  para(form, 'Achievements, certifications, or extracurricular activities', false);
  choice(form, 'How did you hear about us?', ['College T&P cell', 'LinkedIn', 'Instagram', 'Friend', 'Internshala'], true, true);
  checks(form, 'Consent', ['I confirm that the information above is accurate and my parent/guardian is aware of this application.'], true);

  return form;
}
