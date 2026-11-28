// Homepage copy (English + Arabic). Concrete, verifiable statements only: no statistics,
// customers, accuracy figures or awards. Product facts below are true of the current code.
import type { Locale } from './dict';

type Stage = { code: string; title: string; who: string; body: string };
type Row = { term: string; meaning: string };
type HomeCopy = {
  kicker: string; title: string; lead: string; primary: string; secondary: string;
  photoCaption: string; photoNote: string;
  facts: Row[];
  stagesKicker: string; stagesTitle: string; stagesLead: string; stages: Stage[];
  streetKicker: string; streetTitle: string; streetLead: string; shots: { key: string; caption: string }[];
  wrongTitle: string; wrongBody: string;
  productKicker: string; productTitle: string; productLead: string; productNote: string; officeLabel: string; fieldLabel: string;
  moneyKicker: string; moneyTitle: string; moneyLead: string; money: Row[]; moneyRule: string;
  notKicker: string; notTitle: string; notItems: string[];
  accessKicker: string; accessTitle: string; accessItems: Row[];
  ctaTitle: string; ctaLead: string; ctaPrimary: string; ctaSecondary: string;
};

const en: HomeCopy = {
  kicker: 'Road maintenance system · Pilot: New Damietta, Egypt',
  title: 'From the pothole to the paid repair. One record.',
  lead: 'RoadShield is where a road authority keeps the whole job: the citizen’s photo, the engineer’s inspection, the approved budget, the contractor’s work and every payment — checked by a second person and kept on file.',
  primary: 'See how it works', secondary: 'Request a pilot',
  photoCaption: 'Pothole breaking through an old patch',
  photoNote: 'The box is what the detection model returned for this photo (pothole, 0.64). An engineer still confirms it on site.',
  facts: [
    { term: 'Coverage', meaning: 'All 27 Egyptian governorates selectable; cities and districts added on request' },
    { term: 'Languages', meaning: 'Arabic and English, right-to-left done properly' },
    { term: 'Detector', meaning: 'YOLOv8s trained on RDD2022 by its open-source authors — not yet evaluated on Egyptian roads' },
    { term: 'Money', meaning: 'Every amount approved by a second person and logged' },
  ],
  stagesKicker: 'The job, step by step',
  stagesTitle: 'Five stages. Each one leaves evidence.',
  stagesLead: 'A defect moves along the line below. Nobody skips a stage, and nothing is marked done without the record that proves it.',
  stages: [
    { code: 'KM 01', title: 'Report', who: 'Citizens · inspectors', body: 'A photo with GPS from the phone. The model suggests a damage class; the person can change it.' },
    { code: 'KM 02', title: 'Verify', who: 'Road engineers', body: 'An engineer inspects the segment, measures the defect and approves the condition.' },
    { code: 'KM 03', title: 'Plan', who: 'Engineers · finance', body: 'A project with an estimate from cited unit rates and an approved budget.' },
    { code: 'KM 04', title: 'Repair', who: 'Contractors', body: 'Work orders, daily logs and before/after photos — offline when the signal drops.' },
    { code: 'KM 05', title: 'Measure', who: 'Finance · management', body: 'Verified actual cost against estimate and budget, per road, per month.' },
  ],
  streetKicker: 'Real photos, real output', streetTitle: 'What the model sees — and where it is wrong',
  streetLead: 'Photographs from Wikimedia Commons run through the same detector the app uses. The boxes and scores are exactly what it returned.',
  shots: [
    { key: 'alligator-cracking', caption: 'Fatigue cracking around a worn turn arrow' },
    { key: 'wheelpath-damage', caption: 'Damage along the wheel path' },
  ],
  wrongTitle: 'Wrong on purpose, shown on purpose',
  wrongBody: 'On this close-up it calls a wide crack a pothole at 0.71. Close-ups are not what it was trained on. That is why the model only suggests, and an engineer decides.',
  productKicker: 'The software', productTitle: 'An office dashboard and a field app. Same records.',
  productLead: 'Engineers and finance work in the browser. Inspectors and contractors work from the phone, even offline. Permissions are enforced by the database, not just the screen.',
  productNote: 'Screenshots from a demo workspace with test data.', officeLabel: 'Office', fieldLabel: 'Field',
  moneyKicker: 'Public money', moneyTitle: 'Five kinds of money, never mixed up',
  moneyLead: 'Most overruns start when “approved”, “committed” and “paid” become one number. RoadShield keeps them apart, per road and per project.',
  money: [
    { term: 'Budget', meaning: 'Allocated and approved for a project or road' },
    { term: 'Commitment', meaning: 'Signed contracts plus approved change orders' },
    { term: 'Invoiced', meaning: 'Contractor invoices approved for payment' },
    { term: 'Verified actual', meaning: 'Costs checked and approved by a second person' },
    { term: 'Paid', meaning: 'Payments recorded against approved invoices' },
  ],
  moneyRule: 'An invoice cannot exceed its contract. A payment cannot exceed its invoice. Two people approving at the same second cannot get around either rule.',
  notKicker: 'Limits', notTitle: 'What RoadShield does not do',
  notItems: [
    'It does not invent unit rates, costs or road attributes. Unknown stays unknown.',
    'It does not claim an accuracy it has not measured on your roads.',
    'It does not let the model decide severity, payment or a work order.',
    'It does not show one organization’s data to another — or to our own staff.',
  ],
  accessKicker: 'Access', accessTitle: 'Who can do what',
  accessItems: [
    { term: 'Verified organizations', meaning: 'A new organization uploads its official documents and stays read-only until our team verifies it.' },
    { term: 'Roles', meaning: 'Owner, finance, engineer, inspector, contractor and executive viewer — each sees only its part.' },
    { term: 'Four eyes', meaning: 'Budgets, estimates, costs, invoices and unit rates need a second approver.' },
    { term: 'Audit trail', meaning: 'Who did what, and when, for every approval and payment.' },
  ],
  ctaTitle: 'Bring one district. We will map it with you.', ctaLead: 'We import its streets from OpenStreetMap and walk your engineers and finance team through a real repair, end to end.',
  ctaPrimary: 'Request a pilot', ctaSecondary: 'Read the security notes',
};

const ar: HomeCopy = {
  kicker: 'نظام صيانة الطرق · التجربة الأولى: دمياط الجديدة، مصر',
  title: 'من الحفرة حتى دفع ثمن إصلاحها. في سجل واحد.',
  lead: 'رود شيلد هو المكان الذي تحفظ فيه جهة الطرق الشغل كله: صورة المواطن، وفحص المهندس، والميزانية المعتمدة، وشغل المقاول، وكل دفعة — بمراجعة شخص ثانٍ وتسجيل دائم.',
  primary: 'شوف إزاي بيشتغل', secondary: 'اطلب تجربة',
  photoCaption: 'حفرة تخترق رقعة إصلاح قديمة',
  photoNote: 'المربع هو ما أرجعه نموذج الكشف لهذه الصورة (حفرة، 0.64). ويظل المهندس هو من يؤكده في الموقع.',
  facts: [
    { term: 'التغطية', meaning: 'كل محافظات مصر الـ 27 متاحة للاختيار، وتُضاف المدن والأحياء عند الطلب' },
    { term: 'اللغات', meaning: 'العربية والإنجليزية، مع اتجاه من اليمين لليسار مضبوط فعلًا' },
    { term: 'نموذج الكشف', meaning: 'YOLOv8s مدرَّب على RDD2022 من مطوّريه الأصليين — لم يُقيَّم بعد على طرق مصرية' },
    { term: 'المال', meaning: 'كل مبلغ يعتمده شخص ثانٍ ويُسجَّل' },
  ],
  stagesKicker: 'الشغل خطوة بخطوة',
  stagesTitle: 'خمس مراحل. كل مرحلة تترك دليلًا.',
  stagesLead: 'العيب يتحرك على الخط التالي. لا أحد يتخطى مرحلة، ولا شيء يُعلَّم أنه انتهى من غير السجل الذي يثبت ذلك.',
  stages: [
    { code: 'كم 01', title: 'البلاغ', who: 'مواطنون · مفتشون', body: 'صورة بموقع GPS من الموبايل. النموذج يقترح نوع الضرر، والشخص يقدر يغيّره.' },
    { code: 'كم 02', title: 'التحقق', who: 'مهندسو الطرق', body: 'مهندس يفحص القطاع، ويقيس العيب، ويعتمد الحالة.' },
    { code: 'كم 03', title: 'التخطيط', who: 'مهندسون · مالية', body: 'مشروع بتقدير من أسعار وحدات موثّقة المصدر وميزانية معتمدة.' },
    { code: 'كم 04', title: 'الإصلاح', who: 'المقاولون', body: 'أوامر عمل وسجل يومي وصور قبل وبعد — حتى من غير إنترنت.' },
    { code: 'كم 05', title: 'القياس', who: 'المالية · الإدارة', body: 'التكلفة الفعلية المعتمدة مقابل التقدير والميزانية، لكل طريق ولكل شهر.' },
  ],
  streetKicker: 'صور حقيقية ونتائج حقيقية', streetTitle: 'ما يراه النموذج — وأين يخطئ',
  streetLead: 'صور من ويكيميديا كومنز مرّت على نفس نموذج الكشف الذي يستخدمه التطبيق. المربعات والدرجات هي بالضبط ما أرجعه.',
  shots: [
    { key: 'alligator-cracking', caption: 'تشققات إجهاد حول سهم انعطاف باهت' },
    { key: 'wheelpath-damage', caption: 'تلف على مسار العجلات' },
  ],
  wrongTitle: 'خطأ نعرضه عن قصد',
  wrongBody: 'في هذه الصورة القريبة يسمّي النموذج شرخًا عريضًا حفرةً بدرجة 0.71. الصور القريبة ليست ما تدرّب عليه. لذلك النموذج يقترح فقط، والمهندس هو من يقرر.',
  productKicker: 'البرنامج', productTitle: 'لوحة للمكتب وتطبيق للموقع. نفس السجلات.',
  productLead: 'المهندسون والمالية يعملون من المتصفح. المفتشون والمقاولون يعملون من الموبايل حتى من غير إنترنت. الصلاحيات تفرضها قاعدة البيانات نفسها، لا الشاشة فقط.',
  productNote: 'لقطات من مساحة عمل تجريبية ببيانات اختبار.', officeLabel: 'المكتب', fieldLabel: 'الموقع',
  moneyKicker: 'المال العام', moneyTitle: 'خمسة أنواع من الأموال، لا تختلط أبدًا',
  moneyLead: 'أغلب تجاوزات التكلفة تبدأ عندما يصير «المعتمد» و«الملتزم به» و«المدفوع» رقمًا واحدًا. رود شيلد يفصل بينها لكل طريق ولكل مشروع.',
  money: [
    { term: 'الميزانية', meaning: 'المخصّص والمعتمد لمشروع أو طريق' },
    { term: 'الالتزام', meaning: 'العقود الموقّعة وأوامر التغيير المعتمدة' },
    { term: 'المفوتر', meaning: 'فواتير المقاولين المعتمدة للصرف' },
    { term: 'الفعلي المُتحقق منه', meaning: 'تكاليف راجعها واعتمدها شخص ثانٍ' },
    { term: 'المدفوع', meaning: 'دفعات مسجّلة على فواتير معتمدة' },
  ],
  moneyRule: 'الفاتورة لا تتجاوز عقدها. والدفعة لا تتجاوز فاتورتها. وحتى لو اعتمد شخصان في نفس الثانية، لا يستطيعان تجاوز أي قاعدة منهما.',
  notKicker: 'الحدود', notTitle: 'ما لا يفعله رود شيلد',
  notItems: [
    'لا يخترع أسعار وحدات أو تكاليف أو بيانات طرق. المجهول يبقى مجهولًا.',
    'لا يدّعي دقة لم يقِسها على طرقك.',
    'لا يترك للنموذج قرار الخطورة أو الدفع أو أمر العمل.',
    'لا يعرض بيانات مؤسسة لمؤسسة أخرى — ولا لموظفينا.',
  ],
  accessKicker: 'الصلاحيات', accessTitle: 'مين يقدر يعمل إيه',
  accessItems: [
    { term: 'مؤسسات موثّقة', meaning: 'المؤسسة الجديدة ترفع مستنداتها الرسمية وتبقى للقراءة فقط حتى يوثّقها فريقنا.' },
    { term: 'الأدوار', meaning: 'مالك ومالية ومهندس ومفتش ومقاول ومشاهد تنفيذي — كلٌّ يرى جزءه فقط.' },
    { term: 'العين الثانية', meaning: 'الميزانيات والتقديرات والتكاليف والفواتير وأسعار الوحدات تحتاج معتمدًا ثانيًا.' },
    { term: 'سجل المراجعة', meaning: 'من فعل ماذا ومتى، لكل اعتماد ولكل دفعة.' },
  ],
  ctaTitle: 'هات حيًّا واحدًا. نرسم شبكته معك.', ctaLead: 'نستورد شوارعه من OpenStreetMap، ونمشي مع مهندسيك وفريق المالية في إصلاح حقيقي من البداية للنهاية.',
  ctaPrimary: 'اطلب تجربة', ctaSecondary: 'اقرأ ملاحظات الأمان',
};

export const homeCopy: Record<Locale, HomeCopy> = { en, ar };
