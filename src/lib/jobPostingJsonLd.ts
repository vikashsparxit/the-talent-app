export interface JobPostingInput {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  jobType?: string | null;
  datePosted?: string | null;
  validThrough?: string | null;
  companyName: string;
  companyUrl?: string | null;
  jobUrl: string;
  addressCountry?: string;
}

const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
  freelance: 'OTHER',
};

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function employmentTypeForJob(jobType?: string | null): string {
  if (!jobType) return 'FULL_TIME';
  return EMPLOYMENT_TYPE[jobType] ?? 'OTHER';
}

export function buildJobPostingJsonLd(input: JobPostingInput): Record<string, unknown> {
  const description = stripHtml(input.description ?? '').slice(0, 8000) || input.title;
  const locality = input.location?.trim() || undefined;

  const posting: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: input.title,
    description,
    datePosted: input.datePosted ?? new Date().toISOString(),
    hiringOrganization: {
      '@type': 'Organization',
      name: input.companyName,
      ...(input.companyUrl ? { sameAs: input.companyUrl } : {}),
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(locality ? { addressLocality: locality } : {}),
        addressCountry: input.addressCountry ?? 'IN',
      },
    },
    employmentType: employmentTypeForJob(input.jobType),
    url: input.jobUrl,
    identifier: {
      '@type': 'PropertyValue',
      name: input.companyName,
      value: input.id,
    },
  };

  if (input.validThrough) {
    posting.validThrough = input.validThrough;
  }

  return posting;
}

export function jobPostingJsonLdScript(input: JobPostingInput): string {
  return JSON.stringify(buildJobPostingJsonLd(input));
}
