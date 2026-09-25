# Manual Test Cases — The Talent App

## How to Use This Document
Each test case has an **ID**, **preconditions**, **steps**, and **expected results**. Testers should mark each as ✅ Pass, ❌ Fail, or ⏭️ Skipped.

---

## 1. Authentication (Admin/HR)

### TC-AUTH-01: Sign Up
**Preconditions:** No existing account  
**Steps:**
1. Navigate to `/auth`
2. Click "Sign Up" tab
3. Enter full name, email, and password
4. Click "Sign Up"

**Expected:**
- Success toast appears
- User receives a verification email
- User cannot sign in until email is verified

### TC-AUTH-02: Sign In
**Preconditions:** Verified account exists  
**Steps:**
1. Navigate to `/auth`
2. Enter valid email and password
3. Click "Sign In"

**Expected:**
- Redirected to dashboard (`/`)
- Header shows user info and navigation links (Dashboard, Jobs, Assessments, Candidates, Evaluations, Analytics)

### TC-AUTH-03: Sign In — Invalid Credentials
**Steps:**
1. Navigate to `/auth`
2. Enter wrong email or password
3. Click "Sign In"

**Expected:**
- Error toast with "Invalid login credentials"
- User stays on auth page

### TC-AUTH-04: Sign Out
**Preconditions:** Logged in as Admin/HR  
**Steps:**
1. Click the logout/sign-out button in the header

**Expected:**
- Redirected to `/auth`
- Protected routes no longer accessible

### TC-AUTH-05: Protected Route Access (Unauthenticated)
**Steps:**
1. Without logging in, navigate directly to `/candidates`

**Expected:**
- Redirected to `/auth`

### TC-AUTH-06: Protected Route Access — All Routes
**Steps:**
1. Without logging in, try navigating to each: `/`, `/jobs`, `/jobs/<id>`, `/assessments`, `/assessments/<id>`, `/candidates`, `/evaluations`, `/evaluations/<id>`, `/analytics`

**Expected:**
- All redirect to `/auth`

---

## 2. Applicant Authentication (OTP)

### TC-AAUTH-01: Send OTP
**Steps:**
1. Navigate to `/applicant/login`
2. Enter a valid email
3. Click "Send OTP"

**Expected:**
- Success toast: OTP sent
- OTP input field appears

### TC-AAUTH-02: Verify OTP
**Preconditions:** OTP received via email  
**Steps:**
1. Enter correct OTP
2. Click "Verify"

**Expected:**
- Redirected to `/applicant`
- Profile and application data loads
- If first-time user, applicant profile auto-created with email

### TC-AAUTH-03: Verify OTP — Invalid Code
**Steps:**
1. Enter incorrect OTP
2. Click "Verify"

**Expected:**
- Error toast appears
- User remains on login page

### TC-AAUTH-04: Session Persistence
**Preconditions:** Previously logged in as applicant  
**Steps:**
1. Close the browser
2. Reopen and navigate to `/applicant`

**Expected:**
- Session persists (15-day persistence)
- Dashboard loads without re-authentication

### TC-AAUTH-05: Applicant Sign Out
**Preconditions:** Logged in as applicant  
**Steps:**
1. Click "Sign Out" button in header

**Expected:**
- Redirected to `/applicant/login`
- Cannot access `/applicant` without re-authenticating

### TC-AAUTH-06: Unauthenticated Applicant Redirect
**Steps:**
1. Without logging in, navigate directly to `/applicant`

**Expected:**
- Redirected to `/applicant/login`

---

## 3. Admin Dashboard (Home Page)

### TC-DASH-01: View Dashboard Metrics
**Preconditions:** Logged in as Admin/HR  
**Steps:**
1. Navigate to `/`

**Expected:**
- Four metric cards displayed: Total Candidates, Active Assessments, Pending Evaluation, Average Score
- Values reflect actual database data

### TC-DASH-02: Dashboard Widgets
**Steps:**
1. On `/`, observe the three widget cards below metrics

**Expected:**
- "Quick Stats" widget displays
- "Top Performers" widget displays
- "Recent Activity" widget displays

### TC-DASH-03: Candidate Pipeline — Filter by Status
**Steps:**
1. On `/`, scroll to "Candidate Pipeline" section
2. Click different filter tabs (All, Invited, In Progress, Completed, Evaluated, Expired)

**Expected:**
- Candidate list filters by selected status
- Tab counts match actual data
- "All" shows all candidates

### TC-DASH-04: Candidate Pipeline — Search
**Steps:**
1. Type a candidate name, email, role, or skill in the header search bar

**Expected:**
- Candidate pipeline filters to matching results
- Search is case-insensitive

### TC-DASH-05: View All Candidates Link
**Steps:**
1. Click "View All" button in Candidate Pipeline card header

**Expected:**
- Navigates to `/candidates`

### TC-DASH-06: Dashboard — Empty State
**Preconditions:** No candidates or assessments exist  
**Steps:**
1. Navigate to `/`

**Expected:**
- Metrics show 0 values
- Empty state message in candidate pipeline

---

## 4. Jobs Management

### TC-JOBS-01: Create Job
**Preconditions:** Logged in as Admin/HR  
**Steps:**
1. Navigate to `/jobs`
2. Click "New Job"
3. Fill in: Title (required), Description, Department, Location, Job Type, Experience Level
4. Set salary range and currency (INR default)
5. Add required skills (comma-separated)
6. Add benefits (comma-separated)
7. Set application deadline
8. Click "Save" / submit

**Expected:**
- Job appears in the jobs list
- Status is "Draft" by default
- Success toast appears

### TC-JOBS-02: Edit Job
**Preconditions:** At least one job exists  
**Steps:**
1. Navigate to `/jobs`
2. Hover over a job card, click the "⋮" menu
3. Click "Edit"
4. Modify title and description
5. Save changes

**Expected:**
- Updated values reflected in the job list
- Success toast appears

### TC-JOBS-03: Publish Job (Draft → Open)
**Steps:**
1. On a Draft job, click "⋮" menu → "Publish"

**Expected:**
- Job status changes to "Open"
- Job now appears on the public Careers page (`/careers`)

### TC-JOBS-04: Pause Job (Open → Paused)
**Steps:**
1. On an Open job, click "⋮" menu → "Pause"

**Expected:**
- Job status changes to "Paused"
- Job no longer visible on `/careers`

### TC-JOBS-05: Resume Job (Paused → Open)
**Steps:**
1. On a Paused job, click "⋮" menu → "Resume"

**Expected:**
- Job status changes to "Open"
- Job reappears on `/careers`

### TC-JOBS-06: Close Job
**Steps:**
1. On any non-closed job, click "⋮" menu → "Close"

**Expected:**
- Job status changes to "Closed"
- Job no longer visible on `/careers`

### TC-JOBS-07: Delete Job
**Steps:**
1. Click "⋮" menu → "Delete" on a job
2. Confirm deletion in the browser dialog

**Expected:**
- Job removed from the list
- Associated applications also deleted
- Success toast appears

### TC-JOBS-08: Search Jobs
**Steps:**
1. On `/jobs`, type a search term in the search bar

**Expected:**
- Jobs filtered by title, department, or location (case-insensitive)

### TC-JOBS-09: Copy Public Link
**Steps:**
1. Click "⋮" menu → "Copy Public Link" on a job

**Expected:**
- Link copied to clipboard
- Toast: "Link copied to clipboard"
- Link format: `{origin}/careers/{jobId}`

### TC-JOBS-10: View Public Page Button
**Steps:**
1. Click "View Public Page" button at the top of Jobs page

**Expected:**
- Navigates to `/careers`

### TC-JOBS-11: View Applications from Job Card
**Steps:**
1. Click "⋮" menu → "View Applications"

**Expected:**
- Navigates to `/jobs/{id}` showing the job detail with applications list

### TC-JOBS-12: Create Job — Title Required Validation
**Steps:**
1. Open create job dialog
2. Leave title empty
3. Click save

**Expected:**
- Form does not submit
- Job not created

### TC-JOBS-13: Applicant Count Display
**Steps:**
1. View jobs list with jobs that have received applications

**Expected:**
- Each job card shows applicant count (e.g., "3 applicants")

---

## 5. Job Detail & Applications Management

### TC-JDET-01: View Job Detail Page
**Preconditions:** Job exists with applications  
**Steps:**
1. Navigate to `/jobs/{id}`

**Expected:**
- Left sidebar shows job info (title, status, type, department, location, experience, salary, deadline, skills)
- Right side shows applications table with columns: Applicant, Resume & LinkedIn, Status, Applied date
- "View Public Listing" button opens `/careers/{id}` in new tab

### TC-JDET-02: Shortlist Applicant
**Steps:**
1. On an application row, click "⋮" → "Shortlist & Send Email"

**Expected:**
- Application status changes to "Shortlisted"
- Candidate record created in candidates list
- Shortlist email sent to applicant
- Success toast appears

### TC-JDET-03: Reject Applicant
**Steps:**
1. On an application row, click "⋮" → "Reject & Send Email"
2. Enter a rejection reason (required)
3. Click "Send Rejection Email"

**Expected:**
- Application status changes to "Rejected"
- Rejection email sent to applicant with the provided reason
- Dialog closes

### TC-JDET-04: Reject — Empty Reason Validation
**Steps:**
1. Open reject dialog
2. Leave reason empty
3. Try to submit

**Expected:**
- Submit button disabled when reason is empty
- Cannot send without a reason

### TC-JDET-05: Mark as Reviewing
**Steps:**
1. Click "⋮" → "Mark as Reviewing"

**Expected:**
- Application status changes to "Reviewing"

### TC-JDET-06: Convert to Candidate
**Steps:**
1. On an application that is NOT already converted, click "⋮" → "Convert to Candidate"

**Expected:**
- Candidate created in candidates list (`/candidates`)
- Application linked to candidate
- Success toast appears

### TC-JDET-07: View Cover Letter
**Preconditions:** Application has a cover letter  
**Steps:**
1. Click "⋮" → "View Cover Letter"

**Expected:**
- Dialog opens showing the cover letter text
- "Close" button dismisses the dialog

### TC-JDET-08: View Resume & LinkedIn Links
**Steps:**
1. On an application with resume and/or LinkedIn

**Expected:**
- "CV" button opens resume URL in new tab
- "LinkedIn" button opens LinkedIn profile in new tab
- If neither exists, shows "-"

### TC-JDET-09: Job Not Found
**Steps:**
1. Navigate to `/jobs/invalid-uuid`

**Expected:**
- "Job not found" message displayed
- "Back to Jobs" button navigates to `/jobs`

### TC-JDET-10: Back to Jobs Navigation
**Steps:**
1. On job detail page, click "Back to Jobs"

**Expected:**
- Navigates back to `/jobs`

---

## 6. Careers Page (Public)

### TC-CAREERS-01: View Job Listings
**Preconditions:** At least one job with status "Open"  
**Steps:**
1. Navigate to `/careers` (no login required)

**Expected:**
- Open jobs listed with title, type, experience level, description, department, location, skills, and deadline
- Salary information is NOT displayed (public view excludes salary)
- No login required to view
- Header shows "Applicant Login" and "HR Login" buttons

### TC-CAREERS-02: View Job Detail
**Steps:**
1. On `/careers`, navigate to `/careers/{id}`

**Expected:**
- Full job description shown with department, location, experience level
- Benefits listed with checkmarks
- Required skills displayed
- Application deadline shown
- "Apply Now" button visible
- "Back to all jobs" button works and navigates to `/careers`

### TC-CAREERS-03: Submit Application
**Steps:**
1. Click "Apply Now" on a job
2. Fill in: Name (required), Email (required), Phone, LinkedIn URL (required, validated)
3. Optionally add a cover letter
4. Upload a resume (PDF/DOC/DOCX, ≤ 10MB) — required unless profile resume exists
5. Click "Submit Application"

**Expected:**
- Success confirmation screen with checkmark icon
- Application confirmation email received
- "Close" button dismisses the dialog

### TC-CAREERS-04: Submit Application — Missing Required Fields
**Steps:**
1. Click "Apply Now"
2. Leave name or email empty
3. Try to submit

**Expected:**
- Form does not submit (button check: `!form.name.trim() || !form.email.trim()`)
- Application not submitted

### TC-CAREERS-05: Submit Application — Invalid LinkedIn URL
**Steps:**
1. Fill in all fields but enter an invalid LinkedIn URL (e.g., "https://google.com")
2. Click submit

**Expected:**
- Error toast: "Invalid LinkedIn URL"
- Description: "Please provide a valid LinkedIn profile URL"
- Application not submitted

### TC-CAREERS-06: Submit Application — Valid LinkedIn URL
**Steps:**
1. Enter a valid LinkedIn URL: `https://linkedin.com/in/username` or `https://www.linkedin.com/in/username/`

**Expected:**
- URL accepted, no validation error

### TC-CAREERS-07: Resume Upload — Invalid File Type
**Steps:**
1. Try uploading a non-PDF/DOC file (e.g., .png, .txt)

**Expected:**
- Error toast: "Invalid file type"
- Description: "Please upload a PDF or Word document"
- File not accepted

### TC-CAREERS-08: Resume Upload — File Too Large
**Steps:**
1. Try uploading a file > 10MB

**Expected:**
- Error toast: "File too large"
- Description: "Maximum file size is 10MB"
- File not accepted

### TC-CAREERS-09: Submit Application — No Resume
**Steps:**
1. Fill in all fields but do not upload a resume (and no profile resume)
2. Click submit

**Expected:**
- Error toast: "Resume required"
- Description: "Please upload your resume (PDF or Word)"
- Application not submitted

### TC-CAREERS-10: Auto-fill from Logged-in Profile
**Preconditions:** Applicant is logged in with a completed profile  
**Steps:**
1. Click "Apply Now" on a job

**Expected:**
- Name, email, phone, LinkedIn URL pre-filled from applicant profile
- If profile has a resume, option to use profile resume appears
- Fields can be overridden manually

### TC-CAREERS-11: No Open Positions
**Preconditions:** No jobs with "Open" status  
**Steps:**
1. Navigate to `/careers`

**Expected:**
- Empty state: "No open positions" with message "Check back later for new opportunities"

### TC-CAREERS-12: Loading State
**Steps:**
1. Navigate to `/careers` while data is loading

**Expected:**
- Skeleton cards shown (4 placeholder cards)
- Replaced by actual content when loaded

---

## 7. Candidates Management

### TC-CAND-01: View Candidates List
**Preconditions:** Logged in as Admin/HR  
**Steps:**
1. Navigate to `/candidates`

**Expected:**
- All candidates listed with name, email, role applied, and skills
- Search and filter options available

### TC-CAND-02: Add Candidate Manually
**Steps:**
1. Click "Add Candidate"
2. Fill in name (required), email (required), phone, role
3. Click "Save"

**Expected:**
- Candidate appears in the list
- Success toast appears

### TC-CAND-03: Edit Candidate
**Steps:**
1. Click edit on a candidate
2. Modify fields
3. Save

**Expected:**
- Updated info reflected
- Success toast appears

### TC-CAND-04: Delete Candidate
**Steps:**
1. Click delete on a candidate
2. Confirm

**Expected:**
- Candidate removed
- Success toast appears

### TC-CAND-05: Bulk Import Candidates
**Steps:**
1. Click "Bulk Import"
2. Upload a CSV file with candidate data

**Expected:**
- Candidates imported and listed
- Success toast with count

### TC-CAND-06: Export Candidates
**Steps:**
1. Click "Export"
2. Choose format

**Expected:**
- File downloads with candidate data

### TC-CAND-07: Assign Assessment to Candidate
**Preconditions:** Active assessment and at least one candidate exist  
**Steps:**
1. Click "Assign Assessment" on a candidate
2. Select an assessment
3. Optionally set a deadline
4. Click "Assign"

**Expected:**
- Assignment created with "Invited" status
- Invitation email sent to candidate with magic link
- Success toast appears

### TC-CAND-08: Duplicate Assignment Prevention
**Steps:**
1. Try assigning the same assessment to the same candidate again

**Expected:**
- Error or warning preventing duplicate assignment

---

## 8. Assessments

### TC-ASSESS-01: Create Assessment
**Preconditions:** Logged in as Admin/HR  
**Steps:**
1. Navigate to `/assessments`
2. Click "Create Assessment"
3. Enter title (required), description, duration (minutes), passing score
4. Click "Create"

**Expected:**
- Assessment created in "Draft" status
- Redirected to assessment builder (`/assessments/{id}`)
- Success toast appears

### TC-ASSESS-02: Add Section to Assessment
**Steps:**
1. Open an assessment in the builder
2. Click "Add Section"
3. Enter section title, description, weightage

**Expected:**
- Section appears in the assessment
- Weightage value saved

### TC-ASSESS-03: Edit Section
**Steps:**
1. Click edit on an existing section
2. Modify title, description, or weightage
3. Save

**Expected:**
- Section updated
- Changes reflected in the builder

### TC-ASSESS-04: Delete Section
**Steps:**
1. Click delete on a section
2. Confirm deletion

**Expected:**
- Section and all its questions removed
- Success toast appears

### TC-ASSESS-05: Add MCQ Question
**Steps:**
1. In a section, click "Add Question"
2. Select type: MCQ
3. Enter question text
4. Add options (at least 2), mark one as correct
5. Set marks
6. Save

**Expected:**
- Question added to the section
- Options and correct answer saved
- Success toast appears

### TC-ASSESS-06: Add Coding Question
**Steps:**
1. Add question with type: Coding
2. Enter question text
3. Select programming language
4. Add starter code
5. Add test cases (input/output pairs)
6. Set marks
7. Save

**Expected:**
- Question saved with language, starter code, and test cases
- Success toast appears

### TC-ASSESS-07: Add Subjective Question
**Steps:**
1. Add question with type: Subjective
2. Enter question text
3. Set max words and rubric
4. Set marks
5. Save

**Expected:**
- Question saved with rubric and word limit
- Success toast appears

### TC-ASSESS-08: Edit Question
**Steps:**
1. Click edit on an existing question
2. Modify question text, marks, or options
3. Save

**Expected:**
- Question updated
- Changes reflected in the builder

### TC-ASSESS-09: Delete Question
**Steps:**
1. Click delete on a question
2. Confirm deletion

**Expected:**
- Question removed from the section
- Success toast appears

### TC-ASSESS-10: Activate Assessment (Draft → Active)
**Steps:**
1. Change assessment status from "Draft" to "Active"

**Expected:**
- Assessment available for assignment to candidates
- Status badge updates

### TC-ASSESS-11: Archive Assessment (Active → Archived)
**Steps:**
1. Change assessment status to "Archived"

**Expected:**
- Assessment no longer available for new assignments

### TC-ASSESS-12: Save as Template
**Steps:**
1. Open an assessment with sections and questions
2. Click "Save as Template"
3. Enter template name and description
4. Save

**Expected:**
- Template saved with all sections and questions
- Success toast appears

### TC-ASSESS-13: Create from Template
**Steps:**
1. Click "Create from Template"
2. Select a template
3. Confirm

**Expected:**
- New assessment created with all sections and questions from template
- Redirected to assessment builder for the new assessment

### TC-ASSESS-14: Delete Assessment
**Steps:**
1. Delete an assessment

**Expected:**
- Assessment and all its sections/questions removed
- Success toast appears

### TC-ASSESS-15: Assessment Settings
**Steps:**
1. In the assessment builder, configure settings (e.g., shuffle questions, show results)

**Expected:**
- Settings saved and reflected when candidate takes the assessment

---

## 9. Candidate Portal — Legacy Magic Link

### TC-PORTAL-01: Access via Magic Link
**Steps:**
1. Open the magic link from the invitation email (navigates to `/exam?token=...`)

**Expected:**
- Assessment portal loads
- Assessment info displayed (title, duration, number of questions)
- "Start Assessment" button visible
- Candidate name shown

### TC-PORTAL-02: Invalid/Expired Token
**Steps:**
1. Navigate to `/exam?token=invalid-token`

**Expected:**
- Error message displayed
- Cannot access assessment

### TC-PORTAL-03: Start Assessment
**Steps:**
1. Click "Start Assessment"

**Expected:**
- Timer starts counting down
- First question displayed
- Question palette visible (desktop)
- Status changes to "In Progress" in database

### TC-PORTAL-04: Answer MCQ Question
**Steps:**
1. Navigate to an MCQ question
2. Select an answer option

**Expected:**
- Option highlighted as selected
- Response auto-saves periodically

### TC-PORTAL-05: Answer Coding Question
**Steps:**
1. Navigate to a coding question
2. Write code in the code editor
3. Click "Run Code"

**Expected:**
- Code executes via Piston API
- Output/test results displayed (pass/fail for each test case)
- Response auto-saves

### TC-PORTAL-06: Answer Subjective Question
**Steps:**
1. Navigate to a subjective question
2. Type answer in text area

**Expected:**
- Word count updates
- Response auto-saves

### TC-PORTAL-07: Navigate Between Questions
**Steps:**
1. Use Next/Previous buttons
2. Click question numbers in palette

**Expected:**
- Navigation works correctly
- Previously answered questions show saved responses
- Current question highlighted in palette

### TC-PORTAL-08: Submit Assessment
**Steps:**
1. Answer some/all questions
2. Click "Submit"
3. Confirm submission

**Expected:**
- Assessment marked as "Completed"
- Completion email sent to candidate and HR
- Cannot re-access the assessment (shows completed state)

### TC-PORTAL-09: Timer Expiry — Auto Submit
**Steps:**
1. Start an assessment
2. Let the timer run to 0

**Expected:**
- All responses saved
- Assessment auto-submits
- Status changes to "Completed"

### TC-PORTAL-10: Tab Switching Detection
**Steps:**
1. During an assessment, switch to another browser tab
2. Switch back

**Expected:**
- Integrity event logged (tab_switch event)
- Event recorded in `integrity_log` on `candidate_assessments`

### TC-PORTAL-11: Auto-Save Responses
**Steps:**
1. Answer a question
2. Wait ~30 seconds (or the auto-save interval)
3. Refresh the page / navigate away and come back

**Expected:**
- Response preserved after refresh
- No data loss

### TC-PORTAL-12: Resume In-Progress Assessment
**Preconditions:** Assessment was started but not submitted  
**Steps:**
1. Close the browser
2. Reopen the magic link

**Expected:**
- Assessment loads with remaining time
- Previously saved responses restored
- Can continue from where left off

---

## 10. Applicant Exam Portal

### TC-AEXAM-01: Start Assessment from Dashboard
**Preconditions:** Applicant logged in, has an "Invited" assessment  
**Steps:**
1. On `/applicant`, click "Assessments" tab
2. Click "Start" on an invited assessment

**Expected:**
- Navigates to `/exam/{assessmentId}`
- Assessment interface loads
- Timer starts after clicking start

### TC-AEXAM-02: View Completed Assessment
**Steps:**
1. On "Assessments" tab, view a completed assessment

**Expected:**
- Shows "Completed" status badge
- "View" button may be available
- Score/percentage displayed if evaluated

### TC-AEXAM-03: View In-Progress Assessment
**Steps:**
1. On "Assessments" tab, view an in-progress assessment

**Expected:**
- Shows "In Progress" status
- "Continue" button available to resume

---

## 11. Applicant Dashboard

### TC-ADASH-01: View Applications
**Preconditions:** Applicant logged in, has submitted applications  
**Steps:**
1. Navigate to `/applicant`
2. Click "My Applications" tab

**Expected:**
- All submitted applications listed
- Each shows job title, department, location, applied date
- Status badge with correct color (Submitted, Under Review, Shortlisted, Not Selected, Moved to Interview)

### TC-ADASH-02: View Assessments
**Steps:**
1. Click "Assessments" tab

**Expected:**
- Assigned assessments listed
- Shows assessment title, status, deadline (if set), score (if evaluated)
- "Start" button for invited assessments
- "Continue" for in-progress assessments

### TC-ADASH-03: Browse Jobs Tab
**Steps:**
1. Click "Browse Jobs" tab

**Expected:**
- Links to or displays available job listings
- Can navigate to careers page

### TC-ADASH-04: Quick Stats
**Steps:**
1. View the quick stats cards on the dashboard

**Expected:**
- Shows: Total Applications count, Shortlisted count, Total Assessments count, Pending Tests count
- Numbers reflect actual data

### TC-ADASH-05: Update Profile
**Steps:**
1. Click "Profile" button in header
2. Update name, phone, LinkedIn URL
3. Click save

**Expected:**
- Profile updated
- Success toast appears
- Updated values reflected on next load

### TC-ADASH-06: Profile — Name Required Validation
**Steps:**
1. Open profile dialog
2. Clear the name field
3. Click save

**Expected:**
- Error toast: "Name is required"
- Profile not saved

### TC-ADASH-07: Upload Resume & Auto-fill
**Steps:**
1. Open profile dialog
2. Upload a PDF or Word resume (≤ 10MB)

**Expected:**
- Resume uploaded to storage
- "Analyzing resume..." toast appears
- Name, phone, LinkedIn extracted and populated
- Work experience entries populated
- Education entries populated
- Success toast: "Resume parsed!"

### TC-ADASH-08: Upload Resume — Invalid File Type
**Steps:**
1. Try uploading a non-PDF/DOC file

**Expected:**
- Error toast: "Invalid file type"
- File not accepted

### TC-ADASH-09: Upload Resume — File Too Large
**Steps:**
1. Try uploading a file > 10MB

**Expected:**
- Error toast: "File too large"
- Description: "Maximum file size is 10MB"

### TC-ADASH-10: Upload Resume — Parse Failure Graceful
**Steps:**
1. Upload a valid resume but simulate parse failure (e.g., corrupted file)

**Expected:**
- Resume file still uploaded successfully
- Toast: "Could not auto-fill from resume" with "You can still enter details manually"
- Manual entry still possible

### TC-ADASH-11: Add Work Experience Manually
**Steps:**
1. Open profile dialog
2. Click "Add Experience"
3. Fill in company, title, start date, end date, description
4. Save profile

**Expected:**
- Work experience entry saved
- Displayed in profile dialog

### TC-ADASH-12: Add Education Manually
**Steps:**
1. Open profile dialog
2. Click "Add Education"
3. Fill in institution, degree, field, start year, end year
4. Save profile

**Expected:**
- Education entry saved
- Displayed in profile dialog

### TC-ADASH-13: Remove Work Experience / Education
**Steps:**
1. Click the trash icon on an experience or education entry
2. Save profile

**Expected:**
- Entry removed from the list
- Remaining entries re-indexed correctly
- Changes saved to database

### TC-ADASH-14: Incomplete Profile Warning Banner
**Preconditions:** Profile missing name (or name is email), phone, LinkedIn, or resume  
**Steps:**
1. Navigate to `/applicant`

**Expected:**
- Amber warning banner at top: "Your profile is incomplete"
- Clicking the banner opens the profile dialog
- Banner disappears once all required fields are filled

### TC-ADASH-15: Complete Profile — No Warning
**Preconditions:** Profile has name, phone, LinkedIn, and resume  
**Steps:**
1. Navigate to `/applicant`

**Expected:**
- No warning banner displayed

### TC-ADASH-16: Welcome Message
**Steps:**
1. Navigate to `/applicant` with a completed profile

**Expected:**
- Shows "Welcome back, {firstName}!" with first name from profile
- If name is not set or is an email, shows "Welcome back, Applicant!"

### TC-ADASH-17: Empty Applications State
**Preconditions:** No applications submitted  
**Steps:**
1. Click "My Applications" tab

**Expected:**
- Empty state: "No applications yet"
- "Browse Jobs" button links to `/careers`

### TC-ADASH-18: Empty Assessments State
**Preconditions:** No assessments assigned  
**Steps:**
1. Click "Assessments" tab

**Expected:**
- Empty state: "No assessments assigned"
- Message: "When you're shortlisted, assessments will appear here"

---

## 12. Evaluations

### TC-EVAL-01: View Evaluations List
**Preconditions:** Logged in as Admin/HR, at least one completed assessment  
**Steps:**
1. Navigate to `/evaluations`

**Expected:**
- Completed/evaluated assessments listed
- Shows candidate name, assessment title, score/percentage, status (Completed/Evaluated)

### TC-EVAL-02: View Evaluation Detail
**Steps:**
1. Click on a completed assessment to navigate to `/evaluations/{id}`

**Expected:**
- Detailed view showing each question, candidate's response, and score
- MCQ questions: auto-scored, shows selected vs correct answer
- Coding questions: shows code, execution output, test case results
- Subjective questions: shows response text and rubric

### TC-EVAL-03: Manual Scoring (Subjective)
**Steps:**
1. On a subjective question response, enter a manual score
2. Add feedback text
3. Save

**Expected:**
- Score saved
- Total score recalculated (via `calculate_assessment_total_score` function)
- Status may change to "Evaluated" when all questions scored

### TC-EVAL-04: Manual Scoring (Coding)
**Steps:**
1. On a coding question, review the code and test results
2. Enter a manual score override
3. Add feedback
4. Save

**Expected:**
- Manual score saved alongside auto-score
- Final score uses manual score if provided

### TC-EVAL-05: Export Report
**Steps:**
1. Click "Export Report"
2. Choose format

**Expected:**
- Report downloads with evaluation data

---

## 13. Email Notifications

### TC-EMAIL-01: Application Received Email
**Preconditions:** Applicant submits a job application  
**Expected:**
- Applicant receives confirmation email
- Email contains job title and application details

### TC-EMAIL-02: Shortlist Email
**Preconditions:** HR shortlists an applicant  
**Expected:**
- Applicant receives shortlist notification email

### TC-EMAIL-03: Rejection Email
**Preconditions:** HR rejects an applicant with a reason  
**Expected:**
- Applicant receives rejection email
- Email includes the rejection reason

### TC-EMAIL-04: Assessment Invitation Email
**Preconditions:** Candidate assigned an assessment  
**Expected:**
- Candidate receives email with assessment title, deadline (if set), and magic link
- Magic link navigates to assessment portal

### TC-EMAIL-05: Assessment Completion Email
**Preconditions:** Candidate submits an assessment  
**Expected:**
- Candidate receives completion confirmation email
- HR receives notification of assessment completion

---

## 14. Code Execution (Coding Questions)

### TC-CODE-01: Execute Code — Successful Run
**Steps:**
1. During a coding question, write valid code
2. Click "Run Code"

**Expected:**
- Code executes via Piston API
- Output displayed
- Execution time shown

### TC-CODE-02: Execute Code — Compilation Error
**Steps:**
1. Write code with syntax errors
2. Click "Run Code"

**Expected:**
- Error message displayed with compilation error details
- Test cases show as failed

### TC-CODE-03: Execute Code — Runtime Error
**Steps:**
1. Write code that throws a runtime exception
2. Click "Run Code"

**Expected:**
- Runtime error displayed
- Test cases show as failed

### TC-CODE-04: Execute Code — Test Cases
**Steps:**
1. Write correct code for a question with test cases
2. Click "Run Code"

**Expected:**
- Each test case shows pass/fail status
- Input, expected output, and actual output displayed
- Score calculated based on passed test cases

### TC-CODE-05: Execute Code — Timeout
**Steps:**
1. Write code with an infinite loop
2. Click "Run Code"

**Expected:**
- Execution times out
- Appropriate error message displayed

---

## 15. Assessment Templates

### TC-TMPL-01: Save Assessment as Template
**Steps:**
1. Open an assessment with sections and questions
2. Click "Save as Template"
3. Enter name and description
4. Save

**Expected:**
- Template created
- Success toast appears

### TC-TMPL-02: Create Assessment from Template
**Steps:**
1. On assessments page, click "Create from Template"
2. Select a template from the list
3. Confirm

**Expected:**
- New assessment created
- All sections and questions copied from template
- New assessment is in "Draft" status

### TC-TMPL-03: Template Data Integrity
**Steps:**
1. Create an assessment from a template
2. Open the new assessment in the builder

**Expected:**
- All sections present with correct titles and weightages
- All questions present with correct types, marks, options, test cases
- Questions are independent copies (editing doesn't affect template)

---

## 16. Edge Cases & Error Handling

### TC-EDGE-01: Network Error During Save
**Steps:**
1. Disable network (browser DevTools → Offline)
2. Try saving a candidate or assessment

**Expected:**
- Error toast appears
- Data not corrupted
- Retry possible after reconnect

### TC-EDGE-02: Concurrent Assessment Access
**Steps:**
1. Open same assessment magic link in two browser tabs
2. Start in one, try to start in the other

**Expected:**
- Only one session active
- Second tab shows appropriate state (already in progress)

### TC-EDGE-03: Expired Assessment Deadline
**Steps:**
1. Try accessing an assessment after its deadline has passed

**Expected:**
- Cannot start the assessment
- Shows "Expired" status

### TC-EDGE-04: Already Completed Assessment
**Steps:**
1. Try accessing a completed assessment via magic link

**Expected:**
- Shows completed state
- Cannot restart or re-submit

### TC-EDGE-05: Browser Refresh During Assessment
**Steps:**
1. During an active assessment, refresh the browser

**Expected:**
- Assessment resumes with remaining time
- Saved responses preserved
- Timer continues from correct remaining time

### TC-EDGE-06: 404 — Not Found Page
**Steps:**
1. Navigate to a non-existent route (e.g., `/nonexistent`)

**Expected:**
- NotFound page displayed
- User can navigate back to valid pages

---

## 17. Responsive Design

### TC-RESP-01: Mobile — Admin Dashboard
**Steps:**
1. Open `/` on mobile viewport (< 768px)

**Expected:**
- Metric cards stack (2 columns on mobile)
- Widgets stack vertically
- Candidate pipeline shows 1 column
- Navigation accessible

### TC-RESP-02: Mobile — Jobs Page
**Steps:**
1. Open `/jobs` on mobile

**Expected:**
- Job cards stack in single column
- Create/edit dialog scrollable
- Search bar full width

### TC-RESP-03: Mobile — Assessment Portal
**Steps:**
1. Take an assessment on mobile

**Expected:**
- Questions readable and answerable
- Question palette hidden (only shown on desktop per code)
- Code editor usable but may require horizontal scrolling
- Submit button accessible
- Timer visible

### TC-RESP-04: Mobile — Careers Page
**Steps:**
1. Open `/careers` on mobile

**Expected:**
- Job cards stack in single column
- Header shows mobile-appropriate layout (logo only, login buttons)
- Application dialog scrollable on small screens

### TC-RESP-05: Mobile — Applicant Dashboard
**Steps:**
1. Open `/applicant` on mobile

**Expected:**
- Quick stats show 2 columns
- Tabs stacked appropriately
- Profile dialog scrollable
- Header collapses (email hidden, buttons visible)

### TC-RESP-06: Mobile — Job Detail Page
**Steps:**
1. Open `/jobs/{id}` on mobile

**Expected:**
- Job info sidebar stacks above applications table
- Applications table horizontally scrollable if needed

---

## 18. June 2026 Release — QA Walkthrough

**Purpose:** Verify Assessments Release 1, Pre-Screen modal footer fix, Email v1, applicant profile fields, digital job application form, question bank admin, pre-screen drawer merge, job match scoring, HR Settings access, `generate-assessment` edge function, and `/features` updates.

**Environment:** SparxIT production (or staging with same migration + edge functions deployed).

**Mark each:** ✅ Pass · ❌ Fail · ⏭️ Skipped · 📝 Notes

**Cross-references:** Baseline regressions for Careers apply, applicant exam portal, and legacy email cases remain in §6, §10–11, and §13 above.

---

### 18.0 Prerequisites (Super Admin — Before QA Starts)

| ID | Check | Steps | Expected | Pass/Fail | Notes |
|----|-------|-------|----------|-----------|-------|
| TC-JUN26-PRE-01 | Migration applied | In Supabase, confirm migration `20260618000001_job_assessment_integration.sql` is applied | Columns exist: `jobs.assessment_enabled`, `jobs.default_assessment_id`, `jobs.assessment_config`, `candidate_assessments.job_id` / `consent_*` / `assigned_via`, `assessments.source_job_id` / `ai_generated` | | |
| TC-JUN26-PRE-02 | Edge function deployed | Jobs → Edit → click **Generate from job description** on a saved job with description | Returns success (not 404/500); toast **Assessment generated** | | |
| TC-JUN26-PRE-03 | Portal + email functions | Assign assessment → open magic link; complete exam | `candidate-portal`, `send-invitation-email`, `send-completion-email` respond without error | | |
| TC-JUN26-PRE-04 | Resend configured | Settings → **Email** → send a test trigger (e.g. shortlist or assign) | Email delivers; not skipped in logs | | |
| TC-JUN26-PRE-05 | Email settings baseline | Settings → **Email**: notifications **enabled**, valid **From address** | Quota counters increment after a test send | | |
| TC-JUN26-PRE-06 | Frontend deployed | Spot-check `/jobs` edit form and `/pipeline` cards | **Job assessment** toggle, pipeline assessment badges, drawer **Pre-Screen** subsections visible | | |

#### Test accounts

| Role | Use for |
|------|---------|
| **Admin** (super admin) | Jobs config, AI generate, Settings (all tabs), pipeline override, Assessment Builder |
| **HR** | Settings (limited tabs), pipeline override, evaluations override, assessments |
| **Recruiter** (assigned to test job) | Assign assessment, pipeline gating (blocked), completion notifications |
| **Interviewer** | Drawer read-only sections, evaluation override (not pipeline advance override) |
| **Applicant** (OTP login) | Digital form, profile fields, exam consent, notification prefs |

#### Test data to prepare

1. **Open job** with a real JD (skills, experience level, description) — e.g. "QA Test Engineer — Assessment Flow"
2. **Second open job** with **Digital application form ON**, **assessment OFF** — form-only tests
3. **Candidate** approved into pipeline on the assessment job (past Pending Approval)
4. **Candidate email** you can read (magic link + completion emails)
5. At least one **Active** assessment in `/assessments` (or generate from JD and activate)

---

### 18.1 Assessments Release 1 — Job Configuration (`/jobs`)

**Roles:** Admin, HR

#### TC-JUN26-ASSESS-01: Enable Job Assessment Section
**Preconditions:** Logged in as Admin or HR  
**Steps:**
1. Go to `/jobs` → **New Job** or **⋮ → Edit** an Open job
2. Scroll to **Digital application form** and **Job assessment**
3. Toggle **Job assessment** ON

**Expected:**
- Section expands with: **Default assessment** dropdown, **Generate from job description** button, **Default deadline (days)** (default 7), **Pass threshold override (%)** (placeholder "Use assessment default"), **Notify recruiter on completion** (default ON), **Require pass to advance** (default ON; helper mentions admin/HR override)

#### TC-JUN26-ASSESS-02: Link Existing Active Assessment
**Preconditions:** At least one Active assessment exists  
**Steps:**
1. Pick an Active assessment from **Default assessment** dropdown
2. Save job → reopen edit

**Expected:** Same assessment selected; **Job assessment** still ON

#### TC-JUN26-ASSESS-03: AI Generate from Job Description (Happy Path)
**Preconditions:** Job saved with non-empty description  
**Steps:**
1. Click **Generate from job description** (Sparkles icon)
2. Wait for completion
3. Go to `/assessments` → open new assessment
4. Change status to **Active**
5. Return to job edit

**Expected:**
- Toast: **Assessment generated** — "Draft assessment created and linked. Review it in Assessment Builder before activating."
- **Job assessment** auto-enabled; **Default assessment** populated
- New assessment: status **Draft** initially; title relevant to JD; sections/questions present (MCQ/coding/subjective mix)
- After activation, job still linked

#### TC-JUN26-ASSESS-04: AI Generate — Validation Errors
**Steps:**
1. On unsaved new job, click **Generate from job description**
2. On saved job with empty description, click **Generate from job description**

**Expected:**
- Unsaved job → toast **Save the job first**
- Empty description → toast **Job description required**

#### TC-JUN26-ASSESS-05: Assessment Config Toggles Persist
**Steps:**
1. Set **Default deadline (days)** = `3`
2. Set **Pass threshold override** = `80`
3. Turn **Notify recruiter on completion** OFF → save → reopen → turn ON
4. Turn **Require pass to advance** OFF → save → reopen

**Expected:** All values persist on reopen

---

### 18.2 `generate-assessment` Edge Function — Fix Verification

**Roles:** Admin, HR  
**Purpose:** Confirm deployed function handles Gemini output, auth, and errors correctly (not generic failures).

#### TC-JUN26-GEN-01: Staff Auth Required
**Steps:**
1. Call `generate-assessment` without staff session (or as applicant) via API/tooling if available; otherwise confirm UI is only on `/jobs` for staff

**Expected:** Unauthorized users cannot generate; edge function returns auth error (not 200 with assessment)

#### TC-JUN26-GEN-02: Tech Role — Coding Questions Normalized
**Preconditions:** Job description clearly technical (e.g. React/Node developer)  
**Steps:**
1. Generate assessment from JD
2. Open draft in `/assessments/{id}` builder

**Expected:**
- At least one section with questions; MCQ majority
- If Gemini returns type aliases (`code`, `text`, `essay`), questions still save as **coding** or **subjective** (no insert failure / empty builder)
- Coding questions have starter code and ≥2 visible test cases

#### TC-JUN26-GEN-03: Error Messages Surfaced in UI
**Steps:**
1. Temporarily use invalid/missing `GOOGLE_AI_API_KEY` in non-prod, **or** use a job that triggers Gemini error
2. Click **Generate from job description**

**Expected:**
- Toast **Generation failed** with specific description (e.g. "Gemini API key not configured" or Gemini error text) — not silent failure or unhelpful "Could not generate assessment" only
- Job form remains usable; no partial/broken assessment link

#### TC-JUN26-GEN-04: Regenerate / Second Generate
**Preconditions:** Job already has linked assessment from prior generate  
**Steps:**
1. Click **Generate from job description** again on same job

**Expected:** New draft created and linked (or clear success behavior); builder shows new assessment; job `default_assessment_id` updates

---

### 18.3 Assessments Release 1 — Assign Dialog

**Roles:** Admin, HR, Recruiter (on assigned job)

#### TC-JUN26-ASSIGN-01: Assign from Pipeline Card Menu
**Preconditions:** Assessment-enabled job; candidate on pipeline  
**Steps:**
1. `/pipeline` → select job → candidate **⋮** → **Assign Assessment**

**Expected:**
- Dialog title: **Assign Assessment**
- **Assessment** pre-selected = job default
- **Deadline** = today + job `deadline_days`
- **Send invitation email to {email}** checked by default

#### TC-JUN26-ASSIGN-02: Assign and Generate Link
**Steps:**
1. Click **Assign & Generate Link**

**Expected:**
- Success: **Assessment Assigned!**
- Magic link `{origin}/exam?token=...` shown; copy works
- Invitation email received (if email enabled)
- No duplicate invitation on completion alone (v1 behavior)

#### TC-JUN26-ASSIGN-03: Assign from Candidate Drawer
**Preconditions:** No assignment yet for candidate on assessment job  
**Steps:**
1. Open drawer → **Pre-Screen** → **Job Assessment**
2. Click **Assign Assessment**

**Expected (before assign):** Badge **Assessment not assigned** (slate); "No assessment assigned yet…"; **Assign Assessment** button  
**Expected (dialog):** Same behavior as TC-JUN26-ASSIGN-01

#### TC-JUN26-ASSIGN-04: Re-assign Same Assessment
**Steps:**
1. Assign same assessment again to same candidate

**Expected:** Amber note: previously assigned — new invitation created; new link generated

---

### 18.4 Assessments Release 1 — Pipeline Badges & Gating (`/pipeline`)

**Roles:** Admin, HR, Recruiter

#### TC-JUN26-PIPE-01: Assessment Status Badges
**Steps:** Observe pipeline cards for candidates in each assessment state

**Expected:**

| State | Badge | Color |
|-------|-------|-------|
| Not assigned | Assessment not assigned | Slate |
| Invited / in progress | Assessment pending | Amber |
| Completed & passed | Assessment passed | Emerald |
| Completed & failed | Assessment failed | Red |
| Expired | Assessment expired | Orange |

Also: **Form pending** / **Form complete** when digital form required (amber/emerald)

#### TC-JUN26-PIPE-02: Recruiter Blocked on Advance (Require Pass ON)
**Preconditions:** **Require pass to advance** ON; candidate failed or pending assessment; **proceeded** verdict on stage  
**Steps:**
1. Log in as **Recruiter**
2. Click **Advance**

**Expected:** Destructive toast **Assessment required** — must pass before advancing; candidate stays in stage

#### TC-JUN26-PIPE-03: Admin/HR Override on Advance
**Preconditions:** Same as TC-JUN26-PIPE-02; logged in as Admin or HR  
**Steps:**
1. Click **Advance**
2. Confirm **Override & Advance** in dialog **Advance without passing assessment?**

**Expected:** Candidate moves to next stage

#### TC-JUN26-PIPE-04: Advance When Passed
**Preconditions:** Assessment status **passed**; proceeded verdict  
**Steps:** Click **Advance**

**Expected:** Advances without override dialog

#### TC-JUN26-PIPE-05: Gating Disabled on Job
**Preconditions:** Job **Require pass to advance** OFF  
**Steps:** As Recruiter, advance candidate with pending/failed assessment

**Expected:** No block toast; no override dialog; advance succeeds

---

### 18.5 Assessments Release 1 — Exam Consent & Completion

**Roles:** Applicant; magic-link candidate

#### TC-JUN26-EXAM-01: Magic Link Consent (`/exam?token=...`)
**Steps:**
1. Open invitation link
2. Without consent, try **Start Assessment**
3. Check consent checkbox; start

**Expected:**
- Pre-start shows title, duration, question count
- Start disabled until consent checked
- Consent text mentions responses, integrity monitoring, recruitment evaluation
- After start: in progress; `consent_source` = exam portal magic link

#### TC-JUN26-EXAM-02: Applicant Portal Consent (`/exam/:assessmentId`)
**Steps:**
1. Applicant login → `/applicant` → **Assessments** → **Start**
2. Consent checkbox → **Start Assessment**

**Expected:** Same consent UX; `consent_source` = applicant exam path; **Back to Dashboard** visible

#### TC-JUN26-EXAM-03: Complete Assessment
**Steps:** Answer questions → **Submit** → confirm

**Expected:** Status **Completed**; cannot retake; completion email to applicant (if prefs allow)

#### TC-JUN26-EXAM-04: Recruiter Completion Notifications
**Preconditions:** Job **Notify recruiter on completion** ON; recruiter assigned  
**Steps:** Complete assessment as candidate

**Expected (recruiter):**
- Bell: `assessment_completed`, title **Assessment Completed**, message with name, assessment, **Passed** or **Did not pass**, score %
- Link to `/evaluations?candidate=...`
- Email: subject `{Name} completed {Assessment title}`

**Negative:** With notify OFF on job → no in-app/email for that completion

---

### 18.6 Assessments Release 1 — Drawer & Evaluations

#### TC-JUN26-DRAW-01: Drawer Pre-Screen Subsections
**Roles:** Admin, HR, Recruiter  
**Steps:** Open drawer for job-linked candidate

**Expected under **Pre-Screen**:**
- **Applicant Digital Form** (if form required)
- **Job Assessment** (if assessment enabled)
- **Recruiter Screening Notes**
- After assign: title, deadline, status; **Re-assign / Resend** if pending/failed; hidden if passed

#### TC-JUN26-DRAW-02: Interviewer Read-Only Assessment
**Roles:** Interviewer  
**Steps:** Open same drawer

**Expected:** Can see assessment status; **no** Assign / Re-assign buttons

#### TC-JUN26-EVAL-01: Override Pass/Fail (`/evaluations/{id}`)
**Roles:** Admin, HR, Interviewer  
**Steps:**
1. Open completed evaluation
2. **Override Pass** → confirm **Override to Passed?**
3. On another candidate, **Override Fail**

**Expected:** Pipeline badge updates to **Assessment passed** / **Assessment failed**; gating behavior matches

#### TC-JUN26-EVAL-02: Recruiter Cannot Override
**Roles:** Recruiter  
**Steps:** Open `/evaluations/{id}`

**Expected:** Override Pass/Fail buttons **not** shown

---

### 18.7 Pre-Screen Modal — Footer Fix

#### TC-JUN26-PRES-01: Footer Pinned Inside Modal
**Roles:** Admin, HR, Recruiter  
**Steps:**
1. `/candidates` or `/pipeline` → **⋮ → Pre-Screen**
2. Resize viewport to short height (~768px) or narrow laptop
3. Scroll through Experience, Mobility, Communication Rating, Academics, etc.
4. Save

**Expected:**
- **Cancel** and **Save Pre-Screen** always visible inside modal footer (border-top), not off-screen or outside dialog
- Save persists; drawer **Recruiter Screening Notes** updates

---

### 18.8 Digital Job Application Form

#### TC-JUN26-FORM-01: Job Toggle (`/jobs`)
**Roles:** Admin, HR  
**Steps:** Edit job → **Digital application form** ON/OFF; save

**Expected:** Helper: "Require applicants to complete the pre-screen form before interviews."; OFF removes form requirement for that job

#### TC-JUN26-FORM-02: Applicant Complete Form
**Roles:** Applicant  
**Steps:**
1. Apply on `/careers/{id}` → login → `/applicant/applications/{id}`
2. **Complete Job Application** → `/applicant/applications/{id}/form`
3. Complete **10 questions** + **≥2 employment references** → Submit

**Expected:**
- Pending: amber **Complete your job application form**
- After submit: green **Job application form submitted**; **View Responses** works

#### TC-JUN26-FORM-03: Recruiter Fill on Behalf (Drawer)
**Roles:** Admin, HR, Recruiter  
**Steps:** Drawer → **Applicant Digital Form** → **Fill on Behalf** or **Complete on Behalf**

**Expected:** Dialog **Job Application Form — {name}**; submit shows "Filled by recruiter" on submitted date; badges **Form pending** / **Form complete** match state

#### TC-JUN26-FORM-04: Schedule Interview Warning
**Roles:** Recruiter  
**Steps:** `/pipeline` → schedule interview for candidate with incomplete form

**Expected:** Amber banner: **This candidate has not completed the digital job application form yet.** (scheduling still allowed)

---

### 18.9 Question Bank Admin (`/settings`)

#### TC-JUN26-QBANK-01: Application Questions Tab
**Roles:** Admin, HR  
**Steps:**
1. `/settings` → **Application Questions**
2. **Add Question** → category, text, sort; edit/deactivate

**Expected:** Summary shows active/total, categories, **10 picked per application**; active questions appear on new applicant forms

#### TC-JUN26-QBANK-02: HR Settings Tab Visibility
**Roles:** HR vs Admin  
**Steps:** Log in as HR → `/settings`

**Expected:**
- HR **can** open Settings (not admin-only error)
- HR **cannot** see: **User Roles**, **Business**, **Email**, **Scorecards**
- HR **can** see: Certifications, Colleges, Domains, Teams, Vendors, **Application Questions**, Announcements, Red Flag Rules
- HR default tab = **Certifications**

---

### 18.10 Applicant Profile Completion

#### TC-JUN26-PROF-01: Extended Profile Fields
**Roles:** Applicant  
**Steps:**
1. `/applicant` → **Profile**
2. Verify fields: first/middle/last name, DOB, gender, marital status, blood group, LinkedIn, phone, resume, experience, education, skills
3. Save with missing required fields

**Expected:** Validation toasts (e.g. **First name is required**, **Gender is required**); complete profile → **Welcome back, {firstName}!**

#### TC-JUN26-PROF-02: Email Notification Preferences
**Steps:**
1. Toggle **Assessment reminders** OFF → have staff assign assessment
2. Toggle ON → assign again

**Expected:** OFF → no invitation email; ON → invitation sends (see also §13 TC-EMAIL-04)

---

### 18.11 Job Match Scoring

#### TC-JUN26-MATCH-01: Pipeline Fit Badge
**Roles:** Admin, HR, Recruiter  
**Steps:** `/pipeline` and **Pending Approval** columns

**Expected:** **`{N}% fit`** badge when `suitability_score` exists (green ≥70, amber ≥40, red &lt;40)

#### TC-JUN26-MATCH-02: Drawer Job Fit Breakdown
**Steps:** Drawer intelligence header → click **Job Fit** score

**Expected:** Popover **Job Fit Breakdown** (Skills Match, Experience Match, etc.)

#### TC-JUN26-MATCH-03: Applicant Job Recommendations
**Roles:** Applicant  
**Steps:** `/applicant` → **Jobs** / Browse Jobs with complete profile

**Expected:** Personalized matches; roles below **60%** threshold hidden or empty-state prompts profile completion

#### TC-JUN26-MATCH-04: Candidates Page Match Column
**Steps:** `/candidates`

**Expected:** **% Match** column/badge where analyzed

---

### 18.12 Email Notifications v1

#### TC-JUN26-EMAIL-01: Admin Email Config
**Roles:** Admin  
**Steps:** `/settings` → **Email**

**Expected:** **Email notifications enabled**, **From address**, **Reply-to**, **Quota usage** (Today / This month)

#### TC-JUN26-EMAIL-02: Applicant Emails Respect Prefs

| Trigger | Email | Pref gate |
|---------|-------|-----------|
| Careers apply | Application confirmation | `application_updates` |
| Assessment assign | Invitation + magic link | `assessment_reminders` |
| Assessment submit | Completion confirmation | `assessment_reminders` |

#### TC-JUN26-EMAIL-03: Staff Emails

| Trigger | Email |
|---------|-------|
| Interview scheduled | Staff notification |
| Verdict submitted | Staff notification |
| Job-linked assessment complete | Recruiter (if job notify ON) |

#### TC-JUN26-EMAIL-04: Global Email Disabled
**Steps:** Settings → Email OFF → trigger any email

**Expected:** Skipped/logged in `email_delivery_log`; no external delivery

---

### 18.13 Pre-Screen Drawer Merge (Regression)

#### TC-JUN26-MERGE-01: Single Pre-Screen Section
**Roles:** Admin, HR, Recruiter, Interviewer  
**Steps:** Open candidate drawer from pipeline (not `/database`)

**Expected:** One **Pre-Screen** section with: (1) Applicant Digital Form if required, (2) Job Assessment if enabled, (3) Recruiter Screening Notes (CTC, notice, relocation, work mode, comms rating, academics, nutshell). Interviewer: CTC/notice hidden.

---

### 18.14 Features Overview (`/features`)

#### TC-JUN26-FEAT-01: Feature Catalogue
**Roles:** Any internal user  
**Steps:**
1. Navigate to `/features`
2. Filter: All / Admin / HR / Recruiter / Interviewer / Candidate
3. Find **AI Job Fit Score**, **Applicant Portal**, assessment/email entries

**Expected:** Descriptions match shipped behavior; role filters work; **New** badge on recent items (if within 7 days)

---

### 18.15 Smoke Test Path (~15 min)

Run end-to-end on one assessment-enabled job:

| Step | Action | Pass criteria | Pass/Fail |
|------|--------|---------------|-----------|
| S1 | `/jobs` → enable assessment + generate or link + **Active** | Config saved | |
| S2 | `/pipeline` → assign assessment | Link/email received | |
| S3 | `/exam?token=...` → consent → start → submit | Completed | |
| S4 | Recruiter bell + email | **Assessment Completed** notification | |
| S5 | `/pipeline` badge | **Assessment passed** or **failed** | |
| S6 | Recruiter **Advance** (if failed) | Blocked toast | |
| S7 | Admin **Advance** | Override dialog → advance works | |
| S8 | Drawer → Pre-Screen | Form + Assessment sections visible | |
| S9 | `/settings` → Application Questions | Tab loads | |
| S10 | Pre-Screen modal scroll | Footer buttons inside modal | |
| S11 | `/jobs` → **Generate from job description** | TC-JUN26-GEN-02 passes | |

---

### 18.16 Full Regression Path (~2–3 hours)

After smoke path (§18.15), execute all TC-JUN26-* cases above, then:

1. **Email v1:** §18.12 with prefs on/off; quota increments
2. **Digital form:** §18.8 applicant + recruiter + pipeline badges + schedule warning
3. **Question bank:** Add/deactivate question; verify form question set
4. **Applicant profile:** §18.10 + legacy §11 (TC-ADASH-*)
5. **Job match:** Analyze candidate → scores on pipeline + drawer
6. **HR Settings:** §18.9 tab visibility vs admin
7. **Evaluations:** Override pass/fail; pipeline + gating update
8. **Assessments builder:** `/assessments` — create section/question; template save (§8 TC-ASSESS-*)
9. **Roles matrix** (spot-check):

| Action | Admin | HR | Recruiter | Interviewer |
|--------|-------|-----|-----------|-------------|
| `/assessments` | ✅ | ✅ | ❌ | ❌ |
| Assign assessment | ✅ | ✅ | ✅ | ❌ |
| Advance override | ✅ | ✅ | ❌ | ❌ |
| Eval override | ✅ | ✅ | ❌ | ✅ |
| Settings Email tab | ✅ | ❌ | ❌ | ❌ |
| Application Questions | ✅ | ✅ | ❌ | ❌ |

10. **Pre-Screen modal:** Mobile width, save all sections, reopen persistence
11. **Legacy baseline:** §6 Careers, §10–11 Applicant exam, §13 Email

---

### 18.17 Known V2 — Do NOT Test (Out of Scope)

| Item | Notes |
|------|-------|
| Auto-assign on stage entry | Manual assign + job default only |
| Recruiter Assessment Builder access | `/assessments` admin/HR only |
| Clone assessment per job UI | `source_job_id` column only |
| Assessment analytics dashboard | No funnel/pass-rate UI |
| Token RLS hardening | Security backlog |
| GDPR assign-time consent / withdrawal | Exam-portal consent only in R1 |
| Editable email templates table | Fixed templates in v1 |
| Marketing / weekly digest emails | Out of scope |
| Applicant Profile Completion (ROADMAP #2) | Placeholder — not this release |

---

### 18.18 Defect Log (June 2026 Release)

| ID | TC / Area | Steps | Expected | Actual | Role | Screenshot? | Status |
|----|-----------|-------|----------|--------|------|-------------|--------|
| DEF-JUN26-001 | | | | | | | Open |
| DEF-JUN26-002 | | | | | | | Open |

---

### 18.19 Route & Label Quick Reference

| Route | Purpose |
|-------|---------|
| `/jobs` | Job assessment + digital form toggles; **Generate from job description** |
| `/assessments` | Builder (admin/HR) |
| `/assessments/{id}` | Activate AI-generated draft |
| `/pipeline` | Badges, assign, advance gating |
| `/candidates` | Pre-Screen dialog, assign assessment |
| `/evaluations` | Completion notifications link target |
| `/evaluations/{id}` | Override Pass/Fail |
| `/settings` | Email (admin), Application Questions (admin/HR) |
| `/features` | Feature catalogue |
| `/careers` | Public apply |
| `/applicant` | Dashboard (Profile, Jobs, Applications, Assessments) |
| `/applicant/applications/{id}/form` | Digital job application form |
| `/exam?token=...` | Magic-link exam + consent |
| `/exam/{assessmentId}` | Applicant logged-in exam + consent |

**Assessment badges:** Assessment not assigned · Assessment pending · Assessment passed · Assessment failed · Assessment expired  
**Form badges:** Form pending · Form complete  
**Key dialogs:** Assign Assessment · Advance without passing assessment? · Pre-Screen: {name} · Job Application Form — {name}

---

### 18.20 QA Team Sign-Off & Feedback

**Release:** June 2026 (Assessments R1 + related features)  
**Test environment:** _________________________  
**Build / deploy date:** _________________________

| Field | Value |
|-------|-------|
| QA lead | |
| Testers | |
| Smoke path (§18.15) completed | ☐ Yes ☐ No — Date: |
| Full regression (§18.16) completed | ☐ Yes ☐ No ☐ Partial — Date: |
| Total TC-JUN26 cases executed | / 47 |
| Passed | |
| Failed | |
| Blocked | |
| Skipped | |

**Overall result:** ☐ Approved for production ☐ Approved with known issues ☐ Not approved

**Known issues accepted for release (link DEF-JUN26-*):**

1.
2.

**QA feedback on flow / functionality (free text):**

```
(UX confusion, missing labels, performance, role gaps, suggestions)
```

| Reviewer | Role | Signature / Date | Comments |
|----------|------|------------------|------------|
| | QA Lead | | |
| | Product / Vikash | | |

---

## Test Execution Log

| Test ID | Tester | Date | Result | Notes |
|---------|--------|------|--------|-------|
| TC-AUTH-01 | | | | |
| TC-AUTH-02 | | | | |
| TC-AUTH-03 | | | | |
| TC-AUTH-04 | | | | |
| TC-AUTH-05 | | | | |
| TC-AUTH-06 | | | | |
| TC-AAUTH-01 | | | | |
| TC-AAUTH-02 | | | | |
| TC-AAUTH-03 | | | | |
| TC-AAUTH-04 | | | | |
| TC-AAUTH-05 | | | | |
| TC-AAUTH-06 | | | | |
| TC-DASH-01 | | | | |
| TC-DASH-02 | | | | |
| TC-DASH-03 | | | | |
| TC-DASH-04 | | | | |
| TC-DASH-05 | | | | |
| TC-DASH-06 | | | | |
| TC-JOBS-01 | | | | |
| TC-JOBS-02 | | | | |
| TC-JOBS-03 | | | | |
| TC-JOBS-04 | | | | |
| TC-JOBS-05 | | | | |
| TC-JOBS-06 | | | | |
| TC-JOBS-07 | | | | |
| TC-JOBS-08 | | | | |
| TC-JOBS-09 | | | | |
| TC-JOBS-10 | | | | |
| TC-JOBS-11 | | | | |
| TC-JOBS-12 | | | | |
| TC-JOBS-13 | | | | |
| TC-JDET-01 | | | | |
| TC-JDET-02 | | | | |
| TC-JDET-03 | | | | |
| TC-JDET-04 | | | | |
| TC-JDET-05 | | | | |
| TC-JDET-06 | | | | |
| TC-JDET-07 | | | | |
| TC-JDET-08 | | | | |
| TC-JDET-09 | | | | |
| TC-JDET-10 | | | | |
| TC-CAREERS-01 | | | | |
| TC-CAREERS-02 | | | | |
| TC-CAREERS-03 | | | | |
| TC-CAREERS-04 | | | | |
| TC-CAREERS-05 | | | | |
| TC-CAREERS-06 | | | | |
| TC-CAREERS-07 | | | | |
| TC-CAREERS-08 | | | | |
| TC-CAREERS-09 | | | | |
| TC-CAREERS-10 | | | | |
| TC-CAREERS-11 | | | | |
| TC-CAREERS-12 | | | | |
| TC-CAND-01 | | | | |
| TC-CAND-02 | | | | |
| TC-CAND-03 | | | | |
| TC-CAND-04 | | | | |
| TC-CAND-05 | | | | |
| TC-CAND-06 | | | | |
| TC-CAND-07 | | | | |
| TC-CAND-08 | | | | |
| TC-ASSESS-01 | | | | |
| TC-ASSESS-02 | | | | |
| TC-ASSESS-03 | | | | |
| TC-ASSESS-04 | | | | |
| TC-ASSESS-05 | | | | |
| TC-ASSESS-06 | | | | |
| TC-ASSESS-07 | | | | |
| TC-ASSESS-08 | | | | |
| TC-ASSESS-09 | | | | |
| TC-ASSESS-10 | | | | |
| TC-ASSESS-11 | | | | |
| TC-ASSESS-12 | | | | |
| TC-ASSESS-13 | | | | |
| TC-ASSESS-14 | | | | |
| TC-ASSESS-15 | | | | |
| TC-PORTAL-01 | | | | |
| TC-PORTAL-02 | | | | |
| TC-PORTAL-03 | | | | |
| TC-PORTAL-04 | | | | |
| TC-PORTAL-05 | | | | |
| TC-PORTAL-06 | | | | |
| TC-PORTAL-07 | | | | |
| TC-PORTAL-08 | | | | |
| TC-PORTAL-09 | | | | |
| TC-PORTAL-10 | | | | |
| TC-PORTAL-11 | | | | |
| TC-PORTAL-12 | | | | |
| TC-AEXAM-01 | | | | |
| TC-AEXAM-02 | | | | |
| TC-AEXAM-03 | | | | |
| TC-ADASH-01 | | | | |
| TC-ADASH-02 | | | | |
| TC-ADASH-03 | | | | |
| TC-ADASH-04 | | | | |
| TC-ADASH-05 | | | | |
| TC-ADASH-06 | | | | |
| TC-ADASH-07 | | | | |
| TC-ADASH-08 | | | | |
| TC-ADASH-09 | | | | |
| TC-ADASH-10 | | | | |
| TC-ADASH-11 | | | | |
| TC-ADASH-12 | | | | |
| TC-ADASH-13 | | | | |
| TC-ADASH-14 | | | | |
| TC-ADASH-15 | | | | |
| TC-ADASH-16 | | | | |
| TC-ADASH-17 | | | | |
| TC-ADASH-18 | | | | |
| TC-EVAL-01 | | | | |
| TC-EVAL-02 | | | | |
| TC-EVAL-03 | | | | |
| TC-EVAL-04 | | | | |
| TC-EVAL-05 | | | | |
| TC-EMAIL-01 | | | | |
| TC-EMAIL-02 | | | | |
| TC-EMAIL-03 | | | | |
| TC-EMAIL-04 | | | | |
| TC-EMAIL-05 | | | | |
| TC-CODE-01 | | | | |
| TC-CODE-02 | | | | |
| TC-CODE-03 | | | | |
| TC-CODE-04 | | | | |
| TC-CODE-05 | | | | |
| TC-TMPL-01 | | | | |
| TC-TMPL-02 | | | | |
| TC-TMPL-03 | | | | |
| TC-EDGE-01 | | | | |
| TC-EDGE-02 | | | | |
| TC-EDGE-03 | | | | |
| TC-EDGE-04 | | | | |
| TC-EDGE-05 | | | | |
| TC-EDGE-06 | | | | |
| TC-RESP-01 | | | | |
| TC-RESP-02 | | | | |
| TC-RESP-03 | | | | |
| TC-RESP-04 | | | | |
| TC-RESP-05 | | | | |
| TC-RESP-06 | | | | |
| TC-JUN26-PRE-01 | | | | |
| TC-JUN26-PRE-02 | | | | |
| TC-JUN26-PRE-03 | | | | |
| TC-JUN26-PRE-04 | | | | |
| TC-JUN26-PRE-05 | | | | |
| TC-JUN26-PRE-06 | | | | |
| TC-JUN26-ASSESS-01 | | | | |
| TC-JUN26-ASSESS-02 | | | | |
| TC-JUN26-ASSESS-03 | | | | |
| TC-JUN26-ASSESS-04 | | | | |
| TC-JUN26-ASSESS-05 | | | | |
| TC-JUN26-GEN-01 | | | | |
| TC-JUN26-GEN-02 | | | | |
| TC-JUN26-GEN-03 | | | | |
| TC-JUN26-GEN-04 | | | | |
| TC-JUN26-ASSIGN-01 | | | | |
| TC-JUN26-ASSIGN-02 | | | | |
| TC-JUN26-ASSIGN-03 | | | | |
| TC-JUN26-ASSIGN-04 | | | | |
| TC-JUN26-PIPE-01 | | | | |
| TC-JUN26-PIPE-02 | | | | |
| TC-JUN26-PIPE-03 | | | | |
| TC-JUN26-PIPE-04 | | | | |
| TC-JUN26-PIPE-05 | | | | |
| TC-JUN26-EXAM-01 | | | | |
| TC-JUN26-EXAM-02 | | | | |
| TC-JUN26-EXAM-03 | | | | |
| TC-JUN26-EXAM-04 | | | | |
| TC-JUN26-DRAW-01 | | | | |
| TC-JUN26-DRAW-02 | | | | |
| TC-JUN26-EVAL-01 | | | | |
| TC-JUN26-EVAL-02 | | | | |
| TC-JUN26-PRES-01 | | | | |
| TC-JUN26-FORM-01 | | | | |
| TC-JUN26-FORM-02 | | | | |
| TC-JUN26-FORM-03 | | | | |
| TC-JUN26-FORM-04 | | | | |
| TC-JUN26-QBANK-01 | | | | |
| TC-JUN26-QBANK-02 | | | | |
| TC-JUN26-PROF-01 | | | | |
| TC-JUN26-PROF-02 | | | | |
| TC-JUN26-MATCH-01 | | | | |
| TC-JUN26-MATCH-02 | | | | |
| TC-JUN26-MATCH-03 | | | | |
| TC-JUN26-MATCH-04 | | | | |
| TC-JUN26-EMAIL-01 | | | | |
| TC-JUN26-EMAIL-02 | | | | |
| TC-JUN26-EMAIL-03 | | | | |
| TC-JUN26-EMAIL-04 | | | | |
| TC-JUN26-MERGE-01 | | | | |
| TC-JUN26-FEAT-01 | | | | |
