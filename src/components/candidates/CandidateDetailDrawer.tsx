import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Mail,
  Phone,
  Linkedin,
  Briefcase,
  Building2,
  Clock,
  FileText,
  MapPin,
  IndianRupee,
  MessageSquare,
  GraduationCap,
  Star,
  Calendar,
  Loader2,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Award,
  ShieldCheck,
  ThumbsUp,
  ThumbsDown,
  Pause,
  UserX,
  Video,
  PhoneCall,
  Users,
  ClipboardEdit,
  Crown,
  Pencil,
  Paperclip,
  Link2,
  LinkIcon,
  ExternalLink,
  NotebookPen,
  HelpCircle,
  X,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateTimeInTz } from '@/lib/formatTz';
import { InterviewFeedbackDialog } from '@/components/pipeline/InterviewFeedbackDialog';
import { useInterviewKit } from '@/hooks/useInterviewKit';
import { isPastInterview } from '@/lib/interviewKit';
import type { InterviewVerdict, InterviewMode, RatingCategories, InterviewArtifact } from '@/hooks/useInterviewPipeline';
import { usePreScreen, type AcademicRecord } from '@/hooks/usePreScreen';
import { useCandidateCoverLetter } from '@/hooks/useCandidates';
import { JobApplicationFormSection } from '@/components/candidates/JobApplicationFormSection';
import { JobDetailsEmailSection } from '@/components/candidates/JobDetailsEmailSection';
import { JobApplicationFormDialog } from '@/components/candidates/JobApplicationFormDialog';
import { AssessmentSection } from '@/components/candidates/AssessmentSection';
import { AssignAssessmentDialog } from '@/components/candidates/AssignAssessmentDialog';
import { useJobAssessmentConfig } from '@/hooks/useJobAssessment';
import type { Candidate, StructuredSkill } from '@/types/database';
import { format, isValid, differenceInDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useIsSmDown } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { getDevGeminiKeyBody } from '@/lib/devGemini';
import { openResumeUrl } from '@/lib/resumeStorage';
import { notifyStaffEmail } from '@/lib/staffEmail';
import { buildInterviewHistoryRounds, interviewStageDisplayName, type InterviewHistoryEntry } from '@/lib/interviewHistory';
import { filterStaleLinkedInRedFlags, resolveLinkedInProfileUrl } from '@/lib/applicantProfile';
import { Link } from 'react-router';

type DrawerContext = 'database' | 'application';

interface PipelineEnrollment {
  jobId: string;
  jobTitle: string;
  stageName: string;
}

interface CandidateDetailDrawerProps {
  candidate: Candidate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrich?: (id: string) => void;
  isEnriching?: boolean;
  isInterviewerOnly?: boolean;
  onAddFeedback?: (candidateId: string) => void;
  /** Extra classes on the sheet panel (e.g. stacked offset beside another drawer). */
  sheetClassName?: string;
  /** Tailwind right-offset class for Interview Notes panel (aligns with sheet left edge). */
  notesStackOffset?: string;
  /** Use a parent-managed backdrop instead of this sheet's overlay. */
  hideOverlay?: boolean;
  /** Opens the interview kit drawer for the given interview (e.g. My Interviews stacked KitDrawer). */
  onViewQuestionKit?: (interviewId: string) => void;
  /** When set and matches the relevant interview, hides View Question Kit (kit already open). */
  kitVisibleInterviewId?: string | null;
  /** Sticky Questions/Profile switcher for mobile interview prep (My Interviews). */
  mobilePrepSwitcher?: ReactNode;
  /** Hide the default sheet close button (mobile prep uses switcher close). */
  hideCloseButton?: boolean;
  /** When opened from a specific interview row (e.g. My Interviews), use this for notes/kit context. */
  contextInterviewId?: string | null;
  /** Talent Database shows person-centric profile; application/pipeline shows job context. */
  drawerContext?: DrawerContext;
  onAddToJob?: (candidate: Candidate) => void;
  onEdit?: (candidate: Candidate) => void;
}


const academicLabels: Record<string, string> = {
  '10th': '10th Standard',
  '12th': '12th Standard',
  graduation: 'Graduation',
  post_graduation: 'Post Graduation',
};

const proficiencyColors: Record<string, string> = {
  expert: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
  intermediate: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  beginner: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

const categoryLabels: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  devops: 'DevOps',
  cloud: 'Cloud',
  mobile: 'Mobile',
  design: 'Design',
  testing: 'Testing',
  data_science: 'Data Science',
  ai_ml: 'AI/ML',
  security: 'Security',
  project_management: 'PM',
  soft_skills: 'Soft Skills',
  other: 'Other',
};

function ScoreRingSmall({ value, label }: { value: number | null; label: string }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  if (value == null) {
    return (
      <div className="flex shrink-0 snap-start flex-col items-center gap-1">
        <div className="relative h-16 w-16">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-muted-foreground">—</span>
        </div>
        <span className="whitespace-nowrap text-xs text-muted-foreground">{label}</span>
      </div>
    );
  }
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 80 ? 'text-green-500' : value >= 50 ? 'text-yellow-500' : 'text-destructive';

  return (
    <div className="flex shrink-0 snap-start flex-col items-center gap-1">
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
          <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={color} />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${color}`}>{value}%</span>
      </div>
      <span className="whitespace-nowrap text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function CommsRatingBadge({ rating }: { rating: number }) {
  const color =
    rating >= 8
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200'
      : rating >= 6
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200';

  const label = rating >= 8 ? 'Excellent' : rating >= 6 ? 'Good' : rating >= 4 ? 'Average' : 'Below Average';

  return (
    <div className={`inline-flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg border ${color}`}>
      <Star className="h-4 w-4 fill-current" />
      <span className="text-lg font-bold">{rating}</span>
      <span className="text-xs opacity-70">/10</span>
      <span className="text-xs ml-1">• {label}</span>
    </div>
  );
}

// Skill domain aliases — maps a broad JD term to the concrete skills that prove it
const SKILL_ALIASES: Record<string, string[]> = {
  // ── Data & Analytics ──────────────────────────────────────────────────────
  'data engineering': ['etl', 'elt', 'spark', 'apache spark', 'databricks', 'airflow', 'data pipeline', 'data pipelines', 'kafka', 'flink', 'apache flink', 'beam', 'apache beam', 'data warehouse', 'data lake', 'data lakehouse', 'dbt', 'nifi', 'apache nifi', 'glue', 'aws glue', 'dataflow', 'google dataflow', 'prefect', 'luigi', 'hive', 'hadoop', 'hdfs', 'sqoop', 'flume', 'data integration', 'informatica', 'talend', 'ssis', 'pentaho', 'stitch', 'fivetran'],
  'data science': ['python', 'pandas', 'numpy', 'jupyter', 'statistics', 'statistical analysis', 'data analysis', 'r programming', 'matplotlib', 'seaborn', 'scipy', 'machine learning', 'ml', 'predictive modeling', 'exploratory data analysis', 'eda', 'hypothesis testing', 'a/b testing'],
  'machine learning': ['ml', 'scikit-learn', 'sklearn', 'tensorflow', 'pytorch', 'keras', 'xgboost', 'lightgbm', 'catboost', 'deep learning', 'neural networks', 'model training', 'feature engineering', 'mlflow', 'model deployment', 'nlp', 'computer vision', 'reinforcement learning', 'transformers', 'llm', 'generative ai', 'hugging face'],
  'artificial intelligence': ['ai', 'machine learning', 'ml', 'deep learning', 'nlp', 'natural language processing', 'computer vision', 'llm', 'generative ai', 'openai', 'langchain', 'rag', 'prompt engineering'],
  'business intelligence': ['bi', 'tableau', 'power bi', 'looker', 'qlik', 'metabase', 'superset', 'data visualization', 'reporting', 'dashboards', 'ssrs', 'cognos', 'microstrategy', 'domo'],
  'big data': ['hadoop', 'spark', 'hive', 'hbase', 'kafka', 'flink', 'hdfs', 'yarn', 'mapreduce', 'presto', 'trino', 'databricks', 'emr', 'dataproc'],
  'data analytics': ['sql', 'python', 'r', 'tableau', 'power bi', 'excel', 'data analysis', 'data visualization', 'google analytics', 'mixpanel', 'amplitude', 'looker', 'statistics'],
  'data modeling': ['er modeling', 'dimensional modeling', 'star schema', 'snowflake schema', 'data vault', 'dbt', 'normalization', 'entity relationship', 'uml'],
  'data governance': ['data quality', 'data catalog', 'data lineage', 'metadata management', 'master data management', 'mdm', 'collibra', 'alation', 'atlas', 'data stewardship'],

  // ── Software Engineering ───────────────────────────────────────────────────
  'frontend development': ['react', 'vue', 'vue.js', 'angular', 'javascript', 'typescript', 'html', 'css', 'next.js', 'nuxt', 'svelte', 'jquery', 'webpack', 'vite', 'tailwind', 'bootstrap', 'sass', 'scss', 'web development', 'ui development'],
  'backend development': ['node.js', 'python', 'java', 'go', 'golang', 'rust', 'c#', '.net', 'php', 'ruby', 'scala', 'django', 'fastapi', 'flask', 'spring', 'spring boot', 'express', 'rest api', 'graphql', 'microservices', 'api development', 'laravel', 'rails', 'ruby on rails'],
  'full stack development': ['react', 'node.js', 'javascript', 'typescript', 'python', 'java', 'html', 'css', 'rest api', 'sql', 'mongodb', 'full stack', 'mern', 'mean', 'lamp'],
  'software development': ['programming', 'coding', 'software engineering', 'oop', 'object oriented', 'design patterns', 'clean code', 'solid principles', 'algorithms', 'data structures'],
  'api development': ['rest', 'restful', 'graphql', 'grpc', 'soap', 'openapi', 'swagger', 'api design', 'postman', 'api gateway', 'webhook'],
  'microservices': ['docker', 'kubernetes', 'service mesh', 'istio', 'api gateway', 'event driven', 'message queue', 'rabbitmq', 'kafka', 'grpc', 'rest api'],

  // ── Mobile ─────────────────────────────────────────────────────────────────
  'mobile development': ['ios', 'android', 'react native', 'flutter', 'swift', 'kotlin', 'objective-c', 'java', 'xamarin', 'ionic', 'cordova', 'mobile app', 'xcode', 'android studio'],
  'ios development': ['swift', 'objective-c', 'xcode', 'swiftui', 'uikit', 'cocoa', 'ios', 'apple', 'app store', 'core data', 'combine'],
  'android development': ['kotlin', 'java', 'android studio', 'android sdk', 'jetpack compose', 'android', 'gradle', 'play store', 'room', 'retrofit'],
  'cross platform development': ['react native', 'flutter', 'xamarin', 'ionic', 'cordova', 'capacitor', 'expo'],

  // ── Infrastructure & Cloud ─────────────────────────────────────────────────
  'cloud computing': ['aws', 'azure', 'gcp', 'google cloud', 'ec2', 's3', 'lambda', 'cloud functions', 'cloud run', 'kubernetes', 'terraform', 'cloudformation', 'cloud architecture', 'serverless', 'iaas', 'paas', 'saas'],
  'aws': ['ec2', 's3', 'lambda', 'rds', 'dynamodb', 'sqs', 'sns', 'cloudformation', 'ecs', 'eks', 'cloudwatch', 'iam', 'vpc', 'route53', 'cloudfront', 'redshift', 'glue', 'emr', 'sagemaker'],
  'azure': ['azure functions', 'azure devops', 'azure ad', 'aks', 'cosmos db', 'azure sql', 'blob storage', 'service bus', 'azure monitor', 'arm templates', 'bicep'],
  'gcp': ['google cloud', 'gke', 'bigquery', 'cloud run', 'cloud functions', 'pub/sub', 'dataflow', 'firestore', 'cloud storage', 'vertex ai', 'dataproc'],
  'devops': ['ci/cd', 'jenkins', 'github actions', 'gitlab ci', 'circleci', 'travis ci', 'docker', 'kubernetes', 'terraform', 'ansible', 'puppet', 'chef', 'helm', 'argocd', 'flux', 'spinnaker', 'infrastructure as code', 'iac'],
  'site reliability engineering': ['sre', 'observability', 'monitoring', 'prometheus', 'grafana', 'elk', 'elasticsearch', 'kibana', 'datadog', 'new relic', 'pagerduty', 'incident management', 'slo', 'sla', 'toil reduction'],
  'infrastructure': ['linux', 'networking', 'tcp/ip', 'dns', 'load balancing', 'nginx', 'apache', 'firewall', 'vpn', 'virtualization', 'vmware', 'hyper-v', 'terraform', 'ansible'],
  'networking': ['tcp/ip', 'dns', 'dhcp', 'routing', 'switching', 'bgp', 'ospf', 'vpn', 'firewall', 'load balancer', 'cisco', 'juniper', 'network security', 'sd-wan'],
  'linux administration': ['linux', 'bash', 'shell scripting', 'ubuntu', 'centos', 'rhel', 'debian', 'unix', 'systemd', 'cron', 'ssh', 'vim', 'grep', 'awk', 'sed'],
  'containerization': ['docker', 'kubernetes', 'k8s', 'helm', 'podman', 'containerd', 'docker compose', 'openshift', 'rancher'],

  // ── Database ───────────────────────────────────────────────────────────────
  'database administration': ['sql', 'postgresql', 'mysql', 'oracle', 'sql server', 'mssql', 'dba', 'database tuning', 'indexing', 'query optimization', 'backup', 'recovery', 'replication'],
  'database': ['sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'cassandra', 'dynamodb', 'snowflake', 'bigquery', 'redshift', 'oracle', 'sql server', 'sqlite', 'elasticsearch', 'neo4j', 'couchdb'],
  'nosql': ['mongodb', 'cassandra', 'dynamodb', 'redis', 'couchdb', 'hbase', 'neo4j', 'elasticsearch', 'firebase', 'firestore', 'cosmos db'],

  // ── Security ───────────────────────────────────────────────────────────────
  'cybersecurity': ['security', 'penetration testing', 'pen testing', 'ethical hacking', 'owasp', 'vulnerability assessment', 'siem', 'soc', 'incident response', 'threat modeling', 'cryptography', 'network security', 'application security', 'appsec'],
  'application security': ['appsec', 'owasp', 'sast', 'dast', 'code review', 'vulnerability scanning', 'penetration testing', 'secure coding', 'threat modeling', 'burp suite', 'sonarqube'],
  'information security': ['iso 27001', 'soc 2', 'gdpr', 'compliance', 'risk assessment', 'security policies', 'access control', 'iam', 'siem', 'dlp', 'endpoint security'],
  'identity and access management': ['iam', 'sso', 'saml', 'oauth', 'oidc', 'active directory', 'ldap', 'okta', 'azure ad', 'keycloak', 'privileged access management', 'pam'],

  // ── Quality & Testing ──────────────────────────────────────────────────────
  'software testing': ['qa', 'quality assurance', 'manual testing', 'automated testing', 'unit testing', 'integration testing', 'regression testing', 'selenium', 'cypress', 'playwright', 'jest', 'pytest', 'junit', 'testng', 'tdd', 'bdd', 'cucumber', 'appium', 'jmeter', 'load testing'],
  'quality assurance': ['qa', 'testing', 'manual testing', 'test cases', 'bug reporting', 'test plans', 'selenium', 'automation testing', 'regression', 'user acceptance testing', 'uat'],
  'test automation': ['selenium', 'cypress', 'playwright', 'appium', 'robot framework', 'pytest', 'jest', 'junit', 'testng', 'cucumber', 'bdd', 'tdd', 'ci/cd', 'github actions'],
  'performance testing': ['jmeter', 'k6', 'gatling', 'locust', 'load testing', 'stress testing', 'performance engineering', 'new relic', 'dynatrace'],

  // ── Architecture & Design ──────────────────────────────────────────────────
  'software architecture': ['system design', 'microservices', 'monolith', 'event driven', 'domain driven design', 'ddd', 'cqrs', 'event sourcing', 'hexagonal architecture', 'clean architecture', 'solid', 'design patterns'],
  'solution architecture': ['aws', 'azure', 'gcp', 'system design', 'enterprise architecture', 'integration', 'api design', 'cloud architecture', 'technical leadership'],
  'enterprise architecture': ['togaf', 'zachman', 'ea', 'business architecture', 'it strategy', 'roadmap', 'governance', 'soa', 'integration patterns'],
  'ui/ux design': ['figma', 'sketch', 'adobe xd', 'invision', 'user research', 'wireframing', 'prototyping', 'usability testing', 'information architecture', 'interaction design', 'user experience', 'user interface', 'design systems'],

  // ── Project & Product Management ───────────────────────────────────────────
  'project management': ['agile', 'scrum', 'kanban', 'jira', 'sprint planning', 'pmp', 'prince2', 'waterfall', 'stakeholder management', 'risk management', 'ms project', 'confluence', 'trello', 'asana'],
  'product management': ['product roadmap', 'backlog', 'user stories', 'okrs', 'kpis', 'product strategy', 'go to market', 'market research', 'competitive analysis', 'a/b testing', 'product analytics', 'jira', 'confluence'],
  'scrum master': ['scrum', 'agile', 'sprint', 'retrospective', 'daily standup', 'backlog refinement', 'velocity', 'burndown', 'jira', 'confluence', 'safe', 'certified scrum master', 'csm'],
  'business analysis': ['requirements gathering', 'brd', 'frd', 'use cases', 'process mapping', 'bpmn', 'stakeholder management', 'gap analysis', 'wireframes', 'jira', 'confluence', 'visio'],

  // ── ERP / CRM / Enterprise ─────────────────────────────────────────────────
  'sap': ['sap abap', 'sap hana', 'sap s/4hana', 'sap fiori', 'sap basis', 'sap mm', 'sap sd', 'sap fi', 'sap co', 'sap hr', 'sap wm', 'sap pp', 'sap crm', 'sap bw'],
  'salesforce': ['salesforce crm', 'apex', 'visualforce', 'lightning', 'soql', 'salesforce admin', 'salesforce developer', 'pardot', 'marketing cloud', 'service cloud', 'sales cloud'],
  'erp': ['sap', 'oracle erp', 'microsoft dynamics', 'netsuite', 'odoo', 'sage', 'epicor', 'infor'],
  'crm': ['salesforce', 'hubspot', 'microsoft dynamics crm', 'zoho', 'freshsales', 'pipedrive', 'customer relationship management'],

  // ── Embedded & Hardware ────────────────────────────────────────────────────
  'embedded systems': ['c', 'c++', 'rtos', 'firmware', 'microcontroller', 'arduino', 'raspberry pi', 'arm', 'fpga', 'vhdl', 'verilog', 'embedded linux', 'bare metal', 'uart', 'spi', 'i2c', 'can bus'],
  'iot': ['mqtt', 'embedded systems', 'arduino', 'raspberry pi', 'sensors', 'iot platforms', 'aws iot', 'azure iot', 'edge computing', 'protocol', 'zigbee', 'bluetooth le', 'lorawan'],

  // ── Blockchain & Web3 ──────────────────────────────────────────────────────
  'blockchain': ['solidity', 'ethereum', 'web3', 'smart contracts', 'defi', 'nft', 'hyperledger', 'bitcoin', 'polygon', 'hardhat', 'truffle', 'ethers.js', 'web3.js'],

  // ── Game Development ───────────────────────────────────────────────────────
  'game development': ['unity', 'unreal engine', 'c#', 'c++', 'game design', 'opengl', 'directx', 'vulkan', 'blender', '3d modeling', 'shader', 'physics engine'],

  // ── Support & Operations ───────────────────────────────────────────────────
  'technical support': ['helpdesk', 'it support', 'troubleshooting', 'ticketing', 'servicenow', 'jira service desk', 'active directory', 'windows', 'networking', 'hardware support', 'itil'],
  'it operations': ['itil', 'service management', 'incident management', 'change management', 'problem management', 'servicenow', 'monitoring', 'sla', 'on call'],
};

// Returns true if any of the candidate's skills satisfy the required skill
function skillSatisfied(reqSkill: string, candidateSkills: string[]): 'exact' | 'alias' | null {
  const lower = reqSkill.toLowerCase();

  // 1. Exact match
  if (candidateSkills.includes(lower)) return 'exact';

  // 2. Substring match (e.g. "Apache Spark" covers "Spark")
  if (candidateSkills.some(s => s.includes(lower) || lower.includes(s))) return 'exact';

  // 3. Alias match — check if any candidate skill is an alias for the required domain
  const aliases = SKILL_ALIASES[lower];
  if (aliases && aliases.some(alias => candidateSkills.some(s => s.includes(alias) || alias.includes(s)))) {
    return 'alias';
  }

  // 4. Reverse alias — check if the required skill is an alias for something the candidate has
  for (const [domain, domainAliases] of Object.entries(SKILL_ALIASES)) {
    if (domainAliases.includes(lower) && candidateSkills.some(s => s.includes(domain) || domain.includes(s))) {
      return 'alias';
    }
  }

  return null;
}

// Job-Skill Matching Component
function SkillMatchSection({ structuredSkills, jobId, suitabilityAnalysis }: {
  structuredSkills: StructuredSkill[];
  jobId?: string;
  suitabilityAnalysis?: any;
}) {
  const { data: job } = useQuery({
    queryKey: ['job-for-matching', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const { data, error } = await supabase
        .from('jobs')
        .select('title, required_skills')
        .eq('id', jobId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!jobId,
  });

  if (!job || !job.required_skills) return null;

  const requiredSkills: string[] = Array.isArray(job.required_skills) ? job.required_skills.map(String) : [];
  if (requiredSkills.length === 0) return null;

  // --- Source of truth: prefer AI analysis when available ---
  const hasAiAnalysis = suitabilityAnalysis?.matched_skills?.length > 0 || suitabilityAnalysis?.missing_skills?.length > 0;

  const matched: { skill: string; proficiency?: string; via?: string }[] = [];
  const partial: { skill: string; proficiency?: string; via?: string }[] = [];
  let missing: string[] = [];
  let matchScore = 0;
  let usingAi = false;

  if (hasAiAnalysis) {
    // Use AI-determined matched/missing skills
    usingAi = true;
    const aiMatched: string[] = suitabilityAnalysis.matched_skills || [];
    const aiMissing: string[] = suitabilityAnalysis.missing_skills || [];

    // Map AI matched skills to proficiency from structured skills where possible
    for (const skill of aiMatched) {
      const found = structuredSkills.find(s =>
        s.name.toLowerCase() === skill.toLowerCase() ||
        s.name.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(s.name.toLowerCase())
      );
      matched.push({ skill, proficiency: found?.proficiency });
    }

    // Skills in requiredSkills not in AI matched or missing → check with fuzzy
    const candidateSkillNamesForFuzzy = structuredSkills.map(s => s.name.toLowerCase());
    for (const reqSkill of requiredSkills) {
      const inMatched = aiMatched.some(m => m.toLowerCase() === reqSkill.toLowerCase());
      const inMissing = aiMissing.some(m => m.toLowerCase() === reqSkill.toLowerCase());
      if (!inMatched && !inMissing) {
        const result = skillSatisfied(reqSkill, candidateSkillNamesForFuzzy);
        if (result === 'exact') {
          const found = structuredSkills.find(s => s.name.toLowerCase().includes(reqSkill.toLowerCase()));
          matched.push({ skill: reqSkill, proficiency: found?.proficiency });
        }
      }
    }

    missing = aiMissing;
    matchScore = suitabilityAnalysis.skills_match ?? Math.round(((matched.length + partial.length * 0.5) / requiredSkills.length) * 100);
  } else {
    // Fallback: fuzzy matching with alias map
    const candidateSkillNames = structuredSkills.map(s => s.name.toLowerCase());

    for (const reqSkill of requiredSkills) {
      const lower = reqSkill.toLowerCase();
      const result = skillSatisfied(reqSkill, candidateSkillNames);

      if (result === 'exact') {
        const found = structuredSkills.find(s =>
          s.name.toLowerCase() === lower ||
          s.name.toLowerCase().includes(lower) ||
          lower.includes(s.name.toLowerCase())
        );
        if (found?.proficiency === 'beginner') {
          partial.push({ skill: reqSkill, proficiency: found.proficiency });
        } else {
          matched.push({ skill: reqSkill, proficiency: found?.proficiency });
        }
      } else if (result === 'alias') {
        // Matched via domain alias — show as partial since it's inferred
        partial.push({ skill: reqSkill, via: 'inferred from related skills' });
      } else {
        missing.push(reqSkill);
      }
    }

    matchScore = requiredSkills.length > 0
      ? Math.round(((matched.length + partial.length * 0.5) / requiredSkills.length) * 100)
      : 0;
  }

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Job-Skill Match
          </h3>
          <div className="flex items-center gap-2">
            {usingAi && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">AI</span>
            )}
            <Badge variant={matchScore >= 75 ? 'default' : matchScore >= 50 ? 'secondary' : 'destructive'} className="text-xs">
              {matchScore}% Match
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          vs {job.title} requirements
          {!usingAi && structuredSkills.length > 0 && (
            <span className="ml-1 text-amber-500">(run "Analyze Job Match" for AI-powered matching)</span>
          )}
        </p>

        {matched.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Matched ({matched.length})
            </span>
            <div className="flex flex-wrap gap-1">
              {matched.map(m => (
                <Badge key={m.skill} variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
                  {m.skill}{m.proficiency && <span className="ml-1 opacity-60">({m.proficiency})</span>}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {partial.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Partial ({partial.length})
            </span>
            <div className="flex flex-wrap gap-1">
              {partial.map(p => (
                <Badge key={p.skill} variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400">
                  {p.skill}
                  {p.proficiency && <span className="ml-1 opacity-60">({p.proficiency})</span>}
                  {p.via && <span className="ml-1 opacity-60">(~inferred)</span>}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {missing.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
              <XCircle className="h-3 w-3" /> Missing ({missing.length})
            </span>
            <div className="flex flex-wrap gap-1">
              {missing.map(m => (
                <Badge key={m} variant="outline" className="text-xs bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function CollapsibleWorkSection({ title, icon: Icon, items, renderItem }: { title: string; icon: React.ElementType; items: any[]; renderItem: (item: any, index: number) => React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex-1">{title}</h3>
        <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3">
        {items.map((item, idx) => renderItem(item, idx))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function formatTenure(start?: string, end?: string): string | null {
  if (!start) return null;
  const parseYM = (s: string) => {
    const m = s.match(/^(\d{4})-(\d{2})$/);
    return m ? { y: parseInt(m[1]), mo: parseInt(m[2]) } : null;
  };
  const from = parseYM(start);
  if (!from) return null;
  let toY: number, toMo: number;
  if (!end || end.toLowerCase() === 'present') {
    const now = new Date();
    toY = now.getFullYear();
    toMo = now.getMonth() + 1;
  } else {
    const to = parseYM(end);
    if (!to) return null;
    toY = to.y; toMo = to.mo;
  }
  const total = (toY - from.y) * 12 + (toMo - from.mo);
  if (total <= 0) return null;
  const yrs = Math.floor(total / 12);
  const mos = total % 12;
  if (yrs === 0) return mos === 1 ? '1 mo' : `${mos} mos`;
  if (mos === 0) return yrs === 1 ? '1 yr' : `${yrs} yrs`;
  return `${yrs} yr${yrs > 1 ? 's' : ''} ${mos} mo${mos > 1 ? 's' : ''}`;
}

const formatDateSafe = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return isValid(parsed) ? format(parsed, 'MMM d, yyyy') : '—';
};

const formatRelativeDayLabel = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (!isValid(parsed)) return null;
  const diff = differenceInDays(new Date(), parsed);
  return diff === 0 ? 'today' : `${diff}d ago`;
};

export function CandidateDetailDrawer({
  candidate,
  open,
  onOpenChange,
  onEnrich,
  isEnriching,
  isInterviewerOnly = false,
  onAddFeedback,
  sheetClassName,
  notesStackOffset = 'right-1/2',
  hideOverlay = false,
  onViewQuestionKit,
  kitVisibleInterviewId = null,
  mobilePrepSwitcher,
  hideCloseButton = false,
  contextInterviewId = null,
  drawerContext = 'application',
  onAddToJob,
  onEdit,
}: CandidateDetailDrawerProps) {
  const isDatabaseContext = drawerContext === 'database';
  const { isAdminOrHR, isRecruiter, isInterviewer, user } = useAuth();
  const { toast } = useToast();
  const handleCopyProfileLink = useCallback(() => {
    if (!candidate) return;
    const link = `${window.location.origin}/hiring?view=list&profile=${candidate.id}`;
    navigator.clipboard.writeText(link);
    toast({ title: 'Profile link copied', description: 'Shareable link copied to clipboard' });
  }, [candidate, toast]);
  const userTimezone = useUserTimezone();
  const isSmDown = useIsSmDown();

  // ── Interview Notes panel state ──────────────────────────────────
  const [notesOpen, setNotesOpen] = useState(false);
  const [activeInterview, setActiveInterview] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [isDraftingNotes, setIsDraftingNotes] = useState(false);
  const [draftPreview, setDraftPreview] = useState<{ verdict_suggestion: string; technical: number; communication: number; problem_solving: number; culture_fit: number; feedback: string } | null>(null);
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesDirtyRef = useRef(false);
  const skipNotesSaveRef = useRef(true);
  const [notesSaveStatus, setNotesSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const canEditNotes = !!activeInterview && (isAdminOrHR || isRecruiter || isInterviewer);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const queryClient = useQueryClient();
  const activeInterviewIsPast = isPastInterview(activeInterview?.scheduled_at);
  const [ownerPopoverOpen, setOwnerPopoverOpen] = useState(false);
  const [ownerTransferring, setOwnerTransferring] = useState(false);
  const [redFlagsExpanded, setRedFlagsExpanded] = useState(false);
  const { prescreen, isLoading } = usePreScreen(candidate?.id ?? null, isInterviewerOnly);
  const [applicationFormDialogOpen, setApplicationFormDialogOpen] = useState(false);
  const [applicationFormId, setApplicationFormId] = useState<string | null>(null);
  const [assignAssessmentOpen, setAssignAssessmentOpen] = useState(false);
  const nestedDialogOpen = applicationFormDialogOpen || assignAssessmentOpen || feedbackDialogOpen;

  const handleDrawerOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && nestedDialogOpen) return;
      onOpenChange(nextOpen);
    },
    [nestedDialogOpen, onOpenChange],
  );

  useEffect(() => {
    if (open) return;
    setApplicationFormDialogOpen(false);
    setApplicationFormId(null);
    setAssignAssessmentOpen(false);
  }, [open]);
  const candidateJobId = (candidate as { job_id?: string | null } | null)?.job_id ?? null;
  const canManageApplicationForm = isAdminOrHR || isRecruiter;
  const { data: jobAssessmentConfig } = useJobAssessmentConfig(candidateJobId);
  const { data: coverLetter, isLoading: isCoverLetterLoading } = useCandidateCoverLetter(
    isDatabaseContext ? null : candidate?.id,
    candidateJobId,
  );

  const { data: candidateDetails, isFetching: isCandidateDetailsFetching } = useQuery({
    queryKey: ['candidate-drawer-detail', candidate?.id],
    enabled: open && !!candidate?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, skills, structured_skills, notes, parse_score, enrichment_score, work_experience, ai_summary, red_flags')
        .eq('id', candidate!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Only trust detail-query fields when they belong to the open candidate
  const detailsForOpenCandidate =
    candidateDetails?.id && candidate?.id && candidateDetails.id === candidate.id
      ? candidateDetails
      : null;

  // Work experience with enriched website URLs — local state updated after Gemini enrichment
  const [enrichedWorkExp, setEnrichedWorkExp] = useState<any[] | null>(null);
  const enrichmentTriggeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !candidate?.id) return;
    // Reset when candidate changes
    if (enrichmentTriggeredFor.current !== candidate.id) setEnrichedWorkExp(null);

    const rawExp = (detailsForOpenCandidate as { work_experience?: unknown[] } | null | undefined)?.work_experience
      ?? (candidate as { work_experience?: unknown[] })?.work_experience;
    if (!rawExp?.length) return;
    if (enrichmentTriggeredFor.current === candidate.id) return;
    // Trigger enrichment if any entry is missing a website OR has a bad stored value ("null"/"None")
    const needsEnrich = rawExp.some((e: any) =>
      e.company && (!e.website || e.website === 'null' || e.website === 'None' || e.website === 'none')
    );
    if (!needsEnrich) return;

    const enrichForId = candidate.id;
    enrichmentTriggeredFor.current = enrichForId;
    supabase.functions.invoke('enrich-company-websites', {
      body: { candidate_id: enrichForId, ...getDevGeminiKeyBody() },
    }).then(({ data }) => {
      // Ignore late responses after switching candidates
      if (enrichmentTriggeredFor.current !== enrichForId) return;
      if (data?.work_experience) setEnrichedWorkExp(data.work_experience);
    }).catch(() => {});
  }, [open, candidate?.id, (detailsForOpenCandidate as { work_experience?: unknown[] } | undefined)?.work_experience]);

  const activeInterviewSelect =
    'id, interview_notes, scheduled_at, interviewer_user_id, job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(stage_name)';

  // Fetch pending interview for notes — prefer current user's assignment, include unscheduled
  useEffect(() => {
    if (isDatabaseContext) {
      setActiveInterview(null);
      setNotes('');
      setNotesOpen(false);
      setDraftPreview(null);
      return;
    }

    if (!open || !candidate?.id) {
      setActiveInterview(null);
      setNotes('');
      setNotesOpen(false);
      setDraftPreview(null);
      notesDirtyRef.current = false;
      skipNotesSaveRef.current = true;
      return;
    }

    let cancelled = false;
    notesDirtyRef.current = false;
    skipNotesSaveRef.current = true;
    setNotesSaveStatus('idle');

    (async () => {
      let interview: any = null;

      if (contextInterviewId) {
        const { data } = await supabase
          .from('candidate_interviews')
          .select(activeInterviewSelect)
          .eq('id', contextInterviewId)
          .eq('candidate_id', candidate.id)
          .maybeSingle();
        interview = data;
      }

      if (!interview) {
        const base = () =>
          supabase
            .from('candidate_interviews')
            .select(activeInterviewSelect)
            .eq('candidate_id', candidate.id)
            .is('verdict', null)
            .is('removed_from_pipeline_at', null)
            .order('scheduled_at', { ascending: false, nullsFirst: false })
            .limit(1);

        if (user?.id) {
          const { data } = await base().eq('interviewer_user_id', user.id).maybeSingle();
          interview = data;
        }
        if (!interview) {
          const { data } = await base().maybeSingle();
          interview = data;
        }
      }
      if (cancelled) return;

      setActiveInterview(interview || null);
      if (!notesDirtyRef.current) {
        setNotes(interview?.interview_notes || '');
      }
      setDraftPreview(null);
    })();

    return () => { cancelled = true; };
  }, [open, candidate?.id, user?.id, contextInterviewId, isDatabaseContext]);

  const { data: candidateTags = [] } = useQuery({
    queryKey: ['candidate-tags-drawer', candidate?.id],
    enabled: isDatabaseContext && !!candidate?.id && open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_tags')
        .select('tag')
        .eq('candidate_id', candidate!.id)
        .order('tag');
      if (error) throw error;
      return (data || []).map((r) => r.tag);
    },
  });

  const { data: pipelineEnrollments = [] } = useQuery({
    queryKey: ['candidate-drawer-pipeline', candidate?.id],
    enabled: isDatabaseContext && !!candidate?.id && open,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_interviews')
        .select(`
          candidate_id,
          job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(
            stage_name,
            order_index,
            job:jobs(id, title)
          )
        `)
        .eq('candidate_id', candidate!.id)
        .is('removed_from_pipeline_at', null);
      if (error) throw error;
      const byJob = new Map<string, PipelineEnrollment & { order: number }>();
      (data || []).forEach((row: {
        job_interview_stage?: { stage_name: string; order_index: number; job?: { id: string; title: string } | null } | null;
      }) => {
        const stage = row.job_interview_stage;
        const job = stage?.job;
        if (!stage || !job?.id) return;
        const existing = byJob.get(job.id);
        if (!existing || stage.order_index > existing.order) {
          byJob.set(job.id, {
            jobId: job.id,
            jobTitle: job.title,
            stageName: stage.stage_name,
            order: stage.order_index,
          });
        }
      });
      return [...byJob.values()]
        .sort((a, b) => a.jobTitle.localeCompare(b.jobTitle))
        .map(({ jobId, jobTitle, stageName }) => ({ jobId, jobTitle, stageName }));
    },
  });

  // Auto-save notes (1 s debounce)
  useEffect(() => {
    if (!activeInterview?.id || !canEditNotes) return;
    if (skipNotesSaveRef.current) {
      skipNotesSaveRef.current = false;
      return;
    }
    if (!notesDirtyRef.current) return;
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    setNotesSaveStatus('saving');
    notesSaveTimerRef.current = setTimeout(() => {
      const notesSnapshot = notes;
      supabase.from('candidate_interviews')
        .update({ interview_notes: notesSnapshot } as any)
        .eq('id', activeInterview.id)
        .then(({ error }) => {
          if (error) {
            setNotesSaveStatus('error');
            toast({ title: 'Failed to save notes', description: error.message, variant: 'destructive' });
          } else {
            notesDirtyRef.current = false;
            setNotesSaveStatus('saved');
            setActiveInterview((prev: any) =>
              prev ? { ...prev, interview_notes: notesSnapshot } : prev,
            );
          }
        });
    }, 1000);
    return () => { if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current); };
  }, [notes, activeInterview?.id, canEditNotes, toast]);

  const flushNotesSave = (): Promise<void> => {
    if (!activeInterview?.id || !canEditNotes || !notesDirtyRef.current) return Promise.resolve();
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    notesSaveTimerRef.current = null;
    setNotesSaveStatus('saving');
    const notesSnapshot = notes;
    const interviewId = activeInterview.id;
    return supabase.from('candidate_interviews')
      .update({ interview_notes: notesSnapshot } as any)
      .eq('id', interviewId)
      .then(({ error }) => {
        if (error) {
          setNotesSaveStatus('error');
          toast({ title: 'Failed to save notes', description: error.message, variant: 'destructive' });
        } else {
          notesDirtyRef.current = false;
          setNotesSaveStatus('saved');
          setActiveInterview((prev: any) =>
            prev ? { ...prev, interview_notes: notesSnapshot } : prev,
          );
        }
      });
  };

  const handleNotesOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) void flushNotesSave();
    setNotesOpen(nextOpen);
  };

  const handleDraftNotes = async () => {
    if (!activeInterview || !notes.trim() || isDraftingNotes || !candidate) return;
    setIsDraftingNotes(true);
    setDraftPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke('draft-feedback', {
        body: {
          interview_id: activeInterview.id,
          notes: notes.trim(),
          candidate_name: candidate.name,
          stage_name: (activeInterview.job_interview_stage as any)?.stage_name,
          ...getDevGeminiKeyBody(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.draft) {
        setDraftPreview(data.draft);
        // Save to localStorage as fallback (in case user closes without submitting)
        localStorage.setItem(`sparx_feedback_draft_${activeInterview.id}`, JSON.stringify(data.draft));
      }
    } catch (err: any) {
      toast({ title: 'Failed to draft feedback', description: err?.message || 'Please try again', variant: 'destructive' });
    } finally { setIsDraftingNotes(false); }
  };

  const openFeedbackWithDraft = useCallback(async () => {
    if (!activeInterview?.id || !draftPreview) return;
    await flushNotesSave();
    localStorage.setItem(`sparx_feedback_draft_${activeInterview.id}`, JSON.stringify(draftPreview));
    setActiveInterview((prev: any) =>
      prev ? { ...prev, interview_notes: notes } : prev,
    );
    setFeedbackDialogOpen(true);
  }, [activeInterview?.id, draftPreview, notes]);

  const handleFeedbackSubmitFromDrawer = async (data: {
    verdict: InterviewVerdict;
    overall_score: number | null;
    rating_categories: RatingCategories | null;
    feedback: string;
    artifacts: InterviewArtifact[];
    interview_mode?: InterviewMode;
    completed_at: string;
    rejection_reason?: string | null;
  }) => {
    if (!activeInterview) return;
    setIsSubmittingFeedback(true);
    try {
      const stageSnapshot =
        (activeInterview as { stage_name_snapshot?: string | null }).stage_name_snapshot
        ?? (activeInterview.job_interview_stage as { stage_name?: string } | null)?.stage_name
        ?? null;

      const { error } = await supabase
        .from('candidate_interviews')
        .update({
          verdict: data.verdict,
          overall_score: data.overall_score,
          rating_categories: data.rating_categories as any,
          feedback: data.feedback,
          artifacts: data.artifacts as any,
          interview_mode: data.interview_mode,
          completed_at: data.completed_at,
          interviewer_user_id: user?.id,
          ...(stageSnapshot && { stage_name_snapshot: stageSnapshot }),
          ...(data.rejection_reason != null && { rejection_reason: data.rejection_reason }),
        })
        .eq('id', activeInterview.id);
      if (error) throw error;
      notifyStaffEmail('verdict_submitted', activeInterview.id);
      // Clean up draft from localStorage
      localStorage.removeItem(`sparx_feedback_draft_${activeInterview.id}`);
      queryClient.invalidateQueries({ queryKey: ['all-candidate-interviews'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-interview-history', candidate?.id] });
      setFeedbackDialogOpen(false);
      setDraftPreview(null);
      setActiveInterview(null);
      setNotesOpen(false);
      toast({ title: 'Feedback submitted' });
    } catch (err: any) {
      toast({ title: 'Failed to submit feedback', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // Fetch interview history for this candidate.
  // Only includes interviews that have already happened (scheduled_at in the past)
  // or have a verdict set — future-scheduled interviews are excluded.
  const { data: interviewHistory } = useQuery({
    queryKey: ['candidate-interview-history', candidate?.id],
    enabled: !!candidate?.id && open && !isDatabaseContext,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('candidate_interviews')
        .select(`
          *,
          job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(stage_name, job_id),
          interviewer:profiles!candidate_interviews_interviewer_user_id_fkey(full_name, email)
        `)
        .eq('candidate_id', candidate!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const mostRecentHistoryInterview = useMemo(() => {
    if (!interviewHistory?.length) return null;
    return [...interviewHistory].sort((a, b) => {
      const aT = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const bT = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return bT - aT;
    })[0];
  }, [interviewHistory]);
  const relevantKitInterviewId = contextInterviewId ?? activeInterview?.id ?? mostRecentHistoryInterview?.id ?? null;
  const relevantKitIsPast = activeInterview
    ? activeInterviewIsPast
    : isPastInterview(mostRecentHistoryInterview?.scheduled_at);
  const { data: relevantKit } = useInterviewKit(
    relevantKitInterviewId && relevantKitIsPast ? relevantKitInterviewId : null,
  );
  const hasKitContent = (relevantKit?.questions?.length ?? 0) > 0;
  const showQuestionKitButton = !isDatabaseContext
    && !!relevantKitInterviewId
    && !!onViewQuestionKit
    && relevantKitInterviewId !== kitVisibleInterviewId
    && (!relevantKitIsPast || hasKitContent);
  const handleViewQuestionKit = () => {
    if (!relevantKitInterviewId || !onViewQuestionKit) return;
    onViewQuestionKit(relevantKitInterviewId);
  };

  // Fetch all recruiters for ownership transfer (HR/Admin only, loaded when popover opens)
  const { data: recruiterOptions = [] } = useQuery({
    queryKey: ['recruiter-profiles-for-ownership'],
    enabled: isAdminOrHR && ownerPopoverOpen,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['recruiter', 'hr', 'admin']);
      const ids = (roles || []).map((r: any) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', ids);
      return (profiles || []).map((p: any) => ({ user_id: p.user_id, name: p.full_name || p.email }));
    },
  });

  const handleOwnerTransfer = async (newOwnerUserId: string) => {
    if (!candidate) return;
    setOwnerTransferring(true);
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ uploaded_by: newOwnerUserId })
        .eq('id', candidate.id);
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['candidates'] }),
        queryClient.invalidateQueries({ queryKey: ['all-candidate-interviews'] }),
      ]);
      setOwnerPopoverOpen(false);
      toast({ title: 'Ownership transferred' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setOwnerTransferring(false);
    }
  };

  const redFlags: Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' }> = useMemo(
    () => {
      const rawFlags = detailsForOpenCandidate && Array.isArray((detailsForOpenCandidate as any).red_flags)
        ? (detailsForOpenCandidate as any).red_flags
        : Array.isArray((candidate as any)?.red_flags)
          ? (candidate as any).red_flags
          : [];
      return filterStaleLinkedInRedFlags(rawFlags, (candidate as any)?.linkedin_url);
    },
    [candidate, detailsForOpenCandidate],
  );

  if (!candidate) return null;

  const c = detailsForOpenCandidate ? { ...candidate, ...detailsForOpenCandidate } : candidate;

  const hasPreScreen = !!prescreen;
  const academics = (prescreen?.academics ?? []) as AcademicRecord[];
  const filledAcademics = academics.filter(a => a.institution || a.marks || a.percentile);
  const parseScore: number | null = (c as any).parse_score ?? null;
  const enrichmentScore = (c as any).enrichment_score;
  const source = (c as any).source || 'manual';

  const structuredSkills: StructuredSkill[] = c.structured_skills || [];
  const hasStructuredSkills = structuredSkills.length > 0;

  const certifications: any[] = (candidate as any).certifications || [];
  const awards: any[] = (candidate as any).awards || [];
  const credentialScore: number | null = (candidate as any).credential_score;

  // Intelligence Header data
  const suitabilityScore: number | null = (candidate as any).suitability_score ?? null;
  const suitabilityAnalysis: any = (candidate as any).suitability_analysis ?? null;
  const completedInterviewsWithScore = (interviewHistory || []).filter((iv: any) => iv.overall_score != null);
  const avgRating = completedInterviewsWithScore.length > 0
    ? Math.round((completedInterviewsWithScore.reduce((s: number, iv: any) => s + iv.overall_score, 0) / completedInterviewsWithScore.length) * 10) / 10
    : null;
  
  // Group structured skills by category
  const skillsByCategory = structuredSkills.reduce((acc, skill) => {
    const cat = skill.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {} as Record<string, StructuredSkill[]>);

  // Fallback to flat skills
  const flatSkills: string[] = !hasStructuredSkills
    ? (Array.isArray((candidate as any).skills_tags) && (candidate as any).skills_tags.length > 0
        ? (candidate as any).skills_tags.map(String)
        : (c.skills ?? []))
    : [];

  const interviewNotesBody = (
    <>
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <NotebookPen className="h-3.5 w-3.5 text-primary shrink-0" />
            Interview Notes
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {(activeInterview?.job_interview_stage as any)?.stage_name}
            {activeInterview?.scheduled_at && <> · {formatDateTimeInTz(activeInterview.scheduled_at, userTimezone)}</>}
          </p>
        </div>
        <button onClick={() => handleNotesOpenChange(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0 mt-0.5">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {canEditNotes ? (
          <Textarea
            placeholder="Jot raw notes during the interview — observations, strengths, concerns…"
            className="resize-none text-sm min-h-[120px] sm:min-h-[180px]"
            value={notes}
            onChange={e => {
              notesDirtyRef.current = true;
              setNotes(e.target.value);
            }}
          />
        ) : (
          <div className="text-sm text-muted-foreground bg-muted/30 rounded-md p-3 min-h-[100px] whitespace-pre-wrap leading-relaxed">
            {notes || 'No notes recorded yet.'}
          </div>
        )}

        {canEditNotes && (
          <p className={cn(
            'text-[10px] text-center -mt-1',
            notesSaveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}>
            {notesSaveStatus === 'saving' && 'Saving…'}
            {notesSaveStatus === 'saved' && 'Saved'}
            {notesSaveStatus === 'error' && 'Save failed — retry by editing'}
            {notesSaveStatus === 'idle' && 'Auto-saves as you type'}
          </p>
        )}

        {canEditNotes && (
          <button
            onClick={handleDraftNotes}
            disabled={!notes.trim() || isDraftingNotes}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium border rounded-md px-3 py-2 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isDraftingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
            {isDraftingNotes ? 'Drafting…' : 'Draft with AI'}
          </button>
        )}

        {draftPreview && (
          <div className="space-y-2 border rounded-lg p-3 bg-primary/5 text-xs">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              Draft Preview
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Verdict:</span>
              <span className={cn('font-semibold capitalize',
                draftPreview.verdict_suggestion === 'proceeded' ? 'text-emerald-600' :
                draftPreview.verdict_suggestion === 'rejected' ? 'text-red-600' : 'text-amber-600'
              )}>
                {draftPreview.verdict_suggestion}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {([['Technical', draftPreview.technical], ['Communication', draftPreview.communication], ['Problem Solving', draftPreview.problem_solving], ['Culture Fit', draftPreview.culture_fit]] as [string, number][]).map(([lbl, score]) => (
                <div key={lbl} className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">{lbl}</span>
                  <span className="font-medium text-[11px]">{score}/5</span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground italic leading-snug">"{draftPreview.feedback}"</p>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs flex-1"
                onClick={openFeedbackWithDraft}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs flex-1 btn-gradient text-primary-foreground"
                onClick={openFeedbackWithDraft}
              >
                Submit feedback
              </Button>
            </div>
          </div>
        )}

        {canEditNotes && !draftPreview && (
          <p className="text-[10px] text-muted-foreground text-center pt-1">
            Draft with AI to submit feedback here
          </p>
        )}
      </div>
    </>
  );

  const interviewNotesPanelDesktop =
    !isDatabaseContext && notesOpen && activeInterview && !isSmDown
      ? createPortal(
          <div data-drawer-panel className={cn('fixed inset-y-0 z-[60] flex w-[300px] flex-col overflow-hidden border-r bg-background shadow-lg animate-in slide-in-from-right duration-300', notesStackOffset)}>
            {interviewNotesBody}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
    <Sheet open={open} onOpenChange={handleDrawerOpenChange} modal={!hideOverlay}>
      <SheetContent
        hideOverlay={hideOverlay}
        hideCloseButton={hideCloseButton}
        onPointerDownOutside={(e) => {
          if (nestedDialogOpen) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (nestedDialogOpen) e.preventDefault();
        }}
        className={cn('flex h-full max-h-dvh min-h-0 w-full flex-col p-0', sheetClassName ?? 'sm:max-w-[50%]')}
      >
          {mobilePrepSwitcher && (
            <div className="shrink-0">{mobilePrepSwitcher}</div>
          )}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Native overflow scroll: Radix ScrollArea often blocks touch scroll on mobile */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div
            key={candidate.id}
            className={cn('space-y-6 p-6', !isDatabaseContext && (showQuestionKitButton || canEditNotes) && 'pb-20')}
          >
            {/* Header */}
            <SheetHeader className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <SheetTitle className="text-2xl">{candidate.name}</SheetTitle>
                  {(candidate.role_applied || (candidate as any).candidate_current_role) && (
                    <p className="text-muted-foreground">
                      {(candidate as any).candidate_current_role || candidate.role_applied}
                      {(candidate as any).candidate_current_company && ` at ${(candidate as any).candidate_current_company}`}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant="outline" className="text-xs capitalize">{source}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={handleCopyProfileLink}
                  >
                    <LinkIcon className="h-4 w-4" />
                    Copy profile link
                  </Button>
                  {isInterviewerOnly && onAddFeedback && !isDatabaseContext && (
                    <Button
                      size="sm"
                      variant="default"
                      className="gap-2"
                      onClick={() => onAddFeedback(candidate.id)}
                    >
                      <ClipboardEdit className="h-4 w-4" />
                      Add Feedback
                    </Button>
                  )}
                </div>
              </div>
            </SheetHeader>

            {/* Backout banner */}
            {(candidate as any).candidate_status === 'backout' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm">
                <UserX className="h-4 w-4 shrink-0" />
                <span>This candidate has <strong>withdrawn</strong> from the process.</span>
              </div>
            )}

            {/* Scores — unified rings (one horizontal row; scroll on narrow viewports) */}
            <div className="bg-muted/30 rounded-lg p-3 space-y-3">
              <div className="flex flex-nowrap items-center justify-start gap-6 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-center sm:overflow-x-visible">
                {!isDatabaseContext && (
                  suitabilityAnalysis ? (
                  <Popover key="job-fit">
                    <PopoverTrigger asChild>
                      <div className="shrink-0 snap-start cursor-pointer hover:opacity-75 transition-opacity">
                        <ScoreRingSmall value={suitabilityScore} label="Job Fit" />
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 space-y-2" side="bottom">
                      <p className="text-xs font-semibold text-foreground">Job Fit Breakdown</p>
                      {[
                        { label: 'Skills Match', value: suitabilityAnalysis.skills_match },
                        { label: 'Experience', value: suitabilityAnalysis.experience_match },
                        { label: 'Role Relevance', value: suitabilityAnalysis.role_relevance },
                      ].map(({ label, value }) => value != null && (
                        <div key={label}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-medium">{value}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
                          </div>
                        </div>
                      ))}
                      {suitabilityAnalysis.missing_skills?.length > 0 && (
                        <div className="pt-1 border-t">
                          <p className="text-[10px] text-muted-foreground font-medium mb-1">Skill gaps</p>
                          <div className="flex flex-wrap gap-1">
                            {suitabilityAnalysis.missing_skills.slice(0, 5).map((s: string) => (
                              <span key={s} className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                ) : (
                  <ScoreRingSmall value={suitabilityScore} label="Job Fit" />
                )
                )}
                <ScoreRingSmall value={parseScore} label="Parse" />
                <ScoreRingSmall value={enrichmentScore ?? null} label="Enrichment" />
                {credentialScore != null && <ScoreRingSmall value={credentialScore} label="Credential" />}
              </div>

              {/* Red Flags + Avg Rating — compact inline row */}
              <div className="flex items-center justify-center gap-8 pt-2 border-t border-border/50">
                <button
                  onClick={() => redFlags.length > 0 && setRedFlagsExpanded(v => !v)}
                  disabled={redFlags.length === 0}
                  className="flex items-center gap-1.5 disabled:cursor-default"
                >
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    redFlags.length === 0 && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                    redFlags.length > 0 && redFlags.some(f => f.severity === 'high') && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    redFlags.length > 0 && !redFlags.some(f => f.severity === 'high') && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                  )}>
                    <AlertTriangle className="h-3 w-3" />
                    {redFlags.length === 0 ? 'No flags' : `${redFlags.length} flag${redFlags.length !== 1 ? 's' : ''}`}
                    {redFlags.length > 0 && <ChevronDown className={cn('h-3 w-3 transition-transform', redFlagsExpanded && 'rotate-180')} />}
                  </span>
                </button>
                {!isDatabaseContext && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Star className={cn('h-3.5 w-3.5', avgRating != null ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
                  {avgRating != null ? (
                    <>
                      <span className="font-semibold text-foreground">{avgRating}</span>
                      <span className="text-muted-foreground">/ 5 · {completedInterviewsWithScore.length} iv{completedInterviewsWithScore.length !== 1 ? 's' : ''}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">No ratings yet</span>
                  )}
                </div>
                )}
              </div>
            </div>

            {/* Red Flags expanded list */}
            {redFlagsExpanded && redFlags.length > 0 && (
              <div className="space-y-1.5 -mt-2">
                {redFlags.map((flag, i) => (
                  <div key={i} className={cn(
                    'flex items-start gap-2 rounded-md px-3 py-2 text-xs',
                    flag.severity === 'high'   && 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400',
                    flag.severity === 'medium' && 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400',
                    flag.severity === 'low'    && 'bg-muted text-muted-foreground',
                  )}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{flag.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* AI Summary — only from id-matched detail query (never stale prop from another candidate) */}
            {(() => {
              if (!detailsForOpenCandidate) {
                // Avoid flashing another candidate's summary while details load
                if (!onEnrich) return null;
                return (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wide">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI Summary
                    </div>
                    <p className="text-sm text-muted-foreground italic">
                      {isCandidateDetailsFetching ? 'Loading summary…' : 'No summary yet — click Generate or run Enrich Profile.'}
                    </p>
                  </div>
                );
              }
              const aiSummary = ((detailsForOpenCandidate as { ai_summary?: string | null }).ai_summary ?? null);
              if (!aiSummary && !onEnrich) return null;
              return (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wide">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI Summary
                    </div>
                    {onEnrich && (
                      <button
                        onClick={() => onEnrich(candidate.id)}
                        disabled={isEnriching}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                      >
                        {isEnriching ? 'Generating...' : aiSummary ? 'Regenerate' : 'Generate'}
                      </button>
                    )}
                  </div>
                  {aiSummary ? (
                    <p className="text-sm text-foreground leading-relaxed">{aiSummary}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No summary yet — click Generate or run Enrich Profile.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Contact */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${candidate.email}`} className="text-primary hover:underline">{candidate.email}</a>
                </div>
                {candidate.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{candidate.phone}</span>
                  </div>
                )}
                {(() => {
                  const linkedInUrl = resolveLinkedInProfileUrl((candidate as any).linkedin_url);
                  if (linkedInUrl) {
                    return (
                      <div className="flex items-center gap-3 text-sm">
                        <Linkedin className="h-4 w-4 text-[#0A66C2] shrink-0" />
                        <a href={linkedInUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                          {linkedInUrl.replace('https://www.linkedin.com/in/', '').replace('https://linkedin.com/in/', '')}
                        </a>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center gap-3 text-sm">
                      <Linkedin className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="italic text-amber-500 font-medium">
                        No LinkedIn — add via Edit
                        {(candidate as any).linkedin_url && (
                          <span className="ml-1 text-muted-foreground not-italic font-normal text-xs">(parsed: "{(candidate as any).linkedin_url}")</span>
                        )}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Ownership */}
            <div className="flex items-center gap-2 text-sm">
              <Crown className="h-4 w-4 text-amber-500 fill-amber-400 shrink-0" />
              <span className="text-muted-foreground">Owner:</span>
              <span className="font-medium text-foreground">
                {(candidate as any).owner?.full_name || candidate.owner_name || (candidate.uploaded_by ? 'Unknown' : 'Unassigned')}
              </span>
              {isAdminOrHR && (
                <Popover open={ownerPopoverOpen} onOpenChange={setOwnerPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="end">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Transfer ownership to</p>
                    {ownerTransferring ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                        <Loader2 className="h-4 w-4 animate-spin" /> Transferring...
                      </div>
                    ) : (
                      <Select onValueChange={handleOwnerTransfer}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select recruiter" />
                        </SelectTrigger>
                        <SelectContent>
                          {recruiterOptions.map(r => (
                            <SelectItem key={r.user_id} value={r.user_id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {isDatabaseContext && candidateTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {candidateTags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs font-normal capitalize">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {isDatabaseContext && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Active on Jobs
                  </h3>
                  {pipelineEnrollments.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground italic">Not in pipeline</p>
                      {onAddToJob && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onAddToJob(candidate)}>
                          <Briefcase className="h-3.5 w-3.5" />
                          Add to Job
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pipelineEnrollments.map((enrollment) => (
                        <div key={enrollment.jobId} className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium min-w-0 truncate">
                            {enrollment.jobTitle} · {enrollment.stageName}
                          </span>
                          <Button variant="link" size="sm" className="h-auto shrink-0 px-0 text-xs" asChild>
                            <Link to={`/hiring?view=board&job=${enrollment.jobId}&candidate=${candidate.id}`}>
                              View in Pipeline
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />

            {/* Professional */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Professional</h3>
              <div className="grid grid-cols-2 gap-3">
                {(candidate as any).candidate_current_role && (
                  <InfoItem icon={Briefcase} label="Current Role" value={(candidate as any).candidate_current_role} />
                )}
                {(candidate as any).candidate_current_company && (
                  <InfoItem icon={Building2} label="Company" value={(candidate as any).candidate_current_company} />
                )}
                {(candidate as any).experience_years != null && (
                  <InfoItem icon={Clock} label="Experience" value={`${(candidate as any).experience_years} years`} />
                )}
                {(candidate as any).job?.title && !isDatabaseContext && (
                  <InfoItem icon={Briefcase} label="Applied For" value={(candidate as any).job.title} />
                )}
              </div>
            </div>

            {/* Work Experience - Collapsible */}
            {((enrichedWorkExp ?? (candidate as any).work_experience) || []).length > 0 && (
              <>
                <Separator />
                <CollapsibleWorkSection
                  title="Work Experience"
                  icon={Briefcase}
                  items={enrichedWorkExp ?? (candidate as any).work_experience}
                  renderItem={(exp: any) => (
                    <div key={`${exp.company}-${exp.title}`} className="border-l-2 border-primary/20 pl-3 py-1 space-y-0.5">
                      <div className="font-medium text-sm">{exp.title}</div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span>{exp.company}</span>
                        {exp.website && exp.website !== 'null' && exp.website !== 'None' && exp.website !== 'none' && (
                          <a
                            href={exp.website.startsWith('http') ? exp.website : `https://${exp.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-muted-foreground/50 hover:text-primary transition-colors"
                            title={exp.website}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {(exp.start_date || exp.end_date) && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <span>{exp.start_date} — {exp.end_date || 'Present'}</span>
                          {formatTenure(exp.start_date, exp.end_date) && (
                            <>
                              <span className="opacity-40">·</span>
                              <span className="text-primary/70 font-medium">{formatTenure(exp.start_date, exp.end_date)}</span>
                            </>
                          )}
                        </div>
                      )}
                      {exp.description && (
                        <p className="text-xs text-muted-foreground mt-1">{exp.description}</p>
                      )}
                    </div>
                  )}
                />
              </>
            )}

            {/* Education - Collapsible */}
            {(candidate as any).education && (candidate as any).education.length > 0 && (
              <>
                <Separator />
                <CollapsibleWorkSection
                  title="Education"
                  icon={GraduationCap}
                  items={(candidate as any).education}
                  renderItem={(edu: any) => (
                    <div key={`${edu.institution}-${edu.degree}`} className="border-l-2 border-primary/20 pl-3 py-1 space-y-0.5">
                      <div className="font-medium text-sm">{edu.degree}{edu.field ? ` in ${edu.field}` : ''}</div>
                      <div className="text-sm text-muted-foreground">{edu.institution}</div>
                      {(edu.start_date || edu.end_date) && (
                        <div className="text-xs text-muted-foreground">
                          {edu.start_date} — {edu.end_date || 'Present'}
                        </div>
                      )}
                    </div>
                  )}
                />
              </>
            )}

            {/* Certifications - Collapsible */}
            {certifications.length > 0 && (
              <>
                <Separator />
                <CollapsibleWorkSection
                  title="Certifications"
                  icon={ShieldCheck}
                  items={certifications}
                  renderItem={(cert: any, idx: number) => (
                    <div key={`${cert.name}-${idx}`} className="border-l-2 border-primary/20 pl-3 py-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{cert.name}</span>
                        {cert.is_premium && (
                          <Badge variant="outline" className={`text-[10px] ${
                            cert.tier === 1 ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700' :
                            cert.tier === 2 ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            🏅 Tier {cert.tier}
                          </Badge>
                        )}
                      </div>
                      {cert.issuer && <div className="text-sm text-muted-foreground">{cert.issuer}</div>}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {cert.year && <span>{cert.year}</span>}
                        {cert.credential_id && <span>ID: {cert.credential_id}</span>}
                        {cert.expiry && <span>Expires: {cert.expiry}</span>}
                      </div>
                    </div>
                  )}
                />
              </>
            )}

            {/* Awards - Collapsible */}
            {awards.length > 0 && (
              <>
                <Separator />
                <CollapsibleWorkSection
                  title="Awards & Achievements"
                  icon={Award}
                  items={awards}
                  renderItem={(award: any, idx: number) => (
                    <div key={`${award.title}-${idx}`} className="border-l-2 border-primary/20 pl-3 py-1 space-y-0.5">
                      <div className="font-medium text-sm">{award.title}</div>
                      {award.issuer && <div className="text-sm text-muted-foreground">{award.issuer}</div>}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {award.year && <span>{award.year}</span>}
                        {award.scope && <Badge variant="outline" className="text-[10px] capitalize">{award.scope}</Badge>}
                      </div>
                    </div>
                  )}
                />
              </>
            )}

            {hasStructuredSkills ? (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    Skills
                    <Badge variant="outline" className="text-[10px] font-normal">
                      <Sparkles className="h-2.5 w-2.5 mr-1" />
                      Structured
                    </Badge>
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(skillsByCategory).map(([category, skills]) => (
                      <div key={category}>
                        <span className="text-xs font-medium text-muted-foreground mb-1 block">
                          {categoryLabels[category] || category}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {skills.map(skill => (
                            <Badge
                              key={skill.name}
                              variant="outline"
                              className={`text-xs ${proficiencyColors[skill.proficiency]}`}
                              title={`${skill.proficiency} (${Math.round(skill.confidence * 100)}% confidence) — Sources: ${skill.sources.join(', ')}`}
                            >
                              {skill.name}
                              {skill.sources.includes('assessment') && (
                                <CheckCircle className="h-2.5 w-2.5 ml-1 text-green-500" />
                              )}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Expert</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Intermediate</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> Beginner</span>
                    <span className="flex items-center gap-1"><CheckCircle className="h-2.5 w-2.5 text-green-500" /> Verified</span>
                  </div>
                </div>
              </>
            ) : flatSkills.length > 0 ? (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {flatSkills.map(skill => (
                      <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {/* Job-Skill Match */}
            {!isDatabaseContext && hasStructuredSkills && (
              <SkillMatchSection structuredSkills={structuredSkills} jobId={(candidate as any).job_id} suitabilityAnalysis={(candidate as any).suitability_analysis} />
            )}

            {!isDatabaseContext && candidate?.id && (
              <>
                <Separator />
                {/* Cover Letter — from linked job application */}
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Cover Letter
                  </h3>
                  {isCoverLetterLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading cover letter...
                    </div>
                  ) : coverLetter ? (
                    <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3">{coverLetter}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic py-2">No cover letter submitted</p>
                  )}
                </div>
              </>
            )}

            {/* Pre-Screen — digital application form + recruiter call notes */}
            {!isDatabaseContext && (
              <div className="space-y-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Pre-Screen
                </h3>

                {(candidate?.id || candidate?.email) && candidateJobId && (
                  <JobDetailsEmailSection
                    embedded
                    candidateId={candidate.id}
                    candidateEmail={candidate.email}
                    candidateName={candidate.name}
                    jobId={candidateJobId}
                    canEdit={canManageApplicationForm}
                  />
                )}

                {(candidate?.id || candidate?.email) && candidateJobId && (
                  <JobApplicationFormSection
                    embedded
                    candidateId={candidate.id}
                    candidateEmail={candidate.email}
                    candidateName={candidate.name}
                    jobId={candidateJobId}
                    canEdit={canManageApplicationForm}
                    onFillOnBehalf={(applicationId) => {
                      setApplicationFormId(applicationId);
                      setApplicationFormDialogOpen(true);
                    }}
                  />
                )}

                {candidate?.id && candidateJobId && jobAssessmentConfig?.assessmentEnabled && (
                  <AssessmentSection
                    embedded
                    candidateId={candidate.id}
                    jobId={candidateJobId}
                    defaultAssessmentId={jobAssessmentConfig.defaultAssessmentId}
                    assessmentEnabled={jobAssessmentConfig.assessmentEnabled}
                    canAssign={canManageApplicationForm}
                    onAssign={() => setAssignAssessmentOpen(true)}
                  />
                )}

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Recruiter Screening Notes</h4>

                  {isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading screening notes...
                    </div>
                  ) : !hasPreScreen ? (
                    <p className="text-sm text-muted-foreground italic py-2">
                      Recruiter call notes not recorded yet. Use the &quot;Pre-Screen&quot; option from the candidate menu to add details.
                    </p>
                  ) : (
                <div className="space-y-5">
                  {/* Experience & Compensation */}
                  <div className="grid grid-cols-2 gap-3">
                    {prescreen!.total_experience_years != null && (
                      <InfoItem icon={Clock} label="Total Experience" value={`${prescreen!.total_experience_years} years`} />
                    )}
                    {prescreen!.relevant_experience_years != null && (
                      <InfoItem icon={Clock} label="Relevant Experience" value={`${prescreen!.relevant_experience_years} years`} />
                    )}
                    {prescreen!.relevant_experience_domain && (
                      <InfoItem icon={Briefcase} label="Domain" value={prescreen!.relevant_experience_domain} />
                    )}
                    {!isInterviewerOnly && prescreen!.current_ctc && (
                      <InfoItem icon={IndianRupee} label="Current CTC" value={`₹${prescreen!.current_ctc} Lakh(s)`} />
                    )}
                    {!isInterviewerOnly && prescreen!.expected_ctc && (
                      <InfoItem icon={IndianRupee} label="Expected CTC" value={`₹${prescreen!.expected_ctc} Lakh(s)`} />
                    )}
                    {!isInterviewerOnly && prescreen!.notice_period && (
                      <InfoItem icon={Calendar} label="Notice Period" value={prescreen!.notice_period} />
                    )}
                    {!isInterviewerOnly && prescreen!.lwd && (() => {
                      const lwdDate = new Date(prescreen!.lwd);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      lwdDate.setHours(0, 0, 0, 0);
                      const diffDays = Math.round((lwdDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                      const relative = diffDays === 0 ? 'today' : diffDays > 0 ? `in ${diffDays} day${diffDays !== 1 ? 's' : ''}` : `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`;
                      return <InfoItem icon={Calendar} label="Last Working Day" value={`${prescreen!.lwd} (${relative})`} />;
                    })()}
                    {prescreen!.current_location && (
                      <InfoItem icon={MapPin} label="Current Location" value={prescreen!.current_location} />
                    )}
                    {prescreen!.preferred_location && (
                      <InfoItem icon={MapPin} label="Preferred Location" value={prescreen!.preferred_location} />
                    )}
                    {prescreen!.open_to_relocation && (
                      <InfoItem
                        icon={MapPin}
                        label="Open to Relocation"
                        value={
                          prescreen!.open_to_relocation === 'yes' ? '✅ Yes'
                          : prescreen!.open_to_relocation === 'no' ? '❌ No'
                          : '🤔 Maybe'
                        }
                      />
                    )}
                    {prescreen!.work_mode_preference && (prescreen!.work_mode_preference as string[]).length > 0 && (
                      <InfoItem
                        icon={Building2}
                        label="Work Mode"
                        value={(prescreen!.work_mode_preference as string[]).map(m =>
                          m === 'wfo' ? 'WFO' : m === 'wfh' ? 'WFH' : m === 'hybrid' ? 'Hybrid' : 'Flexible'
                        ).join(' · ')}
                      />
                    )}
                  </div>

                  {/* Communication Rating - Highlighted */}
                  {prescreen!.comms_rating != null && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Communication Rating</span>
                      <div>
                        <CommsRatingBadge rating={prescreen!.comms_rating} />
                      </div>
                    </div>
                  )}

                  {/* Academics */}
                  {filledAcademics.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                        Academics
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Level</th>
                              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Institution</th>
                              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Marks</th>
                              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Percentile</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filledAcademics.map(a => (
                              <tr key={a.level} className="border-t">
                                <td className="px-3 py-2 font-medium">{academicLabels[a.level] || a.level}</td>
                                <td className="px-3 py-2">{a.institution || '—'}</td>
                                <td className="px-3 py-2">{a.marks || '—'}</td>
                                <td className="px-3 py-2">{a.percentile || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Nutshell */}
                  {prescreen!.nutshell && (
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">Nutshell / Summary</h4>
                      <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3">
                        {prescreen!.nutshell}
                      </p>
                    </div>
                  )}

                  {/* Screened info */}
                  {prescreen!.screened_at && (() => {
                    const relative = formatRelativeDayLabel(prescreen!.screened_at);
                    return (
                      <p className="text-xs text-muted-foreground">
                        Screened on {formatDateSafe(prescreen!.screened_at)}
                        {relative && <span className="ml-1">({relative})</span>}
                      </p>
                    );
                  })()}
                </div>
                  )}
                </div>
              </div>
            )}

            {/* Interview History — grouped by round */}
            {!isDatabaseContext && interviewHistory && interviewHistory.length > 0 && (() => {
              const verdictCfg: Record<string, { icon: any; color: string; label: string }> = {
                proceeded: { icon: ThumbsUp, color: 'text-green-600 dark:text-green-400', label: 'Proceeded' },
                rejected: { icon: ThumbsDown, color: 'text-red-600 dark:text-red-400', label: 'Rejected' },
                hold: { icon: Pause, color: 'text-yellow-600 dark:text-yellow-400', label: 'On Hold' },
                no_show: { icon: UserX, color: 'text-muted-foreground', label: 'No Show' },
              };
              const modeIconMap: Record<string, any> = { video: Video, phone: PhoneCall, in_person: Users };
              const ratingLabels: Record<string, string> = {
                technical: 'Technical', communication: 'Communication',
                problem_solving: 'Problem Solving', culture_fit: 'Culture Fit',
              };

              const roundMap = buildInterviewHistoryRounds(interviewHistory);
              const rounds = Array.from(roundMap.keys()).sort((a, b) => b - a);
              const maxRound = rounds[0] ?? 1;

              const renderIv = (iv: InterviewHistoryEntry) => {
                const v = iv.verdict ? verdictCfg[iv.verdict] : null;
                const VIcon = v?.icon;
                const ModeIcon = iv.interview_mode ? modeIconMap[iv.interview_mode] : null;
                const ratings = iv.rating_categories || {};
                const stageLabel = interviewStageDisplayName(iv);
                return (
                  <div key={iv.id} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          Round {iv.displayRound} · {stageLabel}
                        </span>
                        {ModeIcon && <ModeIcon className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                      {v && VIcon && (
                        <Badge variant="outline" className={`text-xs gap-1 ${v.color}`}>
                          <VIcon className="w-3 h-3" /> {v.label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {iv.overall_score != null && (
                        <span className="flex items-center gap-1 font-medium">
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" /> {iv.overall_score}/5
                        </span>
                      )}
                      {iv.interviewer?.full_name && <span>by {iv.interviewer.full_name}</span>}
                      {iv.completed_at && <span>{formatDateSafe(iv.completed_at)}</span>}
                    </div>
                    {Object.keys(ratings).length > 0 && Object.values(ratings).some((val: any) => val != null) && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(ratingLabels).map(([key, label]) => {
                          const val = (ratings as any)[key];
                          if (val == null) return null;
                          return <span key={key} className="text-[11px] bg-muted rounded px-1.5 py-0.5">{label}: <strong>{val}</strong>/5</span>;
                        })}
                      </div>
                    )}
                    {iv.feedback && <p className="text-xs text-muted-foreground italic border-l-2 border-primary/20 pl-2">"{iv.feedback}"</p>}
                    {!iv.verdict && !iv.feedback && <p className="text-xs text-muted-foreground italic">Pending feedback</p>}
                    {iv.artifacts && (iv.artifacts as any[]).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {(iv.artifacts as any[]).map((a: any) => (
                          <a
                            key={a.id}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] bg-muted rounded px-1.5 py-0.5 hover:bg-primary/10 hover:text-primary transition-colors max-w-[180px]"
                          >
                            {a.type === 'link'
                              ? <Link2 className="w-3 h-3 shrink-0" />
                              : <Paperclip className="w-3 h-3 shrink-0" />
                            }
                            <span className="truncate">{a.name}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Users className="h-4 w-4" /> Interview History
                    </h3>
                    {rounds.map(round => (
                      <Collapsible key={round} defaultOpen={round === maxRound}>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-data-[state=open]:rotate-90 transition-transform" />
                          <span className="text-sm font-medium">
                            Round {round}
                            {round === maxRound && <span className="ml-1.5 text-xs text-primary font-semibold">Active</span>}
                            {round < maxRound && <span className="ml-1.5 text-xs text-muted-foreground">(Past)</span>}
                          </span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 space-y-2 pl-5">
                          {roundMap.get(round)!.map(renderIv)}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </>
              );
            })()}

            <Separator />

            {/* Notes */}
            {c.notes && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notes</h3>
                <p className="text-sm whitespace-pre-wrap">{c.notes}</p>
              </div>
            )}

            {/* Details */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Source</div>
                  <Badge variant="outline" className="mt-1 text-xs capitalize">{source}</Badge>
                  {source === 'referral' && (candidate as any).referred_by && (
                    <div className="text-xs text-muted-foreground mt-1">
                      by <span className="font-medium text-foreground">{(candidate as any).referred_by}</span>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Added</div>
                  <div className="font-medium mt-1">{formatDateSafe((candidate as any).created_at)}</div>
                </div>
                {(candidate as any).updated_at && (candidate as any).updated_at !== (candidate as any).created_at && (
                  <div>
                    <div className="text-xs text-muted-foreground">Last Updated</div>
                    <div className="font-medium mt-1">
                      {formatDateSafe((candidate as any).updated_at)}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({differenceInDays(new Date(), new Date((candidate as any).updated_at)) === 0
                          ? 'today'
                          : `${differenceInDays(new Date(), new Date((candidate as any).updated_at))}d ago`})
                      </span>
                    </div>
                  </div>
                )}
                {(candidate as any).last_enriched_at && (
                  <div>
                    <div className="text-xs text-muted-foreground">Last Enriched</div>
                    <div className="font-medium mt-1">{formatDateSafe((candidate as any).last_enriched_at)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2 flex-wrap">
              {(candidate as any).resume_url && (
                <Button
                  variant="outline"
                  className="gap-2 flex-1 min-w-[140px]"
                  onClick={() => openResumeUrl((candidate as any).resume_url)}
                >
                  <FileText className="h-4 w-4" /> View Resume
                </Button>
              )}
              {onEnrich && (() => {
                const lastEnrichedAt = (candidate as any).last_enriched_at;
                const daysAgo = lastEnrichedAt
                  ? differenceInDays(new Date(), new Date(lastEnrichedAt))
                  : null;
                const label = isEnriching
                  ? 'Enriching...'
                  : enrichmentScore != null
                    ? `Re-enrich${daysAgo === 0 ? ' (today)' : daysAgo === 1 ? ' (1 day ago)' : daysAgo != null ? ` (${daysAgo}d ago)` : ''}`
                    : 'Enrich Profile';
                return (
                  <Button
                    variant="outline"
                    className="gap-2 flex-1"
                    onClick={() => onEnrich(candidate.id)}
                    disabled={isEnriching}
                  >
                    {isEnriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {label}
                  </Button>
                );
              })()}
              {onEdit && (
                <Button
                  variant="outline"
                  className="gap-2 flex-1 min-w-[140px]"
                  onClick={() => onEdit(candidate)}
                >
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}
            </div>
          </div>
          </div>
          {!isDatabaseContext && (showQuestionKitButton || canEditNotes) && (
            <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between gap-2">
              {showQuestionKitButton ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="pointer-events-auto gap-1.5 shadow-md"
                  onClick={handleViewQuestionKit}
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  View Question Kit
                </Button>
              ) : (
                <span />
              )}
              {canEditNotes && (
                <Button
                  size="sm"
                  variant={notesOpen ? 'default' : 'outline'}
                  className="pointer-events-auto gap-1.5 shadow-md"
                  onClick={() => handleNotesOpenChange(!notesOpen)}
                >
                  <NotebookPen className="h-3.5 w-3.5" />
                  {notesOpen ? 'Close Notes' : 'Notes'}
                </Button>
              )}
            </div>
          )}
          </div>
      </SheetContent>

      <InterviewFeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={(open) => { if (!open) setFeedbackDialogOpen(false); }}
        interview={activeInterview ? {
          ...activeInterview,
          interview_notes: notes || activeInterview.interview_notes || '',
          candidate: { name: candidate?.name ?? '', email: candidate?.email ?? '' },
        } as any : null}
        onSubmit={handleFeedbackSubmitFromDrawer}
        isSubmitting={isSubmittingFeedback}
        overlayClassName="z-[80]"
        contentClassName="z-[80]"
      />
    </Sheet>
    {interviewNotesPanelDesktop}
    {isSmDown && activeInterview && !isDatabaseContext && (
      <Sheet open={notesOpen} onOpenChange={handleNotesOpenChange}>
        <SheetContent
          side="bottom"
          overlayClassName="z-[70]"
          hideCloseButton
          className="z-[70] flex h-auto max-h-[65vh] flex-col gap-0 rounded-t-xl p-0"
        >
          {notesOpen && interviewNotesBody}
        </SheetContent>
      </Sheet>
    )}
    <JobApplicationFormDialog
      open={applicationFormDialogOpen}
      onOpenChange={(nextOpen) => {
        setApplicationFormDialogOpen(nextOpen);
        if (!nextOpen) setApplicationFormId(null);
      }}
      applicationId={applicationFormId}
      candidateName={candidate?.name}
    />
    {candidate && (
      <AssignAssessmentDialog
        open={assignAssessmentOpen}
        onOpenChange={setAssignAssessmentOpen}
        candidate={candidate}
        jobId={candidateJobId}
        defaultAssessmentId={jobAssessmentConfig?.defaultAssessmentId ?? null}
        deadlineDays={jobAssessmentConfig?.config.deadline_days ?? 7}
      />
    )}
    </>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}
