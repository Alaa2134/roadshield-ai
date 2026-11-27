// Public website copy (English + Arabic). Factual product descriptions only: no customer
// logos, testimonials, usage statistics or certifications are claimed anywhere.
import type { Locale } from './dict';

type Feature = { title: string; body: string; bullets?: string[] };
export type FeaturePage = {
  slug: string; icon: string; eyebrow: string; title: string; lead: string; features: Feature[];
  principlesTitle?: string; principles?: Feature[]; visual?: 'vision' | 'finance' | 'map' | 'predict' | 'security' | 'workflow';
};

type Copy = {
  nav: { platform: string; vision: string; finance: string; predictive: string; solutions: string; government: string; contractors: string;
    technology: string; security: string; pricing: string; about: string; contact: string; signIn: string; demo: string; product: string; company: string; legal: string };
  hero: { eyebrow: string; title: string; lead: string; primary: string; secondary: string; preview: string };
  home: {
    showcaseTitle: string; showcaseLead: string;
    pillars: Feature[];
    detectTitle: string; detectLead: string; detectPoints: string[];
    financeTitle: string; financeLead: string; financePoints: { k: string; v: string }[];
    predictTitle: string; predictLead: string; predictPoints: string[];
    workTitle: string; workLead: string; workSteps: Feature[];
    globalTitle: string; globalLead: string; globalPoints: Feature[];
    trustTitle: string; trustLead: string; trustPoints: Feature[];
    ctaTitle: string; ctaLead: string;
  };
  footer: { tagline: string; rights: string; dataNote: string };
  pages: Record<string, FeaturePage>;
  pricing: { title: string; lead: string; plans: { name: string; for: string; features: string[]; cta: string }[]; note: string };
  about: { title: string; lead: string; sections: Feature[] };
  contact: { title: string; lead: string; demoTitle: string; demoLead: string; name: string; email: string; organization: string; country: string;
    role: string; message: string; send: string; sent: string; privacy: string; interest: string; interests: Record<string, string> };
};

const enCopy: Copy = {
  nav: { platform: 'Platform', vision: 'RoadShield Vision', finance: 'Finance AI', predictive: 'Predictive Maintenance', solutions: 'Solutions',
    government: 'Government', contractors: 'Contractors', technology: 'Technology', security: 'Security', pricing: 'Pricing', about: 'About',
    contact: 'Contact', signIn: 'Sign in', demo: 'Request a demo', product: 'Product', company: 'Company', legal: 'Trust' },
  hero: {
    eyebrow: 'Road infrastructure intelligence',
    title: 'Intelligence for Every Road.',
    lead: 'Monitor road conditions, predict maintenance costs, optimize budgets, and manage infrastructure repairs from one intelligent platform.',
    primary: 'Request a Demo', secondary: 'Explore the Platform', preview: 'Interface preview',
  },
  home: {
    showcaseTitle: 'One operating system for the whole road lifecycle',
    showcaseLead: 'From the first photo of a crack to the final payment for its repair, every step lives in one auditable record.',
    pillars: [
      { title: 'Detect', body: 'Citizens and inspectors photograph damage; RoadShield Vision suggests the defect class with a confidence score for a human to confirm.' },
      { title: 'Predict', body: 'Explainable cost ranges built from your own verified, completed projects — or a clear “insufficient data” when there is not enough evidence.' },
      { title: 'Budget', body: 'Allocate funds with approval workflows that keep budget, commitment, actual cost and payment strictly separate.' },
      { title: 'Repair', body: 'Issue work orders to contractors, collect progress photos and quantities from the field, and accept work with evidence.' },
      { title: 'Optimize', body: 'Compare funding scenarios — safety first, maximum coverage, balanced, critical damage — on real project records.' },
    ],
    detectTitle: 'AI damage detection that knows its limits',
    detectLead: 'RoadShield Vision runs a road-damage detector trained on the multi-national RDD2022 dataset and reports what it actually sees.',
    detectPoints: [
      'Longitudinal, transverse and alligator cracks, and potholes (RDD2022 classes D00–D40)',
      'Every result carries model name, version and confidence — and is cryptographically signed',
      'Faces and licence plates are blurred before images are shared',
      'AI output is a suggestion; engineers verify severity and dimensions on site',
    ],
    financeTitle: 'Financial intelligence built for public money',
    financeLead: 'Every road and project gets a financial profile in which no two kinds of money are ever confused.',
    financePoints: [
      { k: 'Budget', v: 'Money allocated and approved' }, { k: 'Commitment', v: 'Signed contracts and change orders' },
      { k: 'Invoiced', v: 'Contractor invoices approved for payment' }, { k: 'Verified actual', v: 'Costs approved under the four-eyes rule' },
      { k: 'Paid', v: 'Payments recorded against approved invoices' },
    ],
    predictTitle: 'Cost prediction you can explain to an auditor',
    predictLead: 'Predictions show their range, drivers, comparable projects, assumptions and data age. Without enough verified history, RoadShield says so.',
    predictPoints: ['Interquartile cost range per verified m²', 'Major cost drivers by category', 'Comparable completed projects', 'Model version and assumptions'],
    workTitle: 'Contractor and work-order management',
    workLead: 'Contractors get a dedicated, tightly scoped workspace. They see only their own contracts, work orders and invoices.',
    workSteps: [
      { title: 'Issue', body: 'Engineers issue work orders against an approved project and contract.' },
      { title: 'Execute', body: 'Contractors log progress, quantities and before/after photos — even offline.' },
      { title: 'Verify', body: 'Engineers inspect and accept; finance approves costs and invoices.' },
      { title: 'Pay', body: 'Payments are recorded against approved invoices and can never exceed them.' },
    ],
    globalTitle: 'Built to launch locally and scale internationally',
    globalLead: 'The pilot configuration is Egypt — Damietta — New Damietta. Nothing about Egypt is hard-coded.',
    globalPoints: [
      { title: 'Arabic and English', body: 'Full right-to-left layouts, not mirrored afterthoughts.' },
      { title: 'Any currency', body: 'Each project has one currency; RoadShield never converts silently.' },
      { title: 'Any country', body: 'Country, time zone, engineering standard and unit rates are per organization.' },
      { title: 'Open geodata', body: 'Road geometry from OpenStreetMap, with source and licence on every segment.' },
    ],
    trustTitle: 'Security and data integrity by design',
    trustLead: 'Authorization lives in the database, next to the data — not only in the user interface.',
    trustPoints: [
      { title: 'Tenant isolation', body: 'Row-level security keeps every organization’s records private, including from platform staff.' },
      { title: 'Granular roles', body: 'Owner, finance manager, engineer, inspector, contractor and executive viewer — each with precise rights.' },
      { title: 'Four-eyes approvals', body: 'Budgets, estimates, actual costs, invoices and unit rates need a second approver.' },
      { title: 'Complete audit trail', body: 'Every financial action is logged with who, what and when.' },
    ],
    ctaTitle: 'See RoadShield on your own road network',
    ctaLead: 'We will import your service area from OpenStreetMap and walk through the workflow with your team.',
  },
  footer: {
    tagline: 'Detect. Predict. Budget. Repair. Optimize.',
    rights: 'RoadShield AI',
    dataNote: 'Map data © OpenStreetMap contributors (ODbL). Detection model trained on RDD2022 (CC BY-SA 4.0).',
  },
  pages: {
    platform: {
      slug: 'platform', icon: 'layers', visual: 'map', eyebrow: 'RoadShield OS', title: 'The platform',
      lead: 'RoadShield OS connects the road network, field inspections, citizen reports, projects, contractors and finance in one multi-tenant system.',
      features: [
        { title: 'Road network', body: 'Import OpenStreetMap road geometry for your service area. Each segment keeps its source, licence and retrieval date.', bullets: ['Condition by segment from approved inspections', 'Unknown attributes stay explicitly unknown'] },
        { title: 'Inspections', body: 'Engineers and inspectors record defects with verified dimensions from the mobile app — online or offline.', bullets: ['RDD2022 defect classes plus engineering classes', 'Approval by a second engineer updates road condition'] },
        { title: 'Projects', body: 'Plan maintenance projects across one or more segments, with budgets, estimates, contracts and work orders.', bullets: ['Status workflow with history', 'Project boundaries on the map'] },
        { title: 'Finance', body: 'A ledger that separates budget, commitment, invoiced, verified actual and paid amounts.', bullets: ['Decimal-exact arithmetic', 'Approval queue for finance teams'] },
        { title: 'Contractors', body: 'A secure contractor workspace for work orders, progress, costs and invoices.', bullets: ['Strictly scoped visibility', 'Before and after evidence'] },
        { title: 'Intelligence', body: 'Dashboards, cost predictions, budget scenarios and an AI model registry with full lineage.', bullets: ['Every metric from a real query', 'Model cards for every deployed model'] },
      ],
    },
    vision: {
      slug: 'vision', icon: 'scan', visual: 'vision', eyebrow: 'RoadShield Vision', title: 'Computer vision for road damage',
      lead: 'Photograph the road. RoadShield Vision detects cracks and potholes, draws bounding boxes and reports its confidence — then a person decides.',
      features: [
        { title: 'Trained on real roads', body: 'The current detector is a YOLOv8s model trained on the RDD2022 Japan and India subsets by its open-source authors. RoadShield has not retrained it; fine-tuning on local imagery is the next milestone.' },
        { title: 'Four standard classes', body: 'D00 longitudinal cracks, D10 transverse cracks, D20 alligator cracks and D40 potholes, following the RDD2022 annotation definitions.' },
        { title: 'Signed results', body: 'Each analysis is signed by the AI service and verified by the database, so a result cannot be forged, edited or reused for another photo.' },
        { title: 'Privacy first', body: 'EXIF and GPS metadata are stripped; faces and licence plates are blurred where detectable; photos become visible to others only after staff approval.' },
        { title: 'Honest performance', body: 'We publish what has been measured and how. A held-out evaluation on local Egyptian road imagery has not yet been performed and is not claimed.' },
        { title: 'Human verification', body: 'AI severity is never presented as an engineering assessment. Engineers verify dimensions and severity in the field.' },
      ],
    },
    finance: {
      slug: 'finance', icon: 'wallet', visual: 'finance', eyebrow: 'RoadShield Finance AI', title: 'Road financial intelligence',
      lead: 'A financial system designed for road maintenance, where every amount has a source, an approver and an audit trail.',
      features: [
        { title: 'Financial profile per road', body: 'Annual budgets, project budgets, estimates, contracts, change orders, actual costs, invoices and payments — linked to the road segments they concern.' },
        { title: 'Detailed cost breakdown', body: 'Asphalt, milling, excavation, filling, aggregate, transportation, labour, equipment, traffic control, inspection, testing, taxes and other approved costs.', bullets: ['Description, unit, quantity, unit rate, currency', 'Source, date, evidence and approval status'] },
        { title: 'Estimates from cited rates', body: 'Engineering estimates are quantity × unit rate. Every rate is either a verified rate from your library or carries a cited source. RoadShield never invents unit rates.' },
        { title: 'Controls that hold', body: 'Invoices cannot exceed the contract commitment; payments cannot exceed the invoice; tender values can never be recorded as actual costs.' },
        { title: 'Variance analysis', body: 'Compare verified actual cost with the approved estimate and budget, by category and over time.' },
        { title: 'Export', body: 'Download projects, costs, invoices and payments as CSV for your accounting system and auditors.' },
      ],
    },
    predictive: {
      slug: 'predictive-maintenance', icon: 'trending', visual: 'predict', eyebrow: 'RoadShield Predict', title: 'Predictive maintenance and cost forecasting',
      lead: 'Forecast repair costs from what your organization has actually paid — and learn continuously as projects close.',
      features: [
        { title: 'Explainable first', body: 'The baseline estimator uses verified actual cost per verified damaged m² from comparable completed projects, and shows the comparables it used.' },
        { title: 'Minimum evidence', body: 'With fewer than five verified comparables, the system displays “Insufficient verified data to generate a reliable prediction.”' },
        { title: 'Machine learning when data allows', body: 'Linear, random-forest and gradient-boosting models are trained with chronological validation and a held-out test set once enough verified history exists.' },
        { title: 'Continuous learning', body: 'Completed projects with approved actual costs become eligible training records after data-quality checks. Candidates are compared with production and deployed only on approval.' },
        { title: 'Budget Planning Studio', body: 'Explore funding scenarios — Safety First, Maximum Road Coverage, Balanced Maintenance, Critical Damage Priority — and keep humans in charge of the decision.' },
        { title: 'Lineage', body: 'Every model version keeps its dataset, metrics, approver and deployment date.' },
      ],
    },
    solutions: {
      slug: 'solutions', icon: 'building', visual: 'workflow', eyebrow: 'Solutions', title: 'Built for every organization that keeps roads safe',
      lead: 'Municipalities, road authorities, engineering firms and contractors work in the same system — each with exactly the access they need.',
      features: [
        { title: 'Municipalities', body: 'Turn citizen reports into verified, prioritized repairs and show residents what happened to their report.' },
        { title: 'Road authorities', body: 'Manage large networks with condition by segment, inspection programmes and multi-year budget planning.' },
        { title: 'Engineering consultants', body: 'Run inspections, prepare estimates from cited rates and supervise contractors on behalf of clients.' },
        { title: 'Contractors', body: 'Receive work orders, report progress and quantities, and submit invoices with evidence.' },
      ],
    },
    government: {
      slug: 'solutions/government', icon: 'landmark', visual: 'finance', eyebrow: 'Government', title: 'For municipalities and road authorities',
      lead: 'Spend maintenance budgets where they matter most, and be able to show exactly how every pound, dollar or riyal was used.',
      features: [
        { title: 'Citizen reporting', body: 'Residents report hazards from the RoadShield app; staff verify, assign and resolve them with a public status timeline.' },
        { title: 'Condition-based planning', body: 'Prioritize projects by verified defects, road condition and coverage, not by who called last.' },
        { title: 'Approval workflows', body: 'Budgets, estimates, costs and invoices require a second approver, with a full audit log.' },
        { title: 'Executive visibility', body: 'Read-only executive access to network, backlog and financial dashboards.' },
      ],
    },
    contractors: {
      slug: 'solutions/contractors', icon: 'hardhat', visual: 'workflow', eyebrow: 'Contractors', title: 'For maintenance contractors',
      lead: 'A focused workspace for the work you have been assigned — nothing more, nothing less.',
      features: [
        { title: 'Work orders', body: 'See assigned work orders with location, scope and due date on web and mobile.' },
        { title: 'Progress and evidence', body: 'Log progress, quantities and before/after photos from the site, even without a connection.' },
        { title: 'Costs and invoices', body: 'Submit costs against your work orders and invoices against your contract, and follow their review.' },
        { title: 'Strict privacy', body: 'Contractors never see other contractors, budgets or the client’s internal finance.' },
      ],
    },
    technology: {
      slug: 'technology', icon: 'cpu', visual: 'map', eyebrow: 'Technology', title: 'The technology behind RoadShield',
      lead: 'Proven, open technologies chosen for reliability, security and long-term maintainability.',
      features: [
        { title: 'PostgreSQL + PostGIS', body: 'Geospatial data, financial ledger and authorization rules live in one transactional database with versioned migrations.' },
        { title: 'Row-level security', body: 'Every query is filtered by organization and role inside the database. Writes go through validated, audited functions.' },
        { title: 'Native mobile apps', body: 'iOS and Android apps built with React Native and Expo: native camera, GPS, notifications, secure storage and offline queues.' },
        { title: 'Web platform', body: 'Next.js and TypeScript for the website and the RoadShield OS dashboard, with MapLibre GL maps.' },
        { title: 'AI services', body: 'FastAPI inference with ONNX Runtime; reproducible PyTorch training scripts; scikit-learn cost models with chronological validation.' },
        { title: 'Open map data', body: 'OpenStreetMap-derived road geometry and open vector tiles, with attribution and licence tracking.' },
      ],
    },
    security: {
      slug: 'security', icon: 'shield', visual: 'security', eyebrow: 'Security & privacy', title: 'Security, privacy and data integrity',
      lead: 'Road images can contain private information and road budgets are public money. RoadShield is designed for both.',
      features: [
        { title: 'Authentication', body: 'E-mail verification, secure password hashing by the identity provider, and short-lived sessions.' },
        { title: 'Authorization in the database', body: 'Row-level security and role checks in Postgres functions enforce tenant isolation and granular financial permissions.' },
        { title: 'Four-eyes principle', body: 'Financial approvals require a different person from the submitter (configurable per organization).' },
        { title: 'Private storage', body: 'Images and documents are stored in private buckets and served through short-lived signed URLs.' },
        { title: 'Image privacy', body: 'Metadata stripping, face and licence-plate blurring, and staff approval before images are shown to others.' },
        { title: 'Auditability', body: 'Every financial and administrative action is recorded in an append-only audit log per organization.' },
      ],
      principlesTitle: 'What we do not claim',
      principles: [
        { title: 'No certifications claimed', body: 'RoadShield does not claim ISO 27001, SOC 2 or any other certification. Independent assessment is on the roadmap.' },
        { title: 'Responsible disclosure', body: 'Report vulnerabilities through the contact page; we acknowledge reports and keep reporters informed.' },
      ],
    },
  },
  pricing: {
    title: 'Plans and quotes',
    lead: 'Pricing depends on network size, number of users and deployment requirements. Tell us about your organization and we will prepare a quote.',
    plans: [
      { name: 'Pilot', for: 'A single city or district evaluating RoadShield', features: ['Up to 25 users', 'Up to 20,000 road segments', 'Inspections, projects, finance, contractors', 'Citizen reporting app'], cta: 'Request a quote' },
      { name: 'Professional', for: 'Municipalities and authorities in production', features: ['Up to 250 users', 'Up to 250,000 road segments', 'Budget Planning Studio', 'Cost predictions and exports'], cta: 'Request a quote' },
      { name: 'Enterprise', for: 'National authorities and multi-region operators', features: ['Unlimited users and segments', 'Single sign-on integration', 'Audit exports and model center', 'Dedicated deployment options'], cta: 'Talk to us' },
    ],
    note: 'Plan limits are enforced by the platform. Prices are agreed per contract and are not published.',
  },
  about: {
    title: 'About RoadShield AI',
    lead: 'RoadShield AI builds software that helps public bodies and their partners keep roads safe and spend maintenance money well.',
    sections: [
      { title: 'Where we start', body: 'RoadShield is preparing its first pilot in Egypt, with New Damietta as a candidate pilot city. The platform is architected for international use from day one.' },
      { title: 'How we build', body: 'Real data, explicit uncertainty and verifiable records. When we do not know something — a road’s width, a model’s local accuracy, a reliable cost — the product says so.' },
      { title: 'What we believe', body: 'Better roads come from better decisions, and better decisions come from honest, auditable information that everyone involved can trust.' },
    ],
  },
  contact: {
    title: 'Contact us', lead: 'Questions about RoadShield, partnerships or security? Send us a message.',
    demoTitle: 'Request a demo', demoLead: 'Tell us about your road network and we will schedule a walkthrough on your own service area.',
    name: 'Full name', email: 'Work e-mail', organization: 'Organization', country: 'Country', role: 'Role', message: 'How can we help?',
    send: 'Send', sent: 'Thank you — your message has been received. We will reply by e-mail.', privacy: 'We use these details only to respond to your request.',
    interest: 'Interested in', interests: { demo: 'Product demo', pilot: 'Pilot programme', partnership: 'Partnership', security: 'Security', other: 'Other' },
  },
};

const arCopy: Copy = {
  nav: { platform: 'المنصة', vision: 'رود شيلد فيجن', finance: 'الذكاء المالي', predictive: 'الصيانة التنبؤية', solutions: 'الحلول',
    government: 'الجهات الحكومية', contractors: 'المقاولون', technology: 'التقنية', security: 'الأمان', pricing: 'الأسعار', about: 'من نحن',
    contact: 'تواصل معنا', signIn: 'تسجيل الدخول', demo: 'اطلب عرضًا توضيحيًا', product: 'المنتج', company: 'الشركة', legal: 'الثقة' },
  hero: {
    eyebrow: 'ذكاء البنية التحتية للطرق',
    title: 'ذكاء لكل طريق.',
    lead: 'راقب حالة الطرق، وتوقّع تكاليف الصيانة، وحسّن الميزانيات، وأدِر إصلاحات البنية التحتية من منصة ذكية واحدة.',
    primary: 'اطلب عرضًا توضيحيًا', secondary: 'استكشف المنصة', preview: 'معاينة الواجهة',
  },
  home: {
    showcaseTitle: 'نظام تشغيل واحد لدورة حياة الطريق كاملة',
    showcaseLead: 'من أول صورة لشرخ حتى آخر دفعة لإصلاحه، تبقى كل خطوة في سجل واحد قابل للتدقيق.',
    pillars: [
      { title: 'اكتشف', body: 'يصوّر المواطنون والمفتشون الأضرار، ويقترح رود شيلد فيجن نوع العيب مع درجة الثقة ليؤكده إنسان.' },
      { title: 'تنبّأ', body: 'نطاقات تكلفة قابلة للتفسير مبنية على مشروعاتك المكتملة والمُتحقق منها — أو رسالة واضحة بعدم كفاية البيانات.' },
      { title: 'خطّط الميزانية', body: 'خصّص الأموال بمسارات اعتماد تفصل بصرامة بين الميزانية والالتزام والتكلفة الفعلية والمدفوع.' },
      { title: 'أصلِح', body: 'أصدر أوامر العمل للمقاولين، واجمع صور التقدم والكميات من الموقع، واقبل الأعمال بالأدلة.' },
      { title: 'حسِّن', body: 'قارن سيناريوهات التمويل — السلامة أولًا، أقصى تغطية، متوازن، الأضرار الحرجة — على سجلات مشروعات حقيقية.' },
    ],
    detectTitle: 'كشف ذكي للأضرار يعرف حدوده',
    detectLead: 'يشغّل رود شيلد فيجن نموذج كشف أضرار مدرَّبًا على مجموعة بيانات RDD2022 متعددة الدول، ويُبلغ بما يراه فعلًا.',
    detectPoints: [
      'الشروخ الطولية والعرضية والتمساحية والحفر (فئات RDD2022 من D00 إلى D40)',
      'كل نتيجة تحمل اسم النموذج وإصداره ودرجة الثقة — وموقّعة تشفيريًا',
      'تُموَّه الوجوه ولوحات السيارات قبل مشاركة الصور',
      'مخرجات الذكاء اقتراح فقط؛ يتحقق المهندسون من الشدة والأبعاد في الموقع',
    ],
    financeTitle: 'ذكاء مالي مصمم للمال العام',
    financeLead: 'لكل طريق ومشروع ملف مالي لا يختلط فيه نوعان من الأموال أبدًا.',
    financePoints: [
      { k: 'الميزانية', v: 'الأموال المخصصة والمعتمدة' }, { k: 'الالتزام', v: 'العقود الموقعة وأوامر التغيير' },
      { k: 'المفوتر', v: 'فواتير المقاولين المعتمدة للدفع' }, { k: 'الفعلي المُتحقق منه', v: 'تكاليف معتمدة بمبدأ الأعين الأربع' },
      { k: 'المدفوع', v: 'دفعات مسجلة مقابل فواتير معتمدة' },
    ],
    predictTitle: 'توقعات تكلفة يمكنك شرحها للمدقق',
    predictLead: 'تعرض التوقعات النطاق والمحركات والمشروعات المماثلة والافتراضات وعمر البيانات. وعند نقص السجل المُتحقق منه يقول النظام ذلك صراحة.',
    predictPoints: ['نطاق ربعي للتكلفة لكل م² مُتحقق منه', 'أهم محركات التكلفة حسب الفئة', 'مشروعات مكتملة مماثلة', 'إصدار النموذج والافتراضات'],
    workTitle: 'إدارة المقاولين وأوامر العمل',
    workLead: 'يحصل المقاولون على مساحة عمل مخصصة ومحدودة بدقة؛ لا يرون إلا عقودهم وأوامر عملهم وفواتيرهم.',
    workSteps: [
      { title: 'إصدار', body: 'يصدر المهندسون أوامر العمل ضمن مشروع وعقد معتمدين.' },
      { title: 'تنفيذ', body: 'يسجل المقاولون التقدم والكميات وصور قبل/بعد — حتى دون اتصال.' },
      { title: 'تحقق', body: 'يفحص المهندسون ويقبلون الأعمال، ويعتمد الفريق المالي التكاليف والفواتير.' },
      { title: 'دفع', body: 'تُسجَّل الدفعات مقابل الفواتير المعتمدة ولا يمكن أن تتجاوزها.' },
    ],
    globalTitle: 'مُصمَّم للانطلاق محليًا والتوسع دوليًا',
    globalLead: 'إعداد التجربة الأولى: مصر — دمياط — دمياط الجديدة. ولا شيء خاص بمصر مُثبَّت في النظام.',
    globalPoints: [
      { title: 'العربية والإنجليزية', body: 'واجهات كاملة من اليمين إلى اليسار، وليست انعكاسًا متأخرًا.' },
      { title: 'أي عملة', body: 'لكل مشروع عملة واحدة؛ ولا يحوّل النظام العملات خفية.' },
      { title: 'أي دولة', body: 'الدولة والمنطقة الزمنية والمعيار الهندسي وأسعار الوحدات خاصة بكل مؤسسة.' },
      { title: 'بيانات جغرافية مفتوحة', body: 'هندسة الطرق من OpenStreetMap مع المصدر والترخيص لكل مقطع.' },
    ],
    trustTitle: 'الأمان وسلامة البيانات منذ التصميم',
    trustLead: 'الصلاحيات تُطبَّق في قاعدة البيانات بجوار البيانات — لا في الواجهة فقط.',
    trustPoints: [
      { title: 'عزل المؤسسات', body: 'أمان على مستوى الصفوف يحفظ خصوصية سجلات كل مؤسسة، حتى عن فريق المنصة.' },
      { title: 'أدوار دقيقة', body: 'مالك، مدير مالي، مهندس، مفتش، مقاول، ومشاهد تنفيذي — لكل منها صلاحيات محددة.' },
      { title: 'اعتماد بالأعين الأربع', body: 'الميزانيات والتقديرات والتكاليف الفعلية والفواتير وأسعار الوحدات تحتاج معتمِدًا ثانيًا.' },
      { title: 'سجل تدقيق كامل', body: 'كل إجراء مالي مسجل: من، وماذا، ومتى.' },
    ],
    ctaTitle: 'شاهد رود شيلد على شبكة طرقك',
    ctaLead: 'سنستورد منطقة خدمتك من OpenStreetMap ونستعرض سير العمل مع فريقك.',
  },
  footer: {
    tagline: 'اكتشف. تنبّأ. خطّط الميزانية. أصلِح. حسِّن.',
    rights: 'رود شيلد AI',
    dataNote: 'بيانات الخرائط © مساهمو OpenStreetMap (ODbL). نموذج الكشف مدرَّب على RDD2022 (CC BY-SA 4.0).',
  },
  pages: {
    platform: {
      slug: 'platform', icon: 'layers', visual: 'map', eyebrow: 'RoadShield OS', title: 'المنصة',
      lead: 'يربط RoadShield OS شبكة الطرق والفحوص الميدانية وبلاغات المواطنين والمشروعات والمقاولين والمالية في نظام واحد متعدد المؤسسات.',
      features: [
        { title: 'شبكة الطرق', body: 'استورد هندسة الطرق من OpenStreetMap لمنطقة خدمتك. يحتفظ كل مقطع بمصدره وترخيصه وتاريخ استرجاعه.', bullets: ['حالة كل مقطع من الفحوص المعتمدة', 'الخصائص المجهولة تبقى مجهولة صراحة'] },
        { title: 'الفحوص', body: 'يسجل المهندسون والمفتشون العيوب بأبعاد مُتحقق منها من تطبيق الهاتف — متصلين أو دون اتصال.', bullets: ['فئات RDD2022 وفئات هندسية إضافية', 'اعتماد مهندس ثانٍ يحدّث حالة الطريق'] },
        { title: 'المشروعات', body: 'خطط مشروعات الصيانة عبر مقطع أو أكثر، مع الميزانيات والتقديرات والعقود وأوامر العمل.', bullets: ['مسار حالات مع سجل كامل', 'حدود المشروع على الخريطة'] },
        { title: 'المالية', body: 'دفتر يفصل بين الميزانية والالتزام والمفوتر والفعلي المُتحقق منه والمدفوع.', bullets: ['حسابات عشرية دقيقة', 'قائمة اعتماد للفرق المالية'] },
        { title: 'المقاولون', body: 'مساحة آمنة للمقاولين لأوامر العمل والتقدم والتكاليف والفواتير.', bullets: ['رؤية محدودة بدقة', 'أدلة قبل وبعد'] },
        { title: 'الذكاء', body: 'لوحات مؤشرات وتوقعات تكلفة وسيناريوهات ميزانية وسجل لنماذج الذكاء مع تتبع كامل.', bullets: ['كل مؤشر من استعلام حقيقي', 'بطاقة تعريف لكل نموذج منشور'] },
      ],
    },
    vision: {
      slug: 'vision', icon: 'scan', visual: 'vision', eyebrow: 'رود شيلد فيجن', title: 'رؤية حاسوبية لأضرار الطرق',
      lead: 'صوّر الطريق. يكتشف رود شيلد فيجن الشروخ والحفر، ويرسم مربعات التحديد ويُبلغ بدرجة ثقته — ثم يقرر الإنسان.',
      features: [
        { title: 'مدرَّب على طرق حقيقية', body: 'الكاشف الحالي نموذج YOLOv8s درّبه مؤلفوه مفتوحو المصدر على بيانات اليابان والهند من RDD2022. لم تُعِد رود شيلد تدريبه بعد؛ والضبط الدقيق على صور محلية هو المرحلة التالية.' },
        { title: 'أربع فئات قياسية', body: 'D00 شروخ طولية، D10 شروخ عرضية، D20 تشققات تمساحية، D40 حفر — وفق تعريفات التوصيف في RDD2022.' },
        { title: 'نتائج موقّعة', body: 'كل تحليل موقّع من خدمة الذكاء وتتحقق منه قاعدة البيانات، فلا يمكن تزويره أو تعديله أو استخدامه لصورة أخرى.' },
        { title: 'الخصوصية أولًا', body: 'تُزال بيانات EXIF والموقع؛ وتُموَّه الوجوه ولوحات السيارات حيثما أمكن؛ ولا تظهر الصور للآخرين إلا بعد موافقة الموظفين.' },
        { title: 'أداء بصدق', body: 'ننشر ما قيس وكيف قيس. لم يُجرَ بعد تقييم على صور طرق مصرية محلية، ولا ندّعيه.' },
        { title: 'تحقق بشري', body: 'لا تُعرض شدة الذكاء الاصطناعي كتقييم هندسي أبدًا. يتحقق المهندسون من الأبعاد والشدة في الموقع.' },
      ],
    },
    finance: {
      slug: 'finance', icon: 'wallet', visual: 'finance', eyebrow: 'رود شيلد للذكاء المالي', title: 'الذكاء المالي للطرق',
      lead: 'نظام مالي مصمم لصيانة الطرق، لكل مبلغ فيه مصدر ومعتمِد وسجل تدقيق.',
      features: [
        { title: 'ملف مالي لكل طريق', body: 'ميزانيات سنوية وميزانيات مشروعات وتقديرات وعقود وأوامر تغيير وتكاليف فعلية وفواتير ودفعات — مرتبطة بمقاطع الطرق المعنية.' },
        { title: 'تفصيل دقيق للتكاليف', body: 'أسفلت، كشط، حفر، ردم، ركام، نقل، عمالة، معدات، تنظيم مرور، إشراف، اختبارات، ضرائب، وتكاليف أخرى معتمدة.', bullets: ['الوصف والوحدة والكمية وسعر الوحدة والعملة', 'المصدر والتاريخ والدليل وحالة الاعتماد'] },
        { title: 'تقديرات من أسعار موثقة', body: 'التقدير الهندسي = الكمية × سعر الوحدة. كل سعر إما مُتحقق منه من مكتبتك أو يحمل مصدرًا موثقًا. لا يخترع النظام أسعار وحدات.' },
        { title: 'ضوابط صارمة', body: 'لا تتجاوز الفواتير قيمة العقد، ولا تتجاوز الدفعات الفاتورة، ولا تُسجَّل قيم المناقصات كتكاليف فعلية.' },
        { title: 'تحليل الانحراف', body: 'قارن التكلفة الفعلية المُتحقق منها بالتقدير والميزانية المعتمدين، حسب الفئة وعبر الزمن.' },
        { title: 'التصدير', body: 'نزّل المشروعات والتكاليف والفواتير والدفعات بصيغة CSV لنظامك المحاسبي والمدققين.' },
      ],
    },
    predictive: {
      slug: 'predictive-maintenance', icon: 'trending', visual: 'predict', eyebrow: 'رود شيلد للتنبؤ', title: 'الصيانة التنبؤية وتوقع التكاليف',
      lead: 'توقّع تكاليف الإصلاح مما دفعته مؤسستك فعلًا — وتعلّم باستمرار مع إغلاق المشروعات.',
      features: [
        { title: 'القابلية للتفسير أولًا', body: 'يعتمد المقدِّر الأساسي على التكلفة الفعلية المُتحقق منها لكل م² تالف مُتحقق منه من مشروعات مكتملة مماثلة، ويعرض المشروعات التي استخدمها.' },
        { title: 'حد أدنى من الأدلة', body: 'مع أقل من خمسة مشروعات مماثلة مُتحقق منها يعرض النظام: «لا توجد بيانات مُتحقق منها كافية لتوليد توقع موثوق».' },
        { title: 'تعلّم آلي عند توفر البيانات', body: 'تُدرَّب نماذج خطية وغابات عشوائية وتعزيز تدرجي بتحقق زمني ومجموعة اختبار مستقلة عند توفر سجل كافٍ.' },
        { title: 'تعلّم مستمر', body: 'تصبح المشروعات المكتملة ذات التكاليف الفعلية المعتمدة صالحة للتدريب بعد فحوص الجودة، وتُقارن النماذج المرشحة بالإنتاج ولا تُنشر إلا بموافقة.' },
        { title: 'استوديو تخطيط الميزانية', body: 'استكشف سيناريوهات التمويل — السلامة أولًا، أقصى تغطية، صيانة متوازنة، أولوية الأضرار الحرجة — ويبقى القرار للإنسان.' },
        { title: 'تتبع النماذج', body: 'يحتفظ كل إصدار بمجموعة بياناته ومقاييسه ومعتمِده وتاريخ نشره.' },
      ],
    },
    solutions: {
      slug: 'solutions', icon: 'building', visual: 'workflow', eyebrow: 'الحلول', title: 'لكل جهة تحافظ على سلامة الطرق',
      lead: 'تعمل البلديات وهيئات الطرق والمكاتب الهندسية والمقاولون في النظام نفسه — كلٌّ بالصلاحيات التي يحتاجها تمامًا.',
      features: [
        { title: 'البلديات', body: 'حوّل بلاغات المواطنين إلى إصلاحات مُتحقق منها ومرتبة بالأولوية، وأطلع السكان على مصير بلاغاتهم.' },
        { title: 'هيئات الطرق', body: 'أدِر شبكات كبيرة بحالة كل مقطع وبرامج الفحص وتخطيط الميزانية متعدد السنوات.' },
        { title: 'المكاتب الاستشارية', body: 'نفّذ الفحوص، وأعدّ التقديرات من أسعار موثقة، وأشرف على المقاولين نيابة عن العملاء.' },
        { title: 'المقاولون', body: 'استلم أوامر العمل، وأبلغ عن التقدم والكميات، وقدّم الفواتير مع الأدلة.' },
      ],
    },
    government: {
      slug: 'solutions/government', icon: 'landmark', visual: 'finance', eyebrow: 'الجهات الحكومية', title: 'للبلديات وهيئات الطرق',
      lead: 'أنفق ميزانيات الصيانة حيث تكون أكثر أهمية، وأثبت بدقة كيف استُخدم كل جنيه أو دولار أو ريال.',
      features: [
        { title: 'بلاغات المواطنين', body: 'يبلّغ السكان عن المخاطر من تطبيق رود شيلد، ويتحقق الموظفون منها ويكلّفون بها ويحلّونها مع جدول حالة عام.' },
        { title: 'تخطيط قائم على الحالة', body: 'رتّب المشروعات حسب العيوب المُتحقق منها وحالة الطريق والتغطية، لا حسب آخر من اتصل.' },
        { title: 'مسارات الاعتماد', body: 'الميزانيات والتقديرات والتكاليف والفواتير تحتاج معتمِدًا ثانيًا مع سجل تدقيق كامل.' },
        { title: 'رؤية تنفيذية', body: 'وصول تنفيذي للقراءة فقط إلى لوحات الشبكة والمتأخرات والمالية.' },
      ],
    },
    contractors: {
      slug: 'solutions/contractors', icon: 'hardhat', visual: 'workflow', eyebrow: 'المقاولون', title: 'لمقاولي الصيانة',
      lead: 'مساحة عمل مركزة على الأعمال المسندة إليك — لا أكثر ولا أقل.',
      features: [
        { title: 'أوامر العمل', body: 'اطّلع على أوامر العمل المسندة بموقعها ونطاقها وموعدها على الويب والهاتف.' },
        { title: 'التقدم والأدلة', body: 'سجّل التقدم والكميات وصور قبل/بعد من الموقع، حتى دون اتصال.' },
        { title: 'التكاليف والفواتير', body: 'قدّم التكاليف على أوامر عملك والفواتير على عقدك، وتابع مراجعتها.' },
        { title: 'خصوصية صارمة', body: 'لا يرى المقاولون المقاولين الآخرين ولا الميزانيات ولا المالية الداخلية للعميل.' },
      ],
    },
    technology: {
      slug: 'technology', icon: 'cpu', visual: 'map', eyebrow: 'التقنية', title: 'التقنية وراء رود شيلد',
      lead: 'تقنيات مفتوحة ومجرَّبة اخترناها للموثوقية والأمان وسهولة الصيانة على المدى الطويل.',
      features: [
        { title: 'PostgreSQL + PostGIS', body: 'البيانات الجغرافية والدفتر المالي وقواعد الصلاحيات في قاعدة بيانات معاملات واحدة مع ترحيلات مُصدَّرة.' },
        { title: 'أمان على مستوى الصفوف', body: 'كل استعلام يُصفّى حسب المؤسسة والدور داخل قاعدة البيانات، وتمر الكتابات عبر دوال مُتحقق منها ومُدقَّقة.' },
        { title: 'تطبيقات هاتف أصلية', body: 'تطبيقات iOS وAndroid مبنية بـ React Native وExpo: كاميرا وGPS وإشعارات وتخزين آمن وطوابير دون اتصال.' },
        { title: 'منصة الويب', body: 'Next.js وTypeScript للموقع ولوحة RoadShield OS، مع خرائط MapLibre GL.' },
        { title: 'خدمات الذكاء', body: 'استدلال FastAPI مع ONNX Runtime، وسكربتات تدريب PyTorch قابلة لإعادة الإنتاج، ونماذج تكلفة scikit-learn بتحقق زمني.' },
        { title: 'بيانات خرائط مفتوحة', body: 'هندسة طرق من OpenStreetMap وبلاطات متجهة مفتوحة مع الإسناد وتتبع التراخيص.' },
      ],
    },
    security: {
      slug: 'security', icon: 'shield', visual: 'security', eyebrow: 'الأمان والخصوصية', title: 'الأمان والخصوصية وسلامة البيانات',
      lead: 'قد تحتوي صور الطرق على معلومات خاصة، وميزانيات الطرق أموال عامة. صُمّم رود شيلد لكليهما.',
      features: [
        { title: 'المصادقة', body: 'تأكيد البريد الإلكتروني، وتجزئة آمنة لكلمات المرور لدى مزود الهوية، وجلسات قصيرة العمر.' },
        { title: 'الصلاحيات في قاعدة البيانات', body: 'أمان الصفوف وفحوص الأدوار في دوال Postgres تفرض عزل المؤسسات وصلاحيات مالية دقيقة.' },
        { title: 'مبدأ الأعين الأربع', body: 'تتطلب الاعتمادات المالية شخصًا مختلفًا عن مقدّم الطلب (قابل للضبط لكل مؤسسة).' },
        { title: 'تخزين خاص', body: 'تُحفظ الصور والمستندات في حاويات خاصة وتُقدَّم بروابط موقعة قصيرة العمر.' },
        { title: 'خصوصية الصور', body: 'إزالة البيانات الوصفية، وتمويه الوجوه واللوحات، وموافقة الموظفين قبل عرض الصور للآخرين.' },
        { title: 'قابلية التدقيق', body: 'كل إجراء مالي وإداري مسجل في سجل تدقيق إلحاقي لكل مؤسسة.' },
      ],
      principlesTitle: 'ما لا ندّعيه',
      principles: [
        { title: 'لا شهادات مُدّعاة', body: 'لا يدّعي رود شيلد الحصول على ISO 27001 أو SOC 2 أو أي شهادة أخرى. التقييم المستقل ضمن خارطة الطريق.' },
        { title: 'الإفصاح المسؤول', body: 'أبلغ عن الثغرات عبر صفحة التواصل؛ نؤكد الاستلام ونُبقي المبلغين على اطلاع.' },
      ],
    },
  },
  pricing: {
    title: 'الباقات وعروض الأسعار',
    lead: 'يعتمد السعر على حجم الشبكة وعدد المستخدمين ومتطلبات النشر. أخبرنا عن مؤسستك وسنعدّ عرض سعر.',
    plans: [
      { name: 'تجريبية', for: 'مدينة أو حي واحد يقيّم رود شيلد', features: ['حتى 25 مستخدمًا', 'حتى 20,000 مقطع طريق', 'الفحوص والمشروعات والمالية والمقاولون', 'تطبيق بلاغات المواطنين'], cta: 'اطلب عرض سعر' },
      { name: 'احترافية', for: 'البلديات والهيئات في التشغيل الفعلي', features: ['حتى 250 مستخدمًا', 'حتى 250,000 مقطع طريق', 'استوديو تخطيط الميزانية', 'توقعات التكلفة والتصدير'], cta: 'اطلب عرض سعر' },
      { name: 'مؤسسية', for: 'الهيئات الوطنية والمشغلون متعددو المناطق', features: ['مستخدمون ومقاطع بلا حدود', 'تكامل الدخول الموحد', 'تصدير التدقيق ومركز النماذج', 'خيارات نشر مخصصة'], cta: 'تحدث إلينا' },
    ],
    note: 'تطبّق المنصة حدود الباقات. تُتفق الأسعار لكل عقد ولا تُنشر.',
  },
  about: {
    title: 'عن رود شيلد AI',
    lead: 'تبني رود شيلد AI برمجيات تساعد الجهات العامة وشركاءها على الحفاظ على سلامة الطرق وحسن إنفاق أموال الصيانة.',
    sections: [
      { title: 'من أين نبدأ', body: 'تستعد رود شيلد لأول تجربة لها في مصر، ودمياط الجديدة مدينة مرشحة للتجربة. والمنصة مصممة للاستخدام الدولي منذ اليوم الأول.' },
      { title: 'كيف نبني', body: 'بيانات حقيقية، وعدم يقين معلن، وسجلات قابلة للتحقق. حين لا نعرف شيئًا — عرض طريق، أو دقة نموذج محليًا، أو تكلفة موثوقة — يقول المنتج ذلك.' },
      { title: 'ما نؤمن به', body: 'الطرق الأفضل تأتي من قرارات أفضل، والقرارات الأفضل تأتي من معلومات صادقة وقابلة للتدقيق يثق بها الجميع.' },
    ],
  },
  contact: {
    title: 'تواصل معنا', lead: 'لديك أسئلة عن رود شيلد أو الشراكات أو الأمان؟ أرسل لنا رسالة.',
    demoTitle: 'اطلب عرضًا توضيحيًا', demoLead: 'أخبرنا عن شبكة طرقك وسنحدد موعدًا لعرض على منطقة خدمتك.',
    name: 'الاسم الكامل', email: 'البريد الإلكتروني للعمل', organization: 'المؤسسة', country: 'الدولة', role: 'المنصب', message: 'كيف يمكننا المساعدة؟',
    send: 'إرسال', sent: 'شكرًا لك — تم استلام رسالتك. سنرد عبر البريد الإلكتروني.', privacy: 'نستخدم هذه البيانات فقط للرد على طلبك.',
    interest: 'مهتم بـ', interests: { demo: 'عرض المنتج', pilot: 'برنامج تجريبي', partnership: 'شراكة', security: 'الأمان', other: 'أخرى' },
  },
};

export const marketing: Record<Locale, Copy> = { en: enCopy, ar: arCopy };
