import "dotenv/config";
import { OpenAI } from "openai";
import { getDb } from "./firebaseAdmin.mjs";

const db = getDb();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

// Resume data
import fs from 'fs';
import path from 'path';

// Load resume data from JSON file
const resumeDataPath = path.join(process.cwd(), 'data', 'resumeData.json');
const resumeData = JSON.parse(fs.readFileSync(resumeDataPath, 'utf8'));

// Build chunks (without embeddings yet)
const chunks = [];
if (resumeData.education) {
  const { degree, institution, location, graduation, honors, activities, coursework } =
    resumeData.education;
  chunks.push({
    text: `${resumeData.name} education: ${degree} from ${institution} in ${location}. Expected Graduation: ${graduation}. Honors: ${honors}. Activities: ${activities}.`,
    meta: { type: "education" },
  });
  if (coursework) {
     chunks.push({
      text: `Relevant Coursework: ${coursework}`,
      meta: { type: "coursework" },
    });
  }
}

if (resumeData.technicalSkills) {
  const { languages, frameworksAndTools, aiMl, platforms } = resumeData.technicalSkills;
  const skillsText = `Languages: ${languages}. Frameworks & Tools: ${frameworksAndTools}. AI/ML: ${aiMl}. Platforms: ${platforms}.`;
  chunks.push({
    text: `Technical Skills: ${skillsText}`,
    meta: { type: "technicalSkills" },
  });
}

if (resumeData.certifications) {
    chunks.push({
    text: `Certifications: ${resumeData.certifications}`,
    meta: { type: "certifications" },
    });
}

resumeData.professionalExperience?.forEach((exp, i) => {
  chunks.push({
    text: `Professional Experience: ${exp.role} at ${exp.company}, ${exp.location} (${exp.duration}). ${exp.description}`,
    meta: { type: "experience", index: i },
  });
});

resumeData.technicalProjects?.forEach((proj, i) => {
  chunks.push({
    text: `Project: ${proj.name} (${proj.date}). Technologies: ${proj.technologies}. ${proj.description}`,
    meta: { type: "project", index: i },
  });
});

if (resumeData.contact) {
  const { email, phone, linkedin, github, website } = resumeData.contact;
  chunks.push({
    text: `Contact Info: Email: ${email}, Phone: ${phone}, LinkedIn: ${linkedin}, GitHub: ${github}, Website: ${website}.`,
    meta: { type: "contact" },
  });
}

if (resumeData.resumeLink) {
  chunks.push({
    text: `Resume Link: ${resumeData.resumeLink}`,
    meta: { type: "resumeLink" },
  });

  // Personality & interests (Hardcoded as they might not be in the parsed JSON but are good for the bot)
  chunks.push({
    text: `Interests: Academics is only 30% of my life; sports occupy the major part. I love cricket and soccer since childhood. I captained my high school cricket team to a District Championship and trained by top coaches in Nepal. I play soccer weekly and have seen Messi play live. Other sports I enjoy: ping pong, chess, pool and tennis.`,
    meta: { type: "interests", source: "resume" },
  });
  chunks.push({
    text: `Interests: I'm a huge music lover with diverse tastes—Nepali, Bollywood, international genres. Favorites: pop and country. I've attended concerts for Post Malone, Ed Sheeran, and Luke Combs.`,
    meta: { type: "interests", source: "resume" },
  });
  chunks.push({
    text: `Interests: I love traveling and hiking. In the US, I've hiked in High Point, Delaware Water Gap, Ithaca, and the Catskills in NY. I'm a fun-loving person and community volunteer.`,
    meta: { type: "interests", source: "resume" },
  });
  chunks.push({
    text: `Volunteer Work: In Nepal, I taught rural communities about voting. In the US, I volunteered with PyData NYC 2023 at Microsoft Office in Manhattan.`,
    meta: { type: "volunteering", source: "resume" },
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
