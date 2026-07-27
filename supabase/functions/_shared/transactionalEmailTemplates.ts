import {
  emailCandidateNameLink,
  emailCtaButton,
  emailHeading,
  emailHeadingWithIcon,
  emailInfoBox,
  emailLinkFallback,
  emailParagraph,
  emailScoreBox,
  emailSignOff,
  escapeHtml,
  type EmailBranding,
  wrapEmailLayout,
} from "./emailLayout.ts";

function linkedCandidateName(
  candidateName: string,
  candidateProfileUrl: string | null | undefined,
  primaryColor: string,
): string {
  if (candidateProfileUrl) {
    return emailCandidateNameLink(candidateName, candidateProfileUrl, primaryColor);
  }
  return `<strong>${escapeHtml(candidateName)}</strong>`;
}

function messageWithLinkedCandidate(
  message: string,
  candidateName: string | undefined,
  candidateProfileUrl: string | undefined,
  primaryColor: string,
): string {
  if (!candidateName || !candidateProfileUrl) {
    return escapeHtml(message);
  }
  const link = emailCandidateNameLink(candidateName, candidateProfileUrl, primaryColor);
  const parts = message.split(candidateName);
  return parts.map((part, i) => escapeHtml(part) + (i < parts.length - 1 ? link : "")).join("");
}

export interface ApplicantEmailParams {
  type:
    | "application_received"
    | "application_form_required"
    | "job_details"
    | "shortlist"
    | "reject"
    | "hold"
    | "backout"
    | "assessment_assigned";
  applicant_name: string;
  job_title: string;
  rejection_reason?: string;
  assessment_title?: string;
  deadline?: string;
  formLink?: string;
  portalUrl?: string;
  job_location?: string;
  job_type_label?: string;
  experience_label?: string;
  job_description?: string;
  careersLink?: string;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function greeting(name: string): string {
  return emailParagraph(`Dear ${escapeHtml(name)},`);
}

export function buildApplicantEmail(
  branding: EmailBranding,
  params: ApplicantEmailParams,
): EmailContent {
  const {
    type,
    applicant_name,
    job_title,
    rejection_reason,
    assessment_title,
    deadline,
    formLink,
    portalUrl,
    job_location,
    job_type_label,
    experience_label,
    job_description,
    careersLink,
  } = params;
  const { companyName, primaryColor } = branding;
  const safeJob = escapeHtml(job_title);
  const safeCompany = escapeHtml(companyName);

  let subject: string;
  let bodyHtml: string;
  let text: string;

  switch (type) {
    case "job_details": {
      subject = `Job details: ${job_title} at ${companyName}`;
      const metadataRows = [
        job_location ? `<p style="margin:0 0 8px 0;color:#52525b;font-size:15px;"><strong>Location:</strong> ${escapeHtml(job_location)}</p>` : "",
        job_type_label ? `<p style="margin:0 0 8px 0;color:#52525b;font-size:15px;"><strong>Type:</strong> ${escapeHtml(job_type_label)}</p>` : "",
        experience_label ? `<p style="margin:0;color:#52525b;font-size:15px;"><strong>Experience:</strong> ${escapeHtml(experience_label)}</p>` : "",
      ].filter(Boolean).join("");
      const metadataBlock = metadataRows
        ? emailInfoBox(metadataRows, primaryColor)
        : "";
      const descriptionBlock = job_description?.trim()
        ? `<div style="margin:16px 0;color:#52525b;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(job_description.trim())}</div>`
        : "";
      const ctaBlock = careersLink
        ? emailCtaButton("View Job on Careers Page", careersLink, primaryColor) +
          emailLinkFallback(careersLink)
        : "";
      bodyHtml = [
        emailHeading("Job Details"),
        greeting(applicant_name),
        emailParagraph(
          `Here are the details for <strong>${safeJob}</strong> at ${safeCompany}.`,
        ),
        metadataBlock,
        descriptionBlock,
        ctaBlock,
        emailSignOff(companyName),
      ].join("");
      text = [
        `Dear ${applicant_name},`,
        "",
        `Here are the details for ${job_title} at ${companyName}.`,
        job_location ? `\nLocation: ${job_location}` : "",
        job_type_label ? `Type: ${job_type_label}` : "",
        experience_label ? `Experience: ${experience_label}` : "",
        job_description?.trim() ? `\n\n${job_description.trim()}` : "",
        careersLink ? `\n\nView job: ${careersLink}` : "",
        "",
        `Best regards,\nThe ${companyName} Hiring Team`,
      ].filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
      break;
    }
    case "application_form_required": {
      subject = `Action required: complete your application for ${job_title} at ${companyName}`;
      const safePortalUrl = portalUrl ? escapeHtml(portalUrl) : "";
      const portalBlock = portalUrl
        ? emailParagraph(
          `Sign in or create an account at the Applicant Portal: <a href="${safePortalUrl}" style="color:${primaryColor};">${safePortalUrl}</a>`,
        )
        : "";
      const ctaBlock = formLink
        ? emailCtaButton("Complete Application Form", formLink, primaryColor) +
          emailLinkFallback(formLink)
        : emailParagraph("Log in to the Applicant Portal to complete your digital application form.");
      bodyHtml = [
        emailHeading("Digital Application Form"),
        greeting(applicant_name),
        emailParagraph(
          `Please complete the digital job application form for <strong>${safeJob}</strong> at ${safeCompany} before we can move forward with your application.`,
        ),
        ctaBlock,
        portalBlock,
        emailSignOff(companyName),
      ].join("");
      text = [
        `Dear ${applicant_name},`,
        "",
        `Please complete the digital job application form for ${job_title} at ${companyName} before we can move forward with your application.`,
        formLink
          ? `\nComplete your form (sign in or create an account): ${formLink}`
          : "\nLog in to the Applicant Portal to complete your digital application form.",
        portalUrl ? `\nApplicant Portal: ${portalUrl}` : "",
        "",
        `Best regards,\nThe ${companyName} Hiring Team`,
      ].join("\n");
      break;
    }
    case "application_received": {
      subject = `Thank you for applying to ${job_title} at ${companyName}`;
      bodyHtml = [
        emailHeading("Application Received"),
        greeting(applicant_name),
        emailParagraph(
          `Thank you for applying for <strong>${safeJob}</strong> at ${safeCompany}. We have received your application and it is under review.`,
        ),
        emailSignOff(companyName),
      ].join("");
      text = [
        `Dear ${applicant_name},`,
        "",
        `Thank you for applying for ${job_title} at ${companyName}. We have received your application and it is under review.`,
        "",
        `Best regards,\nThe ${companyName} Hiring Team`,
      ].join("\n");
      break;
    }
    case "shortlist": {
      subject = `Good news regarding your application for ${job_title} at ${companyName}`;
      bodyHtml = [
        emailHeading("Congratulations!"),
        greeting(applicant_name),
        emailParagraph(
          `Your application for <strong>${safeJob}</strong> at ${safeCompany} has been <strong>shortlisted</strong>.`,
        ),
        emailSignOff(companyName),
      ].join("");
      text = [
        `Dear ${applicant_name},`,
        "",
        `Your application for ${job_title} at ${companyName} has been shortlisted.`,
        "",
        `Best regards,\nThe ${companyName} Hiring Team`,
      ].join("\n");
      break;
    }
    case "hold": {
      subject = `Update on your application for ${job_title} at ${companyName}`;
      const noteBlock = rejection_reason
        ? emailParagraph(`<strong>Note:</strong> ${escapeHtml(rejection_reason)}`)
        : "";
      bodyHtml = [
        emailHeading("Application On Hold"),
        greeting(applicant_name),
        emailParagraph(
          `Your application for <strong>${safeJob}</strong> at ${safeCompany} is currently <strong>on hold</strong> while we complete our review process.`,
        ),
        noteBlock,
        emailParagraph("We will reach out when there is an update. Thank you for your patience."),
        emailSignOff(companyName),
      ].join("");
      text = [
        `Dear ${applicant_name},`,
        "",
        `Your application for ${job_title} at ${companyName} is currently on hold while we complete our review process.`,
        rejection_reason ? `\nNote: ${rejection_reason}` : "",
        "",
        "We will reach out when there is an update. Thank you for your patience.",
        "",
        `Best regards,\nThe ${companyName} Hiring Team`,
      ].join("\n");
      break;
    }
    case "backout": {
      subject = `Application withdrawn — ${job_title} at ${companyName}`;
      const noteBlock = rejection_reason
        ? emailParagraph(`<strong>Note:</strong> ${escapeHtml(rejection_reason)}`)
        : "";
      bodyHtml = [
        emailHeading("Application Withdrawn"),
        greeting(applicant_name),
        emailParagraph(
          `We have recorded that you have withdrawn from the <strong>${safeJob}</strong> position at ${safeCompany}.`,
        ),
        noteBlock,
        emailParagraph("We wish you the best in your career journey."),
        emailSignOff(companyName),
      ].join("");
      text = [
        `Dear ${applicant_name},`,
        "",
        `We have recorded that you have withdrawn from the ${job_title} position at ${companyName}.`,
        rejection_reason ? `\nNote: ${rejection_reason}` : "",
        "",
        "We wish you the best in your career journey.",
        "",
        `Best regards,\nThe ${companyName} Hiring Team`,
      ].join("\n");
      break;
    }
    case "assessment_assigned": {
      const title = assessment_title || "Technical Assessment";
      const safeTitle = escapeHtml(title);
      const deadlineText = deadline
        ? new Date(deadline).toLocaleDateString("en-IN", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
        : null;
      const deadlineBlock = deadlineText
        ? emailParagraph(`<strong>Deadline:</strong> ${escapeHtml(deadlineText)}`)
        : "";
      subject = `Assessment Assigned: ${title} - ${companyName}`;
      bodyHtml = [
        emailHeading("Assessment Assigned"),
        greeting(applicant_name),
        emailParagraph(
          `You have been assigned <strong>${safeTitle}</strong> for <strong>${safeJob}</strong> at ${safeCompany}.`,
        ),
        deadlineBlock,
        emailParagraph("Log in to the Applicant Portal to complete the assessment."),
        emailSignOff(companyName),
      ].join("");
      text = [
        `Dear ${applicant_name},`,
        "",
        `You have been assigned ${title} for ${job_title} at ${companyName}.`,
        deadlineText ? `\nDeadline: ${deadlineText}` : "",
        "",
        "Log in to the Applicant Portal to complete the assessment.",
        "",
        `Best regards,\nThe ${companyName} Hiring Team`,
      ].join("\n");
      break;
    }
    case "reject":
    default: {
      subject = `Update on your application for ${job_title} at ${companyName}`;
      const feedbackBlock = rejection_reason
        ? emailParagraph(`<strong>Feedback:</strong> ${escapeHtml(rejection_reason)}`)
        : "";
      bodyHtml = [
        emailHeading("Application Update"),
        greeting(applicant_name),
        emailParagraph(`Thank you for applying for <strong>${safeJob}</strong> at ${safeCompany}.`),
        emailParagraph(
          "After careful consideration, we will not be moving forward with your application at this time.",
        ),
        feedbackBlock,
        emailSignOff(companyName),
      ].join("");
      text = [
        `Dear ${applicant_name},`,
        "",
        `Thank you for applying for ${job_title} at ${companyName}.`,
        "After careful consideration, we will not be moving forward with your application at this time.",
        rejection_reason ? `\nFeedback: ${rejection_reason}` : "",
        "",
        `Best regards,\nThe ${companyName} Hiring Team`,
      ].join("\n");
    }
  }

  return {
    subject,
    html: wrapEmailLayout(branding, bodyHtml),
    text,
  };
}

export function buildAssessmentInvitationEmail(
  branding: EmailBranding,
  params: {
    candidateName: string;
    assessmentTitle: string;
    magicLink: string;
    deadline: string | null;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const { candidateName, assessmentTitle, magicLink, deadline } = params;
  const safeName = escapeHtml(candidateName);
  const safeTitle = escapeHtml(assessmentTitle);

  const deadlineBlock = deadline
    ? emailParagraph(
      `<strong style="color:#dc2626;">Please complete before ${escapeHtml(
        new Date(deadline).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      )}</strong>`,
    )
    : "";

  const bodyHtml = [
    emailHeading("Assessment Invitation"),
    emailParagraph(`Hello <strong>${safeName}</strong>,`),
    emailParagraph(`You have been invited to complete <strong>${safeTitle}</strong>.`),
    deadlineBlock,
    emailCtaButton("Start Assessment", magicLink, primaryColor),
    emailLinkFallback(magicLink),
    emailParagraph(`<span style="font-size:13px;color:#71717a;">Automated message from ${escapeHtml(companyName)}.</span>`),
  ].join("");

  const deadlineText = deadline
    ? `\nPlease complete before ${new Date(deadline).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`
    : "";

  return {
    subject: `You're invited to take the ${assessmentTitle} assessment`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Hello ${candidateName},`,
      "",
      `You have been invited to complete ${assessmentTitle}.${deadlineText}`,
      "",
      `Start assessment: ${magicLink}`,
      "",
      `Automated message from ${companyName}.`,
    ].join("\n"),
  };
}

export function buildAssessmentCompletionCandidateEmail(
  branding: EmailBranding,
  params: {
    candidateName: string;
    assessmentTitle: string;
    completedAt: string;
    showScore: boolean;
    percentage?: number | null;
    passed?: boolean | null;
  },
): EmailContent {
  const { companyName } = branding;
  const { candidateName, assessmentTitle, completedAt, showScore, percentage, passed } = params;

  const completedDate = new Date(completedAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const scoreBlock = showScore && percentage != null
    ? emailScoreBox(percentage, !!passed)
    : emailParagraph("Your responses are being reviewed. You will be contacted with the results.");

  const bodyHtml = [
    emailHeading("Assessment Completed"),
    emailParagraph(`Hello <strong>${escapeHtml(candidateName)}</strong>,`),
    emailParagraph(`Thank you for completing <strong>${escapeHtml(assessmentTitle)}</strong>.`),
    emailParagraph(`<strong>Completed:</strong> ${escapeHtml(completedDate)}`),
    scoreBlock,
    emailParagraph(`<span style="font-size:13px;color:#71717a;">Automated message from ${escapeHtml(companyName)}.</span>`),
  ].join("");

  const scoreText = showScore && percentage != null
    ? `\nScore: ${Math.round(percentage)}% (${passed ? "Passed" : "Did not pass"})`
    : "\nYour responses are being reviewed. You will be contacted with the results.";

  return {
    subject: `Assessment Completed: ${assessmentTitle}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Hello ${candidateName},`,
      "",
      `Thank you for completing ${assessmentTitle}.`,
      `Completed: ${completedDate}${scoreText}`,
      "",
      `Automated message from ${companyName}.`,
    ].join("\n"),
  };
}

export function buildAssessmentCompletionHrEmail(
  branding: EmailBranding,
  params: {
    candidateName: string;
    candidateEmail: string;
    assessmentTitle: string;
    completedAt: string;
    percentage?: number | null;
    passed?: boolean | null;
    candidateProfileUrl?: string | null;
  },
): EmailContent {
  const { primaryColor } = branding;
  const { candidateName, candidateEmail, assessmentTitle, completedAt, percentage, passed, candidateProfileUrl } = params;

  const completedDate = new Date(completedAt).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const scoreLine = percentage != null
    ? emailParagraph(
      `<strong>Score:</strong> ${Math.round(percentage)}% (${passed ? "Passed" : "Did not pass"})`,
    )
    : "";

  const bodyHtml = [
    emailHeading("Assessment Completed"),
    emailParagraph(
      `${linkedCandidateName(candidateName, candidateProfileUrl, primaryColor)} completed <strong>${escapeHtml(assessmentTitle)}</strong>.`,
    ),
    emailParagraph(`<strong>Email:</strong> ${escapeHtml(candidateEmail)}`),
    emailParagraph(`<strong>Completed:</strong> ${escapeHtml(completedDate)}`),
    scoreLine,
  ].join("");

  const scoreText = percentage != null
    ? `\nScore: ${Math.round(percentage)}% (${passed ? "Passed" : "Did not pass"})`
    : "";

  return {
    subject: `[Assessment Completed] ${candidateName} - ${assessmentTitle}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `${candidateName} completed ${assessmentTitle}.`,
      `Email: ${candidateEmail}`,
      `Completed: ${completedDate}${scoreText}`,
    ].join("\n"),
  };
}

export function buildStaffAssessmentCompletedEmail(
  branding: EmailBranding,
  params: {
    candidateName: string;
    assessmentTitle: string;
    passedLabel: string;
    scorePart: string;
    viewUrl: string;
    candidateProfileUrl?: string | null;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const { candidateName, assessmentTitle, passedLabel, scorePart, viewUrl, candidateProfileUrl } = params;

  const bodyHtml = [
    emailHeading("Assessment Completed"),
    emailParagraph(
      `${linkedCandidateName(candidateName, candidateProfileUrl, primaryColor)} completed <strong>${escapeHtml(assessmentTitle)}</strong>.`,
    ),
    emailParagraph(`Result: ${escapeHtml(passedLabel)}${escapeHtml(scorePart)}`),
    emailCtaButton("View in Evaluations", viewUrl, primaryColor),
    emailSignOff(companyName),
  ].join("");

  return {
    subject: `${candidateName} completed ${assessmentTitle}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `${candidateName} completed ${assessmentTitle}.`,
      `Result: ${passedLabel}${scorePart}`,
      "",
      `View in Evaluations: ${viewUrl}`,
      "",
      `— ${companyName} Hiring Team`,
    ].join("\n"),
  };
}

export interface DigestInterviewItem {
  candidateName: string;
  jobTitle: string;
  stageName: string;
  scheduledDisplay: string;
  modeLabel: string;
  meetingLink?: string | null;
  candidateProfileUrl?: string | null;
}

export function buildInterviewerDailyDigestEmail(
  branding: EmailBranding,
  params: {
    recipientName: string;
    dateDisplay: string;
    interviews: DigestInterviewItem[];
    calendarUrl: string;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const { recipientName, dateDisplay, interviews, calendarUrl } = params;
  const count = interviews.length;

  const interviewBlocks = interviews.map((iv) => {
    const meetingLine = iv.meetingLink
      ? `<p style="margin:8px 0 0 0;color:#52525b;font-size:14px;"><strong>Meeting link:</strong> <a href="${escapeHtml(iv.meetingLink)}" style="color:${primaryColor};">${escapeHtml(iv.meetingLink)}</a></p>`
      : "";
    return emailInfoBox(
      `<p style="margin:0 0 8px 0;color:#18181b;font-size:15px;font-weight:600;">${linkedCandidateName(iv.candidateName, iv.candidateProfileUrl, primaryColor)} — ${escapeHtml(iv.jobTitle)}</p>
       <p style="margin:0 0 4px 0;color:#52525b;font-size:14px;"><strong>Stage:</strong> ${escapeHtml(iv.stageName)}</p>
       <p style="margin:0 0 4px 0;color:#52525b;font-size:14px;"><strong>When:</strong> ${escapeHtml(iv.scheduledDisplay)}</p>
       <p style="margin:0;color:#52525b;font-size:14px;"><strong>Mode:</strong> ${escapeHtml(iv.modeLabel)}</p>
       ${meetingLine}`,
      primaryColor,
    );
  }).join("");

  const bodyHtml = [
    emailHeading("Today's Interviews"),
    emailParagraph(`Hi ${escapeHtml(recipientName)},`),
    emailParagraph(
      `You have <strong>${count}</strong> interview${count !== 1 ? "s" : ""} scheduled for <strong>${escapeHtml(dateDisplay)}</strong>.`,
    ),
    interviewBlocks,
    emailCtaButton("Open Calendar", calendarUrl, primaryColor),
    emailLinkFallback(calendarUrl),
    emailSignOff(companyName),
  ].join("");

  const textLines = interviews.flatMap((iv) => [
    `• ${iv.candidateName} — ${iv.jobTitle}`,
    `  Stage: ${iv.stageName}`,
    `  When: ${iv.scheduledDisplay}`,
    `  Mode: ${iv.modeLabel}`,
    iv.meetingLink ? `  Meeting link: ${iv.meetingLink}` : "",
    "",
  ]).filter(Boolean);

  return {
    subject: `Today's interviews (${count}) — ${dateDisplay}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Hi ${recipientName},`,
      "",
      `You have ${count} interview${count !== 1 ? "s" : ""} scheduled for ${dateDisplay}.`,
      "",
      ...textLines,
      `Open calendar: ${calendarUrl}`,
      "",
      `— ${companyName} Hiring Team`,
    ].join("\n"),
  };
}

export function buildInterviewScheduledEmail(
  branding: EmailBranding,
  params: {
    recipientName: string;
    candidateName: string;
    jobTitle: string;
    stageName: string;
    scheduledDisplay: string;
    modeLabel: string;
    meetingLink?: string | null;
    candidateProfileUrl?: string | null;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const {
    recipientName,
    candidateName,
    jobTitle,
    stageName,
    scheduledDisplay,
    modeLabel,
    meetingLink,
    candidateProfileUrl,
  } = params;

  const meetingBlock = meetingLink
    ? `<p style="margin:12px 0 0 0;color:#52525b;font-size:15px;line-height:1.6;"><strong>Meeting link:</strong> <a href="${escapeHtml(meetingLink)}" style="color:${primaryColor};">${escapeHtml(meetingLink)}</a></p>`
    : "";

  const profileCta = candidateProfileUrl
    ? emailCtaButton("View Candidate Profile", candidateProfileUrl, primaryColor)
    : "";

  const bodyHtml = [
    emailHeading("Interview Scheduled"),
    emailParagraph(`Hi ${escapeHtml(recipientName)},`),
    emailParagraph(
      `You have been assigned to interview ${linkedCandidateName(candidateName, candidateProfileUrl, primaryColor)} for <strong>${escapeHtml(jobTitle)}</strong>.`,
    ),
    emailInfoBox(
      `<p style="margin:0 0 8px 0;color:#52525b;font-size:15px;"><strong>Stage:</strong> ${escapeHtml(stageName)}</p>
       <p style="margin:0 0 8px 0;color:#52525b;font-size:15px;"><strong>When:</strong> ${escapeHtml(scheduledDisplay)}</p>
       <p style="margin:0;color:#52525b;font-size:15px;"><strong>Mode:</strong> ${escapeHtml(modeLabel)}</p>
       ${meetingBlock}`,
      primaryColor,
    ),
    profileCta,
    emailParagraph(`View your calendar in ${escapeHtml(companyName)} for full details.`),
    emailSignOff(companyName),
  ].join("");

  return {
    subject: `Interview scheduled: ${candidateName} — ${jobTitle}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Hi ${recipientName},`,
      "",
      `You have been assigned to interview ${candidateName} for ${jobTitle}.`,
      "",
      `Stage: ${stageName}`,
      `When: ${scheduledDisplay}`,
      `Mode: ${modeLabel}`,
      meetingLink ? `Meeting link: ${meetingLink}` : "",
      candidateProfileUrl ? `\nView candidate profile: ${candidateProfileUrl}` : "",
      "",
      `View your calendar in ${companyName} for full details.`,
      "",
      `— ${companyName} Hiring Team`,
    ].filter(Boolean).join("\n"),
  };
}

export function buildCandidateHiredStaffEmail(
  branding: EmailBranding,
  params: {
    recipientName: string;
    candidateName: string;
    jobTitle: string;
    hiredAt: string;
    candidateProfileUrl: string;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const { recipientName, candidateName, jobTitle, hiredAt, candidateProfileUrl } = params;
  const hiredDisplay = new Date(hiredAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " IST";

  const bodyHtml = [
    emailHeading("Candidate Hired"),
    emailParagraph(`Hi ${escapeHtml(recipientName)},`),
    emailParagraph(
      `${linkedCandidateName(candidateName, candidateProfileUrl, primaryColor)} has been marked as <strong>hired</strong> for <strong>${escapeHtml(jobTitle)}</strong>.`,
    ),
    emailInfoBox(
      `<p style="margin:0;color:#52525b;font-size:15px;"><strong>Hired on:</strong> ${escapeHtml(hiredDisplay)}</p>`,
      primaryColor,
    ),
    emailCtaButton("View Candidate", candidateProfileUrl, primaryColor),
    emailSignOff(companyName),
  ].join("");

  return {
    subject: `Candidate hired: ${candidateName} — ${jobTitle}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Hi ${recipientName},`,
      "",
      `${candidateName} has been marked as hired for ${jobTitle}.`,
      `Hired on: ${hiredDisplay}`,
      "",
      `View candidate: ${candidateProfileUrl}`,
      "",
      `— ${companyName} Hiring Team`,
    ].join("\n"),
  };
}

export function buildCandidateHiredApplicantEmail(
  branding: EmailBranding,
  params: {
    applicantName: string;
    jobTitle: string;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const { applicantName, jobTitle } = params;
  const safeJob = escapeHtml(jobTitle);
  const safeCompany = escapeHtml(companyName);

  const bodyHtml = [
    emailHeading("Congratulations!"),
    emailParagraph(`Dear ${escapeHtml(applicantName)},`),
    emailParagraph(
      `We are pleased to inform you that you have been <strong>selected</strong> for <strong>${safeJob}</strong> at ${safeCompany}.`,
    ),
    emailParagraph(
      "Our team will reach out shortly with the next steps, which may include documentation collection, background verification, and pre-onboarding activities before a formal offer letter is issued.",
    ),
    emailParagraph("Please keep an eye on your email and respond promptly to any requests from our HR team."),
    emailSignOff(companyName),
  ].join("");

  return {
    subject: `Next steps for your role at ${companyName} — ${jobTitle}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Dear ${applicantName},`,
      "",
      `We are pleased to inform you that you have been selected for ${jobTitle} at ${companyName}.`,
      "",
      "Our team will reach out shortly with the next steps, which may include documentation collection, background verification, and pre-onboarding activities before a formal offer letter is issued.",
      "",
      "Please keep an eye on your email and respond promptly to any requests from our HR team.",
      "",
      `Best regards,\nThe ${companyName} Hiring Team`,
    ].join("\n"),
  };
}

export function buildChitraWarningEmail(
  branding: EmailBranding,
  params: {
    recipientName: string;
    title: string;
    message: string;
    viewUrl: string;
    candidateName?: string;
    candidateProfileUrl?: string;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const { recipientName, title, message, viewUrl, candidateName, candidateProfileUrl } = params;

  const bodyHtml = [
    emailHeading("Formal Warning"),
    emailParagraph(`Hi ${escapeHtml(recipientName)},`),
    emailParagraph(`<strong>${escapeHtml(title)}</strong>`),
    emailInfoBox(messageWithLinkedCandidate(message, candidateName, candidateProfileUrl, primaryColor), "#ea580c"),
    emailCtaButton("View Details", viewUrl, primaryColor),
    emailLinkFallback(viewUrl),
    emailParagraph(
      `<span style="font-size:13px;color:#71717a;">This is a formal escalation from Chitragupta, your AI HR assistant at ${escapeHtml(companyName)}.</span>`,
    ),
  ].join("");

  return {
    subject: `[Action Required] ${title}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Hi ${recipientName},`,
      "",
      title,
      "",
      message,
      "",
      `View details: ${viewUrl}`,
      "",
      `Formal escalation from Chitragupta at ${companyName}.`,
    ].join("\n"),
  };
}

export function buildChitraPraiseEmail(
  branding: EmailBranding,
  params: {
    recipientName: string;
    title: string;
    message: string;
    viewUrl: string;
    candidateName?: string;
    candidateProfileUrl?: string;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const { recipientName, title, message, viewUrl, candidateName, candidateProfileUrl } = params;

  const bodyHtml = [
    emailHeadingWithIcon("Recognition", "&#127881;"),
    emailParagraph(`Hi ${escapeHtml(recipientName)},`),
    emailParagraph(
      `Chitragupta spotted something worth celebrating — <strong>${escapeHtml(title)}</strong>`,
    ),
    emailInfoBox(
      `<p style="margin:0;color:#047857;font-size:15px;line-height:1.6;">${messageWithLinkedCandidate(message, candidateName, candidateProfileUrl, primaryColor)}</p>`,
      "#059669",
    ),
    emailCtaButton("View in Pipeline", viewUrl, primaryColor),
    emailLinkFallback(viewUrl),
    emailParagraph(
      `<span style="font-size:13px;color:#71717a;">Keep up the great work! Sent by Chitragupta, your AI HR assistant at ${escapeHtml(companyName)}.</span>`,
    ),
  ].join("");

  return {
    subject: `Recognition: ${title}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Hi ${recipientName},`,
      "",
      `Chitragupta spotted something worth celebrating — ${title}`,
      "",
      message,
      "",
      `View in pipeline: ${viewUrl}`,
      "",
      `From Chitragupta at ${companyName}.`,
    ].join("\n"),
  };
}

export function buildChitraDailyReportEmail(
  branding: EmailBranding,
  params: {
    recipientName: string;
    title: string;
    message: string;
    viewUrl: string;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const { recipientName, title, message, viewUrl } = params;

  const bodyHtml = [
    emailHeading("Daily Executive Brief"),
    emailParagraph(`Hi ${escapeHtml(recipientName)},`),
    emailParagraph(`<strong>${escapeHtml(title)}</strong>`),
    emailInfoBox(escapeHtml(message), primaryColor),
    emailCtaButton("Open Dashboard", viewUrl, primaryColor),
    emailLinkFallback(viewUrl),
    emailParagraph(
      `<span style="font-size:13px;color:#71717a;">Daily brief from Chitragupta at ${escapeHtml(companyName)}.</span>`,
    ),
  ].join("");

  return {
    subject: `Daily brief: ${title}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Hi ${recipientName},`,
      "",
      title,
      "",
      message,
      "",
      `Open dashboard: ${viewUrl}`,
      "",
      `Daily brief from Chitragupta at ${companyName}.`,
    ].join("\n"),
  };
}

export function buildChitraWeeklyReportEmail(
  branding: EmailBranding,
  params: {
    recipientName: string;
    title: string;
    message: string;
    viewUrl: string;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const { recipientName, title, message, viewUrl } = params;

  const bodyHtml = [
    emailHeading("Weekly Pipeline Report"),
    emailParagraph(`Hi ${escapeHtml(recipientName)},`),
    emailParagraph(`<strong>${escapeHtml(title)}</strong>`),
    emailInfoBox(escapeHtml(message), primaryColor),
    emailCtaButton("View Analytics", viewUrl, primaryColor),
    emailLinkFallback(viewUrl),
    emailParagraph(
      `<span style="font-size:13px;color:#71717a;">Weekly report from Chitragupta at ${escapeHtml(companyName)}.</span>`,
    ),
  ].join("");

  return {
    subject: `Weekly report: ${title}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Hi ${recipientName},`,
      "",
      title,
      "",
      message,
      "",
      `View analytics: ${viewUrl}`,
      "",
      `Weekly report from Chitragupta at ${companyName}.`,
    ].join("\n"),
  };
}

export function buildVerdictSubmittedEmail(
  branding: EmailBranding,
  params: {
    recipientName: string;
    candidateName: string;
    jobTitle: string;
    stageName: string;
    verdictLabel: string;
    candidateProfileUrl?: string | null;
  },
): EmailContent {
  const { companyName, primaryColor } = branding;
  const { recipientName, candidateName, jobTitle, stageName, verdictLabel, candidateProfileUrl } = params;

  const profileCta = candidateProfileUrl
    ? emailCtaButton("View Candidate", candidateProfileUrl, primaryColor)
    : "";

  const bodyHtml = [
    emailHeading("Interview Feedback Submitted"),
    emailParagraph(`Hi ${escapeHtml(recipientName)},`),
    emailParagraph(
      `Interview feedback was submitted for ${linkedCandidateName(candidateName, candidateProfileUrl, primaryColor)} (${escapeHtml(jobTitle)}).`,
    ),
    emailInfoBox(
      `<p style="margin:0 0 8px 0;color:#52525b;font-size:15px;"><strong>Stage:</strong> ${escapeHtml(stageName)}</p>
       <p style="margin:0;color:#52525b;font-size:15px;"><strong>Verdict:</strong> ${escapeHtml(verdictLabel)}</p>`,
      "#059669",
    ),
    profileCta,
    emailParagraph("Review the pipeline for next steps."),
    emailSignOff(companyName),
  ].join("");

  return {
    subject: `Feedback submitted: ${candidateName} — ${verdictLabel}`,
    html: wrapEmailLayout(branding, bodyHtml),
    text: [
      `Hi ${recipientName},`,
      "",
      `Interview feedback was submitted for ${candidateName} (${jobTitle}).`,
      "",
      `Stage: ${stageName}`,
      `Verdict: ${verdictLabel}`,
      candidateProfileUrl ? `\nView candidate: ${candidateProfileUrl}` : "",
      "",
      "Review the pipeline for next steps.",
      "",
      `— ${companyName} Hiring Team`,
    ].join("\n"),
  };
}
