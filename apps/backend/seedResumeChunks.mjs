import "dotenv/config";
import { OpenAI } from "openai";
import { getDb } from "../firebaseAdmin.mjs";

const db = getDb();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

// Resume data
const resumeData = {
  name: "Abhash Niroula",
  contact: {
    email: "abhashniroula8@gmail.com",
    phone: "+1 6467534127",
    linkedin: "https://www.linkedin.com/in/abhash-niroula/",
    github: "https://github.com/abhashn8",
  },
  education: {
    degree: "Bachelor of Science in Computer Science",
    institution: "William Paterson University",
    location: "Wayne, NJ, USA",
    graduation: "May 2026",
    honors: "Honors Program, GPA: 3.9, Dean’s List- Spring 2024, Fall 2024, Spring 2025",
  },
  technicalSkills:
    "Python, Swift, SQL, EJS, JavaScript, HTML/CSS, Kivy, Bootstrap, Tailwind, Windows, macOS, Linux, GitHub, Model Evaluation, Chatbot Development, Generative AI, API Integration, Data Structures and Algorithms (DSA), Object Oriented Programming (OOP), Xcode, Microsoft Azure, Google Cloud Platform, UI/UX Design, Figma, ER Modeling, Office 365, Google Workspace",
  relevantCourseworkAndCertifications: {
    coursework:
      "Computer Programming, Object-Oriented Programming, Data Structures and Algorithms, Database Management Systems, Front-end Web Development, Cloud Computing, Statistics, Calculus",
    certifications:
      "Intermediate Generative AI (Google), Intro to iOS Development (CodePath), Microsoft Azure Fundamentals",
  },
  professionalExperience: [
    {
      role: "AI Founding Engineer Intern",
      company: "Humanity AI",
      location: "Upper Montclair, NJ",
      duration: "Oct 2024 – Present",
      description:
        "Integrated and tested responses from 5+ AI models through APIs to evaluate accuracy and effectiveness in generating answers, contributing to chatbot development. Collaborated with the HAI team on the design and integration of next-generation AI models, ensuring seamless functionality with existing systems and applications. Developed and maintained HAI’s website, enhancing user experience and supporting the company’s digital presence.",
    },
    {
      role: "Software Engineer Intern",
      company: "William Paterson University",
      location: "Wayne, NJ",
      duration: "Mar 2024 – May 2024",
      description:
        "Directed the design and development of the website’s user interface, enhancing user engagement and functionality. Designed and implemented event management and membership registration systems, ensuring a seamless user experience. Facilitated networking opportunities, enriching club members’ professional interactions.",
    },
  ],
  technicalProjects: [
    {
      name: "AskAbhash",
      technologies:
        "Node.js, Express.js, OpenAI API, Firebase, Python, Streamlit",
      description:
        "Built an Express.js Retrieval-Augmented Generation (RAG) chatbot with Firebase and OpenAI embeddings to serve portfolio data. Logged and clustered user queries using DBSCAN to auto-generate dynamic FAQs via a REST API and Streamlit dashboard.",
    },
    {
      name: "LetsCric",
      technologies: "HTML, CSS, JS",
      description:
        "Built a real-time cricket dashboard using Cricbuzz API, delivering live scores, match summaries, and news. Optimized data flow and load time, achieving a 30% performance improvement under high-traffic conditions.",
    },
    {
      name: "WishList App",
      technologies: "Kivy",
      description:
        "Developed an intuitive app to manage wishlist items with offline data caching for enhanced reliability. Improved usability through streamlined UI, contributing to a 15% rise in user satisfaction.",
    },
  ],

  resumeLink: "https://pub-ebbe76c3985b4604b8d5d0885d75ccfd.r2.dev/Resume.pdf",
};

// Build chunks (without embeddings yet)
const chunks = [];
if (resumeData.education) {
  const { degree, institution, location, graduation, honors } =
    resumeData.education;
  chunks.push({
    text: `${resumeData.name} earned a ${degree} from ${institution} in ${location}. Graduation: ${graduation}. Honors: ${honors}.`,
    meta: { type: "education" },
  });
}
if (resumeData.technicalSkills) {
  chunks.push({
    text: `Technical Skills: ${resumeData.technicalSkills}`,
    meta: { type: "technicalSkills" },
  });
}
if (resumeData.relevantCourseworkAndCertifications) {
  const { coursework, certifications } =
    resumeData.relevantCourseworkAndCertifications;
  chunks.push({
    text: `Coursework: ${coursework}. Certifications: ${certifications}.`,
    meta: { type: "coursework" },
  });
}
resumeData.professionalExperience?.forEach((exp, i) => {
  chunks.push({
    text: `Experience: ${exp.role} at ${exp.company}, ${exp.location} (${exp.duration}). ${exp.description}`,
    meta: { type: "experience", index: i },
  });
});
resumeData.technicalProjects?.forEach((proj, i) => {
  chunks.push({
    text: `Project: ${proj.name}. Technologies: ${proj.technologies}. ${proj.description}`,
    meta: { type: "project", index: i },
  });
});
if (resumeData.contact) {
  const { email, phone, linkedin, github } = resumeData.contact;
  chunks.push({
    text: `Contact: Email: ${email}, Phone: ${phone}, LinkedIn: ${linkedin}, GitHub: ${github}.`,
    meta: { type: "contact" },
  });
}
if (resumeData.resumeLink) {
  chunks.push({
    text: `Resume Link: ${resumeData.resumeLink}`,
    meta: { type: "resumeLink" },
  });

  // Personality & interests
  chunks.push({
    text: `Interests: Academics is only 30% of my life; sports occupy the major part. I love cricket and soccer since childhood. I captained my high school cricket team to a District Championship and trained by top coaches in Nepal. I play soccer weekly and have seen Messi play live and watched Barcelona play. Other sports I enjoy: ping pong, chess, pool and tennis.`,
    metadata: { type: "interests", source: "resume" },
  });
  chunks.push({
    text: `Interests: I'm a huge music lover with diverse tastes—Nepali, Bollywood, international genres. Favorites: pop and country. I've attended concerts for Post Malone, Ed Sheeran, and Luke Combs.`,
    metadata: { type: "interests", source: "resume" },
  });
  chunks.push({
    text: `Interests: I love traveling and hiking. In the US, I've hiked in High Point, Delaware Water Gap, Ithaca, and the Catskills in NY. I'm a fun-loving person and community volunteer.`,
    metadata: { type: "interests", source: "resume" },
  });
  chunks.push({
    text: `Volunteer Work: In Nepal, I taught rural communities about voting. In the US, I volunteered with PyData NYC 2023 at Microsoft Office in Manhattan—introducing speakers, assisting guests, and participating in CS events throughout Manhattan.`,
    metadata: { type: "volunteering", source: "resume" },
  });

  // Function to get embedding
  async function embed(text) {
    const r = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return r.data[0].embedding;
  }

  for (let i = 0; i < chunks.length; i++) {
    const id = `chunk_${String(i + 1).padStart(3, "0")}`;
    try {
      const embedding = await embed(chunks[i].text);
      await db.collection("profileChunks").doc(id).set({
        text: chunks[i].text,
        embedding,
        metadata: chunks[i].meta,
      });
      console.log(`${id} written`);
    } catch (e) {
      console.error(`Error writing ${id}:`, e.message);
    }
  }
  console.log("Done.");
}
