import OpenAI from 'openai';
import classes from '../data/classes.js';
import teachers from '../data/teachers.js';
import {PERIODS,CONTACT,CLINIC,BOOKS,ALEF,LMS,WEBSITE,GRADE_LINKS,TEACHER_ALIASES} from '../data/knowledge.js';

const teacherNames=teachers.map(t=>t.teacher);
const sections=[...new Set(classes.map(c=>c.Section))];
const rate=new Map();

function isArabic(s){return /[\u0600-\u06FF]/.test(s)}
function norm(s=''){return s.toLowerCase().normalize('NFKD').replace(/[.]/g,'').replace(/[^a-z0-9\u0600-\u06ff]+/g,' ').trim()}
function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}

function extractGrade(s){
  const m=s.match(/(?:grade|gr|صف|الصف)\s*(1[0-2]|[5-9])\b/i)
    || s.match(/\b(1[0-2]|[5-9])\s*\/?\s*[AG]\s*\d(?:\s*S\s*\d)?\b/i);
  return m?Number(m[1]):null
}

function compactSection(s=''){
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g,'');
}

function extractSection(s=''){
  const q=String(s).toUpperCase();
  const compactQ=q.replace(/[^A-Z0-9]/g,'');

  // 1. Exact match against a real KBZ section.
  // Examples: 11G1 -> 11/G1, 12G1S1 -> 12/G1S1
  const exactMatches=sections.filter(
    sec=>compactQ.includes(compactSection(sec))
  );

  if(exactMatches.length===1){
    return exactMatches[0];
  }

  // 2. Parse shorthand:
  // "12 g1", "grade 12 g1", "12/g1", "12 a2", etc.
  const m=q.match(
    /(?:GRADE|GR)?\s*(1[0-2]|[5-9])\s*\/?\s*([AG])\s*(\d)(?:\s*(?:S)\s*(\d))?/i
  );

  if(!m)return null;

  const grade=m[1];
  const stream=m[2].toUpperCase();
  const number=m[3];
  const sub=m[4]||null;

  // User explicitly supplied S1/S2.
  if(sub){
    const wanted=`${grade}/${stream}${number}S${sub}`;

    return sections.find(
      sec=>compactSection(sec)===compactSection(wanted)
    )||null;
  }

  // User omitted the S suffix.
  // Example: "12 G1" should match "12/G1S1" ONLY if unique.
  const base=compactSection(`${grade}/${stream}${number}`);

  const candidates=sections.filter(sec=>{
    const c=compactSection(sec);

    return c===base || c.startsWith(base+'S');
  });

  // Never guess between multiple KBZ sections.
  if(candidates.length===1){
    return candidates[0];
  }

  return null;
}

function extractDay(s=''){
  const n=norm(s);

  const tests=[
    ['Monday',/\bmonday\b|\bmon\b|الاثنين|الإثنين/],
    ['Tuesday',/\btuesday\b|\btue\b|الثلاثاء/],
    ['Wednesday',/\bwednesday\b|\bwed\b|الأربعاء|الاربعاء/],
    ['Thursday',/\bthursday\b|\bthu\b|الخميس/],
    ['Friday',/\bfriday\b|\bfri\b|الجمعة/]
  ];

  for(const [day,re] of tests){
    if(re.test(n))return day;
  }

  return null;
}

function extractPeriod(s=''){
  const n=norm(s);

  // period 5 / P5 / period #5
  let m=n.match(
    /\b(?:period|p|الحصة|حصه|حصة)\s*(?:number|no|#)?\s*([1-8])\b/i
  );

  if(m)return Number(m[1]);

  // 5th period / 3rd period / 1st period
  m=n.match(
    /\b([1-8])(?:st|nd|rd|th)?\s+(?:period|الحصة|حصه|حصة)\b/i
  );

  if(m)return Number(m[1]);

  // English written numbers:
  // first period, fifth period, etc.
  const words={
    first:1,
    second:2,
    third:3,
    fourth:4,
    fifth:5,
    sixth:6,
    seventh:7,
    eighth:8
  };

  for(const [word,num] of Object.entries(words)){
    const re=new RegExp(`\\b${word}\\s+period\\b`,'i');

    if(re.test(n))return num;
  }

  // Arabic written/ordinal forms
  const arabic=[
    [1,/الحصة\s*(?:الأولى|الاولى|الأول|الاول)/],
    [2,/الحصة\s*(?:الثانية|الثانيه|الثاني)/],
    [3,/الحصة\s*(?:الثالثة|الثالثه|الثالث)/],
    [4,/الحصة\s*(?:الرابعة|الرابعه|الرابع)/],
    [5,/الحصة\s*(?:الخامسة|الخامسه|الخامس)/],
    [6,/الحصة\s*(?:السادسة|السادسه|السادس)/],
    [7,/الحصة\s*(?:السابعة|السابعه|السابع)/],
    [8,/الحصة\s*(?:الثامنة|الثامنه|الثامن)/]
  ];

  for(const [num,re] of arabic){
    if(re.test(n))return num;
  }

  return null;
}

function localIntent(q){
  const n=norm(q);
  const grade=extractGrade(q);
  const section=extractSection(q);
  const day=extractDay(q);
  const period=extractPeriod(q);

  if(/\b(alef)\b|منصة ألف|ألف/.test(n))
    return {intent:'alef',grade};

  if(/book|textbook|كتب|كتاب|الكتب/.test(n))
    return {intent:'books',grade};

  if(/password|student email|\blms\b|كلمة المرور|كلمه المرور|البريد|ايميل|إيميل|نظام lms|منصة lms/.test(n))
    return {intent:'lms',grade};

  if(/clinic|nurse|medical|عيادة|العيادة|ممرض|ممرضة|الصحية|صحي/.test(n))
    return {intent:'clinic',grade};

  if(/website|web site|موقع المدرسة|الموقع الرسمي/.test(n))
    return {intent:'website',grade};

  // Grade links ONLY when Telegram or WhatsApp is explicitly requested.
  if(grade&&(/telegram|تلغرام|تليجرام|whatsapp|واتساب|واتس اب/.test(n))){
    return {
      intent:'grade_links',
      grade,
      channel:/telegram|تلغرام|تليجرام/.test(n)?'telegram':'whatsapp'
    };
  }

  if(/contact school|school contact|phone number|call school|رقم المدرسة|التواصل مع المدرسة|اتصل بالمدرسة|هاتف المدرسة/.test(n))
    return {intent:'contact',grade};

  // IMPORTANT:
  // Any recognized Grade 5–12 section automatically means CLASS TIMETABLE.
  if(section){
    return {
      intent:'class_timetable',
      section,
      grade,
      day,
      period,
      teacher:null,
      channel:null
    };
  }

  // Period/bell times only when a grade is given WITHOUT a section.
  if(
    grade &&
    (
      period ||
      /period\s*time|periods?\b|bell\s*time|school\s*time|أوقات الحصص|اوقات الحصص|وقت الحصة|وقت حصه|الحصص/.test(n)
    )
  ){
    return {
      intent:'period_times',
      grade,
      period,
      section:null,
      teacher:null,
      day:null,
      channel:null
    };
  }

  return null;
}

function dayName(d){
  if(!d)return null;

  const m={
    monday:'Monday',
    mon:'Monday',
    'الاثنين':'Monday',
    'الإثنين':'Monday',

    tuesday:'Tuesday',
    tue:'Tuesday',
    'الثلاثاء':'Tuesday',

    wednesday:'Wednesday',
    wed:'Wednesday',
    'الأربعاء':'Wednesday',
    'الاربعاء':'Wednesday',

    thursday:'Thursday',
    thu:'Thursday',
    'الخميس':'Thursday',

    friday:'Friday',
    fri:'Friday',
    'الجمعة':'Friday'
  };

  return m[norm(d)]||d
}

function findTeacher(name){
  if(!name)return null;

  const a=TEACHER_ALIASES[norm(name)];
  if(a)return teachers.find(t=>t.teacher===a)||null;

  let exact=teachers.find(t=>norm(t.teacher)===norm(name));
  if(exact)return exact;

  const q=norm(name);
  const qt=new Set(q.split(' '));

  let best=null,score=0;

  for(const t of teachers){
    const tt=new Set(norm(t.teacher).split(' '));
    let s=0;

    for(const x of qt){
      if(tt.has(x))s++;
    }

    s/=Math.max(qt.size,tt.size);

    if(s>score){
      score=s;
      best=t;
    }
  }

  return score>=0.45?best:null
}

function teacherCellSubject(cell){
  if(!cell)return '';

  const s=cell
    .replace(/\b(?:[5-9]|1[0-2])\/[AG]\d(?:S\d)?\b/ig,'')
    .trim();

  return s.replace(/^Cover\s+\d+$/i,'Cover').trim()
}

function teacherReverse(section,day,period){
  const re=new RegExp(`\\b${escRe(section)}\\b`,'i');

  return teachers.flatMap(t=>{
    const cell=t.schedule?.[day]?.[String(period)]||'';

    return re.test(cell)
      ? [{teacher:t.teacher,cell,page:t.page}]
      : [];
  })
}

function sameSubject(a,b){
  const clean=x=>norm(x)
    .replace(/chem(is|istry)?/g,'chemistry')
    .replace(/social studies?/g,'social');

  return clean(a)===clean(b)
}

function formatClass(route,ar){
  const section=route.section;
  const day=dayName(route.day);
  const period=route.period?Number(route.period):null;

  if(!section){
    return {
      answer:ar
        ?'يرجى ذكر رمز الصف/الشعبة، مثل 9/A1.'
        :'Please include the class/section code, for example 9/A1.'
    };
  }

  let rows=classes.filter(
    c=>c.Section.toUpperCase()===String(section).toUpperCase()
  );

  if(!rows.length){
    return {
      answer:ar
        ?`لم أجد الشعبة ${section} في جداول KBZ المعتمدة.`
        :`I could not find section ${section} in the approved KBZ timetables.`
    };
  }

  if(day)rows=rows.filter(c=>c.Day===day);
  if(period)rows=rows.filter(c=>c.Period===period);

  if(day&&period){
    const c=rows[0];

    if(!c){
      return {
        answer:ar
          ?'لا توجد خانة مطابقة لهذا اليوم والحصة في المصدر المعتمد.'
          :'No matching day/period cell was found in the approved source.'
      };
    }

    const tr=teacherReverse(c.Section,c.Day,c.Period);

    const mismatch=tr.find(x=>{
      const s=teacherCellSubject(x.cell);
      return s&&!sameSubject(s,c.Subject||'');
    });

    if(mismatch){
      return {
        answer:ar
          ?`⚠️ يوجد تعارض بين المصدرين لـ ${c.Section} يوم ${c.Day} الحصة ${c.Period}.
جدول الصف: ${c.Subject||'فارغ'} — ${c.Teacher||'غير مذكور'}.
جدول المعلم: ${mismatch.cell} — صفحة المعلم ${mismatch.teacher}.
لن أقوم بتصحيح التعارض أو التخمين.`
          :`⚠️ There is a source conflict for ${c.Section}, ${c.Day}, Period ${c.Period}.
Class timetable: ${c.Subject||'blank'} — ${c.Teacher||'not listed'}.
Teacher timetable: ${mismatch.cell} — teacher page ${mismatch.teacher}.
I will not reconcile or guess between the sources.`,
        source:`Class timetable + Teachers timetable page ${mismatch.page}`
      };
    }

    return {
      answer:ar
        ?`${c.Section} — ${c.Day} — الحصة ${c.Period} (${c.Time})
${c.Subject||'لا توجد مادة'}${c.Teacher?` — ${c.Teacher}`:''}`
        :`${c.Section} — ${c.Day} — Period ${c.Period} (${c.Time})
${c.Subject||'No subject listed'}${c.Teacher?` — ${c.Teacher}`:''}`,
      source:`Grade ${c.Grade} class timetable`
    };
  }

  const order=[
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
  ];

  rows.sort(
    (a,b)=>
      order.indexOf(a.Day)-order.indexOf(b.Day)
      || a.Period-b.Period
  );

  if(day){
    const lines=rows.map(
      c=>`${ar?'حصة':'P'}${c.Period} ${c.Time}: ${c.Subject||'—'}${c.Teacher?` — ${c.Teacher}`:''}`
    );

    return {
      answer:`${section} — ${day}
${lines.join('\n')}`,
      source:`Grade ${rows[0]?.Grade} class timetable`
    };
  }

  const blocks=order.map(d=>{
    const r=rows.filter(x=>x.Day===d);

    return `${d}
${r.map(c=>`P${c.Period} ${c.Time}: ${c.Subject||'—'}${c.Teacher?` — ${c.Teacher}`:''}`).join('\n')}`;
  }).join('\n\n');

  return {
    answer:`${section}
${blocks}`,
    source:`Grade ${rows[0]?.Grade} class timetable`
  };
}

function formatTeacher(route,ar){
  const t=findTeacher(route.teacher);
  const day=dayName(route.day);
  const period=route.period?Number(route.period):null;

  if(!t){
    return {
      answer:ar
        ?'لم أتمكن من مطابقة اسم المعلم بشكل فريد مع صفحة معلم معتمدة. يرجى كتابة الاسم بشكل أوضح.'
        :'I could not uniquely match that teacher to an approved teacher timetable page. Please provide a clearer name.'
    };
  }

  const one=(d,p)=>{
    const cell=t.schedule[d][String(p)]||'';

    return cell||(
      ar
        ?'متاح / لا توجد مهمة مدونة'
        :'Free / no source label in this checked cell'
    );
  };

  if(day&&period){
    return {
      answer:ar
        ?`${t.teacher} — ${day} — الحصة ${period}
${one(day,period)}`
        :`${t.teacher} — ${day} — Period ${period}
${one(day,period)}`,
      source:`Teachers timetable — ${t.teacher}, page ${t.page}`
    };
  }

  if(day){
    const lines=Array.from(
      {length:8},
      (_,i)=>`P${i+1}: ${one(day,i+1)}`
    );

    return {
      answer:`${t.teacher} — ${day}
${lines.join('\n')}`,
      source:`Teachers timetable — ${t.teacher}, page ${t.page}`
    };
  }

  const days=[
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
  ];

  const text=days.map(
    d=>`${d}
${Array.from({length:8},(_,i)=>`P${i+1}: ${one(d,i+1)}`).join('\n')}`
  ).join('\n\n');

  return {
    answer:`${t.teacher}
${text}`,
    source:`Teachers timetable — ${t.teacher}, page ${t.page}`
  };
}

function fixed(route,ar){
  switch(route.intent){

    case'contact':
      return {
        answer:ar
          ?`للتواصل العام مع المدرسة:
اتصال: ${CONTACT.phone}
واتساب: ${CONTACT.whatsapp}`
          :`General school contact:
Call: ${CONTACT.phone}
WhatsApp: ${CONTACT.whatsapp}`,
        source:'Creator-approved KBZ contact'
      };

    case'clinic':
      return {
        answer:ar
          ?`رقم عيادة المدرسة: ${CLINIC}`
          :`School clinic: ${CLINIC}`,
        source:'Creator-approved clinic contact'
      };

    case'books':
      return {
        answer:ar
          ?`لأي استفسار عن الكتب المدرسية، تواصل عبر واتساب:
${BOOKS.display}
${BOOKS.url}`
          :`For any school-books question, contact the designated WhatsApp:
${BOOKS.display}
${BOOKS.url}`,
        source:'Creator-approved books contact'
      };

    case'alef':
      return {
        answer:ar
          ?`لأي استفسار أو مشكلة في منصة ألف:
${ALEF.display}
${ALEF.url}`
          :`For any Alef Platform question or support issue:
${ALEF.display}
${ALEF.url}`,
        source:'Creator-approved Alef contact'
      };

    case'lms':
      return {
        answer:ar
          ?`لتغيير/إعادة تعيين كلمة مرور الطالب أو مشاكل البريد/LMS:
${LMS.display}
${LMS.url}`
          :`For student password resets, student email/account issues, or LMS support:
${LMS.display}
${LMS.url}`,
        source:'Creator-approved student account/LMS contact'
      };

    case'website':
      return {
        answer:ar
          ?`الموقع الرسمي الحالي لمدرسة KBZ:
${WEBSITE}`
          :`Current official KBZ website:
${WEBSITE}`,
        source:'Creator-approved KBZ website'
      };

    case'grade_links':{
      const g=Number(route.grade);

      if(!GRADE_LINKS[g]){
        return {
          answer:ar
            ?'يرجى تحديد الصف من 5 إلى 12.'
            :'Please specify a grade from 5 to 12.'
        };
      }

      const L=GRADE_LINKS[g];

      if(route.channel==='telegram'){
        return {
          answer:`Grade ${g} Telegram:
${L.telegram}`,
          source:'Creator-provided official grade link'
        };
      }

      if(route.channel==='whatsapp'){
        return {
          answer:`Grade ${g} WhatsApp:
${L.whatsapp}`,
          source:'Creator-provided official grade link'
        };
      }

      return {
        answer:`Grade ${g}
Telegram: ${L.telegram}
WhatsApp: ${L.whatsapp}`,
        source:'Creator-provided official grade links'
      };
    }

    case'period_times':{
      const g=Number(route.grade);

      if(!g||g<5||g>12){
        return {
          answer:ar
            ?'يرجى تحديد الصف من 5 إلى 12 لأن أوقات الحصص تختلف بين 5–9 و10–12.'
            :'Please specify Grade 5–12 because period times differ for Grades 5–9 and 10–12.'
        };
      }

      const p=PERIODS[g<=9?'junior':'senior'];

      if(route.period){
        return {
          answer:ar
            ?`الصف ${g} — الحصة ${route.period}: ${p[route.period]}`
            :`Grade ${g} — Period ${route.period}: ${p[route.period]}`,
          source:'Creator-approved KBZ period times'
        };
      }

      return {
        answer:`Grade ${g}
${Object.entries(p).map(([k,v])=>`P${k}: ${v}`).join('\n')}`,
        source:'Creator-approved KBZ period times'
      };
    }

    default:
      return null;
  }
}

async function classify(message){
  if(!process.env.OPENAI_API_KEY)
    throw new Error('OPENAI_API_KEY is not configured in Vercel.');

  const client=new OpenAI({
    apiKey:process.env.OPENAI_API_KEY
  });

  const schema={
    type:'object',
    additionalProperties:false,
    properties:{
      intent:{
        type:'string',
        enum:[
          'class_timetable',
          'teacher_timetable',
          'period_times',
          'contact',
          'clinic',
          'books',
          'alef',
          'lms',
          'grade_links',
          'website',
          'unsupported'
        ]
      },
      section:{type:['string','null']},
      teacher:{type:['string','null']},
      day:{type:['string','null']},
      period:{type:['integer','null']},
      grade:{type:['integer','null']},
      channel:{
        type:['string','null'],
        enum:['telegram','whatsapp',null]
      }
    },
    required:[
      'intent',
      'section',
      'teacher',
      'day',
      'period',
      'grade',
      'channel'
    ]
  };

  const instructions=`
You route questions for Khalifa Bin Zayed School (KBZ), Al Ain.

Return only structured data.
Never answer the question yourself.

Use only the allowed intents.

Class sections:
${sections.join(', ')}

Teacher page headings:
${teacherNames.join(', ')}

For teacher queries, set teacher to the exact matching teacher page heading when uniquely supported.

Arabic teacher alias rules:
سهيل كساسبة/الكساسبة = Sohail Kasasbeh.
سهيل الشامسي = Sohail Alshamsi.
These are different people.
Never merge similar names.

Normalize section shorthand only when unambiguous.

IMPORTANT CLASS RULE:
If the user includes a valid class/section code such as:
5/G1
7G2
9 A1
Grade 10 G1
11G1
12/A1S1

and asks about its timetable, schedule, subjects, periods, day, or lessons,
use class_timetable.

A bare valid section code should also default to class_timetable.

Never interpret a class section such as 11G1 as a grade communication link.

Use grade_links ONLY when the user explicitly asks for:
Telegram,
WhatsApp,
grade group,
or communication link.

Use period_times only for bell/period times by grade when no class section is requested.

Day must be English Monday-Friday or null.
Period must be 1-8 or null.
Grade must be 5-12 or null.

For school-specific questions outside approved categories use unsupported.
`;

  const resp=await client.responses.create({
    model:process.env.OPENAI_MODEL||'gpt-5-mini',
    instructions,
    input:message,
    text:{
      format:{
        type:'json_schema',
        name:'kbz_route',
        strict:true,
        schema
      }
    }
  });

  return JSON.parse(resp.output_text)
}

export default async function handler(req,res){

  if(req.method!=='POST'){
    return res.status(405).json({
      error:'Method not allowed'
    });
  }

  const ip=(
    req.headers['x-forwarded-for']
    ||req.socket?.remoteAddress
    ||'unknown'
  ).toString().split(',')[0].trim();

  const now=Date.now();
  const rec=rate.get(ip)||[];
  const recent=rec.filter(t=>now-t<60000);

  if(recent.length>=20){
    return res.status(429).json({
      error:'Too many questions. Please wait a minute and try again.'
    });
  }

  recent.push(now);
  rate.set(ip,recent);

  const message=String(req.body?.message||'').trim();

  if(!message||message.length>500){
    return res.status(400).json({
      error:'Please enter a question up to 500 characters.'
    });
  }

  const ar=isArabic(message);

  try{
    let route=localIntent(message)||await classify(message);

    if(route.day){
      route.day=dayName(route.day);
    }

    let result=fixed(route,ar);

    if(!result&&route.intent==='class_timetable'){
      result=formatClass(route,ar);
    }

    if(!result&&route.intent==='teacher_timetable'){
      result=formatTeacher(route,ar);
    }

    if(!result){
      result={
        answer:ar
          ?'أستطيع الإجابة فقط من بيانات KBZ المعتمدة: الجداول، أوقات الحصص، وسائل التواصل، المجموعات، الكتب، ألف، LMS والعيادة. لا أملك مصدراً معتمداً لهذا السؤال.'
          :'I can only answer from approved KBZ data: timetables, period times, contacts, grade groups, books, Alef, LMS and the clinic. I do not have an approved source for that question.'
      };
    }

    return res.status(200).json(result);

  }catch(e){
    console.error(e);

    return res.status(500).json({
      error:e?.message||'Server error'
    });
  }
}
