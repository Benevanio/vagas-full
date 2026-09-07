import type {
  Job,
  JobLevel,
  JobStatus,
  JobType,
  Mentor,
  SearchPreferences,
  UserProfile,
} from "../types";

export const jobStatuses: Record<JobStatus, string> = {
  saved: "Salva",
  applied: "Candidatura enviada",
  interviewing: "Em entrevista",
  rejected: "Arquivada",
  accepted: "Proposta aceita",
};

export const jobStatusClasses: Record<JobStatus, string> = {
  saved: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
  applied: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300",
  interviewing: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300",
  rejected: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
  accepted: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
};

export const jobTypes: JobType[] = ["Remoto", "Híbrido", "Presencial"];
export const jobLevels: JobLevel[] = [
  "Estágio/Trainee",
  "Júnior",
  "Pleno",
  "Sênior",
];

export const initialJobs: Job[] = [
  {
    id: "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
    jobTitle: "Desenvolvedor Frontend Sênior React",
    company: "Fintech Hub Brasil",
    location: "São Paulo, SP (Híbrido)",
    salary: "R$ 14.000 - R$ 17.500",
    type: "Híbrido",
    level: "Sênior",
    matchScore: 94,
    tags: ["React", "TypeScript", "Tailwind CSS", "Next.js"],
    posted: "Há 2 dias",
    status: "saved",
    jobLink: "https://fintechhub.com/vagas/react-senior",
    source: "Gupy",
    notes: "Preparar portfólio de fintech antes de submeter.",
  },
  {
    id: "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b",
    jobTitle: "Engenheiro de Software Fullstack Pleno",
    company: "Stellar Tech",
    location: "Remoto",
    salary: "R$ 8.500 - R$ 11.000",
    type: "Remoto",
    level: "Pleno",
    matchScore: 89,
    tags: ["React", "Node.js", "PostgreSQL", "Docker"],
    posted: "Há 5 dias",
    status: "applied",
    jobLink: "https://stellartech.solides.jobs/vaga/fullstack-pleno",
    source: "Solides",
    notes: "Inscrito na vaga. Aguardando retorno do RH no e-mail.",
  },
  {
    id: "a3a1b894-3a5f-4a0b-9ffb-3b8d4e9c71bc",
    jobTitle: "Designer de Produto UI/UX Júnior",
    company: "Agência Criativa Digital",
    location: "Rio de Janeiro, RJ (Presencial)",
    salary: "R$ 4.500 - R$ 5.800",
    type: "Presencial",
    level: "Júnior",
    matchScore: 78,
    tags: ["Figma", "Prototipação", "Design Systems", "User Research"],
    posted: "Há 1 dia",
    status: "saved",
    jobLink: "https://agenciacriativa.com/carreiras/uiux",
    source: "LinkedIn",
    notes: "Necessário enviar portfólio via formulário próprio.",
  },
  {
    id: "d9b2c374-e861-46da-b39f-7bcda238510a",
    jobTitle: "Product Owner & Product Manager",
    company: "Unicórnio Delivery",
    location: "Remoto",
    salary: "R$ 12.000 - R$ 15.000",
    type: "Remoto",
    level: "Sênior",
    matchScore: 82,
    tags: ["Agile", "Scrum", "Product Metrics", "Jira"],
    posted: "Há 1 semana",
    status: "interviewing",
    jobLink: "https://unicorndelivery.gupy.io/jobs/19902",
    source: "Gupy",
    notes: "Entrevista marcada para terça-feira com a Product Lead Carolina.",
  },
];

export const initialMentors: Mentor[] = [
  {
    id: "mentor-1",
    name: "Julio Silva",
    rating: 3,
    completed: 33,
    days: "Seg, Qua, Sex",
    hours: "10:00 - 13:00",
    nextSessionDate: "Próxima mentoria: quarta-feira, 24 jul",
    specialty: "Frontend React, Design de Componentes e Otimização de Performance",
    avatarColor: "from-teal-500 to-emerald-600",
    platform: "Google Meet",
    platformUrl: "https://meet.google.com/react-mentor-demo",
    agenda:
      "Revisão de componentes React, organização de estados, renderização eficiente e próximos passos para um portfólio frontend mais forte.",
  },
  {
    id: "mentor-2",
    name: "Silvia Maria",
    rating: 4,
    completed: 103,
    days: "Seg, Ter, Qua, Sex",
    hours: "10:00 - 13:00",
    nextSessionDate: "Próxima mentoria: terça-feira, 23 jul",
    specialty: "Arquitetura Fullstack, Bancos de Dados Relacionais e APIs seguras",
    avatarColor: "from-blue-500 to-indigo-600",
    platform: "Zoom",
    platformUrl: "https://zoom.us/j/1234567890",
    agenda:
      "Mapeamento de arquitetura fullstack, desenho de APIs, decisões de banco de dados e checklist de segurança para aplicações em produção.",
  },
  {
    id: "mentor-3",
    name: "Bia Costa",
    rating: 1,
    completed: 3,
    days: "Seg, Qua, Sex",
    hours: "10:00 - 13:00",
    nextSessionDate: "Próxima mentoria: sexta-feira, 26 jul",
    specialty: "Design de Produto, Figma Avançado, Prototipação e Testes com Usuários",
    avatarColor: "from-pink-500 to-purple-600",
    platform: "Discord",
    platformUrl: "https://discord.gg/product-design-demo",
    agenda:
      "Análise de fluxo de produto, refinamento de protótipos no Figma, narrativa de case e preparação para entrevistas de UX/UI.",
  },
];

export const initialUser: UserProfile = {
  firstName: "Bruna",
  lastName: "Silva",
  displayName: "Bruna Silva",
  username: "brunasilva",
  email: "bruna.silva@exemplo.com",
  avatarUrl: "",
  phone: "(11) 98765-4321",
  level: "Pleno",
  technologies: ["React", "TypeScript", "Tailwind CSS", "Next.js", "Node.js"],
  technologyExperiences: [
    { name: "React", years: 5 },
    { name: "TypeScript", years: 4 },
    { name: "Tailwind CSS", years: 3 },
    { name: "Next.js", years: 3 },
    { name: "Node.js", years: 2 },
  ],
};

export const initialPreferences: SearchPreferences = {
  keywords: ["React", "Frontend", "Fullstack"],
  searchLocation: "São Paulo, SP",
  remoteOnly: false,
  jobTypes: [],
  emailNotifications: true,
  careerChecklist: [],
};
